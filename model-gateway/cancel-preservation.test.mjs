import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { sessionRelay } from './session-relay.mjs';

// 仅 Node 模拟协议，不启动官方 CLI，不访问模型，不执行项目工具。
const fixture = `import readline from 'node:readline';
const mode=process.argv[1],send=x=>console.log(JSON.stringify(x));let turns=0,uuid,terminalDone=false;
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
 if(mode==='prestart'&&turns===1){send({type:'system',subtype:'synthetic_input_received'});return;}
 send({type:'stream_event',event:{type:'message_start',message:{id:'turn-'+turns,usage:{input_tokens:10,output_tokens:0}}}});
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
    spawnProcess(_cli,_args,options) { const child = spawn(process.execPath, ['--input-type=module','-e',fixture,'--',mode],options); children.push(child); if(mode==='prestart')child.stdout.on('data',chunk=>{if(chunk.toString().includes('synthetic_input_received'))ready();}); return child; }, ...extra });
  return { relay, children, events, started, timing: { mark: stage => { if (stage === 'upstream_message_start') ready(); } }, async close() {
    await relay.close({discardFrozen:true});
    for (const child of children) assert.ok(child.exitCode !== null || child.signalCode !== null);
    await fs.rm(home, { recursive: true, force: true });
  } };
}

for (const mode of ['safe','result-first','prestart']) test(`取消确认与终止事件齐全才复用，顺序 ${mode}，新旧轮次不并行`, async () => {
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

for (const mode of ['legacy','timeout','empty','queued','bad-result','wrong-uuid','new-model','partial','tool']) {
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
