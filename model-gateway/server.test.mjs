import test from 'node:test';import assert from 'node:assert/strict';import {gateway} from './server.mjs';
test('模型入口认证、单请求限制与断线取消',async()=>{
 let started,aborted;const began=new Promise(r=>started=r),stopped=new Promise(r=>aborted=r);
 const server=await gateway({token:'test-secret',port:0,execute:async(_body,signal)=>{started();await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted();resolve();},{once:true}));return {role:'assistant',content:'stopped'};}});
 const base=`http://127.0.0.1:${server.port}`;const headers={Authorization:'Bearer test-secret','content-type':'application/json'};
 try{
  assert.equal((await fetch(base+'/v1/models')).status,401);
  assert.equal((await fetch(base+'/v1/models',{headers:{...headers,Origin:'https://untrusted.invalid'}})).status,403);
  assert.equal((await fetch(base+'/v1/models',{headers})).status,200);
  const body=JSON.stringify({model:'claude-code-deepseek',messages:[{role:'user',content:'hi'}]});
  const controller=new AbortController();const pending=fetch(base+'/v1/chat/completions',{method:'POST',headers,body,signal:controller.signal});
  const rejection=assert.rejects(pending,/abort/i);await began;
  assert.equal((await fetch(base+'/v1/chat/completions',{method:'POST',headers,body})).status,429);
  controller.abort();await rejection;await stopped;
 }finally{await server.close();}
});

// 对标准 JSON/SSE 内容与错误响应做最小协议回归。
test('模型列表、JSON 回答、SSE 工具调用和无效请求', async () => {
 const tool = {id:'call_test',type:'function',function:{name:'read',arguments:'{"path":"proof.txt"}'}};
 const server = await gateway({token:'test-secret',port:0,execute:async body => body.stream ? {role:'assistant',content:null,tool_calls:[tool]} : {role:'assistant',content:'hello'}});
 const base = `http://127.0.0.1:${server.port}`;
 const headers = {Authorization:'Bearer test-secret','content-type':'application/json'};
 const request = body => fetch(base+'/v1/chat/completions',{method:'POST',headers,body:JSON.stringify(body)});
 try {
  const models = await (await fetch(base+'/v1/models',{headers})).json();
  assert.equal(models.data[0].id,'claude-code-deepseek');
  const body = {model:'claude-code-deepseek',messages:[{role:'user',content:'hi'}]};
  const response = await (await request(body)).json();
  assert.equal(response.choices[0].message.content,'hello');
  assert.equal(response.choices[0].finish_reason,'stop');
  const stream = await request({...body,stream:true});
  assert.match(stream.headers.get('content-type'),/text\/event-stream/);
  const raw = await stream.text();
  const chunks = raw.split('\n').filter(line=>line.startsWith('data: {')).map(line=>JSON.parse(line.slice(6)));
  assert.equal(chunks.find(c=>c.choices[0].delta.tool_calls)?.choices[0].delta.tool_calls[0].function.name,'read');
  assert.equal(chunks.at(-1).choices[0].finish_reason,'tool_calls');
  assert(raw.endsWith('data: [DONE]\n\n'));
  assert.equal((await request({...body,model:'unknown'})).status,400);
  assert.equal((await request({model:body.model})).status,400);
  assert.equal((await fetch(base+'/v1/chat/completions',{method:'POST',headers,body:'invalid'})).status,400);
  assert.equal((await fetch(base+'/not-found',{headers})).status,404);
 } finally { await server.close(); }
});
