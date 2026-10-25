import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionAffinity} from './session-affinity.mjs';
import {gateway} from './server.mjs';
test('固定会话头严格验证，不影响无头客户端',()=>{
 assert.equal(sessionAffinity(),undefined);
 assert.deepEqual(sessionAffinity({'x-claude-proxy-session-key':'a'}),{key:'a'});
 for(const headers of [{'x-claude-proxy-session-mode':'sticky'},{'x-claude-proxy-session-key':['a','b']},{'x-claude-proxy-session-key':'a b'},{'x-claude-proxy-session-key':'a','x-claude-proxy-session-mode':'pool'}])assert.throws(()=>sessionAffinity(headers),{code:'INVALID_SESSION_AFFINITY'});
});
test('会话身份通过独立参数进入执行器，不污染模型请求',async()=>{
 let captured;
 const app=await gateway({token:'synthetic',port:0,models:[{id:'test'}],execute:async(...args)=>{captured=args;return{role:'assistant',content:'OK'};}});
 try {
  const body={model:'test',max_tokens:256,messages:[{role:'user',content:'开始'}]};
  const res=await fetch(`http://127.0.0.1:${app.port}/v1/chat/completions`,{method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json','x-claude-proxy-session-key':'private-key','x-claude-proxy-session-mode':'sticky'},body:JSON.stringify(body)});
  assert.equal(res.status,200);await res.json();assert.deepEqual(captured[4],{key:'private-key'});assert.deepEqual(captured[0],body);
 }finally{await app.close({discardFrozen:true});}
});
