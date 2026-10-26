import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gateway } from './server.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
// 模拟半截上传、慢速大正文、推理期间断线，均不调用真实模型。
function open(server, length) {
  let resolve, reject;
  const response = new Promise((yes, no) => { resolve = yes; reject = no; });
  const req = http.request({ hostname: '127.0.0.1', port: server.port, path: '/v1/chat/completions', method: 'POST',
    headers: { authorization: 'Bearer upload-test', 'content-type': 'application/json', 'content-length': length } }, res => {
    let raw = ''; res.on('data', chunk => raw += chunk); res.on('error', reject);
    res.on('end', () => resolve({ status: res.statusCode, raw, headers: res.headers }));
  });
  req.on('error', reject);
  return { req, response };
}
const body = JSON.stringify({ model: 'claude-code-sonnet', messages: [{ role: 'user', content: 'synthetic' }] });

test('上传停顿明确返回 408，归还容量且不启动执行；恢复后请求可成功', async () => {
  let calls = 0; const records = [];
  const server = await gateway({ token: 'upload-test', port: 0, bodyIdleTimeoutMs: 180, bodyTimeoutMs: 1500,
    onTiming: r => records.push(r), execute: async () => { calls++; return { role: 'assistant', content: 'OK' }; } });
  try {
    const stalled = open(server, Buffer.byteLength(body));
    stalled.req.write(body.slice(0, 10));
    const result = await stalled.response;
    assert.equal(result.status, 408);
    assert.equal(JSON.parse(result.raw).error.code, 'REQUEST_BODY_IDLE_TIMEOUT');
    assert.equal(result.headers.connection, 'close');
    assert.equal(calls, 0); assert.equal(server.inflightBytes, 0); assert.equal(server.receivingRequests, 0);
    const record = records.find(r => r.stage === 'finished');
    assert.equal(record.outcome, 'timeout');
    assert.deepEqual(record.upload, { receivedBytes: 10, expectedBytes: Buffer.byteLength(body) });
    assert.equal(record.stages.cli_spawned, undefined);
    assert(!JSON.stringify(records).includes('synthetic'));
    const next = open(server, Buffer.byteLength(body)); next.req.end(body);
    assert.equal((await next.response).status, 200); assert.equal(calls, 1);
  } finally { await server.close({discardFrozen:true}); }
});

test('持续上传超过空闲阈值可完成，上传计时器不误杀后续慢推理', async () => {
  const server = await gateway({ token: 'upload-test', port: 0, bodyIdleTimeoutMs: 300, bodyTimeoutMs: 2000,
    execute: async () => { await delay(500); return { role: 'assistant', content: 'OK' }; } });
  try {
    const call = open(server, Buffer.byteLength(body));
    for (let offset = 0; offset < body.length; offset += 15) { call.req.write(body.slice(offset, offset + 15)); await delay(90); }
    call.req.end(); assert.equal((await call.response).status, 200);
    assert.equal(server.inflightBytes, 0); assert.equal(server.receivingRequests, 0);
  } finally { await server.close({discardFrozen:true}); }
});

test('持续滴流仍受总上传时限约束，空正文和主动断开不会泄漏容量', async () => {
  let calls = 0; const records = [];
  const server = await gateway({ token: 'upload-test', port: 0, bodyIdleTimeoutMs: 200, bodyTimeoutMs: 400,
    onTiming: r => records.push(r), execute: async () => { calls++; return { role: 'assistant', content: 'OK' }; } });
  let timer;
  try {
    const drip = open(server, 10000); drip.req.write('{');
    timer = setInterval(() => drip.req.write(' '), 40);
    const result = await drip.response; clearInterval(timer);
    assert.equal(JSON.parse(result.raw).error.code, 'REQUEST_BODY_TIMEOUT');
    const empty = open(server, 0); empty.req.end(); assert.equal((await empty.response).status, 400);
    const cancel = open(server, 10000); const rejected = assert.rejects(cancel.response); cancel.req.write('{');
    await delay(50); cancel.req.destroy(); await rejected;
    for (let n = 0; n < 40 && server.busy; n++) await delay(10);
    assert.equal(calls, 0); assert.equal(server.inflightBytes, 0); assert.equal(server.receivingRequests, 0);
    assert(records.some(r => r.stage === 'downstream_disconnected'));
  } finally { clearInterval(timer); await server.close({discardFrozen:true}); }
});

// 请求尚未上传完时也应收到完整错误正文；关闭连接不能把可读的 413 变成网络故障。
test('持续超限上传先返回完整 413 正文再关闭连接，不等待上传结束且不启动模型', async () => {
  let executions = 0;
  const server = await gateway({ token: 'upload-test', port: 0, maxRequestBytes: 1024, maxImageBytes: 1024,
    execute: async () => { executions++; return { role: 'assistant', content: 'OK' }; } });
  const call = open(server, 1000000);
  let timer;
  try {
    call.req.write('x'.repeat(2048));
    timer = setInterval(() => { if (!call.req.destroyed) call.req.write('x'.repeat(2048)); }, 10);
    const result = await call.response;
    assert.equal(result.status, 413); assert.equal(result.headers.connection, 'close');
    const failure = JSON.parse(result.raw).error;
    assert.equal(failure.code, 'REQUEST_TOO_LARGE'); assert.equal(failure.type, 'request_too_large');
    assert.equal(executions, 0); assert.equal(server.inflightBytes, 0); assert.equal(server.receivingRequests, 0);
  } finally { clearInterval(timer); call.req.destroy(); await server.close({discardFrozen:true}); }
});
