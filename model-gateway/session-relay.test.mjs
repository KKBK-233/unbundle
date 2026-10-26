import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sessionRelay } from './session-relay.mjs';
import { assistantMessage } from './session-history.mjs';

// 持续读取输入的模拟 CLI；无联网、无凭据、无真实模型调用。
const fake = `import readline from 'node:readline';let turns=0;
const emit=v=>console.log(JSON.stringify(v));
const lines=readline.createInterface({input:process.stdin});
lines.on('line',line=>{let input;try{input=JSON.parse(line);}catch{return;}turns++;
emit({type:'stream_event',event:{type:'message_start',message:{id:'m'+turns,usage:{input_tokens:10,output_tokens:0}}}});
if(JSON.stringify(input).includes('API_FAILURE')){
emit({type:'assistant',is_api_error_message:true,message:{content:[{type:'text',text:'API Error: 400 private-secret'}]}});
emit({type:'result',is_error:true,result:'failed'});return;
}
if(JSON.stringify(input).includes('RAWONLY')){emit({type:'content_block_delta',delta:{type:'text_delta',text:'RAW_ONLY'}});return;}
if(JSON.stringify(input).includes('HEARTBEAT')){setInterval(()=>emit({type:'system',subtype:'status',status:'busy'}),10);return;}
if(JSON.stringify(input).includes('WAIT'))return;
if(JSON.stringify(input).includes('THINKING_LIMIT')){
emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'',estimated_tokens:128}}});
emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'max_tokens'},usage:{output_tokens:1024}}});
return;
}
emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'READY'}}});
emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:5}}});
emit({type:'result',is_error:false,result:'READY',usage:{input_tokens:10*turns,output_tokens:5*turns}});
});`;
const base = { model: 'claude-opus-5-5', reasoning_effort: 'low', max_tokens: 1024, messages: [{ role: 'user', content: '开始' }] };
async function setup(overrides = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'native-relay-test-')); let spawns = 0, environment;
  const relay = sessionRelay({ cli: 'synthetic', home, modelFor: model => model, maxOutputTokens: 1024, timeoutMs: 5000,
    spawnProcess: (_cli, _args, options) => { spawns++; environment=options.env; return spawn(process.execPath, ['--input-type=module', '-e', fake], options); }, ...overrides });
  return { relay, home, spawns: () => spawns, environment:()=>environment, async close() { await relay.close({discardFrozen:true}); assert((await fs.readdir(home)).every(name=>['workspace','quarantined-sessions'].includes(name))); await fs.rm(home, { recursive: true, force: true }); } };
}

test('API适配关闭CLI自加任务预算提示，调用方输入和实际输出上限不变', async()=>{
 const state=await setup();
 try {
  const request={...base,messages:[{role:'user',content:'保留调用方自己的预算要求：完成任务'}]};
  const original=JSON.stringify(request);
  await state.relay.infer(request);
  assert.equal(state.environment().CLAUDE_CODE_TOTAL_TOKENS_REMINDER,'off');
  assert.equal(state.environment().CLAUDE_CODE_MAX_OUTPUT_TOKENS,'1024');
  assert.equal(JSON.stringify(request),original);
 }finally{await state.close({discardFrozen:true});}
});

test('CLI明确API错误透传分类，不当作正文、不丢失不可重试标记', async () => {
  const state = await setup(); const visible = [];
  try {
    await assert.rejects(state.relay.infer({ ...base, messages: [{ role: 'user', content: 'API_FAILURE' }] },
      { onText: text => visible.push(text) }), { code: 'UPSTREAM_HTTP_400', status: 400, retryable: false });
    assert.deepEqual(visible, []);
    assert.equal(state.relay.size, 0);
  } finally { await state.close({discardFrozen:true}); }
});

