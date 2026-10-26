import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sessionRelay } from './session-relay.mjs';
import { assistantMessage } from './session-history.mjs';

// 仅运行 Node 模拟协议进程，绝不运行官方 Claude CLI 或使用账号。
const script = `import fs from 'node:fs';import readline from 'node:readline';
const config=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).mcpServers.omp,mode=process.argv[2];
const emit=v=>console.log(JSON.stringify(v));
const start=id=>emit({type:'stream_event',event:{type:'message_start',message:{id,usage:{input_tokens:1,output_tokens:0}}}});
const call=(id,name,path)=>fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json'},
 body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:mode==='reordered'?{path,options:{offset:0,limit:5}}:{path},_meta:{'claudecode/toolUseId':id}}})});
readline.createInterface({input:process.stdin}).on('line',()=>{
 if(mode==='aggregate')emit({type:'system',subtype:'api_retry',attempt:1});else start('initial');
 const tools=[{type:'tool_use',id:'native_1',name:'mcp__omp__Read',input:mode==='reordered'?{options:{limit:5,offset:0},path:'first'}:{path:'first'}}];
 if(mode==='serial')tools.push({type:'tool_use',id:'native_2',name:'mcp__omp__Write',input:{path:'second'}});
 emit({type:'assistant',message:{id:'initial',content:tools,...(mode==='aggregate'?{stop_reason:'tool_use',usage:{input_tokens:2,output_tokens:3}}:{})}});
 if(mode!=='aggregate')emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:1}}});
 if(mode==='timeout')return;
 if(mode==='internal-error'){
  setTimeout(()=>emit({type:'user',message:{content:[{type:'tool_result',tool_use_id:'native_1',is_error:true,content:'Synthetic internal rejection'}]}}),20);return;
 }
 if(mode==='unrequested')setTimeout(()=>start('unexpected'),80);
 call('native_1','Read','first').then(async response=>{
  if(!response.ok)return;
  await response.json();
  if(mode==='serial'){const second=await call('native_2','Write','second');if(!second.ok)return;await second.json();}
  start('continued');
  emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'DONE'}}});
  emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:2}}});
  emit({type:'result',is_error:false,result:'DONE'});
 }).catch(()=>{});
});`;
const request = { model: 'claude-opus-5-5', max_tokens: 1024, messages: [{ role: 'user', content: 'synthetic' }],
  tools: ['Read', 'Write'].map(name => ({ type: 'function', function: { name, parameters: { type: 'object' } } })) };
async function setup(mode, overrides={}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'native-handoff-')), records = []; let spawns = 0;
  const relay = sessionRelay({ home, model: request.model, maxOutputTokens: 1024, timeoutMs: 3000, handoffTimeoutMs: 150,
    requireLiveToolContinuation: true, maxSessions: 1, ...overrides,
    onSessionEvent: value => records.push(value),
    spawnProcess: (_cli, args, options) => { spawns++; return spawn(process.execPath,
      ['--input-type=module', '-e', script, args[args.indexOf('--mcp-config') + 1], mode], options); } });
  return { relay, records, spawns: () => spawns, async close() { await relay.close({discardFrozen:true}); await fs.rm(home, { recursive: true, force: true }); } };
}

test('没有真实 MCP 等待时不向 Desktop 交付虚假可续接工具', async () => {
  for (const [mode, code] of [['timeout', 'CLI_TOOL_HANDOFF_TIMEOUT'], ['internal-error', 'CLI_TOOL_HANDOFF_FAILED']]) {
    const state = await setup(mode);
    try { await assert.rejects(state.relay.infer(request), { code }); assert.equal(state.relay.size, 0); }
    finally { await state.close({discardFrozen:true}); }
  }
});

