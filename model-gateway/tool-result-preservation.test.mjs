import test from 'node:test';
import assert from 'node:assert/strict';
import { fromAnthropic } from './anthropic.mjs';
import { mcpToolResult } from './session-history.mjs';
import { compileContext } from './context.mjs';
import { nativeHistoryBootstrap } from './native-history.mjs';

const convert = (content, is_error) => fromAnthropic({ model: 'claude-opus-5-5', max_tokens: 1024,
  tools: [{ name: 'Bash', input_schema: { type: 'object' } }], messages: [
    { role: 'user', content: '合成任务' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'original', name: 'Bash', input: { command: 'synthetic-only' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'original', content, is_error }] },
  ] });

test('错误工具正文按字节保留，错误状态通过MCP标记而非另包JSON', () => {
  for (const text of ['Exit code 1\n保留原文 😀', '', '{"is_error":true,"content":"这是工具真实输出"}']) {
    const request = convert(text, true), message = request.messages.at(-1);
    const result = mcpToolResult(message);
    assert.equal(message.content, text);
    assert.equal(message.tool_call_id, 'original');
    assert.deepEqual(result, { content: [{ type: 'text', text }], isError: true });
  }
});

test('纯文本多块工具结果不合并或凭空加入换行，成功和失败均保持块边界', () => {
  const content = [{ type: 'text', text: '第一块\n' }, { type: 'text', text: '{"原始":"第二块"}' }];
  for (const failed of [false, true]) {
    const result = mcpToolResult(convert(content, failed).messages.at(-1));
    assert.deepEqual(result.content, content);
    assert.equal(result.isError, failed ? true : undefined);
  }
});

test('原生历史候选也保留错误正文和状态，不改变调用ID或伪造结果', () => {
  const text = 'Exit code 1\n真实错误';
  const request = convert(text, true);
  const native = nativeHistoryBootstrap(request, compileContext(request));
  assert.deepEqual(native.current.content[0], { type: 'tool_result', tool_use_id: 'original',
    content: [{ type: 'text', text }], is_error: true });
});