test('普通后续请求复用 CLI，原始历史不再追加，用量逐轮计数', async () => {
  const state = await setup();
  try {
    const first = await state.relay.infer(base);
    assert.equal(first.content, 'READY');
    const next = { ...base, messages: [...base.messages, assistantMessage(first), { role: 'user', content: '下一步' },
      { role: 'system', content: '<total_tokens>100 tokens left</total_tokens>' }] };
    const second = await state.relay.infer(next);
    assert.equal(second.content, 'READY'); assert.equal(state.spawns(), 1);
    assert.equal(first.usage.completion_tokens, 5); assert.equal(second.usage.completion_tokens, 5);
    assert.equal(second.usage.prompt_tokens, 10);
  } finally { await state.close({discardFrozen:true}); }
});

test('强制工具时普通文本不流出、不算成功且不自动重试', async () => {
  const state = await setup(); const visible = [];
  try {
    await assert.rejects(state.relay.infer({ ...base, tool_choice: 'required',
      tools: [{ type: 'function', function: { name: 'Read', parameters: {} } }] }, { onText: text => visible.push(text) }),
      { code: 'TOOL_CHOICE_UNSATISFIED', status: 422, retryable: false });
    assert.deepEqual(visible, []); assert.equal(state.spawns(), 1); assert.equal(state.relay.size, 0);
  } finally { await state.close({discardFrozen:true}); }
});

test('默认入口新对话原生输入，普通续接优先保留现有 CLI', async () => {
  const records = [], state = await setup({ onSessionEvent: record => records.push(record) });
  try {
    const first = await state.relay.infer(base);
    await state.relay.infer({ ...base, messages: [...base.messages, assistantMessage(first), { role: 'user', content: '下一轮' }] });
    assert.equal(state.spawns(), 1);
    assert(records.some(record => record.event === 'session_entry' && record.code === 'native_new:first_user_message'));
    assert(records.some(record => record.event === 'session_entry' && record.code === 'native_increment:matched_history'));
  } finally { await state.close({discardFrozen:true}); }
});

test('只有隐藏思考且输出预算耗尽时必须结束请求，不能留下可复用的等待会话', async () => {
  const state = await setup();
  try {
    const result = await state.relay.infer({ ...base, messages: [{ role: 'user', content: 'THINKING_LIMIT' }] });
    assert.equal(result.content, '');
    assert.equal(result.finish_reason, 'length');
    assert.equal(result.usage.completion_tokens, 1024);
    assert.equal(state.relay.size, 0);
    const next = await state.relay.infer(base);
    assert.equal(next.content, 'READY');
    assert.equal(state.spawns(), 2);
  } finally { await state.close({discardFrozen:true}); }
});

test('无原生检查点时禁止导入完整 Desktop 历史，旧开关也不能绕过',async()=>{
 const state=await setup({bootstrapNativeHistory:true});
 try{
  await assert.rejects(state.relay.infer({...base,messages:[{role:'user',content:'旧任务'},{role:'assistant',content:'旧回答'},{role:'user',content:'继续'}]}),{code:'NATIVE_RESUME_REQUIRED',retryable:false});
  assert.equal(state.spawns(),0);
 }finally{await state.close({discardFrozen:true});}
});

test('待工具边界和缺失历史映射在启动 CLI 前明确拒绝', async()=>{
 const state=await setup({bootstrapNativeHistory:true});
 try {
  const historical={...base,tools:[{type:'function',function:{name:'Read',parameters:{type:'object'}}}],messages:[
   {role:'user',content:'历史任务'},{role:'assistant',content:null,tool_calls:[{id:'old',type:'function',function:{name:'Read',arguments:'{}'}}]},
   {role:'tool',tool_call_id:'old',content:'真实旧结果'}]};
  await assert.rejects(state.relay.infer(historical),{code:'NATIVE_HISTORY_UNSAFE',reason:'pending_tool_boundary',retryable:false});
  await assert.rejects(state.relay.infer({...historical,tools:[],messages:[...historical.messages,{role:'assistant',content:'已完成'},{role:'user',content:'继续'}]}),{code:'NATIVE_HISTORY_TOOL_UNAVAILABLE',retryable:false});
  assert.equal(state.spawns(),0);
 }finally{await state.close({discardFrozen:true});}
});

