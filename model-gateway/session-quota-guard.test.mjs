import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';
import { sessionQuotaFailure, sessionQuotaGuard } from './session-quota-guard.mjs';

const message = "You've hit your session limit · resets 12:10am (America/Los_Angeles)";
const zero = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const request = { model: 'claude-code-opus', messages: [{ role: 'user', content: '合成问题' }] };
const invoke = (app, native, body) => fetch(`http://127.0.0.1:${app.port}/v1/${native ? 'messages' : 'chat/completions'}`, {
  method: 'POST', headers: { 'x-api-key': 'quota-test', authorization: 'Bearer quota-test', 'content-type': 'application/json' }, body: JSON.stringify({ max_tokens: 8192, ...body }),
});

// 复现实际 CLI 的失败结果，验证两种协议的 JSON/SSE 均正常终止，换会话和模型也不重复启动 CLI。
test('账户额度失败不再变成 502 或 SSE error，新会话请求在认证之前被拦截', async () => {
  for (const native of [false, true]) for (const stream of [false, true]) {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'session-quota-cli-'));
    let spawns = 0, authChecks = 0;
    const logs = [];
    const app = await gateway({ token: 'quota-test', port: 0, models: [{ id: request.model }, { id: 'claude-code-sonnet' }],
      onTiming: record => logs.push(record), beforeExecute: () => { authChecks++; },
      execute: (body, signal, onText, timing) => infer(body, { cli: 'synthetic', home, model: 'synthetic', signal, onText, timing,
        spawnProcess: (_cli, _args, options) => {
          spawns++;
          return spawn(process.execPath, ['--input-type=module', '-e', `
            for await (const chunk of process.stdin) {}
            console.log(JSON.stringify({type:'assistant',is_api_error_message:true,message:{content:[{type:'text',text:${JSON.stringify(message)}}]}}));
            console.log(JSON.stringify({type:'result',is_error:true,result:${JSON.stringify(message)},usage:${JSON.stringify(zero)}}));
            process.exitCode=1;
          `], options);
        } }) });
    const read = async response => {
      assert.equal(response.status, 200);
      if (!stream) {
        const value = await response.json();
        assert.equal(native ? value.stop_reason : value.choices[0].finish_reason, native ? 'end_turn' : 'stop');
        return native ? value.content[0].text : value.choices[0].message.content;
      }
      const wire = await response.text();
      assert(!wire.includes('event: error')); assert(!wire.includes('"type":"api_error"'));
      assert(wire.includes(native ? '"stop_reason":"end_turn"' : '"finish_reason":"stop"'));
      if (native) assert(wire.includes('event: message_stop'));
      else assert(wire.endsWith('data: [DONE]\n\n'));
      return wire;
    };
    try {
      for (const body of [request, request, { model: 'claude-code-sonnet', messages: [{ role: 'user', content: '另一个新会话' }] }]) {
        assert((await read(await invoke(app, native, { ...body, stream }))).includes('SESSION_LIMIT'));
      }
      assert.equal(spawns, 1); assert.equal(authChecks, 1);
      assert.equal(logs.filter(e => e.stage === 'session_quota_stopped').length, 1);
      assert.equal(logs.filter(e => e.stage === 'session_quota_retry_blocked').length, 2);
      assert(!logs.some(e => e.stage === 'first_text'));
      assert(!JSON.stringify(logs).includes(message));
      assert.equal(app.activeRequests, 0); assert.equal(app.inflightBytes, 0);
      assert.deepEqual(await fs.readdir(home), ['workspace']);
    } finally { await app.close(); await fs.rm(home, { recursive: true, force: true }); }
  }
});

test('排队的新会话在上一请求确认额度耗尽后不再启动推理', async () => {
  let started, finish;
  const began = new Promise(resolve => started = resolve), gate = new Promise(resolve => finish = resolve);
  let executions = 0;
  const app = await gateway({ token: 'quota-test', port: 0, maxConcurrent: 1, models: [{ id: request.model }],
    execute: async () => { executions++; started(); await gate; throw sessionQuotaFailure(message); } });
  try {
    const first = invoke(app, false, request); await began;
    const queued = invoke(app, false, { ...request, messages: [{ role: 'user', content: '新会话' }] });
    for (let i = 0; i < 100 && app.queuedRequests === 0; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(app.queuedRequests, 1); finish();
    for (const response of await Promise.all([first, queued])) assert((await response.json()).choices[0].message.content.includes('SESSION_LIMIT'));
    assert.equal(executions, 1); assert.equal(app.activeRequests, 0); assert.equal(app.queuedRequests, 0);
  } finally { finish(); await app.close(); }
});

// 时钟跨午夜、夏令时重复时刻及未知提示的冷却必须可释放，不能把账户永久封锁。
test('重置时间按上游 IANA 时区计算，过期释放；缺失或无效时间只冷却一分钟', () => {
  let now = Date.parse('2026-10-06T05:40:00Z');
  const guard = sessionQuotaGuard({ now: () => now });
  const error = sessionQuotaFailure(message, {}, now);
  assert.equal(error.expiresAt, Date.parse('2026-10-06T07:10:00Z'));
  assert(error.message.includes('00:10（America/Los_Angeles）'));
  guard.record(error); assert(guard.check());
  now = error.expiresAt; assert.equal(guard.check(), undefined);
  const dst = sessionQuotaFailure("You've hit your session limit · resets 1:10am (America/Los_Angeles)", {}, Date.parse('2026-11-01T08:40:00Z'));
  assert.equal(dst.expiresAt, Date.parse('2026-11-01T09:10:00Z'));
  for (const suffix of ['', ' · resets 13:99am (America/Los_Angeles)', ' · resets 1:10am (No/Such_Zone)', ' · resets 12:10pm (America/Los_Angeles)']) {
    const fallback = sessionQuotaFailure("You've hit your session limit" + suffix, {}, now);
    assert.equal(fallback.expiresAt, now + 60000); guard.record(fallback);
    now += 60000; assert.equal(guard.check(), undefined);
  }
  assert.equal(guard.record(new Error('网络断开')), undefined);
  for (const text of ['429 rate limit', 'Connection reset', '输出 token 上限无效', `模型引用：${message}`, "You've hit your weekly limit"]) {
    assert.equal(sessionQuotaFailure(text), undefined);
  }
});

test('正常正文中的额度引用不触发冷却，未知错误仍返回原错误', async () => {
  let executions = 0;
  const app = await gateway({ token: 'quota-test', port: 0, models: [{ id: request.model }], execute: async body => {
    executions++;
    if (body.messages[0].content === '网络') throw new Error('Connection reset');
    return { role: 'assistant', content: message };
  } });
  try {
    for (let i = 0; i < 2; i++) assert.equal((await (await invoke(app, false, request)).json()).choices[0].message.content, message);
    const response = await invoke(app, false, { ...request, messages: [{ role: 'user', content: '网络' }] });
    assert.equal(response.status, 502); assert.equal((await response.json()).error.message, 'Connection reset');
    assert.equal(executions, 3);
  } finally { await app.close(); }
});
