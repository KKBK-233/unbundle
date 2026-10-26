import test from 'node:test';
import assert from 'node:assert/strict';
import {gateway} from './server.mjs';
import {sessionQuotaFailure} from './session-quota-guard.mjs';

// 复现实际损坏形态：摘要请求失败不能被误读为合法的助手摘要。
test('摘要请求额度耗尽在 JSON/SSE 均为错误，不能生成可替换上下文的成功摘要',async()=>{
 for(const stream of [false,true]){
  const app=await gateway({token:'synthetic',port:0,models:[{id:'claude-opus-5-5'}],
   execute:async()=>{throw sessionQuotaFailure("You've hit your session limit");}});
  try{
   const response=await fetch(`http://127.0.0.1:${app.port}/v1/messages`,{method:'POST',headers:{'x-api-key':'synthetic','content-type':'application/json'},body:JSON.stringify({model:'claude-opus-5-5',max_tokens:1024,stream,messages:[{role:'user',content:'Summarize the conversation so it can be continued after compaction.'}]})});
   if(stream){
    const wire=await response.text();
    assert(wire.includes('event: error'));assert(!wire.includes('event: message_stop'));
    assert(!wire.includes('"stop_reason":"end_turn"'));assert(!wire.includes('"type":"text_delta"'));
   }else{
    assert.equal(response.status,429);const body=await response.json();
    assert.equal(body.type,'error');assert.equal(body.error.code,'SESSION_LIMIT');
    assert.equal(body.content,undefined);assert.equal(body.stop_reason,undefined);
   }
  }finally{await app.close({discardFrozen:true});}
 }
});

test('已产生部分文本后额度失败仍以 error 结束，不追加错误提示或成功收尾',async()=>{
 const app=await gateway({token:'synthetic',port:0,models:[{id:'claude-opus-5-5'}],
  execute:async(_request,_signal,onText)=>{onText('部分摘要');throw sessionQuotaFailure("You've hit your session limit");}});
 try{
  const response=await fetch(`http://127.0.0.1:${app.port}/v1/messages`,{method:'POST',headers:{'x-api-key':'synthetic','content-type':'application/json'},body:JSON.stringify({model:'claude-opus-5-5',max_tokens:1024,stream:true,messages:[{role:'user',content:'Summarize the task.'}]})});
  const events=(await response.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
  assert.equal(events.filter(e=>e.delta?.type==='text_delta').map(e=>e.delta.text).join(''),'部分摘要');
  assert.equal(events.at(-1).type,'error');assert.equal(events.at(-1).error.type,'rate_limit_error');
  assert(!events.some(e=>e.type==='message_stop'||e.type==='message_delta'&&e.delta.stop_reason));
 }finally{await app.close({discardFrozen:true});}
});
