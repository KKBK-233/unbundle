import {messageText} from './messages.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CliEvents } from './cli-events.mjs';
import { gateway } from './server.mjs';
import { validateRequest } from './request.mjs';
import { validateCliVersion } from './cli-compat.mjs';
import { inspectUpstream } from './probe-contract.mjs';
import { compileContext } from './context.mjs';

const request = { model: 'claude-code-sonnet', messages: [{ role: 'user', content: '测试' }] };
const stream = event => ({ type: 'stream_event', event });
const aggregate = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'mcp__caller__read', input: { path: '中文' } }] } };

test('工具片段重建不依赖 assistant 聚合事件的先后或存在', () => {
  for (const order of ['before', 'after', 'missing']) {
    const events = new CliEvents([{ name: 'read', original: 'read' }]);
    if (order === 'before') events.accept(aggregate);
    for (const [index, id] of ['a', 'b'].entries()) {
      events.accept(stream({ type: 'content_block_start', index, content_block: { type: 'tool_use', id, name: 'mcp__caller__read', input: {} } }));
      for (const partial_json of ['{"path":"中', '文"}']) events.accept(stream({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json } }));
      events.accept(stream({ type: 'content_block_stop', index }));
      assert.equal(events.toolEnd, false);
    }
    events.accept(stream({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }));
    if (order === 'after') events.accept(aggregate);
    assert.equal(events.toolEnd, true);
    assert.deepEqual([...events.calls.keys()], ['a', 'b']);
    assert.deepEqual(events.calls.get('a').input, { path: '中文' });
    assert.throws(() => events.addCall({ ...aggregate.message.content[0], input: { path: '冲突' } }), /冲突/);
  }
});

