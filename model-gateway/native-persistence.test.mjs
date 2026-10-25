import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { sessionRelay } from './session-relay.mjs';
import { assistantMessage } from './session-history.mjs';

// 只启动 Node 假 CLI；transcript 只是测试夹具，绝不运行官方 CLI 或请求模型。
const fake = `import fs from 'node:fs';import path from 'node:path';import readline from 'node:readline';
const args=JSON.parse(process.argv[1]),mode=process.argv[2];const flag=n=>args[args.indexOf(n)+1];
let id=args.includes('--resume')?flag('--resume'):flag('--session-id');
if(id.endsWith('.jsonl'))id=JSON.parse(fs.readFileSync(id,'utf8').split('\\n')[0]).sessionId;
const folder=path.join(process.env.CLAUDE_CONFIG_DIR,'projects','synthetic'),file=path.join(folder,id+'.jsonl');
if(args.includes('--resume')&&!flag('--resume').endsWith('.jsonl')&&!fs.existsSync(file))throw Error('missing fake transcript');
fs.mkdirSync(folder,{recursive:true});
const emit=x=>console.log(JSON.stringify(x));emit({type:'system',subtype:'init',session_id:id});
readline.createInterface({input:process.stdin}).on('line',line=>{
 const frame=JSON.parse(line);if(frame.type!=='user')return;
 fs.appendFileSync(file,JSON.stringify({type:'fake_user',content:frame.message.content})+'\\n');
 emit({type:'stream_event',event:{type:'message_start',message:{id:'one-'+Date.now(),usage:{input_tokens:2}}}});
 if(mode==='failure'){
  emit({type:'result',is_error:true,result:'API Error: 400 synthetic resume failure'});return;
 }
 if(mode==='pending'){
  emit({type:'assistant',message:{content:[{type:'tool_use',id:'pending',name:'mcp__omp__Read',input:{}}]}});
  emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:3}}});
  const config=JSON.parse(fs.readFileSync(flag('--mcp-config'),'utf8')).mcpServers.omp;
  fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'rpc',method:'tools/call',params:{name:'Read',arguments:{},_meta:{'claudecode/toolUseId':'pending'}}})}).catch(()=>{});return;
 }
 emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'READY'}}});
 emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:3}}});
 emit({type:'result',is_error:false,result:'READY'});
});`;
const base={model:'synthetic',max_tokens:1024,messages:[{role:'user',content:'PRIVATE_FIRST_MESSAGE'}]};
async function setup() {
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'native-persistence-')),calls=[],audit=[];let mode='normal';
 const options={home,configDir:path.join(home,'.claude'),persistentSessions:true,modelFor:model=>model,maxOutputTokens:1024,
  maxSessions:1,timeoutMs:3000,onCliAudit:r=>audit.push(r),onSessionEvent:r=>audit.push(r),
  spawnProcess:(_cli,args,opts)=>{calls.push(args);return spawn(process.execPath,['--input-type=module','-e',fake,JSON.stringify(args),mode],opts);}};
 const relays=[];const make=()=>{const relay=sessionRelay(options);relays.push(relay);return relay;};
 return {home,calls,audit,make,setMode:value=>{mode=value;},async close(){await Promise.all(relays.map(r=>r.close({discardFrozen:true})));await fs.rm(home,{recursive:true,force:true});}};
}
const next=(first)=>({...base,messages:[...base.messages,assistantMessage(first),{role:'user',content:'ONLY_NEW_MESSAGE'}]});

test('网关关闭重建后按原 UUID resume，只输入新增消息，索引不保存正文',async()=>{
 const state=await setup();
 try{
  const firstRelay=state.make(),first=await firstRelay.infer(base);await firstRelay.close({discardFrozen:true});
  const index=await fs.readFile(path.join(state.home,'native-session-index/index.json'),'utf8');
  assert(!index.includes('PRIVATE_FIRST_MESSAGE'));assert(!index.includes('READY'));
  const oldArgs=state.calls[0],id=oldArgs[oldArgs.indexOf('--session-id')+1];
  assert(!oldArgs.includes('--no-session-persistence'));
  const secondRelay=state.make();assert.equal((await secondRelay.infer(next(first))).content,'READY');
  const args=state.calls[1];assert.equal(args[args.indexOf('--resume')+1],id);assert(!args.includes('--session-id'));
  const transcript=await fs.readFile(path.join(state.home,'.claude/projects/synthetic',id+'.jsonl'),'utf8');
  const frames=transcript.trim().split('\n').map(JSON.parse);
  assert.deepEqual(frames[1].content,[{type:'text',text:'ONLY_NEW_MESSAGE'}]);
  assert(state.audit.some(r=>r.type==='session_restore_usage'&&r.strategy==='native_resume'&&r.model_requests===1));
 }finally{await state.close({discardFrozen:true});}
});

