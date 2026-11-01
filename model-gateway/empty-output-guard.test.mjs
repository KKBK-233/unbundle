import {messageText, toolUses} from './messages.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';
import { emptyOutputGuard, AUTO_RESUME_PROMPT, EMPTY_OUTPUT_NOTICE, AUTO_RESUME_NOTICE } from './empty-output-guard.mjs';

const base = { model: 'claude-code-opus', max_tokens: 64000, messages: [{ role: 'user', content: '合成任务，禁止真实上游请求' }] };
const usage = { input_tokens: 17, output_tokens: 64000, cache_read_input_tokens: 19, cache_creation_input_tokens: 23 };
const zeroUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const headers = { 'x-api-key': 'guard-test', authorization: 'Bearer guard-test', 'content-type': 'application/json' };
const invoke = (app, body) => fetch(`http://127.0.0.1:${app.port}/v1/messages`, {
  method: 'POST', headers, body: JSON.stringify(body),
});

test('Desktop单token句点探测保留真实空响应和用量，不伪造正文或缓存失败', async () => {
  let executions = 0;
  const probe = { model: 'claude-haiku-5-5', max_tokens: 1, messages: [{ role: 'user', content: '.' }] };
  assert.equal(Buffer.byteLength(JSON.stringify(probe)), 86);
  const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: probe.model }],
    execute: async () => { executions++; return { role: 'assistant', content: '', stop_reason: 'max_tokens',
      usage: { input_tokens: 12, output_tokens: 1 } }; } });
  try {
    for (let i = 0; i < 2; i++) {
      const response = await invoke(app, probe);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.content, []);
      assert.equal(body.stop_reason, 'max_tokens');
      assert.equal(body.usage.output_tokens, 1);
      assert.equal(body.usage.input_tokens, 12);
    }
    assert.equal(executions, 2);
    for (const request of [
      { ...probe, max_tokens: 2 },
      { ...probe, messages: [{ role: 'user', content: '继续任务' }] },
      { ...probe, system: '真实任务规则' },
    ]) {
      const response = await invoke(app, request);
      assert.equal(response.status, 422);
      assert.equal((await response.json()).error.code, 'EMPTY_OUTPUT_LIMIT');
    }
  } finally { await app.close({discardFrozen:true}); }
});

test('单token探测不吞掉真实上游拒绝', async () => {
  const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], execute: async () => {
    throw Object.assign(new Error('上游拒绝'), { status: 403, code: 'UPSTREAM_HTTP_403', retryable: false });
  } });
  try {
    const response = await invoke(app, { model: base.model, max_tokens: 1, messages: [{ role: 'user', content: '.' }] });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'UPSTREAM_HTTP_403');
  } finally { await app.close({discardFrozen:true}); }
});

// JSON/SSE 验证首轮止损、传输重试和历史自动续接均不会二次调用推理。
test('空结果止损覆盖Messages JSON/SSE，首次真实用量不在重发中重复报告', async () => {
  for (const stream of [false, true]) {
    let executions = 0, authChecks = 0;
    const logs = [];
    const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], maxOutputTokens: 128000,
      onTiming: record => logs.push(record), beforeExecute: () => { authChecks++; },
      execute: async () => { executions++; return { role: 'assistant', content: '', stop_reason: 'max_tokens', usage: usage }; } });
    const read = async response => {
      if (response.headers.get('content-type').includes('application/json')) {
        assert.equal(response.status,422);assert.equal(response.headers.get('x-should-retry'),'false');
        const value = await response.json();
        assert.equal(value.content,undefined);assert.equal(value.choices,undefined);
        return {text:value.error.message,usage:value.error.usage};
      }
      assert.equal(response.status,200);
      const wire = await response.text();
      assert(!wire.includes('event: message_stop'));
      const events = wire.split('\n').filter(line => line.startsWith('data: ') && !line.includes('[DONE]')).map(line => JSON.parse(line.slice(6)));
      const failure=events.find(e=>e.error)?.error;assert(failure);assert.equal(failure.retryable,false);
      assert(!events.some(e=>e.choices?.[0]?.delta?.content||e.delta?.type==='text_delta'&&e.delta.text.trim()));
      return {text:failure.message,usage:failure.usage};
    };
    try {
      const first = await read(await invoke(app, { ...base, stream }));
      assert.equal(first.text, EMPTY_OUTPUT_NOTICE);
      assert.equal(first.reason, undefined);
      assert.deepEqual(first.usage, usage);
      const retry = await read(await invoke(app, { ...base, stream }));
      assert.equal(retry.text, EMPTY_OUTPUT_NOTICE);
      assert.equal(retry.reason, undefined);
      assert.deepEqual(retry.usage, undefined);
      for (const content of ['', [{ type: 'text', text: '' }], []]) {
        const resumed = await read(await invoke(app, { ...base, stream,
          messages: [...base.messages, { role: 'assistant', content }, { role: 'user', content: AUTO_RESUME_PROMPT }] }));
        assert.equal(resumed.text, AUTO_RESUME_NOTICE);
        assert.equal(resumed.reason, undefined);
      }
      assert.equal(executions, 1); assert.equal(authChecks, 1);
      assert.equal(logs.filter(r => r.stage === 'empty_output_limit_stopped').length, 1);
      assert.equal(logs.filter(r => r.stage === 'empty_output_retry_blocked').length, 4);
      assert(!logs.some(r => r.stage === 'first_text'));
      assert(!JSON.stringify(logs).includes(base.messages[0].content));
      assert(!JSON.stringify(logs).includes(EMPTY_OUTPUT_NOTICE));
      assert.equal(app.inflightBytes, 0);
    } finally { await app.close({discardFrozen:true}); }
  }
});

