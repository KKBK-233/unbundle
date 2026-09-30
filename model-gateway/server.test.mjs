import test from 'node:test';import assert from 'node:assert/strict';import {gateway} from './server.mjs';
test('模型入口认证、单请求限制与断线取消',async()=>{
 let started,aborted;const began=new Promise(r=>started=r),stopped=new Promise(r=>aborted=r);
 const server=await gateway({token:'test-secret',port:0,execute:async(_body,signal)=>{started();await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted();resolve();},{once:true}));return {role:'assistant',content:'stopped'};}});
 const base=`http://127.0.0.1:${server.port}`;const headers={Authorization:'Bearer test-secret','content-type':'application/json'};
 try{
  assert.equal((await fetch(base+'/v1/models')).status,401);
  assert.equal((await fetch(base+'/v1/models',{headers:{...headers,Origin:'https://untrusted.invalid'}})).status,403);
  assert.equal((await fetch(base+'/v1/models',{headers})).status,200);
  const body=JSON.stringify({model:'claude-code-sonnet',messages:[{role:'user',content:'hi'}]});
  const controller=new AbortController();const pending=fetch(base+'/v1/chat/completions',{method:'POST',headers,body,signal:controller.signal});
  const rejection=assert.rejects(pending,/abort/i);await began;
  assert.equal((await fetch(base+'/v1/chat/completions',{method:'POST',headers,body})).status,429);
  controller.abort();await rejection;await stopped;
 }finally{await server.close();}
});

test('登录错误先返回状态码，流式片段在执行完成前到达且不重复',async()=>{
 let release;const gate=new Promise(r=>release=r);let ready;const began=new Promise(r=>ready=r);
 const server=await gateway({token:'stream-test',port:0,beforeExecute:body=>{if(body.messages[0].content==='auth')throw Object.assign(new Error('AUTH_REQUIRED'),{status:503,code:'AUTH_REQUIRED'});},execute:async(_body,_signal,onText)=>{onText('FIRST');ready();await gate;return {role:'assistant',content:'FIRST'};}});
 const headers={Authorization:'Bearer stream-test','content-type':'application/json'},base=`http://127.0.0.1:${server.port}`;
 const body=content=>JSON.stringify({model:'claude-code-sonnet',messages:[{role:'user',content}],stream:true});
 try{
  const denied=await fetch(base+'/v1/chat/completions',{method:'POST',headers,body:body('auth')});
  assert.equal(denied.status,503);assert.equal((await denied.json()).error.code,'AUTH_REQUIRED');
  const response=await fetch(base+'/v1/chat/completions',{method:'POST',headers,body:body('stream')});await began;
  const reader=response.body.getReader();let output='';
  while(!output.includes('FIRST')){const part=await reader.read();assert(!part.done);output+=new TextDecoder().decode(part.value);}
  release();while(true){const part=await reader.read();if(part.done)break;output+=new TextDecoder().decode(part.value);}
  assert.equal(output.split('FIRST').length-1,1);assert(output.includes('[DONE]'));
 }finally{release();await server.close();}
});
