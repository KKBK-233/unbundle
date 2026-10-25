import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {statelessQuotaFailure} from './stateless-quota.mjs';
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
