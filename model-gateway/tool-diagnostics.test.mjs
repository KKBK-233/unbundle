import test from 'node:test';
import assert from 'node:assert/strict';
import { cliDiagnostics } from './cli-diagnostics.mjs';
import { CliEvents } from './cli-events.mjs';
import { toolDiagnostics } from './tool-diagnostics.mjs';

const stream = event => ({ type: 'stream_event', event });

// 合成流式及聚合快照，确保诊断不把一次发现记为两次，也不泄露参数或工具正文。
test('发现目标、真实引用与调用方选择分开记录，片段读取仅记录范围类别', () => {
  const rows = [], audit = cliDiagnostics({ requestId: 'test', sink: row => rows.push(row) });
  const events = new CliEvents([{ name: 'Read', original: 'Read' }, { name: 'Edit', original: 'Edit' }], undefined, [],
    { allowToolSearch: true, onToolCall: call => audit.toolCall(call) });
  const emit = event => { audit.accept(event); events.accept(event); };
  emit(stream({ type: 'message_start', message: { id: 'msg_search' } }));
  emit(stream({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'PRIVATE_SEARCH_ID', name: 'ToolSearch', input: {} } }));
  emit(stream({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ query: 'select:mcp__omp__Read,mcp__omp__Edit,mcp__omp__PRIVATE_TOOL' }) } }));
  emit(stream({ type: 'content_block_stop', index: 0 }));
  emit({ type: 'assistant', message: { id: 'msg_search', content: [{ type: 'tool_use', id: 'PRIVATE_SEARCH_ID', name: 'ToolSearch', input: { query: 'select:mcp__omp__Read,mcp__omp__Edit,mcp__omp__PRIVATE_TOOL' } }] } });
  const result = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'PRIVATE_SEARCH_ID', content: [
    { type: 'text', text: 'PRIVATE_RESULT' }, { type: 'tool_reference', tool_name: 'mcp__omp__Edit' },
    { type: 'tool_reference', tool_name: 'mcp__omp__PRIVATE_TOOL' }] }] } };
  emit(result); emit(result);
  emit({ type: 'assistant', message: { id: 'msg_read', content: [{ type: 'tool_use', id: 'PRIVATE_READ_ID', name: 'mcp__omp__Read', input: { file_path: 'PRIVATE_PATH', offset: 13, limit: 6 } }] } });
  audit.toolHandoff([...events.calls.values()]); audit.finish('success');
  const search = rows.find(r => r.event === 'tool_call' && r.kind === 'discovery');
  assert.deepEqual(search.targetTools, ['Edit', 'Read', 'other']); assert.equal(search.targetCount, 3);
  const found = rows.filter(r => r.event === 'tool_search_result');
  assert.equal(found.length, 1); assert.equal(found[0].toolOrdinal, search.toolOrdinal);
  assert.deepEqual(found[0].referencedTools, ['Edit', 'other']);
  const call = rows.find(r => r.event === 'tool_call' && r.kind === 'caller');
  assert.equal(call.tool, 'Read'); assert.equal(call.readRange, 'explicit');
  const handoff = rows.find(r => r.event === 'tool_handoff');
  assert.equal(handoff.toolOrdinal, call.toolOrdinal); assert.equal(handoff.phase, 'response_ready');
  assert.equal(rows.at(-1).toolSearchCalls, 1); assert.equal(rows.at(-1).callerToolCalls, 1);
  assert.equal(rows.at(-1).toolHandoffCalls, 1); assert(!JSON.stringify(rows).includes('PRIVATE'));
});

test('自由搜索和纯文本结果不猜测已加载工具，诊断异常不影响解析', () => {
  const rows = [], audit = cliDiagnostics({ sink: row => rows.push(row) });
  audit.toolCall({ id: 's', kind: 'search', query: 'find Edit in PRIVATE_PATH with PRIVATE_TOKEN' });
  audit.accept({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 's', content: 'Edit loaded PRIVATE_RESULT', is_error: true }] } });
  audit.toolCall({ id: 'r', kind: 'caller', name: 'Read', readRange: 'default' });
  audit.toolCall({ id: 'c', kind: 'caller', name: 'PRIVATE_CUSTOM_TOOL' });
  audit.finish('success'); const frozen = rows.length;
  audit.toolCall({ id: 'late', kind: 'caller', name: 'Edit' }); audit.toolHandoff([]);
  assert.equal(rows.length, frozen);
  const search = rows.find(r => r.event === 'tool_call');
  assert.equal(search.queryMode, 'search'); assert.equal(search.targetTools, undefined);
  const found = rows.find(r => r.event === 'tool_search_result');
  assert.equal(found.referenceCount, 0); assert.equal(found.isError, true);
  assert.deepEqual(found.referencedTools, []); assert(!JSON.stringify(rows).includes('PRIVATE'));
  const events = new CliEvents([{ name: 'Read', original: 'Read' }], undefined, [], { onToolCall() { throw new Error('diagnostic failure'); } });
  events.addCall({ id: 'r', name: 'mcp__omp__Read', input: { file_path: 'x' } });
  assert.equal(events.calls.get('r').function.name, 'Read');
});

test('工具跟踪与记录有上限，溢出可见且摘要仍然保留', () => {
  const out = [], tools = toolDiagnostics((event, fields) => out.push({ event, ...fields }), { maxTracked: 2 });
  for (let n = 0; n < 20; n++) tools.call({ id: String(n), kind: 'caller', name: 'Read' });
  assert.equal(out.length, 2); assert.equal(tools.summary().toolTrackingOverflow, 18);
  const rows = [], audit = cliDiagnostics({ sink: row => rows.push(row), maxRecords: 2 });
  for (let n = 0; n < 300; n++) audit.toolCall({ id: String(n), kind: 'caller', name: 'Read' });
  audit.finish('success');
  assert.equal(rows.length, 3); assert.equal(rows.at(-1).event, 'summary');
  assert.equal(rows.at(-1).callerToolCalls, 256); assert.equal(rows.at(-1).toolTrackingOverflow, 44);
  assert.equal(rows.at(-1).droppedRecords, 254);
});
