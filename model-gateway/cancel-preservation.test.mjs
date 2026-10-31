import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {fromAnthropic} from './anthropic.mjs';
import { sessionRelay } from './session-relay.mjs';

// 仅 Node 模拟协议，不启动官方 CLI，不访问模型，不执行项目工具。
const fixture = `import readline from 'node:readline';
const mode=process.argv[1].replace('before-start-',''),beforeStart=process.argv[1].startsWith('before-start-'),send=x=>console.log(JSON.stringify(x));let turns=0,uuid,terminalDone=false;
send({type:'system',subtype:'init',capabilities:mode==='legacy'?[]:['interrupt_receipt_v1','interrupt_cancel_queued_v1']});
readline.createInterface({input:process.stdin}).on('line',line=>{const v=JSON.parse(line);
 if(v.type==='control_request'){
  if(v.request.subtype!=='interrupt'||v.request.cancel_queued!==true)throw Error('incorrect cancel');
  if(mode==='timeout')return;
  const ack=()=>send({type:'control_response',response:{request_id:v.request_id,subtype:'success',response:mode==='empty'?{}:{still_queued:mode==='queued'?['unexpected']:[],cancelled:[]}}});
  const end=()=>{terminalDone=true;send({type:'result',is_error:true,subtype:'error_during_execution',terminal_reason:mode==='bad-result'?'api_error':'aborted_streaming',user_message_uuid:mode==='wrong-uuid'?'other':uuid});};
  if(mode==='result-first'){setTimeout(end,10);setTimeout(ack,40);}
  else {setTimeout(ack,10);if(mode==='new-model')setTimeout(()=>send({type:'stream_event',event:{type:'message_start',message:{id:'unexpected',usage:{input_tokens:1,output_tokens:0}}}}),20);setTimeout(end,60);}
  return;
 }
 if(v.type!=='user')throw Error('unexpected input');
 turns++;if(turns>1&&!terminalDone)throw Error('old and new turns overlap');uuid=v.uuid;
 if(beforeStart&&turns===1)send({type:'system',subtype:'synthetic_input_accepted'});
 else send({type:'stream_event',event:{type:'message_start',message:{id:'turn-'+turns,usage:{input_tokens:10,output_tokens:0}}}});
 if(turns===1){
  if(mode==='partial')send({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'PARTIAL'}}});
  if(mode==='tool')send({type:'stream_event',event:{type:'content_block_start',index:0,content_block:{type:'tool_use',id:'uncertain',name:'mcp__omp__Bash',input:{}}}});
  return;
 }
 send({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'READY'}}});
 send({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:1}}});
 send({type:'result',is_error:false,result:'READY',terminal_reason:'completed',user_message_uuid:uuid});
});`;

const request = { model: 'claude-code-sonnet', max_tokens: 1024, messages: [{ role: 'user', content: '原始任务' }] };
async function setup(mode, extra = {}) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cancel-preserve-')); const children = [], events = [];
  let ready; const started = new Promise(resolve => { ready = resolve; });
  const relay = sessionRelay({ cli: 'synthetic', home, model: request.model, maxOutputTokens: 1024, maxSessions: 1,
    preserveCancelledSession: true, cancelAckTimeoutMs: 300, timeoutMs: 3000, onSessionEvent: value => events.push(value),
    spawnProcess(_cli,_args,options) { const child = spawn(process.execPath, ['--input-type=module','-e',fixture,'--',mode],options); children.push(child); return child; }, ...extra });
  return { relay, children, events, started, timing: { mark: stage => { if (stage === 'upstream_message_start') ready(); },
    cliEvent: event => { if (event.type === 'system' && event.subtype === 'synthetic_input_accepted') ready(); } }, async close() {
    await relay.close({discardFrozen:true});
    for (const child of children) assert.ok(child.exitCode !== null || child.signalCode !== null);
    await fs.rm(home, { recursive: true, force: true });
  } };
}

for (const mode of ['safe','result-first','before-start-safe','before-start-result-first']) test(`取消确认与终止事件齐全才复用，顺序 ${mode}，新旧轮次不并行`, async () => {
  const s = await setup(mode), controller = new AbortController();
  try {
    const first = s.relay.infer(request, { signal: controller.signal, timing: s.timing });
    const rejected = assert.rejects(first, { code: 'REQUEST_CANCELLED' });
    await s.started; controller.abort();
    const next = s.relay.infer({ ...request, messages: [...request.messages, { role: 'user', content: '换个思路' }] });
    await rejected; assert.equal((await next).content, 'READY');
    assert.equal(s.children.length, 1); assert.ok(s.events.some(value => value.event === 'cancel_preserved'));
  } finally { await s.close({discardFrozen:true}); }
});

