import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {NativeSessionStore} from './native-session-store.mjs';
import {sessionRelay} from './session-relay.mjs';
import {historyKey} from './session-history.mjs';
import {cancelledCheckpointDelta,cancellationBoundary,validCancellationBoundary} from './cancel-checkpoint.mjs';

const env={role:'system',content:'# Environment update\n - Primary working directory: E:\\demo (was E:\\)\n'},user={role:'user',content:'PRIVATE_SYNTHETIC_TASK'},next={role:'user',content:'继续新任务'};
const call={role:'assistant',content:null,tool_calls:[{id:'completed',type:'function',function:{name:'Bash',arguments:'{"command":"synthetic-only"}'}}]},receipt={role:'tool',tool_call_id:'completed',content:'ACTUAL_RESULT'};
const ack=[{role:'user',content:'[Request interrupted by user]'},{role:'assistant',content:'No response requested.'}];
function cancelled(messages=[user,call,receipt,env],ids=['completed']){
 const s={state:'idle',nativeConfirmed:true,nativeSessionId:'00000000-0000-4000-8000-000000000001',signature:'a'.repeat(64),options:{outputTokens:1024},historyNormalization:true,interrupted:true,cancelConfirmed:true,cancelledReceiptIds:new Set(ids),request:{messages,tools:[]},pendingIds:new Set(),pendingHttp:new Map(),results:new Map(),pendingControls:new Map()};
 return s;
}
test('取消检查点仅保存HMAC；退出刷新、重新加载后仍以同一UUID恢复新用户增量',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'cancel-checkpoint-')),config=path.join(home,'.claude'),s=cancelled(),file=path.join(config,'projects','synthetic',s.nativeSessionId+'.jsonl');
 try{
  const store=new NativeSessionStore(home,config);await store.ready;await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'{"type":"user"}\n');s.history=s.request.messages.map(m=>historyKey(m,{hashKey:store.key,exact:true}));
  assert.equal(await store.checkpoint(s),true);await fs.appendFile(file,'{"type":"cost-state"}\n');s.state='closed';await store.refreshClosed(s);
  const reopened=new NativeSessionStore(home,config);await reopened.ready;assert.equal(reopened.records.size,1);
  const request={messages:[...s.request.messages,...ack,next],tools:[]};
  const restored=await reopened.take(request,s.signature,true,undefined,{consume:false});assert.equal(restored.id,s.nativeSessionId);assert.deepEqual(restored.delta,[next]);
  const persisted=await fs.readFile(path.join(store.folder,'index.json'),'utf8');assert(!persisted.includes(user.content));assert(!persisted.includes(receipt.content));assert(!persisted.includes('synthetic-only'));
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
test('取消后的目录重排、已确认收据缺失及已完成尾部省略可恢复；真实历史变化拒绝',()=>{
 const s=cancelled(),hashKey=Buffer.alloc(32,2);s.history=s.request.messages.map(m=>historyKey(m,{hashKey,exact:true}));const row={...s,cancellation:cancellationBoundary(s)};
 const check=messages=>cancelledCheckpointDelta(row,{messages,tools:[]},{hashKey,allowInstructionUpdates:true});
 assert.deepEqual(check([user,call,receipt,next,env]),[next,env]);
 const missing={role:'tool',tool_call_id:'completed',content:'[Tool result missing due to internal error]',is_error:true};
 assert.deepEqual(check([user,call,missing,env,...ack,next]),[next]);assert.deepEqual(check([user,next,env]),[next,env]);
 for(const messages of [[{...user,content:'changed'},next],[user,call,{...receipt,content:'changed'},env,next],[user,call,{...missing,is_error:false},env,next],[user,call,receipt,env,ack[1],next],[user,call,receipt,env,ack[0],{...ack[1],content:'different'},next]])assert.equal(check(messages),undefined);
 const unknown=cancelled(undefined,[]);unknown.history=s.history;assert.equal(cancelledCheckpointDelta({...unknown,cancellation:cancellationBoundary(unknown)},{messages:[user,call,missing,env,next],tools:[]},{hashKey,allowInstructionUpdates:true}),undefined);
 assert.equal(cancellationBoundary({...s,cancelConfirmed:false}),undefined);assert.equal(validCancellationBoundary({version:1,trailingEnvironment:false,receipts:[{index:-1,id:'bad'}]},4),false);
});