test('历史分支、模型和强度变化隔离；有界会话池清理旧进程', async () => {
  const state = await setup({ maxSessions: 2 });
  try {
    const first = await state.relay.infer(base);
    const messages = [...base.messages, assistantMessage(first), { role: 'user', content: '继续' }];
    await assert.rejects(state.relay.infer({ ...base, model: 'claude-sonnet-5-5', messages }),{code:'NATIVE_RESUME_REQUIRED'});
    await assert.rejects(state.relay.infer({ ...base, reasoning_effort: 'high', messages }),{code:'NATIVE_RESUME_REQUIRED'});
    assert.equal(state.spawns(),1);
    await state.relay.infer({ ...base, messages: [{ role: 'user', content: '完全不同的历史' }] });
    assert.equal(state.spawns(), 2); assert.equal(state.relay.size, 2);
  } finally { await state.close({discardFrozen:true}); }
});

test('调用方取消和总时限终止 CLI，不残留可误复用的会话', async () => {
  const state = await setup({ timeoutMs: 100 });
  try {
    await assert.rejects(state.relay.infer({ ...base, messages: [{ role: 'user', content: 'WAIT' }] }), { code: 'INFERENCE_TIMEOUT' });
    assert.equal(state.relay.size, 0);
    const controller = new AbortController();
    const pending = state.relay.infer({ ...base, messages: [{ role: 'user', content: 'WAIT_CANCEL' }] }, { signal: controller.signal });
    const timer = setTimeout(() => controller.abort(), 40);
    await assert.rejects(pending, { code: 'REQUEST_CANCELLED' }); clearTimeout(timer);
    assert.equal(state.relay.size, 0);
  } finally { await state.close({discardFrozen:true}); }
});

test('空闲会话到期后清理进程与临时文件，后续请求重新隔离', async () => {
  const state = await setup({ sessionTtlMs: 30 });
  try {
    const first = await state.relay.infer(base);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(state.relay.size, 0);
    await assert.rejects(state.relay.infer({ ...base, messages: [...base.messages, assistantMessage(first), { role: 'user', content: '继续' }] }),{code:'NATIVE_RESUME_REQUIRED'});
    assert.equal(state.spawns(), 1);
  } finally { await state.close({discardFrozen:true}); }
});

test('CLI 心跳不能掩盖上游无进展，累计协议输出仍受预算限制', async () => {
  const idle = await setup({ idleTimeoutMs: 100 });
  try {
    await assert.rejects(idle.relay.infer({ ...base, messages: [{ role: 'user', content: 'HEARTBEAT' }] }), { code: 'INFERENCE_IDLE_TIMEOUT' });
    assert.equal(idle.relay.size, 0);
  } finally { await idle.close({discardFrozen:true}); }
  const limited = await setup({ maxCliOutputBytes: 10 });
  try {
    await assert.rejects(limited.relay.infer(base), { code: 'CLI_OUTPUT_LIMIT' });
    assert.equal(limited.relay.size, 0);
  } finally { await limited.close({discardFrozen:true}); }
});

test('CLI 已产生转换器不识别的正文时，独立管道检查仍可定位', async () => {
  const records = [], visible = [];
  const state = await setup({ idleTimeoutMs: 150, onCliAudit: value => records.push(value) });
  try {
    await assert.rejects(state.relay.infer({ ...base, messages: [{ role: 'user', content: 'RAWONLY' }] },
      { onText: text => visible.push(text) }), { code: 'INFERENCE_IDLE_TIMEOUT' });
    assert.deepEqual(visible, []);
    const summary = records.find(r => r.event === 'summary');
    assert.equal(summary.directApiEvents, 1); assert.equal(summary.streamTextBytes, 8);
    assert(!JSON.stringify(records).includes('RAW_ONLY'));
  } finally { await state.close({discardFrozen:true}); }
});

