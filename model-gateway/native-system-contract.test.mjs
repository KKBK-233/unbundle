import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {parseMessagesRequest} from './anthropic.mjs';
import {sessionRelay} from './session-relay.mjs';
import {NativeSessionStore} from './native-session-store.mjs';
import {compileContext} from './context.mjs';
import {assistantMessage,historyKey,sessionHistory} from './session-history.mjs';
import {compactionIntent,compactionBoundary,compactionRecord,compactedDelta,SUMMARY_HEADER,SUMMARY_SYSTEM} from './compaction-boundary.mjs';

const text=value=>[{type:'text',text:value}];
const request=()=>parseMessagesRequest({model:'synthetic',max_tokens:1024,system:text('ORIGINAL_RULES'),messages:[{role:'user',content:text('task')}]});
const answer={role:'assistant',content:text('DONE')};
const summaryPrompt={role:'user',content:text('Your task is to create a detailed summary of this conversation.')};
const fake=`import readline from 'node:readline';const emit=x=>console.log(JSON.stringify(x));readline.createInterface({input:process.stdin}).on('line',line=>{const frame=JSON.parse(line);if(frame.type!=='user')throw Error('unexpected control');emit({type:'stream_event',event:{type:'message_start',message:{id:'m',usage:{input_tokens:1,output_tokens:0}}}});emit({type:'result',is_error:false,result:'DONE'});});`;

// 从真实 Messages 形态进入，顶层指令不能被动态追加开关绕过。
for(const liveInstructionUpdates of [false,true])test(`顶层规则与停止串参与会话身份，动态追加=${liveInstructionUpdates}`,async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'native-system-'));let spawns=0;
 const relay=sessionRelay({home,model:'synthetic',maxOutputTokens:1024,liveInstructionUpdates,timeoutMs:3000,
   spawnProcess:(_cli,_args,opts)=>{spawns++;return spawn(process.execPath,['--input-type=module','-e',fake],opts);}});
 try{
  const first=request(),result=await relay.infer(first),next={...first,messages:[...first.messages,assistantMessage(result),{role:'user',content:text('next')}]};
  for(const changed of [{...next,system:text('CHANGED_RULES')},{...next,stop_sequences:['NEW_STOP']}])await assert.rejects(relay.infer(changed),{code:'NATIVE_RESUME_REQUIRED'});
  assert.equal(spawns,1);
  await relay.infer(next);assert.equal(spawns,1);
 }finally{await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});

test('原生摘要识别工具策略和顶层系统，压缩前后都校验原规则',()=>{
 const base=request(),session={state:'idle',request:base,lastAssistant:answer,pendingIds:new Set()},summary={...base,messages:[...base.messages,answer,summaryPrompt]};
 for(const type of ['auto','none'])assert(compactionBoundary(session,parseMessagesRequest({...summary,tool_choice:{type}})));
 assert.equal(compactionIntent({...summary,tool_choice:{type:'any'}}),undefined);
 assert.equal(compactionBoundary(session,{...summary,system:text('CHANGED')}),undefined);
 const explicit={...summary,system:text(SUMMARY_SYSTEM)};
 assert(compactionBoundary(session,explicit));
 session.compaction=compactionRecord(session,explicit,{content:text('<summary>summary body</summary>')});
 assert(session.compaction);
 const next={...base,messages:[{role:'user',content:text(SUMMARY_HEADER+'\n\nSummary:\nsummary body')},{role:'user',content:text('continue')}]};
 assert(compactedDelta(session,next));assert.equal(compactedDelta(session,{...next,system:text('CHANGED')}),undefined);
});

test('持久压缩入口核验顶层系统，旧索引与新索引隔离',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'native-system-store-')),config=path.join(home,'.claude');
 try{
  const old=path.join(home,'native-session-index');await fs.mkdir(old);await fs.writeFile(path.join(old,'index.json'),'OLD_INDEX_MUST_NOT_BE_PARSED');
  const store=new NativeSessionStore(home,config);await store.ready;assert.equal(store.records.size,0);
  assert.equal(await fs.readFile(path.join(old,'index.json'),'utf8'),'OLD_INDEX_MUST_NOT_BE_PARSED');
  const base=request(),id='00000000-0000-4000-8000-000000000099',folder=path.join(config,'projects','synthetic');
  await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,id+'.jsonl'),'synthetic\n');
  const compiled=compileContext(base),session={state:'idle',nativeConfirmed:true,nativeSessionId:id,signature:'a'.repeat(64),options:{outputTokens:1024},request:base,compiled,lastAssistant:answer,pendingIds:new Set(),history:sessionHistory(base.messages).map(m=>historyKey(m,{hashKey:store.key})),expected:historyKey(answer,{hashKey:store.key})};
  await store.checkpoint(session);
  const summary={...base,messages:[...base.messages,answer,summaryPrompt],tool_choice:{type:'none'}};
  const restarted=new NativeSessionStore(home,config);await restarted.ready;
  assert.equal(await restarted.takeForCompaction({...summary,system:text('CHANGED')},compiled,undefined,{consume:false}),undefined);
  const withExtra={...summary,messages:[...summary.messages.slice(0,-1),{role:'user',content:text('retained context')},summaryPrompt]};
  const extra=await restarted.takeForCompaction(withExtra,compiled,undefined,{consume:false});assert.deepEqual(extra.boundary.additionalUsers,[{role:'user',content:text('retained context')}]);
  const restored=await restarted.takeForCompaction(summary,compiled,undefined,{consume:false});assert.equal(restored.row.id,id);assert.deepEqual(restored.sourceRequest.system,base.system);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});

for(const liveInstructionUpdates of [false,true])test(`系统缓存断点添加、移动或TTL变化不改变提示和续接，动态追加=${liveInstructionUpdates}`,async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'native-system-cache-'));let spawns=0;
 const relay=sessionRelay({home,model:'synthetic',maxOutputTokens:1024,liveInstructionUpdates,timeoutMs:3000,
  spawnProcess:(_c,_a,opts)=>{spawns++;return spawn(process.execPath,['--input-type=module','-e',fake],opts);}});
 try{
  let base={...request(),system:[...text('FIRST_RULE'),...text('SECOND_RULE')]};
  const initial=compileContext(base);let result=await relay.infer(base);
  for(const [index,ttl]of [[0,'1h'],[1,'1h'],[1,'5m']]){
   const system=base.system.map(({cache_control,...block},i)=>i===index?{...block,cache_control:{type:'ephemeral',ttl}}:block);
   base=parseMessagesRequest({...base,system,messages:[...base.messages,assistantMessage(result),{role:'user',content:text('next')}]});
   const compiled=compileContext(base);assert.equal(compiled.systemPrompt,initial.systemPrompt);assert.equal(compiled.metrics.systemHash,initial.metrics.systemHash);
   assert.equal(base.system[index].cache_control.ttl,ttl);
   result=await relay.infer(base);assert.equal(spawns,1);
  }
 }finally{await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});
