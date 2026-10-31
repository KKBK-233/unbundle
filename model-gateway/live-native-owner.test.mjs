import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionRelay} from './session-relay.mjs';
for(const state of ['idle','frozen'])test(`检查点匹配到仍存活的同UUID会话时禁止启动第二个CLI，状态=${state}`,async()=>{
 const id='00000000-0000-4000-8000-000000000001',owner={nativeSessionId:id,state,options:{outputTokens:1024},signature:'different',history:[],pendingIds:new Set(),request:{messages:[]},close:async()=>{}},sessions=new Set([owner]);
 const store={home:'synthetic',folder:'synthetic/index',key:Buffer.alloc(32,9),ready:Promise.resolve(),blocked:[],checkAffinity:async()=>{},take:async()=>({id,delta:[{role:'user',content:'next'}],outputTokens:1024})};
 let launches=0;const relay=sessionRelay({home:'synthetic',model:'synthetic',spawnProcess(){launches++;throw Error('duplicate spawn');}},{sessions,store});
 try{await assert.rejects(relay.infer({model:'synthetic',max_tokens:1024,messages:[{role:'user',content:'next'}]}),{code:'NATIVE_SESSION_ALREADY_LIVE'});assert.equal(launches,0);assert.equal(sessions.size,1);assert.equal(owner.state,state);}
 finally{await relay.close({discardFrozen:true});}
});