// 真正模拟 CLI 的 thinking→max_tokens，而非仅返回伪造的服务层失败。
test('64K thinking 空结果只启动一个模拟 CLI，本地客户端收到终止消息而非自动续接触发器', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-output-cli-'));
  let spawns = 0;
  const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], maxOutputTokens: 128000,
    execute: (body, signal, onText, timing) => infer(body, { cli: 'synthetic', home, model: 'synthetic', signal, onText, timing, maxOutputTokens: 128000,
      spawnProcess: (_cli, args, options) => {
        spawns++; assert.equal(options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, '64000');
        assert.equal(args[args.indexOf('--effort') + 1], 'max');
        return spawn(process.execPath, ['--input-type=module', '-e', `
          for await (const chunk of process.stdin) {}
          const stream = event => console.log(JSON.stringify({type:'stream_event',event}));
          stream({type:'message_start',message:{id:'synthetic',usage:{input_tokens:17,output_tokens:0}}});
          stream({type:'content_block_start',index:0,content_block:{type:'thinking',thinking:''}});
          stream({type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'HIDDEN_SYNTHETIC_THINKING'}});
          stream({type:'content_block_stop',index:0});
          stream({type:'message_delta',delta:{stop_reason:'max_tokens'},usage:{output_tokens:64000}});
          setInterval(()=>{},1000);
        `], options);
      } }) });
  try {
    const body = { ...base, thinking: { type: 'adaptive' }, output_config: { effort: 'max' }, stream: true };
    const wire = await (await invoke(app, body)).text();
    assert(wire.includes('event: error'));assert(!wire.includes('"stop_reason":"end_turn"')); assert(!wire.includes('"stop_reason":"max_tokens"'));
    assert(wire.includes('"output_tokens":64000')); assert(!wire.includes('HIDDEN_SYNTHETIC_THINKING'));
    const retry = await (await invoke(app, body)).text();
    assert(retry.includes('EMPTY_OUTPUT_LIMIT')); assert(!retry.includes('"output_tokens":64000'));
    assert.equal(spawns, 1); assert.deepEqual(await fs.readdir(home), ['workspace']);
  } finally { await app.close({discardFrozen:true}); await fs.rm(home, { recursive: true, force: true }); }
});

test('排队的同一失败请求在获取执行槽后被拦截，失败不会永久占用容量', async () => {
  let finish, started;
  const gate = new Promise(resolve => finish = resolve), began = new Promise(resolve => started = resolve);
  let executions = 0;
  const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], maxOutputTokens: 128000, maxConcurrent: 1,
    execute: async () => { executions++; started(); await gate; return { role: 'assistant', content: null, stop_reason: 'max_tokens' }; } });
  try {
    const first = invoke(app, base); await began;
    const queued = invoke(app, base);
    for (let i = 0; i < 100 && app.queuedRequests === 0; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(app.queuedRequests, 1); finish();
    for (const response of await Promise.all([first, queued])) {
      const value = await response.json(); assert.equal(response.status,422);assert.equal(value.error.code,'EMPTY_OUTPUT_LIMIT');
    }
    assert.equal(executions, 1); assert.equal(app.activeRequests, 0); assert.equal(app.queuedRequests, 0); assert.equal(app.inflightBytes, 0);
  } finally { finish(); await app.close({discardFrozen:true}); }
});