test('坏 JSON、未结束块和未知工具均不返回部分成功', () => {
  for (const scenario of ['json', 'open', 'unknown']) {
    const events = new CliEvents([{ name: 'read', original: 'read' }]);
    events.accept(aggregate);
    events.accept(stream({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'b', name: scenario === 'unknown' ? 'Agent' : 'mcp__caller__read', input: {} } }));
    if (scenario === 'json') events.accept(stream({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{' } }));
    assert.throws(() => events.accept(stream(scenario === 'open' ? { type: 'message_delta', delta: { stop_reason: 'tool_use' } } : { type: 'content_block_stop', index: 1 })));
    assert.equal(events.toolEnd, false);
  }
});

test('无效生成参数在 SSE 或 CLI 启动前返回 400', async () => {
  let executions = 0;
  const app = await gateway({ token: 'test', port: 0, execute: async () => { executions++; return { role: 'assistant', content: 'ok' }; } });
  try {
    for (const body of [null, [], { ...request, temperature: 0 }, { ...request, stop_sequences: [''] }, { ...request, response_format: { type: 'json_object' } }, { ...request, max_tokens: 99999 }, {...request, tool_choice:{...{type:'auto'},disable_parallel_tool_use:'false'}}]) {
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST', headers: { Authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body && { ...body, stream: true }) });
      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type'), /application\/json/);
      await response.json();
    }
    assert.equal(executions, 0);
    assert.equal(validateRequest({ ...request, max_tokens: 1024 }), 1024);
    assert.throws(() => validateRequest({ ...request, max_completion_tokens: 4096 }));
    assert.throws(() => validateRequest({ ...request, store: false }));
    // 桌面客户端的大输出预算原样接受，未指定时仍沿用小预算。
    for (const limit of [32768, 64000, 128000]) assert.equal(validateRequest({ ...request, max_tokens: limit }, { maxOutputTokens: 128000 }), limit);
    assert.equal(validateRequest(request, { maxOutputTokens: 128000 }), 128000);
    assert.equal(validateRequest(request, { maxOutputTokens: 4096 }), 4096);
    assert.throws(() => validateRequest({ ...request, max_tokens: 128001 }, { maxOutputTokens: 128000 }));
    assert.throws(() => validateRequest({ ...request, store: true }));
    assert.throws(() => validateRequest({ ...request, max_tokens: 1024, max_completion_tokens: 4096 }));
  } finally { await app.close({discardFrozen:true}); }
});

test('HTTP 接受桌面动态指令，执行层收到完整角色和原始顺序', async () => {
  const messages = [{ role: 'system', content: '固定规则' }, ...request.messages,
    { role: 'system', content: '<total_tokens>1000 tokens left</total_tokens>' },
    { role: 'developer', content: '动态规则' }];
  let executions = 0;
  const app = await gateway({ token: 'test', port: 0, execute: async body => {
    executions++;
    assert.deepEqual(body.messages, messages);
    const compiled = compileContext(body);
    assert.equal(compiled.metrics.instructionUpdates, 1);
    assert.equal(compiled.metrics.runtimeStatusCount, 1);
    assert(!compiled.systemPrompt.includes('<total_tokens>'));
    assert(compiled.input.includes('<total_tokens>'));
    return { role: 'assistant', content: 'ok' };
  } });
  try {
    for (const stream of [false, true]) {
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, {
        method: 'POST', headers: { Authorization: 'Bearer test', 'content-type': 'application/json' },
        body: JSON.stringify({ ...request, messages, stream }),
      });
      assert.equal(response.status, 200);
      const output = await response.text();
      if (stream) { assert(output.includes('event: message_stop')); assert(output.includes('ok')); }
      else assert.equal(messageText(JSON.parse(output)), 'ok');
    }
    assert.equal(executions, 2);
  } finally { await app.close({discardFrozen:true}); }
});

test('启动只接受已验收 CLI 版本', () => {
  assert.equal(validateCliVersion('2.1.280 (Claude Code)\n'), '2.1.280');
  for (const output of ['2.1.277 (Claude Code)', '2.1.281 (Claude Code)', '', 'failed: 2.1.280']) assert.throws(() => validateCliVersion(output), /未验收/);
});

test('探针精确拒绝额外工具，并将提示词变化与元数据变化分开', () => {
  const input = { ...request, tools: [{name: 'read', input_schema: { type: 'object' }}] };
  const compiled = compileContext(input, {cacheBreakpoint:'5m'});
  const body = { tools: [{ name: 'mcp__caller__read' }], system: compiled.systemPrompt, messages: [JSON.parse(compiled.input).message], metadata: { session: 'one' } };
  const { snapshot } = inspectUpstream(body, input);
  assert.doesNotThrow(() => inspectUpstream({ ...body, metadata: { session: 'two' } }, input, snapshot));
  assert.throws(() => inspectUpstream({ ...body, tools: [...body.tools, { name: 'Agent' }] }, input), /工具集合/);
  assert.throws(() => inspectUpstream({ ...body, system: body.system + 'changed' }, input, snapshot), /系统前缀/);
  const withEnvironment = { ...body, messages: [...body.messages, { role: 'system', content: [{ type: 'text', text: 'synthetic environment' }] }] };
  const first = inspectUpstream(withEnvironment, input);
  const nextInput = { ...input, messages: [...input.messages, { role: 'assistant', content: 'ok' }] };
  const nextBody = { ...withEnvironment, messages: [JSON.parse(compileContext(nextInput).input).message, withEnvironment.messages.at(-1)] };
  assert.doesNotThrow(() => inspectUpstream(nextBody, nextInput, first.snapshot));
  assert.equal(first.report.afterBreakpointBlocks, 1);
  const conflicting = structuredClone(withEnvironment);
  conflicting.messages.at(-1).content[0].cache_control = { type: 'ephemeral', ttl: '1h' };
  assert.throws(() => inspectUpstream(conflicting, input), /5m 缓存断点后追加 1h/);
  const reordered = { ...nextBody, messages: [{ role: 'user', content: [...nextBody.messages[0].content].reverse() }] };
  assert.throws(() => inspectUpstream(reordered, nextInput), /按顺序/);
});