test('池容量淘汰后的完成会话可恢复原 UUID',async()=>{
 const state=await setup();
 try{
  const relay=state.make(),first=await relay.infer(base);
  await relay.infer({...base,messages:[{role:'user',content:'OTHER_CONVERSATION'}]});
  assert.equal((await relay.infer(next(first))).content,'READY');
  assert.equal(state.calls.length,3);
  assert.equal(state.calls[2][state.calls[2].indexOf('--resume')+1],state.calls[0][state.calls[0].indexOf('--session-id')+1]);
 }finally{await state.close({discardFrozen:true});}
});

test('等待工具时不生成恢复检查点，不把未完成操作当成完成历史',async()=>{
 const state=await setup();
 try{
  state.setMode('pending');const relay=state.make();
  const result=await relay.infer({...base,tools:[{type:'function',function:{name:'Read',parameters:{}}}]});
  assert.equal(result.tool_calls.length,1);
  await assert.rejects(fs.readFile(path.join(state.home,'native-session-index/index.json')),{code:'ENOENT'});
 }finally{await state.close({discardFrozen:true});}
});

test('恢复失败只运行一次，相同长历史请求立即重试被拦截',async()=>{
 const state=await setup();
 try{
  const firstRelay=state.make(),first=await firstRelay.infer(base);await firstRelay.close({discardFrozen:true});
  state.setMode('failure');const relay=state.make();
  await assert.rejects(relay.infer(next(first)),{code:'UPSTREAM_HTTP_400',retryable:false});
  const count=state.calls.length;
  await assert.rejects(relay.infer(next(first)),{code:'SESSION_QUARANTINED',retryable:false});
  await assert.rejects(relay.infer({...next(first),messages:[...next(first).messages,
    {role:'system',content:'<total_tokens>100 tokens left</total_tokens>'}]}),{code:'SESSION_QUARANTINED',retryable:false});
  assert.equal(state.calls.length,count);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(state.home,'native-session-index/index.json'),'utf8')),[]);
 }finally{await state.close({discardFrozen:true});}
});

test('历史分支或模型变化不恢复旧原生 ID',async()=>{
 const state=await setup();
 try{
  const firstRelay=state.make(),first=await firstRelay.infer(base);await firstRelay.close({discardFrozen:true});
  const relay=state.make();const branch=next(first);branch.messages[0]={role:'user',content:'CHANGED_HISTORY'};
  await assert.rejects(relay.infer(branch),{code:'NATIVE_RESUME_REQUIRED'});
  await assert.rejects(relay.infer({...next(first),model:'different-model'}),{code:'NATIVE_RESUME_REQUIRED'});
  assert.equal(state.calls.length,1);
 }finally{await state.close({discardFrozen:true});}
});

test('官方 transcript 丢失时记录原因，不按不存在的原生 ID 启动',async()=>{
 const state=await setup();
 try{
  const firstRelay=state.make(),first=await firstRelay.infer(base);await firstRelay.close({discardFrozen:true});
  const id=state.calls[0][state.calls[0].indexOf('--session-id')+1];
  await fs.unlink(path.join(state.home,'.claude/projects/synthetic',id+'.jsonl'));
  await assert.rejects(state.make().infer(next(first)),{code:'NATIVE_TRANSCRIPT_MISSING',retryable:false});
  assert.equal(state.calls.length,1);
 }finally{await state.close({discardFrozen:true});}
});

test('先撤销完成检查点再启动工具轮次，中途关闭不能恢复旧边界',async()=>{
 const state=await setup();
 try{
  const relay=state.make(),first=await relay.infer({...base,tools:[{type:'function',function:{name:'Read',parameters:{}}}]});
  assert.equal(JSON.parse(await fs.readFile(path.join(state.home,'native-session-index/index.json'),'utf8')).length,1);
  state.setMode('pending');
  // 更改工具集合会隔离会话，保持集合一致以验证原会话的检查点撤销。
  await relay.close({discardFrozen:true});const second=state.make();
  await second.infer({...next(first),tools:[{type:'function',function:{name:'Read',parameters:{}}}]});
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(state.home,'native-session-index/index.json'),'utf8')),[]);
 }finally{await state.close({discardFrozen:true});}
});

