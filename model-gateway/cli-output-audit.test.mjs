import test from 'node:test';
import assert from 'node:assert/strict';
import { cliOutputAudit } from './cli-output-audit.mjs';

test('CLI 管道检查独立统计流式、聚合及结果，日志不保存内容', () => {
  const records = [], audit = cliOutputAudit({ requestId: 'synthetic', sink: value => records.push(value) });
  const accept = event => audit.line(JSON.stringify(event));
  audit.stdout(Buffer.from('PRIVATE_STDOUT')); audit.stderr(Buffer.from('PRIVATE_CREDENTIAL'));
  accept({ type: 'stream_event', event: { type: 'message_start' } });
  accept({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'PRIVATE_THOUGHT' } } });
  accept({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'signature_delta', signature: 'PRIVATE_SIGNATURE' } } });
  accept({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '你好' } } });
  accept({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'PRIVATE_TOOL' } } });
  accept({ type: 'assistant', message: { content: [{ type: 'text', text: '你好' }, { type: 'tool_use', input: { secret: 'PRIVATE_INPUT' } }] } });
  accept({ type: 'result', is_error: true, result: 'PRIVATE_ERROR' });
  audit.finish(); audit.finish();
  const summary = records.at(-1);
  assert.equal(summary.streamTextBytes, 6); assert.equal(summary.assistantTextBytes, 6);
  assert.equal(summary.streamToolStarts, 1); assert.equal(summary.assistantToolBlocks, 1);
  assert.equal(summary.thinkingDeltas, 1); assert.equal(summary.signatureDeltas, 1);
  assert.equal(summary.thinkingBytes, Buffer.byteLength('PRIVATE_THOUGHT'));
  assert.equal(summary.emptyThinkingDeltas, 0);
  assert.equal(summary.resultErrors, 1); assert.equal(summary.stderrBytes, 18);
  assert.equal(records.filter(r => r.event === 'summary').length, 1);
  assert(!JSON.stringify(records).includes('PRIVATE'));
});

test('思考事件区分空片段与实际字节，不保存思考正文', () => {
  const records = [], audit = cliOutputAudit({ sink: value => records.push(value) });
  for (const thinking of ['', undefined, '合成测试']) audit.line(JSON.stringify({
    type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking } },
  }));
  audit.finish();
  const summary = records.at(-1);
  assert.equal(summary.thinkingDeltas, 3);
  assert.equal(summary.emptyThinkingDeltas, 2);
  assert.equal(summary.thinkingBytes, 12);
  assert(!JSON.stringify(records).includes('合成测试'));
});

test('格式异常和非标准事件可见，未知字段不会注入日志', () => {
  const records = [], audit = cliOutputAudit({ sink: value => records.push(value) });
  audit.line('PRIVATE_NOT_JSON'); audit.line('null'); audit.line('[]');
  audit.line(JSON.stringify({ type: 'PRIVATE_EVENT', text: 'PRIVATE_TEXT' }));
  audit.line(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'RAW_TEXT' } }));
  audit.finish();
  const summary = records.at(-1);
  assert.equal(summary.malformedLines, 1); assert.equal(summary.invalidValues, 2);
  assert.equal(summary.otherEvents, 1); assert.equal(summary.directApiEvents, 1);
  assert.equal(summary.streamTextBytes, 8);
  assert(records.some(r => r.event === 'protocol_difference'));
  assert(!/PRIVATE|RAW_TEXT/.test(JSON.stringify(records)));
});

test('隐藏思考的估算进度独立记录，不和CLI镜像事件相加或当作计费用量', () => {
  const records = [], audit = cliOutputAudit({ sink: value => records.push(value) });
  const accept = value => audit.line(JSON.stringify(value));
  for (const value of [32, 48, null, -1, 'PRIVATE', 1.5]) accept({ type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '', estimated_tokens: value } } });
  accept({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 32, estimated_tokens_delta: 32 });
  accept({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 80, estimated_tokens_delta: 48 });
  // 新块累计值可归零；不把最后一个块的总值误称为整轮实际用量。
  accept({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 8, estimated_tokens_delta: 8 });
  audit.finish();
  const summary = records.at(-1);
  assert.equal(summary.thinkingBytes, 0);
  assert.equal(summary.thinkingEstimateEvents, 2);
  assert.equal(summary.thinkingEstimatedDeltaTokens, 80);
  assert.equal(summary.nativeThinkingEstimateEvents, 3);
  assert.equal(summary.nativeThinkingEstimatedTokens, 8);
  assert.equal(summary.nativeThinkingEstimatedDeltaTokens, 88);
  assert.equal(summary.resultEvents, 0);
  assert(!JSON.stringify(records).includes('PRIVATE'));
});
