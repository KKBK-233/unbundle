import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {sessionRelay} from './session-relay.mjs';
import {assistantMessage} from './session-history.mjs';
import {NativeSessionStore} from './native-session-store.mjs';
import {SessionLifecycle} from './session-lifecycle.mjs';
import {infer as statelessInfer} from './engine.mjs';

// 只产生合成文本并访问本次创建的回环 MCP；不运行官方 CLI、不请求模型。
const fake=String.raw`import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';
const args=JSON.parse(process.argv[1]),mode=process.argv[2],flag=n=>args[args.indexOf(n)+1];
const id=args.includes('--resume')?flag('--resume'):(args.includes('--session-id')?flag('--session-id'):'legacy');
const folder=path.join(process.env.CLAUDE_CONFIG_DIR,'projects','synthetic'),file=path.join(folder,id+'.jsonl');
fs.mkdirSync(folder,{recursive:true});const emit=x=>console.log(JSON.stringify(x));
emit({type:'system',subtype:'init',session_id:id});
readline.createInterface({input:process.stdin}).on('line',line=>{
 const frame=JSON.parse(line);if(frame.type!=='user')return;
 fs.appendFileSync(file,JSON.stringify({type:'fake_user'})+'\n');
 emit({type:'stream_event',event:{type:'message_start',message:{id:'synthetic',usage:{input_tokens:2}}}});
 if(mode==='failure'){emit({type:'result',is_error:true,result:'API Error: 400 synthetic'});return;}
 if(mode==='pending'){
  emit({type:'assistant',message:{content:[{type:'tool_use',id:'pending',name:'mcp__omp__Read',input:{}}]}});
  emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:3}}});
  const config=JSON.parse(fs.readFileSync(flag('--mcp-config'),'utf8')).mcpServers.omp;
  fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'rpc',method:'tools/call',params:{name:'Read',arguments:{},_meta:{'claudecode/toolUseId':'pending'}}})}).catch(()=>{});return;
 }
 const text=mode==='tag'?'<thinking>SYNTHETIC_ONLY</thinking>':'READY';
 emit({type:'stream_event',event:{type:'content_block_start',index:0,content_block:{type:'text',text:''}}});
 emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text}}});
 emit({type:'stream_event',event:{type:'content_block_stop',index:0}});
 emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:3}}});
 emit({type:'result',is_error:false,result:text});
});`;
const base={model:'synthetic',max_tokens:1024,messages:[{role:'user',content:'A'}]};
async function poolFixture(overrides={}){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'pr3-independent-')),configDir=path.join(home,'.claude');
 const children=[],relays=[],events=[];let mode='normal';
 const options={home,configDir,persistentSessions:true,modelFor:x=>x,maxOutputTokens:1024,maxSessions:1,timeoutMs:3000,
  onSessionEvent:r=>events.push(r),onCliAudit:r=>events.push(r),
  spawnProcess:(_c,args,opts)=>{const child=spawn(process.execPath,['--input-type=module','-e',fake,JSON.stringify(args),mode],opts);children.push(child);return child;},...overrides};
 const retained={sessions:new Set()};
 return {home,configDir,events,children,retained,options,setMode:v=>mode=v,
  make(){const relay=sessionRelay(options,retained);relays.push(relay);return relay;},
  async close(){for(const relay of relays)await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}};
}
async function lifecycleFixture(){
 const f=await poolFixture(),id=randomUUID(),folder=path.join(f.configDir,'projects','synthetic');await fs.mkdir(folder,{recursive:true});
 const file=path.join(folder,id+'.jsonl');await fs.writeFile(file,'SYNTHETIC_TRANSCRIPT\n');const stat=await fs.stat(file);
 const store=new NativeSessionStore(f.home,f.configDir);await store.ready;
 const h='a'.repeat(64),row={id,signature:h,expected:h,history:[h],historyNormalization:true,snapshot:{size:stat.size,mtimeMs:stat.mtimeMs},savedAt:Date.now()};
 store.records.set(id,row);await store.persist();const lifecycle=new SessionLifecycle(store);
 return {...f,id,file,row,store,lifecycle};
}

test('普通恢复和压缩恢复遇到容量不足均保留检查点，未启动多余 CLI',async()=>{
 for(const compact of [false,true]){
  const f=await poolFixture();try{
   const original=f.make(),first=await original.infer(base);await original.close();f.retained.sessions.clear();
   const relay=f.make();f.setMode('pending');
   await relay.infer({...base,tools:[{type:'function',function:{name:'Read',parameters:{}}}],messages:[{role:'user',content:'B'}]});
   const request={...base,messages:[...base.messages,assistantMessage(first),{role:'user',content:compact?'Your task is to create a detailed summary of this conversation.':'A next'}]};
   const index=path.join(f.home,'native-session-index/index.json'),before=await fs.readFile(index,'utf8');
   await assert.rejects(relay.infer(request),{code:'SESSION_CAPACITY'});
   assert.equal(await fs.readFile(index,'utf8'),before);assert.equal(f.children.length,2);
   if(!compact){
    for(const session of f.retained.sessions)await session.close('test');
    f.setMode('normal');assert.equal((await relay.infer(request)).content,'READY');assert.equal(f.children.length,3);
   }
  }finally{await f.close();}
 }
});

