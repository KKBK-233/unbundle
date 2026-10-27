import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {sessionRelay} from './session-relay.mjs';
import {assistantMessage} from './session-history.mjs';

// 假 CLI 将实际预算回写到合成 transcript，便于确认续接没有悄悄提高进程上限。
const fake=String.raw`import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';
const args=JSON.parse(process.argv[1]),flag=n=>args[args.indexOf(n)+1],id=args.includes('--resume')?flag('--resume'):flag('--session-id');
const folder=path.join(process.env.CLAUDE_CONFIG_DIR,'projects','synthetic'),file=path.join(folder,id+'.jsonl');
fs.mkdirSync(folder,{recursive:true});const emit=x=>console.log(JSON.stringify(x));let n=0;
emit({type:'system',subtype:'init',session_id:id});
readline.createInterface({input:process.stdin}).on('line',line=>{
 const frame=JSON.parse(line);if(frame.type!=='user')return;
 fs.appendFileSync(file,JSON.stringify({input:frame.message.content,budget:process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS})+String.fromCharCode(10));
 emit({type:'assistant',message:{id:'m'+(++n),content:[{type:'text',text:'READY'}],stop_reason:'end_turn',usage:{input_tokens:2,output_tokens:2}}});
 emit({type:'result',is_error:false,result:'READY'});
});`;
const base={model:'synthetic',max_tokens:1024,messages:[{role:'user',content:'first'}]};
const next=answer=>({...base,messages:[...base.messages,assistantMessage(answer),{role:'user',content:'next'}]});
async function setup(){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'session-budget-')),sessions=new Set(),calls=[],relays=[];
 const options={home,configDir:path.join(home,'.claude'),persistentSessions:true,modelFor:x=>x,maxOutputTokens:8192,timeoutMs:5000,
  spawnProcess:(_c,args,o)=>{calls.push({args,budget:o.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS});return spawn(process.execPath,['--input-type=module','-e',fake,JSON.stringify(args)],o);}};
 return {home,sessions,calls,make(){const r=sessionRelay(options,{sessions});relays.push(r);return r;},async close(){for(const r of relays)await r.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}};
}
for(const persisted of [false,true])for(const sticky of [false,true])test('预算提高与降低保留原会话：'+JSON.stringify({persisted,sticky}),async()=>{
 const f=await setup(),context=sticky?{affinity:{key:'same-device'}}:{};
 try{
  let relay=f.make();const first=await relay.infer(base,context),request=next(first),id=[...f.sessions][0].nativeSessionId;
  if(persisted){await relay.close();relay=f.make();}
  const index=path.join(f.home,'native-session-index/index.json'),before=await fs.readFile(index,'utf8');
  await assert.rejects(relay.infer({...request,max_tokens:512},context),{code:'SESSION_OUTPUT_BUDGET_TOO_SMALL'});
  assert.equal(await fs.readFile(index,'utf8'),before);assert.equal(relay.frozenSize,0);
  const second=await relay.infer({...request,max_tokens:2048},context);
  assert.equal(second.content,'READY');assert.equal([...f.sessions][0].nativeSessionId,id);
  assert.deepEqual(f.calls.map(c=>c.budget),persisted?['1024','1024']:['1024']);
  const rows=JSON.parse(await fs.readFile(index,'utf8'));assert.equal(rows[0].outputTokens,1024);
  await relay.infer({...request,max_tokens:512,max_completion_tokens:4096,messages:[...request.messages,assistantMessage(second),{role:'user',content:'third'}]},context);
  assert.equal(f.calls.length,persisted?2:1);
 }finally{await f.close();}
});

test('旧检查点使用 compactSource 预算迁移；预算全缺失时拒绝变化但保留原参数恢复',async()=>{
 for(const missing of [false,true]){
  const f=await setup();try{
   let relay=f.make();const first=await relay.infer(base),request=next(first);await relay.close();
   const file=path.join(f.home,'native-session-index/index.json'),rows=JSON.parse(await fs.readFile(file,'utf8'));
   delete rows[0].outputTokens;if(missing)delete rows[0].compactSource.outputTokens;
   await fs.writeFile(file,JSON.stringify(rows));const original=await fs.readFile(file,'utf8');relay=f.make();
   if(missing){await assert.rejects(relay.infer({...request,max_tokens:2048}),{code:'SESSION_OUTPUT_BUDGET_UNKNOWN'});assert.equal(await fs.readFile(file,'utf8'),original);}
   assert.equal((await relay.infer({...request,max_tokens:missing?1024:2048})).content,'READY');
   assert.deepEqual(f.calls.map(c=>c.budget),['1024','1024']);
  }finally{await f.close();}
 }
});

test('预算提高不绕过模型和旧历史核验',async()=>{
 const f=await setup();try{
  const relay=f.make(),first=await relay.infer(base),request={...next(first),max_tokens:2048};
  await assert.rejects(relay.infer({...request,model:'different'}));assert.equal(f.calls.length,1);
  await assert.rejects(relay.infer({...request,messages:[{role:'user',content:'changed'},...request.messages.slice(1)]}));assert.equal(f.calls.length,1);
  assert.equal((await relay.infer(request)).content,'READY');
 }finally{await f.close();}
});

for(const automatic of [false,true])test('冻结恢复预算拒绝可重试且提高后复用同一进程：'+automatic,async()=>{
 const f=await setup();try{
  const relay=f.make();await relay.infer(base);
  const failed={...base,messages:[...base.messages,{role:'assistant',content:[{type:'text',text:'RE'},{type:'text',text:'ADY'}]},{role:'user',content:'old next'}]};
  await assert.rejects(relay.infer(failed),{code:'ASSISTANT_MESSAGE_MISMATCH'});
  const session=[...f.sessions][0],pid=session.child.pid;
  if(!automatic)await relay.recover(session.sessionId);
  const request=automatic?{...failed,messages:[...failed.messages,{role:'user',content:'continue'}]}:failed;
  await assert.rejects(relay.infer({...request,max_tokens:512}),{code:'SESSION_OUTPUT_BUDGET_TOO_SMALL'});
  assert.equal(session.state,'frozen');assert.equal(session.automaticRecoveryAttempt,undefined);
  assert.equal((await relay.infer({...request,max_tokens:2048})).content,'READY');
  assert.equal(session.child.pid,pid);assert.equal(session.options.outputTokens,1024);assert.equal(f.calls.length,1);
 }finally{await f.close();}
});
