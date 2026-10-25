import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {NativeSessionStore} from './native-session-store.mjs';
import {SessionLifecycle} from './session-lifecycle.mjs';
import {gateway} from './server.mjs';
import {sessionRelay} from './session-relay.mjs';
const day=86400000,h='a'.repeat(64);
async function fixture(){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'session-lifecycle-')),config=path.join(home,'.claude'),folder=path.join(config,'projects','synthetic');await fs.mkdir(folder,{recursive:true});
 const id=randomUUID(),file=path.join(folder,id+'.jsonl');await fs.writeFile(file,'SYNTHETIC_NATIVE_HISTORY\n');
 const st=await fs.stat(file),store=new NativeSessionStore(home,config);await store.ready;
 const row={id,signature:h,expected:h,history:[h],historyNormalization:true,snapshot:{size:st.size,mtimeMs:st.mtimeMs},savedAt:Date.now()-100*day};store.records.set(id,row);await store.persist();
 const protectedIds=new Set();let now=Date.now();const lifecycle=new SessionLifecycle(store,{protectedIds:()=>protectedIds,now:()=>now,retentionMs:day});
 return {home,config,id,file,store,row,lifecycle,protectedIds,advance:()=>{now+=2*day;},close:()=>fs.rm(home,{recursive:true,force:true})};
}

