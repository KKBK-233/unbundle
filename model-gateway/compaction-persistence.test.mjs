import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {NativeSessionStore} from './native-session-store.mjs';
import {compactionRecord,compactedDelta,SUMMARY_HEADER,SUMMARY_SYSTEM} from './compaction-boundary.mjs';
const base={model:'synthetic',messages:[{role:'system',content:'original rules'},{role:'user',content:'PRIVATE_SOURCE'}],tools:[]};
const assistant={role:'assistant',content:'PRIVATE_REPLY'};
const request={model:base.model,messages:[{role:'system',content:SUMMARY_SYSTEM},...base.messages.slice(1),assistant,{role:'user',content:'Your task is to create a detailed summary of this conversation.'}]};
const result={content:'<analysis>private analysis</analysis><summary>PRIVATE_SUMMARY</summary>'};
function next(){return {...base,messages:[base.messages[0],{role:'user',content:SUMMARY_HEADER+'\n\n<tools-used></tools-used>\nSummary:\nPRIVATE_SUMMARY\nContinue now.'},{role:'user',content:'NEW_INPUT'}]};}
test('压缩映射持久化后仍恢复原生UUID，索引只保存哈希不保存历史或摘要正文',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'compact-checkpoint-')),config=path.join(home,'.claude');
 try{
  const store=new NativeSessionStore(home,config);await store.ready;
  const id='00000000-0000-4000-8000-000000000001',signature='a'.repeat(64);
  const folder=path.join(config,'projects','synthetic');await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,id+'.jsonl'),'synthetic transcript\n');
  const session={nativeSessionId:id,state:'idle',nativeConfirmed:true,signature,request:base,pendingIds:new Set(),history:[],expected:'b'.repeat(64)};
  session.compaction=compactionRecord(session,request,result,{hashKey:store.key});await store.checkpoint(session);
  const index=await fs.readFile(path.join(home,'native-session-index','index.json'),'utf8');
  for(const secret of ['PRIVATE_SOURCE','PRIVATE_REPLY','PRIVATE_SUMMARY','private analysis'])assert(!index.includes(secret));
  const restarted=new NativeSessionStore(home,config);const restored=await restarted.take(next(),signature,false);
  assert.equal(restored.id,id);assert.equal(restored.delta.length,2);assert(!JSON.stringify(restored.delta).includes('PRIVATE_SOURCE'));
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
test('摘要正文或原始系统规则变化仍拒绝，保留的旧工具结果不再次输入',()=>{
 const session={request:base,pendingIds:new Set()};session.compaction=compactionRecord(session,request,result);
 const valid=next();assert(compactedDelta(session,valid));
 const rendered={...valid,messages:valid.messages.map(m=>({...m,content:m.content.replace('<tools-used></tools-used>\n','Tools called before this summary: Bash, Read\n')}))};assert(compactedDelta(session,rendered));
 assert.equal(compactedDelta(session,{...valid,messages:valid.messages.map(m=>({...m,content:m.content.replace('PRIVATE_SUMMARY','FORGED_SUMMARY')}))}),undefined);
 assert.equal(compactedDelta(session,{...valid,messages:[{role:'system',content:'changed rules'},...valid.messages.slice(1)]}),undefined);
 assert.equal(compactedDelta(session,{...valid,messages:[...valid.messages,{role:'tool',tool_call_id:'orphan',content:'must not replay'}]}),undefined);
 const retained={...valid,messages:[...valid.messages.slice(0,2),base.messages[1],assistant,...valid.messages.slice(2)]};
 assert.deepEqual(compactedDelta(session,retained),[valid.messages[1],valid.messages[2]]);
 session.compaction.nativeCommitted=true;
 const summaryOnly={...base,messages:[base.messages[0],{role:'user',content:SUMMARY_HEADER+'\n\nSummary:\nPRIVATE_SUMMARY'}]};
 const delta=compactedDelta(session,summaryOnly);assert.equal(delta.length,1);assert(!JSON.stringify(delta).includes('PRIVATE_SUMMARY'));assert.match(delta[0].content,/Continue/);
});

test('CLI 已正常关闭时凭原历史哈希恢复压缩；异源请求不消费检查点',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'compact-cold-')),config=path.join(home,'.claude');
 try{
  const store=new NativeSessionStore(home,config);await store.ready;
  const id='00000000-0000-4000-8000-000000000002',signature='a'.repeat(64),compiled={metrics:{toolsHash:'c'.repeat(64)}};
  const folder=path.join(config,'projects','synthetic');await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,id+'.jsonl'),'synthetic transcript\n');
  const session={nativeSessionId:id,state:'idle',nativeConfirmed:true,signature,request:base,lastAssistant:assistant,options:{outputTokens:1024},compiled,pendingIds:new Set(),history:[],expected:'b'.repeat(64)};
  await store.checkpoint(session);const index=await fs.readFile(path.join(home,'native-session-index','index.json'),'utf8');assert(!index.includes('PRIVATE_SOURCE'));assert(!index.includes('PRIVATE_REPLY'));
  const actual={...base,messages:[...base.messages,assistant,request.messages.at(-1)]};
  assert.equal(await store.takeForCompaction({...actual,messages:[base.messages[0],{role:'user',content:'foreign'},assistant,request.messages.at(-1)]},compiled),undefined);
  assert.equal(await store.takeForCompaction(actual,{metrics:{toolsHash:'d'.repeat(64)}}),undefined);
  const restored=await store.takeForCompaction(actual,compiled);assert.equal(restored.row.id,id);assert.deepEqual(restored.boundary.receipts,[]);
  assert.equal(await store.takeForCompaction(actual,compiled),undefined);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
