import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { cliDiagnostics, refusalExplanation } from './cli-diagnostics.mjs';
import { infer } from './engine.mjs';
import { sessionRelay } from './session-relay.mjs';
import { gateway } from './server.mjs';
const stream = event => ({ type: 'stream_event', event });

// 原始拒绝、CLI 内部说明及下一条消息均独立记录，不从回复正文猜测原因。
test('拒绝类别、原因、请求关联及消息去重可追踪，诊断不记录正文和凭据', () => {
  const rows = [], audit = cliDiagnostics({ requestId: 'gateway-id', sink: row => rows.push(row) });
  audit.context({ cliVersion: '2.1.310', model: 'claude-opus-5-5', token: 'PRIVATE_TOKEN' });
  for (let n = 0; n < 2; n++) audit.accept(stream({ type: 'message_start', message: { id: 'msg_first', model: 'claude-opus-5-5' } }));
  audit.accept(stream({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'PRIVATE_TEXT' } }));
  audit.accept(stream({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'PRIVATE_THINKING', signature: 'PRIVATE_SIGNATURE' } }));
  audit.accept(stream({ type: 'message_delta', delta: { stop_reason: 'refusal', stop_details: { category: 'cyber', explanation: 'Synthetic policy explanation', fallback_credit_token: 'PRIVATE_CREDIT' } } }));
  audit.accept({ type: 'assistant', is_api_error_message: true, requestId: 'req_upstream', message: {
    id: 'msg_first', stop_reason: 'refusal', stop_details: { category: 'cyber', explanation: 'Synthetic policy explanation' }, content: [{ type: 'text', text: 'PRIVATE_ERROR_TEXT' }] } });
  audit.accept({ type: 'system', subtype: 'informational', content: "Claude's safeguards stopped the response above · continuing once with that noted" });
  audit.accept({ type: 'user', isMeta: true, turnCompanion: true, refusedMessageId: 'msg_first', message: { content: 'PRIVATE_INTERNAL_PROMPT' } });
  audit.accept({ type: 'system', subtype: 'model_refusal_fallback', scope: 'session', direction: 'retry', originalModel: 'claude-opus-5-5', fallbackModel: 'claude-sonnet-5', apiRefusalCategory: 'cyber', apiRefusalExplanation: 'Synthetic fallback', creditCode: 'PRIVATE_CREDIT' });
  audit.accept({ type: 'refusal_continuation', phase: 'begin', salvageText: 'PRIVATE_SALVAGE' });
  audit.accept({ type: 'query_model_change', toModel: 'claude-sonnet-5' });
  audit.accept(stream({ type: 'message_start', message: { id: 'msg_second' } }));
  audit.accept(stream({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }));
  audit.accept({ type: 'result', subtype: 'success', is_error: false, result: 'PRIVATE_RESULT', num_turns: 2 });
  audit.finish('success'); audit.finish('success');
  const ends = rows.filter(row => row.event === 'message_end');
  assert.equal(ends[0].category, 'cyber'); assert.equal(ends[0].explanation, 'Synthetic policy explanation');
  assert.equal(ends[0].messageId, 'msg_first'); assert.equal(ends[1].upstreamRequestId, 'req_upstream'); assert.equal(ends[1].isApiError, true);
  assert.equal(ends[2].stopReason, 'end_turn');
  assert(rows.some(row => row.event === 'refusal_notice'));
  assert(rows.some(row => row.event === 'meta_message' && row.refusedMessageId === 'msg_first'));
  assert(rows.some(row => row.event === 'model_refusal_fallback' && row.category === 'cyber'));
  assert(rows.some(row => row.event === 'query_model_change' && row.model === 'claude-sonnet-5'));
  const summary = rows.at(-1);
  assert.equal(summary.messageStartEvents, 3); assert.equal(summary.uniqueMessageIds, 2); assert.equal(summary.duplicateStarts, 1);
  assert.equal(summary.refusalEvents, 2); assert.equal(summary.apiRetries, 0); assert.equal(summary.num_turns, undefined);
  assert(rows.every(row => row.requestId === 'gateway-id'));
  assert(!JSON.stringify(rows).includes('PRIVATE'));
});

