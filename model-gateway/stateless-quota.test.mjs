import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {statelessQuotaFailure,statelessInitialCancellation} from './stateless-quota.mjs';
import {sessionRelay} from './session-relay.mjs';
const fake=`import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',()=>console.log(JSON.stringify({type:'result',is_error:true,result:"You've hit your session limit"})));`;
test('启动探针额度耗尽后仍返回额度错误；同样请求不会变成永久封存',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'probe-quota-'));let calls=0;
 const relay=sessionRelay({home,modelFor:x=>x,maxOutputTokens:1024,persistentSessions:true,spawnProcess:(_cli,_args,opts)=>{calls++;return spawn(process.execPath,['--input-type=module','-e',fake],opts);}});
 const request={model:'claude-haiku-5-5',max_tokens:16,tools:[],messages:[{role:'developer',content:'synthetic rules'},{role:'user',content:'.'}]};
 try{
  for(let i=0;i<2;i++)await assert.rejects(relay.infer(request),{code:'SESSION_LIMIT'});
  assert.equal(calls,2);assert.equal(relay.frozenSize,0);
  await assert.rejects(fs.access(path.join(home,'native-session-index/quarantined-history.json')),{code:'ENOENT'});
 }finally{await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});
test('真实历史、工具或固定会话中的额度错误不能借此绕过封存',()=>{
 const fixture=()=>({entryMode:'native_new',options:{},request:{tools:[],messages:[{role:'user',content:'.'}]},pendingIds:new Set(),pendingHttp:new Map(),results:new Map(),turn:{events:{calls:new Map(),searchCalls:new Map()}}});
 const error={code:'SESSION_LIMIT'};assert.equal(statelessQuotaFailure(fixture(),error),true);
 for(const modify of [s=>s.lastAssistant={},s=>s.entryMode='native_resume',s=>s.affinityHash='sticky',s=>s.request.tools=[{}],s=>s.pendingIds.add('tool'),s=>s.turn.events.calls.set('tool',{}),s=>s.request.messages.push({role:'assistant',content:'old'})]){
  const session=fixture();modify(session);assert.equal(statelessQuotaFailure(session,error),false);
 }
 assert.equal(statelessQuotaFailure(fixture(),{code:'UPSTREAM_HTTP_400'}),false);
});


test('首次无工具请求在模型响应前取消后，重复启动测试不会命中封存',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'probe-cancel-'));let calls=0;
 const relay=sessionRelay({home,modelFor:x=>x,maxOutputTokens:1024,persistentSessions:true,spawnProcess:(_cli,_args,opts)=>{calls++;return spawn(process.execPath,['--input-type=module','-e',calls===1?"process.stdin.resume();":"import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',()=>console.log(JSON.stringify({type:'result',is_error:false,result:'OK'})));"],opts);}});
 const request={model:'claude-haiku-5-5',max_tokens:16,tools:[],messages:[{role:'user',content:'.'}]},controller=new AbortController();
 try{const pending=relay.infer(request,{signal:controller.signal});const rejected=assert.rejects(pending,{code:'REQUEST_CANCELLED'});for(let i=0;i<200&&calls===0;i++)await new Promise(r=>setTimeout(r,5));await new Promise(r=>setTimeout(r,20));controller.abort();await rejected;assert.equal(relay.frozenSize,0);assert.equal((await relay.infer(request)).content,'OK');assert.equal(calls,2);await assert.rejects(fs.access(path.join(home,'native-session-index/quarantined-history.json')),{code:'ENOENT'});}finally{await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});

test('已有模型消息、历史、工具或固定会话的取消不按空启动测试释放',()=>{
 const fixture=()=>({entryMode:'native_new',options:{},request:{tools:[],messages:[{role:'user',content:'.'}]},pendingIds:new Set(),pendingHttp:new Map(),results:new Map(),turn:{awaitingStart:true,events:{calls:new Map(),searchCalls:new Map(),counts:new Map(),blocks:new Map(),text:'',pendingText:'',receivedText:false}}});
 const error={code:'REQUEST_CANCELLED'};assert.equal(statelessInitialCancellation(fixture(),error),true);
 for(const modify of [s=>s.lastAssistant={},s=>s.entryMode='native_resume',s=>s.affinityHash='sticky',s=>s.request.tools=[{}],s=>s.pendingIds.add('tool'),s=>s.turn.awaitingStart=false,s=>s.turn.events.counts.set('msg',{}),s=>s.turn.events.blocks.set(0,{}),s=>s.turn.events.text='visible',s=>s.turn.events.pendingText='partial',s=>s.turn.events.receivedText=true,s=>s.request.messages.push({role:'assistant',content:'old'})]){const current=fixture();modify(current);assert.equal(statelessInitialCancellation(current,error),false);}
});