test('恢复在首次输入前启动失败时保留检查点，下一次可以正常 resume',async()=>{
 const f=await poolFixture();try{
  const original=f.make(),first=await original.infer(base);await original.close();f.retained.sessions.clear();
  const spawnProcess=f.options.spawnProcess,index=path.join(f.home,'native-session-index/index.json'),before=await fs.readFile(index,'utf8');
  f.options.spawnProcess=()=>{throw Error('synthetic startup failure');};const relay=f.make();
  const request={...base,messages:[...base.messages,assistantMessage(first),{role:'user',content:'next'}]};
  await assert.rejects(relay.infer(request),/synthetic startup failure/);assert.equal(await fs.readFile(index,'utf8'),before);
  // options 在池创建时被闭包引用，恢复构造器使用更新后的同一配置。
  f.options.spawnProcess=spawnProcess;assert.equal((await relay.infer(request)).content,'READY');
 }finally{await f.close();}
});

test('不同会话键并发创建仍遵守池容量，容量拒绝后可重新建立新会话',async()=>{
 const f=await poolFixture();try{
  const relay=f.make(),results=await Promise.allSettled(['one','two','three'].map(content=>relay.infer({...base,messages:[{role:'user',content}]},{affinity:{key:content}})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='SESSION_CAPACITY'));
  assert.equal(relay.size,1);assert.equal(f.children.length,1);
  assert.equal((await relay.infer({...base,messages:[{role:'user',content:'four'}]},{affinity:{key:'four'}})).content,'READY');
  assert.equal(relay.size,1);assert.equal(f.children.length,2);
 }finally{await f.close();}
});

test('超两万项的合法历史检查点可持久化并原样重载',async()=>{
 const f=await lifecycleFixture();try{
  f.row.history=Array(20001).fill('a'.repeat(64));await f.store.persist();
  const loaded=new NativeSessionStore(f.home,f.configDir);await loaded.ready;
  assert.deepEqual(loaded.records.get(f.id),f.row);
 }finally{await f.close();}
});

test('默认逐轮执行器接受已完成的普通历史，并在第二轮成功返回',async()=>{
 const f=await poolFixture();try{
  const first=await statelessInfer(base,f.options);
  const next={...base,messages:[...base.messages,assistantMessage(first),{role:'user',content:'next'}]};
  assert.equal((await statelessInfer(next,f.options)).content,'READY');assert.equal(f.children.length,2);
 }finally{await f.close();}
});

test('只允许显式释放已死亡的冻结进程，保留现场与墓碑并恢复其他会话容量',async()=>{
 const f=await poolFixture();try{
  const relay=f.make();f.setMode('failure');await assert.rejects(relay.infer(base),{code:'UPSTREAM_HTTP_400'});
  const row=(await relay.listSessions()).sessions[0];
  await assert.rejects(relay.dispose(row.sessionId),{code:'NATIVE_PROCESS_ALIVE'});assert.equal(relay.frozenSize,1);
  const child=f.children[0],done=new Promise(r=>child.once('close',r));child.kill('SIGKILL');await done;
  const before=await fs.readFile(path.join(f.home,'native-session-index/quarantined-history.json'),'utf8');
  assert.equal((await relay.dispose(row.sessionId)).state,'archived');assert.equal(relay.frozenSize,0);
  assert.equal(await fs.readFile(path.join(f.home,'native-session-index/quarantined-history.json'),'utf8'),before);
  const archived=(await relay.listSessions()).sessions.find(s=>s.sessionId===row.sessionId);assert.equal(archived.state,'archived');
  await assert.rejects(relay.infer(base),{code:'SESSION_QUARANTINED'});
  f.setMode('normal');assert.equal((await relay.infer({...base,messages:[{role:'user',content:'another conversation'}]})).content,'READY');
 }finally{await f.close();}
});

test('restore清理中断可在重建后续办，manifest删除后也不覆盖新的正文与检查点',async()=>{
 for(const sweep of [false,true]){
  const f=await lifecycleFixture();try{
   await f.lifecycle.retire(f.id);
   f.lifecycle.removeArchive=async folder=>{await fs.unlink(path.join(folder,'manifest.json'));throw Error('synthetic interrupted cleanup');};
   await assert.rejects(f.lifecycle.restore(f.id),/synthetic interrupted cleanup/);
   assert.equal(f.lifecycle.catalog.sessions[f.id].state,'restoring');assert(f.store.records.has(f.id));
   await fs.appendFile(f.file,'NEW_VALID_DATA');const stat=await fs.stat(f.file);
   f.store.records.set(f.id,{...f.store.records.get(f.id),snapshot:{size:stat.size,mtimeMs:stat.mtimeMs},savedAt:Date.now()+1});await f.store.persist();
   const before=await fs.readFile(f.file,'utf8'),checkpoint=structuredClone(f.store.records.get(f.id));
   const lifecycle=new SessionLifecycle(f.store);
   if(sweep)await lifecycle.sweep();else await lifecycle.restore(f.id);
   assert.equal(lifecycle.catalog.sessions[f.id].state,'recoverable');assert.equal(await fs.readFile(f.file,'utf8'),before);
   assert.deepEqual(f.store.records.get(f.id),checkpoint);
   await lifecycle.retire(f.id);assert.equal(lifecycle.catalog.sessions[f.id].state,'retired');
  }finally{await f.close();}
 }
});

