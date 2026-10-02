import test from 'node:test';import assert from 'node:assert/strict';import {gateway} from './server.mjs';

// 验证桌面客户端小输出探针可通过 HTTP 入口，同时无效额度不进入推理进程。
test('小输出上限原样传递，非法额度仍返回 400', async () => {
 const limits = [];
 const server = await gateway({ token: 'probe-test', port: 0, execute: async body => {
  limits.push(body.max_tokens ?? body.max_completion_tokens);
  return { role: 'assistant', content: 'OK' };
 }});
 const invoke = body => fetch(`http://127.0.0.1:${server.port}/v1/chat/completions`, {
  method: 'POST', headers: { Authorization: 'Bearer probe-test', 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'claude-code-sonnet', messages: [{ role: 'user', content: 'probe' }], ...body }),
 });
 try {
  for (const field of ['max_tokens', 'max_completion_tokens']) {
   for (const limit of [1, 16, 255, 8192]) assert.equal((await invoke({ [field]: limit })).status, 200);
   for (const limit of [0, -1, 1.5, '1', 8193]) assert.equal((await invoke({ [field]: limit })).status, 400);
  }
  assert.deepEqual(limits, [1, 16, 255, 8192, 1, 16, 255, 8192]);
 } finally { await server.close(); }
});
test('模型入口认证、显式关闭队列与断线取消',async()=>{
 let started,aborted;const began=new Promise(r=>started=r),stopped=new Promise(r=>aborted=r);
 const server=await gateway({token:'test-secret',port:0,maxConcurrent:1,maxQueued:0,execute:async(_body,signal)=>{started();await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted();resolve();},{once:true}));return {role:'assistant',content:'stopped'};}});
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
