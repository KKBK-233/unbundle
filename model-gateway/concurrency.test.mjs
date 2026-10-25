import test from 'node:test';
import assert from 'node:assert/strict';
import { gateway } from './server.mjs';
import { scheduler } from './scheduler.mjs';

test('排队按顺序执行，取消等待不占用后续容量，释放不重复计数', async () => {
  const pool = scheduler({ maxConcurrent: 1, maxQueued: 2, queueTimeoutMs: 1000 });
  const release = await pool.acquire();
  const abort = new AbortController();
  const cancelled = assert.rejects(pool.acquire(abort.signal), /abort/i);
  const next = pool.acquire();
  assert.equal(pool.queued, 2);
  await assert.rejects(pool.acquire(), error => error.code === 'QUEUE_FULL');
  abort.abort(); await cancelled;
  assert.equal(pool.queued, 1);
  release(); release();
  const finish = await next;
  assert.equal(pool.running, 1); assert.equal(pool.queued, 0);
  finish(); assert.equal(pool.running, 0);
  const hold = await pool.acquire();
  const closed = assert.rejects(pool.acquire(), error => error.code === 'GATEWAY_CLOSING');
  pool.close({discardFrozen:true}); await closed; hold();
});

test('主请求与辅助请求实际重叠，排队请求断线后不执行，下一请求仍能成功', async () => {
  let release;
  const barrier = new Promise(resolve => release = resolve);
  const started = [];
  let peak = 0, running = 0;
  const server = await gateway({ token: 'concurrency', port: 0, maxConcurrent: 2, maxQueued: 2,
    execute: async body => {
      started.push(body.messages[0].content); running++; peak = Math.max(peak, running);
      await barrier; running--;
      return { role: 'assistant', content: body.messages[0].content };
    } });
  const call = (content, signal) => fetch(`http://127.0.0.1:${server.port}/v1/chat/completions`, {
    method: 'POST', headers: { authorization: 'Bearer concurrency', 'content-type': 'application/json' }, signal,
    body: JSON.stringify({ model: 'claude-code-sonnet', messages: [{ role: 'user', content }] }),
  });
  const until = async fn => { for (let n = 0; n < 100 && !fn(); n++) await new Promise(r => setTimeout(r, 5)); assert(fn()); };
  try {
    const first = call('main'), second = call('classifier');
    await until(() => started.length === 2);
    assert.equal(server.activeRequests, 2); assert.equal(peak, 2);
    const abort = new AbortController();
    const cancelled = assert.rejects(call('cancelled', abort.signal), /abort/i);
    await until(() => server.queuedRequests === 1);
    const third = call('agent'); await until(() => server.queuedRequests === 2);
    abort.abort(); await cancelled; await until(() => server.queuedRequests === 1);
    release();
    for (const response of await Promise.all([first, second, third])) assert.equal(response.status, 200);
    assert.deepEqual(started, ['main', 'classifier', 'agent']);
    assert.equal(server.activeRequests, 0); assert.equal(server.queuedRequests, 0);
  } finally { release(); await server.close({discardFrozen:true}); }
});

test('等待超时移除请求，后续释放仍可获取容量', async () => {
  const pool = scheduler({ maxConcurrent: 1, maxQueued: 1, queueTimeoutMs: 10 });
  const release = await pool.acquire();
  await assert.rejects(pool.acquire(), error => error.code === 'QUEUE_TIMEOUT');
  assert.equal(pool.queued, 0); release();
  (await pool.acquire())(); assert.equal(pool.running, 0);
});