test('取消后客户端合并连续 user 文本，继续复用原进程且仅发送新增文字',async()=>{
 const inputs=[],s=await setup('safe',{spawnProcess(_cli,_args,options){
   const child=spawn(process.execPath,['--input-type=module','-e',fixture,'--','safe'],options),write=child.stdin.write.bind(child.stdin);
   child.stdin.write=(line,...args)=>{inputs.push(JSON.parse(line));return write(line,...args);};return child;
 }}),controller=new AbortController(),suffix='\n\n换个思路\n\n继续';
 try{
   const first=s.relay.infer(request,{signal:controller.signal,timing:s.timing}),rejected=assert.rejects(first,{code:'REQUEST_CANCELLED'});
   await s.started;controller.abort();await rejected;
   const merged={...request,messages:[{role:'user',content:request.messages[0].content+suffix}]};
   assert.equal((await s.relay.infer(merged)).content,'READY');
   const users=inputs.filter(frame=>frame.type==='user');assert.equal(users.length,2);
   assert(!JSON.stringify(users[1]).includes(request.messages[0].content));assert(JSON.stringify(users[1]).includes('换个思路'));
   assert(s.events.some(event=>event.event==='cancel_preserved'));
 }finally{await s.close();}
});

for (const mode of ['legacy','timeout','empty','queued','bad-result','wrong-uuid','new-model','partial','tool',
  'before-start-timeout','before-start-wrong-uuid','before-start-new-model']) {
  test(`取消证据不充分或边界不安全时关闭旧会话：${mode}`, async () => {
    const s = await setup(mode), controller = new AbortController();
    try {
      const first = s.relay.infer(request, { signal: controller.signal, timing: s.timing });
      const rejected = assert.rejects(first, { code: 'REQUEST_CANCELLED' });
      await s.started;
      // 等同一 stdout 批内的正文/工具事件进入状态机，不靠 CPU 时序猜测。
      if (mode === 'partial' || mode === 'tool') await new Promise(resolve => setTimeout(resolve, 30));
      controller.abort(); await rejected; await s.relay.close({discardFrozen:true});
      assert.equal(s.relay.size, 0); assert.ok(!s.events.some(value => value.event === 'cancel_preserved'));
    } finally { await s.close({discardFrozen:true}); }
  });
}

test('默认关闭候选能力，原有取消行为保持不变', async () => {
  const s = await setup('safe', { preserveCancelledSession: false }), controller = new AbortController();
  try {
    const first = s.relay.infer(request, { signal: controller.signal, timing: s.timing }); const rejected = assert.rejects(first, { code: 'REQUEST_CANCELLED' });
    await s.started; controller.abort(); await rejected;
    assert.equal(s.relay.size, 0); assert.ok(!s.events.some(value => value.event === 'cancel_preserved'));
  } finally { await s.close({discardFrozen:true}); }
});

for(const changed of [false,true])test('图片缓存标记变化后取消并续接仍保留原 CLI，移动标记='+changed,async()=>{
 const state=await setup('safe'),controller=new AbortController();
 const image={type:'image',source:{type:'base64',media_type:'image/png',data:'aGVsbG8='}};
 const body={model:request.model,max_tokens:1024,messages:[{role:'user',content:[{type:'text',text:'task'}, {...image,cache_control:{type:'ephemeral'}}]}]};
 try{
  const first=state.relay.infer(fromAnthropic(body),{signal:controller.signal,timing:state.timing});const rejected=assert.rejects(first,{code:'REQUEST_CANCELLED'});
  await state.started;controller.abort();await rejected;
  const next=structuredClone(body);if(changed){delete next.messages[0].content[1].cache_control;next.messages[0].content[0].cache_control={type:'ephemeral'};}
  next.messages.push({role:'user',content:'continue'});
  assert.equal((await state.relay.infer(fromAnthropic(next))).content,'READY');assert.equal(state.children.length,1);
 }finally{await state.close();}
});
