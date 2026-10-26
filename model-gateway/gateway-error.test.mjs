import test from 'node:test';
import assert from 'node:assert/strict';
import { gateway } from './server.mjs';

const body = { model: 'claude-code-sonnet', max_tokens: 1024, messages: [{ role: 'user', content: '合成错误回归' }] };
const headers = { authorization: 'Bearer error-test', 'content-type': 'application/json' };
const invoke = (app, native, extra = {}, customHeaders = headers) => fetch(`http://127.0.0.1:${app.port}/v1/${native ? 'messages' : 'chat/completions'}`, {
  method: 'POST', headers: customHeaders, body: JSON.stringify({ ...body, ...extra }),
});

// 区分访问中继的令牌与云端 CLI 登录，两种错误都不能进入上游推理。
test('无效中继令牌与跨域请求返回可读诊断，两种协议均不启动执行', async () => {
  let executions = 0, authChecks = 0;
  const app = await gateway({ token: 'error-test', port: 0, beforeExecute: () => { authChecks++; },
    execute: async () => { executions++; return { role: 'assistant', content: 'OK' }; } });
  try {
    for (const native of [false, true]) {
      const invalid = await invoke(app, native, {}, { ...headers, authorization: 'Bearer invalid' });
      assert.equal(invalid.status, 401);
      const denied = await invalid.json();
      assert.equal(denied.error.type, 'authentication_error'); assert.equal(denied.error.code, 'INVALID_GATEWAY_TOKEN');
      assert.equal(denied.type, native ? 'error' : undefined);
      const origin = await invoke(app, native, {}, { ...headers, origin: 'https://untrusted.invalid' });
      assert.equal(origin.status, 403); assert.equal((await origin.json()).error.code, 'ORIGIN_REJECTED');
    }
    assert.equal(executions, 0); assert.equal(authChecks, 0);
  } finally { await app.close({discardFrozen:true}); }
});

test('已确认未登录返回 401，认证检查失败保留 503；恢复后新请求可以正常执行', async () => {
  let mode = 'AUTH_REQUIRED', executions = 0;
  const app = await gateway({ token: 'error-test', port: 0,
    beforeExecute: () => { if (mode) throw Object.assign(new Error(mode + '：合成认证诊断'), { status: 503, code: mode }); },
    execute: async () => { executions++; return { role: 'assistant', content: 'OK' }; } });
  try {
    for (const native of [false, true]) for (const stream of [false, true]) {
      for (const code of ['AUTH_REQUIRED', 'AUTH_CHECK_FAILED']) {
        mode = code;
        const response = await invoke(app, native, { stream });
        assert.equal(response.status, code === 'AUTH_REQUIRED' ? 401 : 503);
        assert.match(response.headers.get('content-type'), /application\/json/);
        const error = (await response.json()).error;
        assert.equal(error.code, code); assert.equal(error.type, code === 'AUTH_REQUIRED' ? 'authentication_error' : 'api_error');
      }
    }
    assert.equal(executions, 0); assert.equal(app.activeRequests, 0); assert.equal(app.inflightBytes, 0);
    mode = undefined;
    assert.equal((await (await invoke(app, false)).json()).choices[0].message.content, 'OK');
    assert.equal(executions, 1);
  } finally { await app.close({discardFrozen:true}); }
});

// 已开启 SSE 后不能更改 HTTP 状态，但仍须保留实际错误类型与诊断码，不能假报成功。
test('执行中错误的 JSON 与 SSE 保留认证、限流及未知故障分类，部分正文不被伪装成成功', async () => {
  for (const native of [false, true]) for (const stream of [false, true]) {
    let current;
    const app = await gateway({ token: 'error-test', port: 0, execute: async (_body, _signal, onText) => {
      if (stream) onText('合成部分正文');
      throw current;
    } });
    try {
      for (const [status, code, type] of [[401, 'AUTH_REQUIRED', 'authentication_error'], [429, 'UPSTREAM_RATE_LIMIT', 'rate_limit_error'],
        [503, 'UPSTREAM_UNAVAILABLE', 'api_error'], [undefined, undefined, 'api_error']]) {
        current = Object.assign(new Error('合成执行错误'), { status, code });
        const response = await invoke(app, native, { stream });
        if (!stream) {
          assert.equal(response.status, status || 502);
          const value = await response.json(); assert.equal(value.error.type, type); assert.equal(value.error.code, code || 'GATEWAY_ERROR');
        } else {
          assert.equal(response.status, 200);
          const wire = await response.text();
          const events = wire.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
          const failure = events.find(event => event.error);
          assert.equal(failure.error.type, type); assert.equal(failure.error.code, code || 'GATEWAY_ERROR');
          assert.equal(failure.error.message, '合成执行错误'); assert(wire.includes('合成部分正文'));
          assert(!wire.includes('"finish_reason":"stop"')); assert(!wire.includes('event: message_stop'));
        }
        assert.equal(app.activeRequests, 0); assert.equal(app.inflightBytes, 0);
      }
    } finally { await app.close({discardFrozen:true}); }
  }
});

test('无效请求明确返回 400 与错误码，拒绝发生在认证和执行之前', async () => {
  let authChecks = 0, executions = 0;
  const app = await gateway({ token: 'error-test', port: 0, beforeExecute: () => { authChecks++; },
    execute: async () => { executions++; return { role: 'assistant', content: 'OK' }; } });
  try {
    for (const native of [false, true]) {
      const base = `http://127.0.0.1:${app.port}/v1/${native ? 'messages' : 'chat/completions'}`;
      const malformed = await fetch(base, { method: 'POST', headers, body: '{' });
      assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
      const unknown = await invoke(app, native, { model: 'unknown-model' });
      assert.equal(unknown.status, 400); assert.equal((await unknown.json()).error.code, 'UNKNOWN_MODEL');
    }
    assert.equal(authChecks, 0); assert.equal(executions, 0); assert.equal(app.inflightBytes, 0);
  } finally { await app.close({discardFrozen:true}); }
});
