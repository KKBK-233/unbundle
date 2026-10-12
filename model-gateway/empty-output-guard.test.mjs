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
const invoke = (app, native, body) => fetch(`http://127.0.0.1:${app.port}/v1/${native ? 'messages' : 'chat/completions'}`, {
  method: 'POST', headers, body: JSON.stringify(body),
});

// 四种响应形式验证首轮止损、传输重试和历史自动续接均不会二次调用推理。
test('空结果止损覆盖两种协议及 JSON/SSE，首次真实用量不在重发中重复报告', async () => {
  for (const native of [false, true]) for (const stream of [false, true]) {
    let executions = 0, authChecks = 0;
    const logs = [];
    const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], maxOutputTokens: 128000,
      onTiming: record => logs.push(record), beforeExecute: () => { authChecks++; },
      execute: async () => { executions++; return { role: 'assistant', content: '', finish_reason: 'length', upstream_usage: usage }; } });
    const read = async response => {
      assert.equal(response.status, 200);
      if (!stream) {
        const value = await response.json();
        if (native) return { text: value.content[0].text, reason: value.stop_reason, usage: value.usage };
        return { text: value.choices[0].message.content, reason: value.choices[0].finish_reason, usage: value.upstream_usage };
      }
      const wire = await response.text();
      assert(!wire.includes('event: error'));
      const events = wire.split('\n').filter(line => line.startsWith('data: ') && !line.includes('[DONE]')).map(line => JSON.parse(line.slice(6)));
      if (native) return { text: events.filter(e => e.delta?.type === 'text_delta').map(e => e.delta.text).join(''),
        reason: events.find(e => e.type === 'message_delta').delta.stop_reason, usage: events.find(e => e.type === 'message_delta').usage };
      assert(wire.endsWith('data: [DONE]\n\n'));
      return { text: events.map(e => e.choices?.[0]?.delta?.content || '').join(''), reason: events.at(-1).choices[0].finish_reason };
    };
    try {
      const first = await read(await invoke(app, native, { ...base, stream }));
      assert.equal(first.text, EMPTY_OUTPUT_NOTICE);
      assert.equal(first.reason, native ? 'end_turn' : 'stop');
      if (native || !stream) assert.deepEqual(first.usage, usage);
      const retry = await read(await invoke(app, native, { ...base, stream }));
      assert.equal(retry.text, EMPTY_OUTPUT_NOTICE);
      assert.equal(retry.reason, native ? 'end_turn' : 'stop');
      assert.deepEqual(retry.usage, native ? zeroUsage : undefined);
      for (const content of ['', [{ type: 'text', text: '' }], []]) {
        const resumed = await read(await invoke(app, native, { ...base, stream,
          messages: [...base.messages, { role: 'assistant', content }, { role: 'user', content: AUTO_RESUME_PROMPT }] }));
        assert.equal(resumed.text, AUTO_RESUME_NOTICE);
        assert.equal(resumed.reason, native ? 'end_turn' : 'stop');
      }
      assert.equal(executions, 1); assert.equal(authChecks, 1);
      assert.equal(logs.filter(r => r.stage === 'empty_output_limit_stopped').length, 1);
      assert.equal(logs.filter(r => r.stage === 'empty_output_retry_blocked').length, 4);
      assert(!logs.some(r => r.stage === 'first_text'));
      assert(!JSON.stringify(logs).includes(base.messages[0].content));
      assert(!JSON.stringify(logs).includes(EMPTY_OUTPUT_NOTICE));
      assert.equal(app.inflightBytes, 0);
    } finally { await app.close(); }
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
    const wire = await (await invoke(app, true, body)).text();
    assert(wire.includes('"stop_reason":"end_turn"')); assert(!wire.includes('"stop_reason":"max_tokens"'));
    assert(wire.includes('"output_tokens":64000')); assert(!wire.includes('HIDDEN_SYNTHETIC_THINKING'));
    const retry = await (await invoke(app, true, body)).text();
    assert(retry.includes('EMPTY_OUTPUT_LIMIT')); assert(!retry.includes('"output_tokens":64000'));
    assert.equal(spawns, 1); assert.deepEqual(await fs.readdir(home), ['workspace']);
  } finally { await app.close(); await fs.rm(home, { recursive: true, force: true }); }
});

test('排队的同一失败请求在获取执行槽后被拦截，失败不会永久占用容量', async () => {
  let finish, started;
  const gate = new Promise(resolve => finish = resolve), began = new Promise(resolve => started = resolve);
  let executions = 0;
  const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], maxOutputTokens: 128000, maxConcurrent: 1,
    execute: async () => { executions++; started(); await gate; return { role: 'assistant', content: null, finish_reason: 'length' }; } });
  try {
    const first = invoke(app, false, base); await began;
    const queued = invoke(app, false, base);
    for (let i = 0; i < 100 && app.queuedRequests === 0; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(app.queuedRequests, 1); finish();
    for (const response of await Promise.all([first, queued])) {
      const value = await response.json(); assert.equal(value.choices[0].finish_reason, 'stop');
    }
    assert.equal(executions, 1); assert.equal(app.activeRequests, 0); assert.equal(app.queuedRequests, 0); assert.equal(app.inflightBytes, 0);
  } finally { finish(); await app.close(); }
});