test('MCP 缺少原生 ID 时在交付工具前失败，不留下失效会话', async () => {
  const records = [];
  const script = `import fs from 'node:fs';import readline from 'node:readline';
const config=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).mcpServers.omp;
const emit=v=>console.log(JSON.stringify(v));
readline.createInterface({input:process.stdin}).on('line',()=>{
 emit({type:'stream_event',event:{type:'message_start',message:{id:'synthetic',usage:{input_tokens:1,output_tokens:0}}}});
 emit({type:'assistant',message:{content:[{type:'tool_use',id:'native_1',name:'mcp__omp__Read',input:{path:'synthetic.txt'}}]}});
 emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:1}}});
 setTimeout(()=>fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json'},
 body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'Read',arguments:{path:'synthetic.txt'}}})}).catch(()=>{}),30);
});`;
  const state = await setup({ onSessionEvent: value => records.push(value),
    spawnProcess: (_cli, args, options) => spawn(process.execPath, ['--input-type=module', '-e', script, args[args.indexOf('--mcp-config') + 1]], options) });
  try {
    await assert.rejects(state.relay.infer({ ...base, tools: [{ type: 'function', function: { name: 'Read', parameters: { type: 'object' } } }] }), { code: 'NATIVE_TOOL_ID_MISSING' });
    const failure = records.find(r => r.event === 'failed');
    assert.equal(failure.code, 'NATIVE_TOOL_ID_MISSING'); assert.equal(failure.hasActiveTurn, true);
    assert.equal(state.relay.size, 0);
    assert(!JSON.stringify(records).includes('synthetic.txt'));
  } finally { await state.close({discardFrozen:true}); }
});


test('固定会话键隔离相同历史，合法增量复用；不匹配时保存现场并禁止重建',async()=>{
 const state=await setup();
 try {
  const affinity={key:'conversation-a'};
  const first=await state.relay.infer(base,{affinity});
  await state.relay.infer(base,{affinity:{key:'conversation-b'}});
  assert.equal(state.spawns(),2);
  const next={...base,messages:[...base.messages,assistantMessage(first),{role:'user',content:'继续'}]};
  await state.relay.infer(next,{affinity});
  assert.equal(state.spawns(),2);
  await assert.rejects(state.relay.infer(base,{affinity}),{code:'SESSION_HISTORY_MISMATCH',retryable:false});
  await assert.rejects(state.relay.infer(next,{affinity}),{code:'SESSION_QUARANTINED',retryable:false});
  assert.equal(state.spawns(),2);
  const root=path.join(state.home,'quarantined-sessions');
  const archive=path.join(root,(await fs.readdir(root))[0]);
  const meta=JSON.parse(await fs.readFile(path.join(archive,'metadata.json'),'utf8'));
  assert.equal(meta.resumable,false);
  assert.equal(meta.reason,'SESSION_HISTORY_MISMATCH');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(archive,'desktop-request.json'),'utf8')),base);
  assert(!(await fs.readFile(path.join(archive,'metadata.json'),'utf8')).includes('conversation-a'));
 }finally{await state.close({discardFrozen:true});}
});

test('无固定键的助手差异也不降级导入历史；错误返回时进程已封存',async()=>{
 const state=await setup();
 try {
  await state.relay.infer(base);
  const mismatch={...base,messages:[...base.messages,{role:'assistant',content:'另一份答复'},{role:'user',content:'继续'}]};
  await assert.rejects(state.relay.infer(mismatch),{code:'ASSISTANT_MESSAGE_MISMATCH',retryable:false});
  assert.equal(state.spawns(),1);assert.equal(state.relay.size,0);
  assert.equal((await fs.readdir(path.join(state.home,'quarantined-sessions'))).length,1);
 }finally{await state.close({discardFrozen:true});}
});


test('同一固定键并发请求不会启动第二个进程',async()=>{
 const state=await setup({timeoutMs:100}),affinity={key:'same-key'};
 try {
  const first=state.relay.infer({...base,messages:[{role:'user',content:'WAIT'}]},{affinity});
  const rejected=assert.rejects(first,{code:'INFERENCE_TIMEOUT'});
  await assert.rejects(state.relay.infer(base,{affinity}),{code:'SESSION_BUSY'});
  await rejected;assert.equal(state.spawns(),1);
 }finally{await state.close({discardFrozen:true});}
});
