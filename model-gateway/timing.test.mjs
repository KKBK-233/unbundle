import test from 'node:test';
import assert from 'node:assert/strict';
import { createTiming } from './timing.mjs';

// 阶段日志只接受固定事件与数值；未知字段和正文不得进入输出。
test('进展快照保留最后事件与计数，拒绝正文和未知事件', () => {
  const records = [];
  const timing = createTiming(value => records.push(value));
  timing.observe('tool_delta', { toolArgumentBytes: 200000, pendingTools: 1, retryEvents: 0, stdoutBytes: -1,
    content: 'PRIVATE_CONTENT', token: 'PRIVATE_TOKEN' });
  timing.observe('PRIVATE_EVENT', { toolArgumentBytes: 999999 });
  timing.finish('timeout');
  assert.equal(records.length, 1);
  assert.equal(records[0].progress.event, 'tool_delta');
  assert.equal(records[0].progress.toolArgumentBytes, 200000);
  assert.equal(records[0].progress.pendingTools, 1);
  assert.equal(records[0].progress.stdoutBytes, undefined);
  assert(!JSON.stringify(records).includes('PRIVATE'));
  timing.observe('result', { pendingTools: 0 });
  timing.finish('success');
  assert.equal(records.length, 1);
});