test('检查点后会话文件变化时持续拒绝恢复，不静默退回长历史重放',async()=>{
 const state=await setup();
 try{
  const firstRelay=state.make(),first=await firstRelay.infer(base);await firstRelay.close({discardFrozen:true});
  const id=state.calls[0][state.calls[0].indexOf('--session-id')+1];
  await fs.appendFile(path.join(state.home,'.claude/projects/synthetic',id+'.jsonl'),'UNCONFIRMED_APPEND\n');
  const relay=state.make();
  await assert.rejects(relay.infer(next(first)),{code:'NATIVE_TRANSCRIPT_UNCERTAIN',retryable:false});
  await assert.rejects(relay.infer(next(first)),{code:'SESSION_QUARANTINED',retryable:false});
  assert.equal(state.calls.length,1);
 }finally{await state.close({discardFrozen:true});}
});


test('固定会话在网关重启后只恢复同一原生 ID，异常封存也跨重启生效',async()=>{
 const state=await setup(),affinity={key:'stable-private-session'};
 try {
  const firstRelay=state.make(),first=await firstRelay.infer(base,{affinity});await firstRelay.close({discardFrozen:true});
  const id=state.calls[0][state.calls[0].indexOf('--session-id')+1];
  const second=state.make();await second.infer(next(first),{affinity});
  assert.equal(state.calls[1][state.calls[1].indexOf('--resume')+1],id);
  await assert.rejects(second.infer(base,{affinity}),{code:'SESSION_HISTORY_MISMATCH'});
  await second.close({discardFrozen:true});
  await assert.rejects(state.make().infer(base,{affinity}),{code:'SESSION_QUARANTINED',retryable:false});
  assert.equal(state.calls.length,2);
 }finally{await state.close({discardFrozen:true});}
});

test('检查点已消费但未完成新一轮时，固定会话重启后禁止隐式导入旧历史',async()=>{
 const state=await setup(),affinity={key:'unfinished'};
 try {
  const firstRelay=state.make(),first=await firstRelay.infer(base,{affinity});await firstRelay.close({discardFrozen:true});
  await fs.writeFile(path.join(state.home,'native-session-index/index.json'),'[]');
  await assert.rejects(state.make().infer(next(first),{affinity}),{code:'NATIVE_TRANSCRIPT_UNCERTAIN',retryable:false});
  assert.equal(state.calls.length,1);
 }finally{await state.close({discardFrozen:true});}
});


test('旧会话即使工具结果完整，没有可靠检查点也禁止启动 CLI 导入',async()=>{
 const state=await setup();
 try{
  await assert.rejects(state.make().infer({...base,messages:[...base.messages,{role:'assistant',content:'已完成'},{role:'user',content:'继续'}]}),{code:'NATIVE_RESUME_REQUIRED',retryable:false});
  assert.equal(state.calls.length,0);
 }finally{await state.close({discardFrozen:true});}
});


test('持久封存经审核恢复同一 PID 后只移除该会话的阻止记录，后续正常增量续接',async()=>{
 const state=await setup();
 try{
  const relay=state.make(),first=await relay.infer(base);
  const request={...base,messages:[...base.messages,{role:'assistant',content:[{type:'text',text:'RE'},{type:'text',text:'ADY'}]},{role:'user',content:'下一步'}]};
  await assert.rejects(relay.infer(request),{code:'ASSISTANT_MESSAGE_MISMATCH'});
  const session=(await relay.listSessions()).sessions.find(s=>s.state==='frozen');assert(session.processPreserved);
  const ledger=path.join(state.home,'native-session-index/quarantined-history.json');assert.equal(JSON.parse(await fs.readFile(ledger,'utf8')).length,1);
  await relay.recover(session.sessionId);const second=await relay.infer(request);assert.equal(second.content,'READY');
  assert.equal(JSON.parse(await fs.readFile(ledger,'utf8')).length,0);
  await relay.infer({...base,messages:[...request.messages,assistantMessage(second),{role:'user',content:'再下一步'}]});
  const live=(await relay.listSessions()).sessions.find(s=>s.sessionId===session.sessionId);assert.equal(live.pid,session.pid);assert.equal(state.calls.length,1);
 }finally{await state.close();}
});