test('超过七天与第 128 条之后的检查点仍持久保留并可正常查找',async()=>{
 const f=await fixture();try{
  for(let i=0;i<140;i++){const id=randomUUID();f.store.records.set(id,{...f.row,id});}await f.store.persist();
  const loaded=new NativeSessionStore(f.home,f.config);await loaded.ready;assert.equal(loaded.records.size,141);assert.deepEqual(loaded.records.get(f.id),f.row);
 }finally{await f.close();}
});
test('退役先校验归档，再移除原件与检查点；恢复保留真实正文及映射并移除自有墓碑',async()=>{
 const f=await fixture();try{
  const evidence=path.join(f.home,'quarantined-sessions','session-synthetic');await fs.mkdir(evidence,{recursive:true});
  await fs.writeFile(path.join(evidence,'metadata.json'),JSON.stringify({sessionId:'b'.repeat(24),nativeSessionId:f.id,reason:'resolved'}));await fs.writeFile(path.join(evidence,'handoff-state.json'),'{}');
  await f.lifecycle.retire(f.id);await assert.rejects(fs.stat(f.file),{code:'ENOENT'});assert.equal(f.store.records.has(f.id),false);assert.equal(f.store.blocked[0].origin,'lifecycle_retired');assert.deepEqual(f.store.blocked[0].history,[]);assert.equal(f.store.blocked[0].historyLength,1);
  assert.equal((await f.lifecycle.list()).sessions[0].state,'retired');
  await f.lifecycle.restore(f.id);assert.equal(await fs.readFile(f.file,'utf8'),'SYNTHETIC_NATIVE_HISTORY\n');assert.deepEqual(f.store.records.get(f.id).history,[h]);assert.equal(f.store.blocked.length,0);assert.equal(await fs.readFile(path.join(evidence,'handoff-state.json'),'utf8'),'{}');
  const loaded=new NativeSessionStore(f.home,f.config);await loaded.ready;assert(loaded.records.has(f.id));assert.equal(loaded.blocked.length,0);
 }finally{await f.close();}
});
test('活跃、等待工具、冻结及显式保留会话不因年龄进入清理',async()=>{
 const f=await fixture();try{
  f.protectedIds.add(f.id);await assert.rejects(f.lifecycle.retire(f.id),{code:'LIFECYCLE_SESSION_LIVE'});f.protectedIds.clear();
  await f.lifecycle.pin(f.id,true);await assert.rejects(f.lifecycle.retire(f.id),{code:'LIFECYCLE_SESSION_RETAINED'});await f.lifecycle.pin(f.id,false);
  await f.store.quarantineHistory(h,[h],undefined,true,f.id);await assert.rejects(f.lifecycle.retire(f.id),{code:'LIFECYCLE_SESSION_QUARANTINED'});assert.equal(await fs.readFile(f.file,'utf8'),'SYNTHETIC_NATIVE_HISTORY\n');
 }finally{await f.close();}
});
test('只清理超过保留期的明确退役归档，保留防重建墓碑与未知目录',async()=>{
 const f=await fixture();try{
  const unknown=path.join(f.home,'abandoned-session-preserved-explicit');await fs.mkdir(unknown);await fs.writeFile(path.join(unknown,'history.jsonl'),'KEEP');
  await f.lifecycle.retire(f.id);assert.deepEqual((await f.lifecycle.sweep()).removed,[]);f.advance();await f.lifecycle.pin(f.id,true);assert.equal((await f.lifecycle.sweep()).skipped[0].code,'LIFECYCLE_SESSION_RETAINED');await f.lifecycle.pin(f.id,false);
  assert.deepEqual((await f.lifecycle.sweep()).removed,[f.id]);assert.equal((await f.lifecycle.list()).sessions[0].state,'purged');assert.equal(f.store.blocked.length,1);assert.equal(await fs.readFile(path.join(unknown,'history.jsonl'),'utf8'),'KEEP');await assert.rejects(f.lifecycle.restore(f.id),{code:'LIFECYCLE_NOT_RETIRED'});
 }finally{await f.close();}
});
test('变更的原件与篡改的归档均拒绝清理或恢复',async()=>{
 const f=await fixture();try{
  await fs.appendFile(f.file,'CHANGED');await assert.rejects(f.lifecycle.retire(f.id),{code:'LIFECYCLE_CHECKPOINT_CHANGED'});
 }finally{await f.close();}
 const g=await fixture();try{
  await g.lifecycle.retire(g.id);await fs.appendFile(path.join(g.home,'session-lifecycle',g.id,'native.jsonl.gz'),'CHANGED');await assert.rejects(g.lifecycle.restore(g.id),{code:'LIFECYCLE_ARCHIVE_CHANGED'});g.advance();await assert.rejects(g.lifecycle.sweep(),{code:'LIFECYCLE_ARCHIVE_CHANGED'});assert.equal(g.store.records.has(g.id),false);
 }finally{await g.close();}
});
test('中断清理可继续，恢复后新检查点不会被残留退役状态清理',async()=>{
 const f=await fixture();try{
  await f.lifecycle.retire(f.id);f.advance();const original=f.lifecycle.removeArchive.bind(f.lifecycle);let once=true;
  f.lifecycle.removeArchive=async(...args)=>{if(once){once=false;throw Error('synthetic interruption');}return original(...args);};
  await assert.rejects(f.lifecycle.sweep(),/synthetic interruption/);assert.equal((await f.lifecycle.list()).sessions[0].state,'purging');assert.deepEqual((await f.lifecycle.sweep()).removed,[f.id]);
 }finally{await f.close();}
 const g=await fixture();try{
  await g.lifecycle.retire(g.id);g.advance();g.store.records.set(g.id,g.row);assert.equal((await g.lifecycle.sweep()).skipped[0].code,'LIFECYCLE_CHECKPOINT_PRESENT');
 }finally{await g.close();}
});
test('生命周期路由需要网关鉴权，不接收替换路径或历史，不调用推理',async()=>{
 const calls=[];const app=await gateway({token:'synthetic',port:0,execute:async()=>{throw Error('must not infer');},sessionControl:{lifecycle:async(...args)=>{calls.push(args);return {ok:true};}}});
 try{
  const url='http://127.0.0.1:'+app.port;
  assert.equal((await fetch(url+'/sessions/lifecycle')).status,401);
  const headers={Authorization:'Bearer synthetic'};assert.equal((await fetch(url+'/sessions/lifecycle',{headers})).status,200);
  assert.equal((await fetch(url+'/sessions/'+randomUUID()+'/retire',{method:'POST',headers,body:'{}'})).status,400);
  assert.equal((await fetch(url+'/sessions/lifecycle/sweep',{method:'POST',headers})).status,200);assert.deepEqual(calls,[['list'],['sweep',undefined]]);
 }finally{await app.close();}
});
test('维护与新请求互斥，保护维护期间的索引与文件',async()=>{
 const f=await fixture();const relay=sessionRelay({home:f.home,configDir:f.config,persistentSessions:true});try{
  const original=SessionLifecycle.prototype.list;let release,started;const ready=new Promise(r=>started=r);
  SessionLifecycle.prototype.list=async()=>{started();await new Promise(r=>release=r);return {};};
  try{const pending=relay.lifecycle('list');await ready;assert.equal(relay.maintenance,true);await assert.rejects(relay.infer({}),{code:'SESSION_MAINTENANCE'});await assert.rejects(relay.lifecycle('sweep'),{code:'SESSION_BUSY'});release();await pending;assert.equal(relay.maintenance,false);}finally{SessionLifecycle.prototype.list=original;}
 }finally{await relay.close();await f.close();}
});

