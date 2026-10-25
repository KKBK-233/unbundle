import test from 'node:test';
import assert from 'node:assert/strict';
import {gateway}from './server.mjs';
test('会话管理复用鉴权，准备恢复和导出均不执行模型，不接受替换历史',async()=>{
 let models=0,recoveries=0;const id='a'.repeat(24);
 const app=await gateway({token:'synthetic',port:0,execute:async()=>{models++;return{content:'SHOULD_NOT_RUN'};},sessionControl:{
  listSessions:async()=>({sessions:[{sessionId:id,state:'frozen'}]}),
  recover:async value=>{recoveries++;assert.equal(value,id);return{recoveryArmed:true,processStillPaused:true,modelRequests:0};},
  exportHandoff:async()=>({markdown:'# 交接\n',modelRequests:0})}});
 const base=`http://127.0.0.1:${app.port}`,headers={authorization:'Bearer synthetic'};
 try {
  assert.equal((await fetch(base+'/sessions')).status,401);
  assert.equal((await fetch(base+'/sessions',{headers:{...headers,origin:'https://example.invalid'}})).status,403);
  assert.equal((await(await fetch(base+'/sessions',{headers})).json()).sessions[0].sessionId,id);
  const result=await(await fetch(base+`/sessions/${id}/recover`,{headers,method:'POST'})).json();assert.equal(result.processStillPaused,true);
  assert.equal((await fetch(base+`/sessions/${id}/recover`,{headers,method:'POST',body:'{"history":[]}'})).status,400);
  assert.equal(recoveries,1);assert.equal((await(await fetch(base+`/sessions/${id}/handoff`,{headers})).json()).modelRequests,0);assert.equal(models,0);
 }finally{await app.close();}
});