const fixture=`import readline from 'node:readline';import fs from 'node:fs';
const send=x=>console.log(JSON.stringify(x)),id=process.env.SYNTHETIC_SESSION_ID,file=process.env.SYNTHETIC_FILE;let turns=process.env.SYNTHETIC_RESUME==='1'?1:0,uuid;
send({type:'system',subtype:'init',session_id:id,capabilities:['interrupt_receipt_v1','interrupt_cancel_queued_v1']});
readline.createInterface({input:process.stdin}).on('line',l=>{const v=JSON.parse(l);
 if(v.type==='control_request'){send({type:'control_response',response:{request_id:v.request_id,subtype:'success',response:{still_queued:[],cancelled:[]}}});send({type:'result',is_error:true,terminal_reason:'aborted_streaming',user_message_uuid:uuid});return;}
 if(v.type!=='user')throw Error('unexpected frame');turns++;uuid=v.uuid;fs.appendFileSync(file,JSON.stringify({type:'user',message:v.message})+'\\n');
 send({type:'stream_event',event:{type:'message_start',message:{id:'synthetic-'+turns,usage:{input_tokens:10,output_tokens:0}}}});
 if(turns===1)return;send({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'RESUMED'}}});send({type:'result',is_error:false,result:'RESUMED',terminal_reason:'completed',user_message_uuid:uuid});
});`;
test('完整取消到闲置退出再新建网关：原生resume同一文件，只发送一次新用户输入',{timeout:15000},async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'cancel-resume-e2e-')),config=path.join(home,'.claude'),children=[],argumentsSeen=[],frames=[];let relay,ready;const started=new Promise(r=>ready=r);
 const options={home,configDir:config,cli:'synthetic',model:'synthetic',maxOutputTokens:1024,persistentSessions:true,preserveCancelledSession:true,liveInstructionUpdates:true,cancelAckTimeoutMs:1000,timeoutMs:5000,
  spawnProcess(_cli,args,o){argumentsSeen.push(args);const resumed=args.includes('--resume'),id=args[args.indexOf(resumed?'--resume':'--session-id')+1],file=path.join(config,'projects','synthetic',id+'.jsonl');fsSync.mkdirSync(path.dirname(file),{recursive:true});if(!resumed)fsSync.writeFileSync(file,'');const child=spawn(process.execPath,['--input-type=module','-e',fixture],{...o,env:{...o.env,SYNTHETIC_SESSION_ID:id,SYNTHETIC_FILE:file,SYNTHETIC_RESUME:resumed?'1':'0'}});const write=child.stdin.write.bind(child.stdin);child.stdin.write=(line,...rest)=>{frames.push(JSON.parse(line));return write(line,...rest);};children.push(child);return child;}};
 const request={model:'synthetic',max_tokens:1024,messages:[user]},controller=new AbortController();
 try{
  relay=sessionRelay(options);const run=relay.infer(request,{signal:controller.signal,timing:{mark:p=>{if(p==='upstream_message_start')ready();}}}),rejected=assert.rejects(run,{code:'REQUEST_CANCELLED'});await started;controller.abort();await rejected;
  await relay.close();relay=sessionRelay(options);const result=await relay.infer({...request,messages:[user,...ack,next]});assert.equal(result.content,'RESUMED');assert.equal(argumentsSeen.length,2);const original=argumentsSeen[0][argumentsSeen[0].indexOf('--session-id')+1];assert.equal(argumentsSeen[1][argumentsSeen[1].indexOf('--resume')+1],original);
  const users=frames.filter(f=>f.type==='user');assert.equal(users.length,2);assert(!JSON.stringify(users[1]).includes(user.content));assert(!JSON.stringify(users[1]).includes('No response requested.'));
 }finally{await relay?.close({discardFrozen:true});for(const c of children)if(c.exitCode===null&&c.signalCode===null)c.kill('SIGKILL');await fs.rm(home,{recursive:true,force:true});}
});
import fsSync from 'node:fs';
import {NativeCliSession} from './native-cli-session.mjs';
test('取消检查点未能落盘时不允许容量或闲置回收进程',async()=>{
 const events=[],s={state:'idle',interrupted:true,options:{persistentSessions:true,sessionTtlMs:1000,onCancelledSession:async()=>false},report:(...args)=>events.push(args)};
 await assert.rejects(NativeCliSession.prototype.close.call(s,'capacity'),{code:'SESSION_CAPACITY'});assert.equal(s.state,'idle');assert.equal(await NativeCliSession.prototype.close.call(s,'expired'),false);clearTimeout(s.expiry);assert.equal(s.state,'idle');assert.equal(events.length,2);
});
