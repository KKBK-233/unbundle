import test from'node:test';import assert from'node:assert/strict';import{anthropicWriter}from'./anthropic.mjs';import{gateway}from'./server.mjs';
const usage={input_tokens:2,cache_read_input_tokens:499000,cache_creation_input_tokens:1100,output_tokens:9};
const parse=writes=>writes.flatMap(w=>w.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6))));
test('message_start 提供真实输入及缓存用量，不以零值开头，也不重复发送',()=>{
 const writes=[],writer=anthropicWriter({writeHead(){},write:w=>writes.push(w),end(){}},'synthetic','synthetic');writer.start();writer.ping();writer.text('先到的正文');assert(!parse(writes).some(e=>e.type==='message_start'||e.type==='content_block_start'));
 writer.usage({upstream_usage:usage});writer.usage({upstream_usage:{...usage,input_tokens:99}});writer.finish({content:'先到的正文',upstream_usage:usage},'end_turn');
 const events=parse(writes),starts=events.filter(e=>e.type==='message_start');assert.equal(starts.length,1);assert.deepEqual(starts[0].message.usage,{...usage,output_tokens:0});assert.equal(events.filter(e=>e.type==='content_block_delta').map(e=>e.delta.text).join(''),'先到的正文');assert(events.findIndex(e=>e.type==='message_start')<events.findIndex(e=>e.type==='content_block_start'));assert.deepEqual(events.find(e=>e.type==='message_delta').usage,usage);
});
test('上游只有最终用量时延后起始帧，正文仍完整且只输出一次',()=>{
 const writes=[],writer=anthropicWriter({writeHead(){},write:w=>writes.push(w),end(){}},'synthetic','synthetic');writer.start();writer.usage({upstream_usage:{output_tokens:9}});writer.text('A');writer.text('B');writer.finish({content:'AB',upstream_usage:usage},'end_turn');const events=parse(writes);assert.deepEqual(events[0].message.usage,{...usage,output_tokens:0});assert.equal(events.filter(e=>e.type==='content_block_delta').map(e=>e.delta.text).join(''),'AB');
});
test('HTTP 流在正文结束前提供完整上下文，按SDK起始用量计算超过500k',async()=>{
 let complete;const done=new Promise(r=>complete=r);const app=await gateway({token:'test',port:0,models:[{id:'claude-code-opus'}],execute:(_r,_s,onText,timing)=>{timing.onUsage({upstream_usage:usage});onText('STREAMING');return done;}});
 try{const response=await fetch('http://127.0.0.1:'+app.port+'/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':'test'},body:JSON.stringify({model:'claude-code-opus',max_tokens:1024,stream:true,messages:[{role:'user',content:'synthetic'}]})});const reader=response.body.getReader(),decoder=new TextDecoder();let wire='';while(!wire.includes('STREAMING')){const x=await reader.read();assert(!x.done);wire+=decoder.decode(x.value);}
 const start=parse([wire]).find(e=>e.type==='message_start').message.usage;assert.equal(start.input_tokens+start.cache_read_input_tokens+start.cache_creation_input_tokens,500102);complete({content:'STREAMING',upstream_usage:usage});while(!(await reader.read()).done){}reader.releaseLock();
 }finally{complete({content:'cleanup',upstream_usage:usage});await app.close();}
});
