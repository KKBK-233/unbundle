import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeResumeSafety } from './native-history.mjs';

const tool = { type: 'tool_use', id: 'original' };
const result = { type: 'tool_result', tool_use_id: 'original' };
const user = { role: 'user', content: [{ type: 'text', text: '继续任务' }] };
test('原生历史候选仅允许已完成工具的恢复边界', () => {
  const history = [{ role: 'assistant', content: [tool] }, { role: 'user', content: [result] }, { role: 'assistant', content: [{ type: 'text', text: '已读取' }] }];
  assert.deepEqual(nativeResumeSafety({ history, current: user }), { safe: true });
  assert.deepEqual(nativeResumeSafety({ history: history.slice(0, 1), current: { role: 'user', content: [result] } }),
    { safe: false, reason: 'pending_tool_boundary' });
  assert.deepEqual(nativeResumeSafety({ history: [history[1]], current: user }),
    { safe: false, reason: 'orphan_tool_result' });
  assert.deepEqual(nativeResumeSafety({ history: [...history, history[0]], current: user }),
    { safe: false, reason: 'duplicate_tool_id' });
});