import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';import os from'node:os';
import{quarantineNativeSession}from'./session-quarantine.mjs';import{sessionRelay}from'./session-relay.mjs';import{NativeCliSession}from'./native-cli-session.mjs';
test('封存索引使用当前签名和历史快照，而非恢复前的旧边界',async()=>{
 const rows=[],calls=[],session={nativeSessionId:'native',signature:'current',history:['current-history'],affinityHash:'affinity',historyNormalization:true};
 const store={forget:async id=>calls.push(['forget',id]),quarantineAffinity:async id=>calls.push(['affinity',id]),quarantineHistory:async(...args)=>calls.push(['history',...args])};
 const row=await quarantineNativeSession(session,{store,quarantined:rows});assert.equal(session.quarantineRecord,row);assert.equal(rows[0],row);assert.deepEqual(row.history,['current-history']);session.history.push('later');assert.deepEqual(row.history,['current-history']);assert.deepEqual(calls[2],['history','current',['current-history'],'affinity',true,'native']);
});
test('为压缩而原生恢复的会话同样登记可解冻的当前封存索引',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'compact-quarantine-')),sessions=new Set(),quarantined=[],saved=[];
 const original={start:NativeCliSession.prototype.start,summarize:NativeCliSession.prototype.summarize,close:NativeCliSession.prototype.close};let relay;
 const base={model:'synthetic',max_tokens:1024,tools:[],messages:[{role:'system',content:'rules'},{role:'user',content:'task'}]},prompt={role:'user',content:'Your task is to create a detailed summary of this conversation.'};
 const store={home,key:Buffer.alloc(32,7),ready:Promise.resolve(),writes:Promise.resolve(),blocked:[],checkAffinity:async()=>{},takeForCompaction:async()=>({row:{id:'00000000-0000-4000-8000-000000000001',signature:'old-signature',compactSource:{outputTokens:1024}},sourceRequest:base,boundary:{prompt,receipts:[]}}),forget:async()=>{},checkpoint:async()=>{},refreshClosed:async()=>{},quarantineAffinity:async()=>{},quarantineHistory:async(...args)=>saved.push(args)};
 NativeCliSession.prototype.start=async function(){this.state='idle';this.nativeConfirmed=true;this.lastAssistant={role:'assistant',content:'DONE'};};
 NativeCliSession.prototype.summarize=async function(){this.nativeCompactionCommit={boundaryUuid:'synthetic'};return {content:'<summary>COMPACTED</summary>'};};
 NativeCliSession.prototype.close=async function(){this.state='closed';};
 try{relay=sessionRelay({home,modelFor:x=>x,maxOutputTokens:1024},{sessions,quarantined,store});await relay.infer({...base,messages:[...base.messages,{role:'assistant',content:'DONE'},prompt]});const s=[...sessions][0];s.signature='post-compact';s.history=['post-compact-history'];await s.options.onInvalidateCheckpoint(s.nativeSessionId);assert(s.quarantineRecord);assert.equal(s.quarantineRecord.signature,'post-compact');assert.deepEqual(s.quarantineRecord.history,['post-compact-history']);assert.equal(quarantined.length,1);assert.equal(saved[0][0],'post-compact');assert.deepEqual(saved[0][1],['post-compact-history']);}
 finally{await relay?.close({discardFrozen:true});Object.assign(NativeCliSession.prototype,original);await fs.rm(home,{recursive:true,force:true});}
});
