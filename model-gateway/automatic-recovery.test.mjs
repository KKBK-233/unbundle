import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {automaticRecoveryRequest} from './automatic-recovery.mjs';
import {sessionRelay} from './session-relay.mjs';
import {assistantMessage} from './session-history.mjs';
const saved={model:'synthetic',messages:[{role:'user',content:'old request'}]};
test('任何新用户消息都可触发，但旧历史、工具结果和请求配置不能替换',()=>{
 const s={state:'frozen',frozenRequest:saved,recoveryArmed:false};
 const actual={...saved,messages:[...saved.messages,{role:'user',content:'换个思路'}]};
 const found=automaticRecoveryRequest(s,actual);assert.deepEqual(found.request,{...saved,stream:undefined});assert.equal(found.tail[0].content,'换个思路');assert.match(found.identity,/^[0-9a-f]{64}$/);assert.equal(found.identity,automaticRecoveryRequest(s,{...actual,stream:true}).identity);
 assert.equal(automaticRecoveryRequest(s,saved),undefined);
 assert.equal(automaticRecoveryRequest(s,{...actual,model:'changed'}),undefined);
 assert.equal(automaticRecoveryRequest(s,{...actual,messages:[{role:'user',content:'changed'},actual.messages.at(-1)]}),undefined);
 assert.equal(automaticRecoveryRequest(s,{...actual,messages:[...saved.messages,{role:'assistant',content:'invented'},actual.messages.at(-1)]}),undefined);
});
const fake=`import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';const a=JSON.parse(process.argv[1]),id=a[a.indexOf('--session-id')+1];
const dir=path.join(process.env.CLAUDE_CONFIG_DIR,'projects','synthetic');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,id+'.jsonl');const emit=x=>console.log(JSON.stringify(x));emit({type:'system',subtype:'init',session_id:id});let n=0;
readline.createInterface({input:process.stdin}).on('line',l=>{const f=JSON.parse(l);if(f.type!=='user')return;fs.appendFileSync(file,JSON.stringify(f)+'\\n');n++;emit({type:'stream_event',event:{type:'message_start',message:{id:'r'+n,usage:{input_tokens:2}}}});emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'READY'}}});emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:2}}});emit({type:'result',result:'READY'});});`;
async function setup(){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'automatic-recovery-')),sessions=new Set(),calls=[];
 const relay=sessionRelay({home,persistentSessions:true,modelFor:x=>x,timeoutMs:5000,spawnProcess(cli,args,o){calls.push(args);return spawn(process.execPath,['--input-type=module','-e',fake,JSON.stringify(args)],o);}},{sessions});
 return {home,relay,sessions,calls,close:async()=>{await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}};
}
const base={model:'synthetic',messages:[{role:'user',content:'first'}]};
function mismatch(content=[{type:'text',text:'RE'},{type:'text',text:'ADY'}]){return {...base,messages:[...base.messages,{role:'assistant',content},{role:'user',content:'old next'}]};}

test('无需管理员解封，新消息自动恢复同一 PID，原失败输入与新消息各进入 CLI 一次',async()=>{
 const f=await setup();try{
  await f.relay.infer(base);const failed=mismatch();await assert.rejects(f.relay.infer(failed),{code:'ASSISTANT_MESSAGE_MISMATCH'});
  const s=[...f.sessions][0],pid=s.child.pid;assert.equal(s.recoveryArmed,false);
  const actual={...failed,messages:[...failed.messages,{role:'user',content:'new instruction'}]};const result=await f.relay.infer(actual);assert.equal(result.content,'READY');assert.equal(s.child.pid,pid);assert.equal(f.calls.length,1);assert.equal(s.state,'idle');
  const file=path.join(f.home,'.claude','projects','synthetic',s.nativeSessionId+'.jsonl'),rows=(await fs.readFile(file,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.length,2);assert.deepEqual(rows[1].message.content,[{type:'text',text:'old next'},{type:'text',text:'new instruction'}]);
  const replay=await f.relay.infer(actual);assert.equal(replay.content,'READY');assert.equal(replay.usage.total_tokens,0);assert.equal((await fs.readFile(file,'utf8')).trim().split('\n').length,2);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.home,'native-session-index/quarantined-history.json'),'utf8')),[]);
  await f.relay.infer({...base,messages:[...actual.messages,assistantMessage(result),{role:'user',content:'after recovery'}]});assert.equal(f.calls.length,1);
 }finally{await f.close();}
});
test('真实历史分叉不解冻，同一消息重复送达不会反复验证或触发推理',async()=>{
 const f=await setup();try{
  await f.relay.infer(base);const failed=mismatch('different actual reply');await assert.rejects(f.relay.infer(failed));
  const s=[...f.sessions][0];let verified=0;const check=s.verifySuspended.bind(s);s.verifySuspended=()=>{verified++;return check();};
  const actual={...failed,messages:[...failed.messages,{role:'user',content:'continue'}]};await assert.rejects(f.relay.infer(actual),{code:'RECOVERY_ARGUMENTS_CHANGED'});await assert.rejects(f.relay.infer(actual),{code:'RECOVERY_ARGUMENTS_CHANGED'});
  assert.equal(verified,1);assert.equal(f.calls.length,1);assert.equal(s.state,'frozen');assert.equal(JSON.parse(await fs.readFile(path.join(f.home,'native-session-index/quarantined-history.json'),'utf8')).length,1);
 }finally{await f.close();}
});
test('进程退出时返回明确错误，不因新消息新建 CLI 或重建历史',async()=>{
 const f=await setup();try{
  await f.relay.infer(base);const failed=mismatch();await assert.rejects(f.relay.infer(failed));const s=[...f.sessions][0];s.verifySuspended=async()=>false;
  const actual={...failed,messages:[...failed.messages,{role:'user',content:'continue'}]};await assert.rejects(f.relay.infer(actual),{code:'NATIVE_PROCESS_GONE'});assert.equal(f.calls.length,1);assert.equal(s.state,'frozen');
 }finally{await f.close();}
});

test('恢复执行期间重复新消息返回忙，不启动第二轮恢复或模型请求',async()=>{
 const f=await setup();try{
  await f.relay.infer(base);const failed=mismatch();await assert.rejects(f.relay.infer(failed));const s=[...f.sessions][0],run=s.run.bind(s);let release,started;
  const ready=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  s.run=async(...args)=>{const state=s.state;s.state='running';started();await gate;s.state=state;return run(...args);};
  const actual={...failed,messages:[...failed.messages,{role:'user',content:'continue'}]},pending=f.relay.infer(actual);await ready;
  await assert.rejects(f.relay.infer(actual),{code:'SESSION_BUSY'});release();assert.equal((await pending).content,'READY');assert.equal(f.calls.length,1);
 }finally{await f.close();}
});