test('重启后孤立工具结果在启动任何 CLI 前拒绝，不尝试重放本地操作', async () => {
  const state = await setup('serial');
  try {
    const next = { ...request, messages: [...request.messages,
      { role: 'assistant', content: null, tool_calls: [{ id: 'old', type: 'function', function: { name: 'Write', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'old', content: '文件已经创建' }] };
    await assert.rejects(state.relay.infer(next), { code: 'TOOL_CONTINUATION_UNCERTAIN', status: 409, retryable: false });
    assert.equal(state.spawns(), 0);
  } finally { await state.close({discardFrozen:true}); }
});

test('工具结果重复提交或历史被压缩改写时禁止新建会话续跑', async () => {
  const state = await setup('serial');
  try {
    const first = await state.relay.infer(request);
    const next = { ...request, messages: [...request.messages, assistantMessage(first),
      ...first.tool_calls.map(call => ({ role: 'tool', tool_call_id: call.id, content: '执行成功' }))] };
    const compressed = { ...next, messages: [{ role: 'user', content: '改写后的摘要' }, ...next.messages.slice(1)] };
    await assert.rejects(state.relay.infer(compressed), { code: 'TOOL_CONTINUATION_UNCERTAIN', retryable: false });
    assert.equal(state.spawns(), 1);
    await assert.rejects(state.relay.infer(next), { code: 'SESSION_QUARANTINED', retryable: false });
    await assert.rejects(state.relay.infer(next), { code: 'SESSION_QUARANTINED', retryable: false });
    assert.equal(state.spawns(), 1);
  } finally { await state.close({discardFrozen:true}); }
});

test('容量已满时保留正在等待长工具的会话，拒绝挤占并接收原结果', async () => {
  const state = await setup('serial');
  try {
    const first = await state.relay.infer(request);
    await assert.rejects(state.relay.infer({ ...request, messages: [{ role: 'user', content: '另一对话' }] }),{code:'SESSION_CAPACITY'});
    const next = { ...request, messages: [...request.messages, assistantMessage(first),
      ...first.tool_calls.map(call => ({ role: 'tool', tool_call_id: call.id, content: '实际已成功' }))] };
    assert.equal((await state.relay.infer(next)).content,'DONE');
    assert.equal(state.spawns(), 1);
  } finally { await state.close({discardFrozen:true}); }
});

test('无 Desktop 请求时的新模型消息立即使原生会话失效', async () => {
  const state = await setup('unrequested');
  try {
    const first = await state.relay.infer(request); assert.equal(first.tool_calls.length, 1);
    for (let i = 0; i < 100 && !state.records.some(r => r.code === 'CLI_UNREQUESTED_CONTINUATION'); i++) await new Promise(r => setTimeout(r, 10));
    assert(state.records.some(r => r.code === 'CLI_UNREQUESTED_CONTINUATION'));
    assert.equal(state.relay.size, 0);
  } finally { await state.close({discardFrozen:true}); }
});

test('顺序执行的批内 MCP 工具不死锁，真实 Desktop 结果只回传一次并复用会话', async () => {
  const state = await setup('serial');
  try {
    const first = await state.relay.infer(request); assert.equal(first.tool_calls.length, 2);
    const next = { ...request, messages: [...request.messages, assistantMessage(first),
      ...first.tool_calls.map(call => ({ role: 'tool', tool_call_id: call.id, content: 'CALLER_RESULT' }))] };
    const second = await state.relay.infer(next);
    assert.equal(second.content, 'DONE'); assert.equal(state.spawns(), 1);
    assert(state.records.some(r => r.reused === true));
  } finally { await state.close({discardFrozen:true}); }
});

test('强制任意工具能交付真实调用，禁止并行则整批拒绝且无工具交付', async () => {
  for (const single of [false, true]) {
    const state = await setup('serial'); const visible = [];
    try {
      const pending = state.relay.infer({ ...request, tool_choice: 'required', parallel_tool_calls: !single },
        { onText: text => visible.push(text) });
      if (single) await assert.rejects(pending, { code: 'TOOL_CHOICE_UNSATISFIED', retryable: false });
      else assert.equal((await pending).tool_calls.length, 2);
      assert.deepEqual(visible, []); assert.equal(state.spawns(), 1);
    } finally { await state.close({discardFrozen:true}); }
  }
});

test('Desktop 重排嵌套工具参数后仍交回原生结果，后续历史重排也复用同一 CLI', async () => {
  const state = await setup('reordered');
  try {
    const first = await state.relay.infer(request);
    const reshaped = structuredClone(assistantMessage(first));
    reshaped.tool_calls[0].function.arguments = '{ "path": "first", "options": {"offset":0,"limit":5} }';
    const messages = [...request.messages, reshaped, { role: 'tool', tool_call_id: 'native_1', content: '真实结果' }];
    const second = await state.relay.infer({ ...request, messages });
    assert.equal(second.content, 'DONE'); assert.equal(state.spawns(), 1);
    const third = { ...request, messages: [...request.messages, assistantMessage(first), messages.at(-1),
      assistantMessage(second), { role: 'user', content: '继续' }] };
    assert.equal((await state.relay.infer(third)).tool_calls.length, 1);
    assert.equal(state.spawns(), 1);
    assert.equal(state.records.filter(record => record.reused === true).length, 2);
  } finally { await state.close({discardFrozen:true}); }
});


test('审核后原请求重试及直接继续均恢复同一CLI，不重建也不重放工具',async()=>{
 for(const strategy of ['retry','continue']){
 const state=await setup('serial');
 try {
  const first=await state.relay.infer(request);
  const actual={...assistantMessage(first),tool_calls:[...first.tool_calls].reverse()};
  const next={...request,messages:[...request.messages,actual,...first.tool_calls.map(c=>({role:'tool',tool_call_id:c.id,content:'真实成功结果'}))]};
  await assert.rejects(state.relay.infer(next),{code:'ASSISTANT_MESSAGE_MISMATCH'});
  const frozen=(await state.relay.listSessions()).sessions.find(s=>s.state==='frozen');assert(frozen.processPreserved);
  const armed=await state.relay.recover(frozen.sessionId);assert.equal(armed.processStillPaused,true);assert.equal(armed.pid,frozen.pid);assert.equal(armed.modelRequests,0);
  await assert.rejects(state.relay.infer({...next,messages:[...next.messages,{role:'user',content:'继续并重做'}]}),{code:'RECOVERY_INTERRUPT_UNAVAILABLE'});
  const selected=strategy==='retry'?next:{...next,messages:[...next.messages,{role:'user',content:'继续'}]};
  const result=await state.relay.infer(selected);assert.equal(result.content,'DONE');assert.equal(state.spawns(),1);
  const live=(await state.relay.listSessions()).sessions.find(s=>s.sessionId===frozen.sessionId);assert.equal(live.pid,frozen.pid);assert.equal(live.state,'idle');
  assert(state.records.some(r=>r.event==='recovered'&&r.code==='same_process'));
 }finally{await state.close();}
 }
});

test('真实参数变化不能通过解冻入口放行，已丢失进程也不会重建',async()=>{
 const state=await setup('serial');
 try {
  const first=await state.relay.infer(request),actual=structuredClone(assistantMessage(first));actual.tool_calls[0].function.arguments='{"path":"changed"}';
  const next={...request,messages:[...request.messages,actual,...first.tool_calls.map(c=>({role:'tool',tool_call_id:c.id,content:'结果'}))]};
  await assert.rejects(state.relay.infer(next),{code:'ASSISTANT_MESSAGE_MISMATCH'});
  const frozen=(await state.relay.listSessions()).sessions.find(s=>s.state==='frozen');
  await assert.rejects(state.relay.recover(frozen.sessionId),{code:'RECOVERY_ARGUMENTS_CHANGED'});
  await assert.rejects(state.relay.recover('0'.repeat(24)),{code:'NATIVE_PROCESS_GONE'});assert.equal(state.spawns(),1);
 }finally{await state.close();}
});


test('工具续接提高输出上限后仍复用原进程，并能切回原上限',async()=>{
 const state=await setup('reordered',{maxOutputTokens:2048});
 try{
  const first=await state.relay.infer(request);
  const next={...request,max_tokens:2048,messages:[...request.messages,assistantMessage(first),...first.tool_calls.map(c=>({role:'tool',tool_call_id:c.id,content:'REAL_RESULT'}))]};
  const second=await state.relay.infer(next);assert.equal(second.content,'DONE');assert.equal(state.spawns(),1);
  const third=await state.relay.infer({...request,messages:[...next.messages,assistantMessage(second),{role:'user',content:'继续'}]});
  assert.equal(third.tool_calls.length,1);assert.equal(state.spawns(),1);
 }finally{await state.close();}
});

test('低于原 CLI 实际输出上限的续接仍然拒绝',async()=>{
 const state=await setup('reordered',{maxOutputTokens:2048});
 try{const first=await state.relay.infer(request);const next={...request,max_tokens:512,messages:[...request.messages,assistantMessage(first),...first.tool_calls.map(c=>({role:'tool',tool_call_id:c.id,content:'REAL_RESULT'}))]};await assert.rejects(state.relay.infer(next),{code:'TOOL_CONTINUATION_UNCERTAIN'});assert.equal(state.spawns(),1);}finally{await state.close();}
});


test('过载重试后仅有完整 assistant 时仍交付真实工具并续接原进程',async()=>{
 const state=await setup('aggregate');try{
  const first=await state.relay.infer(request);assert.equal(first.tool_calls.length,1);assert.equal(first.upstream_usage.input_tokens,2);
  const next={...request,messages:[...request.messages,assistantMessage(first),{role:'tool',tool_call_id:first.tool_calls[0].id,content:'REAL_RESULT'}]};
  assert.equal((await state.relay.infer(next)).content,'DONE');assert.equal(state.spawns(),1);
 }finally{await state.close();}
});