test('退役墓碑匹配完成轮次，不封禁同一句开场白的新对话',async()=>{
 const f=await fixture();let relay;try{
  const {historyKey}=await import('./session-history.mjs');const user={role:'user',content:'synthetic greeting'},assistant={role:'assistant',content:'synthetic reply'};
  f.row.history=[historyKey(user,{hashKey:f.store.key})];f.row.expected=historyKey(assistant,{hashKey:f.store.key});f.store.records.set(f.id,f.row);await f.store.persist();await f.lifecycle.retire(f.id);
  let launches=0;relay=sessionRelay({home:f.home,configDir:f.config,persistentSessions:true,modelFor:x=>x,spawnProcess(){launches++;throw Object.assign(Error('synthetic fresh start'),{code:'SYNTHETIC_FRESH_START'});}});
  await assert.rejects(relay.infer({model:'synthetic',messages:[user,assistant,{role:'user',content:'continue'}]}),{code:'SESSION_RETIRED'});assert.equal(launches,0);
  await assert.rejects(relay.infer({model:'synthetic',messages:[user]}),{code:'SYNTHETIC_FRESH_START'});assert.equal(launches,1);
 }finally{await relay?.close();await f.close();}
});

test('退役在撤销检查点后中断，仍能用完整归档恢复且不重放历史',async()=>{
 const f=await fixture();try{
  const forget=f.store.forget.bind(f.store);f.store.forget=async id=>{await forget(id);throw Error('synthetic retire interruption');};
  await assert.rejects(f.lifecycle.retire(f.id),/synthetic retire interruption/);assert.equal((await f.lifecycle.list()).sessions[0].state,'retiring');
  await f.lifecycle.restore(f.id);assert.equal(f.store.blocked.length,0);assert(f.store.records.has(f.id));assert.equal(await fs.readFile(f.file,'utf8'),'SYNTHETIC_NATIVE_HISTORY\n');
 }finally{await f.close();}
});
test('清理拒绝目录符号链接，不触碰链接指向的其他数据',async(t)=>{
 const f=await fixture();try{
  await f.lifecycle.retire(f.id);f.advance();const folder=path.join(f.home,'session-lifecycle',f.id),saved=folder+'-saved',outside=path.join(f.home,'outside');
  await fs.rename(folder,saved);await fs.mkdir(outside);await fs.writeFile(path.join(outside,'KEEP'),'SYNTHETIC_KEEP');try{await fs.symlink(outside,folder,process.platform==='win32'?'junction':'dir');}catch(e){if(process.platform==='win32'&&e.code==='EPERM'){t.skip('Windows 当前权限不能创建链接；Linux 隔离验收实际执行本项');return;}throw e;}
  await assert.rejects(f.lifecycle.sweep(),{code:'LIFECYCLE_UNSAFE_PATH'});assert.equal(await fs.readFile(path.join(outside,'KEEP'),'utf8'),'SYNTHETIC_KEEP');
 }finally{await f.close();}
});
