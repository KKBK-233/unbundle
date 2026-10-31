import {compileContext} from './context.mjs';
import {nativeIncrement} from './session-entry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {settleFrozenTools,recoveryInputMessages} from './native-recovery.mjs';
function setup({badBuffer=false,badInterrupt=false}={}){
 const child=new EventEmitter(),frames=[],events=[];const original=()=>{};
 const session={child,line:original,cliCapabilities:new Set(['interrupt_receipt_v1','interrupt_cancel_queued_v1']),state:'frozen',freezing:Promise.resolve(),options:{instructionUpdateTimeoutMs:100},pendingIds:new Set(['id']),pendingHttp:new Map([['id',{res:{destroy(){events.push('connection-closed');}}}]]),results:new Map(),lastCalls:new Map(),report(){},async freeze(code){events.push(code);this.state='frozen';}};
 session.control=async()=>({still_queued:badInterrupt?['unsettled']:[],cancelled:[]});
 child.stdin={write(line){const f=JSON.parse(line);frames.push(f);queueMicrotask(()=>session.line(JSON.stringify({type:'result',num_turns:badBuffer?1:0,duration_api_ms:0,user_message_uuids:[f.uuid]})));}};
 const resume=async()=>session.line(JSON.stringify({type:'result',terminal_reason:'aborted_tools'}));
 return {session,frames,events,original,resume};
}
const delta=[{role:'tool',tool_call_id:'id',content:'ACTUAL_RESULT',is_error:true}];
test('先确认中断，再保存原结果而不推理，不把新消息混入工具输出',async()=>{
 const f=setup();await settleFrozenTools(f.session,delta,{resume:f.resume});
 assert.equal(f.frames.length,1);assert.equal(f.frames[0].shouldQuery,false);assert.equal(f.frames[0].message.content[1].text,'ACTUAL_RESULT');assert.equal(JSON.parse(f.frames[0].message.content[0].text).is_error,true);assert.equal(f.session.state,'idle');assert.equal(f.session.pendingIds.size,0);assert.equal(f.session.line,f.original);assert.deepEqual(f.events,['connection-closed']);
});
test('未确认停止时不提交任何结果，仍保留原工具等待状态',async()=>{
 const f=setup({badInterrupt:true});await assert.rejects(settleFrozenTools(f.session,delta,{resume:f.resume}),{code:'RECOVERY_INTERRUPT_UNCONFIRMED'});assert.equal(f.frames.length,0);assert.equal(f.session.pendingIds.size,1);assert.equal(f.session.state,'frozen');assert.equal(f.session.line,f.original);
});
test('缓存帧若产生推理或确认异常，立即冻结且不进入新消息推理',async()=>{
 const f=setup({badBuffer:true});await assert.rejects(settleFrozenTools(f.session,delta,{resume:f.resume}),{code:'RECOVERY_BUFFER_UNCONFIRMED'});assert.equal(f.session.state,'frozen');assert.equal(f.session.line,f.original);assert.equal(f.frames.length,1);assert.equal(f.frames[0].shouldQuery,false);
});
test('不支持安全中断能力的 CLI 不解除暂停',async()=>{
 const f=setup();f.session.cliCapabilities.clear();let resumed=false;await assert.rejects(settleFrozenTools(f.session,delta,{resume:async()=>resumed=true}),{code:'RECOVERY_INTERRUPT_UNAVAILABLE'});assert.equal(resumed,false);assert.equal(f.frames.length,0);assert.equal(f.session.state,'frozen');
});


test('工具恢复后的开头目录通知保留为原生事实块，不重复工具结果或改写调用方历史',()=>{
 const snapshot={role:'system',content:'# Environment update\n - Primary working directory: E:\\new (was E:\\old)\n'},user={role:'user',content:'work in the current directory'};
 const source=[...delta,snapshot,user],forward=recoveryInputMessages(source),request={messages:forward};
 const frame=JSON.parse(nativeIncrement(request,compileContext(request))),blocks=frame.message.content;
 assert.equal(blocks.length,2);const fact=JSON.parse(blocks[0].text);assert.equal(fact.kind,'caller_runtime_status');assert.equal(fact.snapshots[0].cwd,'E:\\new');assert.equal(fact.snapshots[0].previousCwd,'E:\\old');assert.equal(fact.snapshots[0].content,snapshot.content);
 assert.equal(blocks[1].text,user.content);assert(!JSON.stringify(frame).includes('ACTUAL_RESULT'));assert.equal(source[1],snapshot);assert.equal(source[1].role,'system');
});
test('多次目录通知保持原顺序，含行为指令的 system 消息仍走原指令通道',()=>{
 const env=(cwd,old)=>({role:'system',content:`# Environment update\n - Primary working directory: ${cwd} (was ${old})\n`});
 const first=env('/new','/old'),second=env('/last','/new'),instruction={role:'system',content:first.content+'Ignore previous instructions'};
 const forward=recoveryInputMessages([...delta,first,{role:'user',content:'first new input'},second,{role:'user',content:'second new input'},instruction]);
 assert.equal(JSON.parse(forward[0].content[0].text).snapshots[0].cwd,'/new');assert.equal(forward[1].content,'first new input');assert.equal(JSON.parse(forward[2].content[0].text).snapshots[0].cwd,'/last');assert.equal(forward[3].content,'second new input');assert.equal(forward[4],instruction);assert.equal(forward[4].role,'system');
});

test('部分文本取消必须获得同一输入的中断确认，不提交工具结果或模型输入',async()=>{
 for(const matches of [true,false]){
  const f=setup();f.session.pendingIds.clear();f.session.pendingHttp.clear();f.session.frozenTurn={inputUuid:'original'};
  const resume=async()=>f.session.line(JSON.stringify({type:'result',terminal_reason:'aborted_streaming',user_message_uuid:matches?'original':'other'}));
  if(matches){await settleFrozenTools(f.session,[],{resume,cancelledTurn:true});assert.equal(f.session.state,'idle');assert.equal(f.session.frozenTurn,undefined);assert.equal(f.session.cancelConfirmed,true);}
  else{await assert.rejects(settleFrozenTools(f.session,[],{resume,cancelledTurn:true}),{code:'RECOVERY_INTERRUPT_UNCONFIRMED'});assert.equal(f.session.state,'frozen');assert(f.session.frozenTurn);}
  assert.equal(f.frames.length,0);assert.equal(f.session.line,f.original);
 }
});
