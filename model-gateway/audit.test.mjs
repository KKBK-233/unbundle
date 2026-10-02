import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import { importOmp } from './import-omp.mjs';
import { CliEvents } from './cli-events.mjs';
import { gateway } from './server.mjs';
import { validateRequest } from './request.mjs';
import { validateCliVersion } from './cli-compat.mjs';
import { inspectUpstream } from './probe-contract.mjs';
import { compileContext } from './context.mjs';

const request = { model: 'claude-code-sonnet', messages: [{ role: 'user', content: '测试' }] };
const stream = event => ({ type: 'stream_event', event });
const aggregate = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'mcp__omp__read', input: { path: '中文' } }] } };

test('缺失、空白和已有 OMP 配置都能安全导入；令牌失配不产生副作用', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-import-'));
  try {
    for (const [index, source] of [null, '', '# 保留注释\ndefaultModel: old\n', '# 原配置\nproviders: {}\n', 'providers:\n', 'providers:\n  other:\n    apiKey: untouched\n'].entries()) {
      const file = path.join(dir, `${index}/models.yml`), tokenFile = path.join(dir, `${index}/token`);
      if (source !== null) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, source); }
      assert.equal((await importOmp({ file, tokenFile })).created, true);
      const output = await fs.readFile(file, 'utf8');
      if (source?.startsWith('#')) assert(output.startsWith(source.split('\n')[0]));
      assert.equal((await importOmp({ file, tokenFile })).created, false);
      await fs.unlink(tokenFile);
      await assert.rejects(importOmp({ file, tokenFile }), /令牌/);
      await assert.rejects(fs.stat(tokenFile), { code: 'ENOENT' });
      assert.equal(await fs.readFile(file, 'utf8'), output);
      await fs.writeFile(tokenFile, 'wrong');
      await assert.rejects(importOmp({ file, tokenFile }), /令牌/);
      const parsed = yaml.load(output);
      await fs.writeFile(tokenFile, parsed.providers['velella-cloud'].apiKey);
      parsed.providers['velella-cloud'].baseUrl = 'http://invalid.local';
      await fs.writeFile(file, yaml.dump(parsed));
      await assert.rejects(importOmp({ file, tokenFile }), /地址/);
    }
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('工具片段重建不依赖 assistant 聚合事件的先后或存在', () => {
  for (const order of ['before', 'after', 'missing']) {
    const events = new CliEvents([{ name: 'read', original: 'read' }]);
    if (order === 'before') events.accept(aggregate);
    for (const [index, id] of ['a', 'b'].entries()) {
      events.accept(stream({ type: 'content_block_start', index, content_block: { type: 'tool_use', id, name: 'mcp__omp__read', input: {} } }));
      for (const partial_json of ['{"path":"中', '文"}']) events.accept(stream({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json } }));
      events.accept(stream({ type: 'content_block_stop', index }));
      assert.equal(events.toolEnd, false);
    }
    events.accept(stream({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }));
    if (order === 'after') events.accept(aggregate);
    assert.equal(events.toolEnd, true);
    assert.deepEqual([...events.calls.keys()], ['a', 'b']);
    assert.deepEqual(JSON.parse(events.calls.get('a').function.arguments), { path: '中文' });
    assert.throws(() => events.addCall({ ...aggregate.message.content[0], input: { path: '冲突' } }), /冲突/);
  }
});

test('坏 JSON、未结束块和未知工具均不返回部分成功', () => {
  for (const scenario of ['json', 'open', 'unknown']) {
    const events = new CliEvents([{ name: 'read', original: 'read' }]);
    events.accept(aggregate);
    events.accept(stream({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'b', name: scenario === 'unknown' ? 'Agent' : 'mcp__omp__read', input: {} } }));
    if (scenario === 'json') events.accept(stream({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{' } }));
    assert.throws(() => events.accept(stream(scenario === 'open' ? { type: 'message_delta', delta: { stop_reason: 'tool_use' } } : { type: 'content_block_stop', index: 1 })));
    assert.equal(events.toolEnd, false);
  }
});

test('无效生成参数和中途系统指令在 SSE 或 CLI 启动前返回 400', async () => {
  let executions = 0;
  const app = await gateway({ token: 'test', port: 0, execute: async () => { executions++; return { role: 'assistant', content: 'ok' }; } });
  try {
    for (const body of [null, [], { ...request, temperature: 0 }, { ...request, stop: ['stop'] }, { ...request, response_format: { type: 'json_object' } }, { ...request, max_tokens: 99999 }, { ...request, parallel_tool_calls: false }, { ...request, messages: [...request.messages, { role: 'system', content: '中途规则' }] }]) {
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/chat/completions`, { method: 'POST', headers: { Authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify(body && { ...body, stream: true }) });
      assert.equal(response.status, 400);
      assert.match(response.headers.get('content-type'), /application\/json/);
      const result = await response.json();
      if (body?.messages?.length === 2) assert.equal(result.error.code, 'UNSUPPORTED_MESSAGE_LAYOUT');
    }
    assert.equal(executions, 0);
    assert.equal(validateRequest({ ...request, max_tokens: 1024 }), 1024);
    assert.equal(validateRequest({ ...request, max_completion_tokens: 4096 }), 4096);
    assert.equal(validateRequest({ ...request, store: false }), 8192);
    // 桌面客户端的大输出预算原样接受，未指定时仍沿用小预算。
    for (const limit of [32768, 64000, 128000]) assert.equal(validateRequest({ ...request, max_tokens: limit }, { maxOutputTokens: 128000 }), limit);
    assert.equal(validateRequest(request, { maxOutputTokens: 128000 }), 8192);
    assert.equal(validateRequest(request, { maxOutputTokens: 4096 }), 4096);
    assert.throws(() => validateRequest({ ...request, max_tokens: 128001 }, { maxOutputTokens: 128000 }));
    assert.throws(() => validateRequest({ ...request, store: true }));
    assert.throws(() => validateRequest({ ...request, max_tokens: 1024, max_completion_tokens: 1024 }));
  } finally { await app.close(); }
});

test('启动只接受已验收 CLI 版本', () => {
  assert.equal(validateCliVersion('2.1.277 (Claude Code)\n'), '2.1.277');
  for (const output of ['2.1.278 (Claude Code)', '', 'failed: 2.1.277']) assert.throws(() => validateCliVersion(output), /未验收/);
});

test('探针精确拒绝额外工具，并将提示词变化与元数据变化分开', () => {
  const input = { ...request, tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }] };
  const compiled = compileContext(input);
  const body = { tools: [{ name: 'mcp__omp__read' }], system: compiled.systemPrompt, messages: [JSON.parse(compiled.input).message], metadata: { session: 'one' } };
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