test('原因说明限长脱敏，空类别与未知结束原因不伪装成明确判定', () => {
  const reason = 'Bearer PRIVATE_BEARER api_key="PRIVATE_KEY" password=PRIVATE_PASSWORD https://host/private?token=PRIVATE_QUERY sk-ant-PRIVATE_SECRET ' + 'x'.repeat(100) + '\nSafe explanation';
  const clean = refusalExplanation(reason);
  assert(!clean.includes('PRIVATE')); assert(clean.includes('Safe explanation')); assert(!clean.includes('\n'));
  assert.equal(refusalExplanation('word '.repeat(300)).length, 512);
  const rows = [], audit = cliDiagnostics({ sink: row => rows.push(row) });
  audit.accept(stream({ type: 'message_delta', delta: { stop_reason: 'PRIVATE_STOP', stop_details: null } }));
  audit.accept({ type: 'assistant', is_api_error_message: true, message: { id: 'msg_error', stop_details: { explanation: 'Synthetic reason' } } });
  audit.accept({ type: 'system', subtype: 'api_retry', attempt: 1, status_code: 529, error: { message: 'PRIVATE_ERROR' } });
  audit.accept({ type: 'assistant', message: { id: 'msg_plain', stop_reason: 'end_turn', content: [{ type: 'text', text: 'refusal PRIVATE_TEXT' }] } });
  audit.finish('success');
  assert.equal(rows[0].stopReason, 'unknown'); assert.equal(rows[0].detailsPresent, false);
  assert.equal(rows[1].event, 'assistant_error'); assert.equal(rows[2].status, 529);
  assert.equal(rows.at(-1).refusalEvents, 0); assert(!JSON.stringify(rows).includes('PRIVATE'));
});

test('重复消息洪泛有界，拒绝保留独立额度；日志故障不改变请求', () => {
  const rows = [], audit = cliDiagnostics({ sink: row => rows.push(row), maxRecords: 2, maxPriorityRecords: 1 });
  for (let i = 0; i < 600; i++) audit.accept(stream({ type: 'message_start', message: { id: `msg_${i}` } }));
  for (let i = 0; i < 2; i++) audit.accept(stream({ type: 'message_delta', delta: { stop_reason: 'refusal' } }));
  audit.finish('error'); audit.accept({ type: 'result' });
  assert.equal(rows.length, 4); assert.equal(rows[2].stopReason, 'refusal'); assert.equal(rows[3].uniqueMessageIds, 256);
  assert.equal(rows[3].messageTrackingOverflow, 344); assert.equal(rows[3].droppedRecords, 599);
  const broken = cliDiagnostics({ sink() { throw new Error('sink failed'); } });
  assert.doesNotThrow(() => { broken.context({}); broken.accept(stream({ type: 'message_delta', delta: { stop_reason: 'refusal' } })); broken.finish('error'); });
});

// 两条执行路径均须在错误占位被解析器过滤之前捕获拒绝元数据。
for (const native of [false, true]) test(`${native ? '原生会话' : '逐轮CLI'}记录被转换器忽略的拒绝及后续消息，并关联本地响应ID`, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-diagnostics-')), rows = [];
  const fake = `import readline from 'node:readline';const emit=x=>console.log(JSON.stringify(x));
    readline.createInterface({input:process.stdin}).on('line',()=>{
      emit({type:'assistant',is_api_error_message:true,requestId:'req_refused',message:{id:'msg_refused',stop_reason:'refusal',stop_details:{category:'reasoning_extraction',explanation:'Synthetic explanation',fallback_credit_token:'PRIVATE'},content:[{type:'text',text:'PRIVATE'}]}});
      emit({type:'system',subtype:'informational',content:"Claude's safeguards stopped the response above · continuing once with that noted"});
      emit({type:'stream_event',event:{type:'message_start',message:{id:'msg_next',model:'claude-opus-5-5'}}});
      emit({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'OK'}}});
      emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'}}});
      emit({type:'result',subtype:'success',is_error:false,result:'OK'});
    });`;
  const options = { cli: 'synthetic', cliVersion: '2.1.310', home, model: 'claude-opus-5-5', modelFor: m => m, timeoutMs: 4000,
    spawnProcess: (_cli, _args, opts) => spawn(process.execPath, ['--input-type=module', '-e', fake], opts) };
  const relay = native ? sessionRelay(options) : undefined;
  const app = await gateway({ token: 'test', port: 0, models: [{ id: 'claude-opus-5-5' }], onTiming: row => rows.push(row),
    execute: (body, signal, onText, timing) => native ? relay.infer(body, { signal, onText, timing }) : infer(body, { ...options, signal, onText, timing }) });
  try {
    const result = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 1024, messages: [{ role: 'user', content: 'synthetic' }] }) });
    const body = await result.json(); assert.equal(result.status, 200, JSON.stringify(body)); assert.equal(body.content[0].text, 'OK');
    const requestId = result.headers.get('x-relay-request-id');
    const refusal = rows.find(row => row.type === 'gateway_cli_event' && row.event === 'message_end' && row.stopReason === 'refusal');
    assert.equal(refusal.requestId, requestId); assert.equal(refusal.upstreamRequestId, 'req_refused'); assert.equal(refusal.category, 'reasoning_extraction');
    assert.equal(refusal.explanation, 'Synthetic explanation');
    assert(rows.some(row => row.event === 'refusal_notice'));
    assert(rows.some(row => row.stage === 'response_binding' && row.responseId === body.id && row.requestId === requestId));
    assert(rows.some(row => row.event === 'summary' && row.refusalEvents === 1 && row.outcome === 'success'));
    assert(!JSON.stringify(rows).includes('PRIVATE'));
  } finally { await app.close(); await relay?.close({ discardFrozen: true }); await fs.rm(home, { recursive: true, force: true }); }
});