test('真实正文截断、工具调用、引用和人工继续仍执行，手动降低档位可以重新请求', async () => {
  const calls = [];
  const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], maxOutputTokens: 128000,
    execute: async body => {
      calls.push(body);
      const last = body.messages.at(-1).content;
      if (last === '正常截断') return { role: 'assistant', content: '有效正文', finish_reason: 'length' };
      if (last === '工具') return { role: 'assistant', content: null, tool_calls: [{ id: 'read', type: 'function', function: { name: 'read', arguments: '{}' } }] };
      return { role: 'assistant', content: last === base.messages[0].content ? '' : '有效正文', finish_reason: last === base.messages[0].content ? 'length' : 'stop' };
    } });
  try {
    const truncated = await (await invoke(app, false, { ...base, messages: [{ role: 'user', content: '正常截断' }] })).json();
    assert.equal(truncated.choices[0].finish_reason, 'length'); assert.equal(truncated.choices[0].message.content, '有效正文');
    const tool = await (await invoke(app, false, { ...base, messages: [{ role: 'user', content: '工具' }] })).json();
    assert.equal(tool.choices[0].finish_reason, 'tool_calls');
    for (const messages of [
      [...base.messages, { role: 'assistant', content: '有效正文' }, { role: 'user', content: AUTO_RESUME_PROMPT }],
      [...base.messages, { role: 'assistant', content: null, tool_calls: tool.choices[0].message.tool_calls }, { role: 'user', content: AUTO_RESUME_PROMPT }],
      [...base.messages, { role: 'user', content: `请解释这段提示：${AUTO_RESUME_PROMPT}` }],
      [...base.messages, { role: 'assistant', content: '' }, { role: 'user', content: '继续，先只处理一个文件' }],
    ]) assert.equal((await (await invoke(app, false, { ...base, messages })).json()).choices[0].message.content, '有效正文');
    await invoke(app, false, { ...base, reasoning_effort: 'max' });
    await invoke(app, false, { ...base, reasoning_effort: 'medium' });
    assert.equal(calls.length, 8); assert.equal(calls.at(-1).reasoning_effort, 'medium');
  } finally { await app.close(); }
});

test('仅空白 SSE 仍补齐止损提示，历史中的止损提示不触发再次续接', async () => {
  const app = await gateway({ token: 'guard-test', port: 0, models: [{ id: base.model }], maxOutputTokens: 128000,
    execute: async (_body, _signal, onText) => { onText(' \n'); return { role: 'assistant', content: ' \n', finish_reason: 'length' }; } });
  try {
    const wire = await (await invoke(app, true, { ...base, stream: true })).text();
    assert.equal(wire.split('EMPTY_OUTPUT_LIMIT').length - 1, 1); assert(wire.includes('"stop_reason":"end_turn"'));
    const resumed = await (await invoke(app, true, { ...base,
      messages: [...base.messages, { role: 'assistant', content: EMPTY_OUTPUT_NOTICE }, { role: 'user', content: AUTO_RESUME_PROMPT }] })).json();
    assert.equal(resumed.content[0].text, AUTO_RESUME_NOTICE);
  } finally { await app.close(); }
});

// 指纹寿命和容量边界明确；不宣称重启后仍能识别同一原始请求。
test('指纹不依赖流式开关与预算字段别名，过期及淘汰后可释放；新进程仍阻止旧空回复自动续接', () => {
  let now = 0;
  const guard = emptyOutputGuard({ ttlMs: 100, capacity: 2, now: () => now });
  const fingerprint = guard.fingerprint(base, 64000);
  const { max_tokens, ...alias } = base;
  assert.equal(guard.fingerprint({ ...alias, max_completion_tokens: 64000, stream: true, stream_options: { include_usage: true } }, 64000), fingerprint);
  guard.finish(fingerprint, { content: '', finish_reason: 'length' }, false);
  assert.equal(guard.check(base, fingerprint), EMPTY_OUTPUT_NOTICE);
  now = 100; assert.equal(guard.check(base, fingerprint), undefined);
  for (const id of ['a', 'b', 'c']) guard.finish(id, { content: '', finish_reason: 'length' }, false);
  assert.equal(guard.check(base, 'a'), undefined); assert.equal(guard.check(base, 'c'), EMPTY_OUTPUT_NOTICE);
  const fresh = emptyOutputGuard();
  const body = { ...base, messages: [...base.messages, { role: 'user', content: AUTO_RESUME_PROMPT }, { role: 'user', content: AUTO_RESUME_PROMPT }] };
  assert.equal(fresh.check(body, fresh.fingerprint(body, 64000)), AUTO_RESUME_NOTICE);
});