test('真实正文截断、工具调用、引用和人工继续仍执行，手动降低档位可以重新请求', async () => {
  const calls = [];
  const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], maxOutputTokens: 128000,
    execute: async body => {
      calls.push(body);
      const last = body.messages.at(-1).content;
      if (last === '正常截断') return { role: 'assistant', content: '有效正文', stop_reason: 'max_tokens' };
      if (last === '工具') return {role: 'assistant', content: [{id: 'read', type: 'tool_use', name: 'read', input: {}}]};
      return { role: 'assistant', content: last === base.messages[0].content ? '' : '有效正文', stop_reason: last === base.messages[0].content ? 'max_tokens' : 'end_turn' };
    } });
  try {
    const truncated = await (await invoke(app, { ...base, messages: [{ role: 'user', content: '正常截断' }] })).json();
    assert.equal(truncated.stop_reason, 'max_tokens'); assert.equal(messageText(truncated), '有效正文');
    const tool = await (await invoke(app, { ...base, messages: [{ role: 'user', content: '工具' }] })).json();
    assert.equal(tool.stop_reason, 'tool_use');
    for (const messages of [
      [...base.messages, { role: 'assistant', content: '有效正文' }, { role: 'user', content: AUTO_RESUME_PROMPT }],
      [...base.messages, {role: 'assistant', content: [...(toolUses(tool) || [])]}, { role: 'user', content: AUTO_RESUME_PROMPT }],
      [...base.messages, { role: 'user', content: `请解释这段提示：${AUTO_RESUME_PROMPT}` }],
      [...base.messages, {role:'user',content:[{type:'text',text:AUTO_RESUME_PROMPT}]}],
      [...base.messages, { role: 'assistant', content: '' }, { role: 'user', content: '继续，先只处理一个文件' }],
    ]) assert.equal(messageText((await (await invoke(app, { ...base, messages })).json())), '有效正文');
    await invoke(app, {...base, output_config: {effort:'max'}});
    await invoke(app, {...base, output_config: {effort:'medium'}});
    assert.equal(calls.length, 9); assert.equal(calls.at(-1).output_config?.effort, 'medium');
  } finally { await app.close({discardFrozen:true}); }
});

test('仅空白 SSE 返回错误而非成功正文，历史中的止损提示不触发再次续接', async () => {
  const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], maxOutputTokens: 128000,
    execute: async (_body, _signal, onText) => { onText(' \n'); return { role: 'assistant', content: ' \n', stop_reason: 'max_tokens' }; } });
  try {
    const wire = await (await invoke(app, { ...base, stream: true })).text();
    assert(wire.includes('event: error'));assert(!wire.includes('"stop_reason":"end_turn"'));assert(!wire.includes('event: message_stop'));
    const resumed = await (await invoke(app, { ...base,
      messages: [...base.messages, { role: 'assistant', content: EMPTY_OUTPUT_NOTICE }, { role: 'user', content: AUTO_RESUME_PROMPT }] })).json();
    assert.equal(resumed.error.message, AUTO_RESUME_NOTICE);assert.equal(resumed.content,undefined);
  } finally { await app.close({discardFrozen:true}); }
});

// 指纹寿命和容量边界明确；不宣称重启后仍能识别同一原始请求。
test('指纹不依赖流式开关与预算字段别名，过期及淘汰后可释放；新进程仍阻止旧空回复自动续接', () => {
  let now = 0;
  const guard = emptyOutputGuard({ ttlMs: 100, capacity: 2, now: () => now });
  const fingerprint = guard.fingerprint(base, 64000);
  const { max_tokens, ...alias } = base;
  assert.equal(guard.fingerprint({ ...alias, max_tokens: 64000, stream: true }, 64000), fingerprint);
  guard.finish(fingerprint, { content: '', stop_reason: 'max_tokens' }, false);
  assert.equal(guard.check(base, fingerprint), EMPTY_OUTPUT_NOTICE);
  now = 100; assert.equal(guard.check(base, fingerprint), undefined);
  for (const id of ['a', 'b', 'c']) guard.finish(id, { content: '', stop_reason: 'max_tokens' }, false);
  assert.equal(guard.check(base, 'a'), undefined); assert.equal(guard.check(base, 'c'), EMPTY_OUTPUT_NOTICE);
  const fresh = emptyOutputGuard();
  const body = { ...base, messages: [...base.messages, { role: 'user', content: AUTO_RESUME_PROMPT }, { role: 'user', content: AUTO_RESUME_PROMPT }] };
  assert.equal(fresh.check(body, fresh.fingerprint(body, 64000)), AUTO_RESUME_NOTICE);
});