// 经过 HTTP 网关及两种执行器验证交接日志，全部使用合成 CLI，不访问真实模型。
for (const native of [false, true]) test(`${native ? '原生会话' : '独立进程'}：工具发现与最终交接沿同一请求关联且不改变编辑`, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-diagnostics-')), rows = [];
  const fake = `import fs from 'node:fs';import readline from 'node:readline';const send=x=>console.log(JSON.stringify(x));
    const config=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).mcpServers.omp;
    readline.createInterface({input:process.stdin}).once('line',async()=>{
      send({type:'stream_event',event:{type:'message_start',message:{id:'msg_discovery'}}});
      send({type:'assistant',message:{id:'msg_discovery',content:[{type:'tool_use',id:'search',name:'ToolSearch',input:{query:'select:mcp__omp__Edit'}}]}});
      send({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'}}});
      send({type:'user',message:{content:[{type:'tool_result',tool_use_id:'search',content:[{type:'tool_reference',tool_name:'mcp__omp__Edit'}]}]}});
      send({type:'stream_event',event:{type:'message_start',message:{id:'msg_edit'}}});
      send({type:'assistant',message:{id:'msg_edit',content:[{type:'tool_use',id:'edit',name:'mcp__omp__Edit',input:{file_path:'PRIVATE_PATH',old_string:'PRIVATE_OLD',new_string:'PRIVATE_NEW'}}]}});
      send({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'}}});
      await fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'rpc-edit',method:'tools/call',params:{name:'Edit',arguments:{file_path:'PRIVATE_PATH',old_string:'PRIVATE_OLD',new_string:'PRIVATE_NEW'},_meta:{'claudecode/toolUseId':'edit'}}})}).catch(()=>{});
    });`;
  const options = { cli: 'synthetic', home, model: 'claude-opus-5-5', modelFor: m => m, toolSearch: true, timeoutMs: 5000,
    spawnProcess: (_cli, args, opts) => spawn(process.execPath, ['--input-type=module', '-e', fake, '--', args[args.indexOf('--mcp-config') + 1]], opts) };
  const relay = native ? sessionRelay(options) : undefined;
  const app = await gateway({ token: 'test', port: 0, models: [{ id: options.model }], onTiming: row => rows.push(row),
    execute: (body, signal, onText, timing) => native ? relay.infer(body, { signal, onText, timing }) : infer(body, { ...options, signal, onText, timing }) });
  try {
    const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: JSON.stringify({ model: options.model, max_tokens: 1024, messages: [{ role: 'user', content: 'synthetic' }], tools: [{ name: 'Edit', input_schema: { type: 'object' } }] }) });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.stop_reason, 'tool_use');
    assert.deepEqual(result.content, [{ type: 'tool_use', id: 'edit', name: 'Edit', input: { file_path: 'PRIVATE_PATH', old_string: 'PRIVATE_OLD', new_string: 'PRIVATE_NEW' } }]);
    const calls = rows.filter(r => r.event === 'tool_call'); assert.equal(calls.length, 2);
    assert.equal(calls[0].kind, 'discovery'); assert.deepEqual(calls[0].targetTools, ['Edit']);
    assert.equal(calls[1].tool, 'Edit'); assert.equal(calls[1].kind, 'caller');
    assert.deepEqual(rows.find(r => r.event === 'tool_search_result').referencedTools, ['Edit']);
    const handoff = rows.find(r => r.event === 'tool_handoff');
    assert.equal(handoff.tool, 'Edit'); assert.equal(handoff.toolOrdinal, calls[1].toolOrdinal);
    assert.equal(handoff.requestId, response.headers.get('x-relay-request-id'));
    assert(rows.some(r => r.stage === 'response_binding' && r.responseId === result.id && r.requestId === handoff.requestId));
    const summary = rows.find(r => r.event === 'summary');
    assert.equal(summary.toolSearchCalls, 1); assert.equal(summary.callerToolCalls, 1); assert.equal(summary.toolHandoffCalls, 1);
    assert(!JSON.stringify(rows).includes('PRIVATE'));
  } finally { await app.close(); await relay?.close({ discardFrozen: true }); await fs.rm(home, { recursive: true, force: true }); }
});
