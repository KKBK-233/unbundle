import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
import {parseMessagesRequest} from './anthropic.mjs';import {validateRequest} from './request.mjs';import {ServerSearchEvents} from './server-search.mjs';import {inferServerSearch} from './server-search-engine.mjs';import {gateway} from './server.mjs';
const body=()=>({model:'claude-sonnet-5-5',max_tokens:1024,thinking:{type:'disabled'},messages:[{role:'user',content:'Search example'}],tools:[{type:'web_search_20250305',name:'web_search',max_uses:1,allowed_domains:['example.com']}],tool_choice:{type:'tool',name:'web_search'},output_config:{effort:'medium'}});
const blocks=[{type:'server_tool_use',id:'srvtoolu_test',name:'web_search',input:{query:'example'}},{type:'web_search_tool_result',tool_use_id:'srvtoolu_test',content:[{type:'web_search_result',title:'Example',url:'https://example.com',encrypted_content:'OPAQUE_CITATION'}]},{type:'text',text:'Example answer',citations:[{type:'web_search_result_location',url:'https://example.com',title:'Example',encrypted_index:'OPAQUE_INDEX',cited_text:'Example'}]}];
function stream(content=blocks,stop='end_turn'){
 const events=[{type:'message_start',message:{id:'msg_search',usage:{input_tokens:12,output_tokens:0}}}];
 for(const [index,block]of content.entries()){
  events.push({type:'content_block_start',index,content_block:block.type==='server_tool_use'?{...block,input:{}}:block.type==='text'?{type:'text',text:''}:block});
  if(block.type==='server_tool_use')events.push({type:'content_block_delta',index,delta:{type:'input_json_delta',partial_json:JSON.stringify(block.input)}});
  if(block.type==='text'){events.push({type:'content_block_delta',index,delta:{type:'text_delta',text:block.text}});for(const citation of block.citations||[])events.push({type:'content_block_delta',index,delta:{type:'citations_delta',citation}});}
  events.push({type:'content_block_stop',index});
 }
 events.push({type:'message_delta',delta:{stop_reason:stop},usage:{output_tokens:25,server_tool_use:{web_search_requests:1}}},{type:'message_stop'});
 return events.map(event=>({type:'stream_event',event}));
}
test('搜索只在明确启用后接受，域名和预算严格验证',()=>{
 assert.throws(()=>parseMessagesRequest(body()),/尚未启用/);
 assert.equal(validateRequest(parseMessagesRequest(body(),{allowAuxiliaryRequests:true})),1024);
 for(const patch of [{max_uses:0},{max_uses:101},{blocked_domains:['evil.test']},{allowed_domains:'example.com'},{user_location:{type:'exact'}},{unknown:true}])assert.throws(()=>parseMessagesRequest({...body(),tools:[{...body().tools[0],...patch}]},{allowAuxiliaryRequests:true}));
 assert.throws(()=>parseMessagesRequest({...body(),tools:[...body().tools,{name:'Read',input_schema:{}}]},{allowAuxiliaryRequests:true}));
 assert.throws(()=>parseMessagesRequest({...body(),thinking:{type:'enabled',budget_tokens:1024}},{allowAuxiliaryRequests:true}));
});
test('无工具辅助请求可声明 disabled，但不扩展到客户端工具或预算',()=>{
 const plain={...body(),tools:[],tool_choice:undefined};assert.doesNotThrow(()=>parseMessagesRequest(plain,{allowAuxiliaryRequests:true}));
 assert.throws(()=>parseMessagesRequest({...plain,tools:[{name:'Read',input_schema:{type:'object'}}]},{allowAuxiliaryRequests:true}),/adaptive/);
});
test('搜索事件保留引用、密文、搜索用量和 pause_turn',()=>{
 const e=new ServerSearchEvents();for(const event of stream(blocks,'pause_turn'))e.accept(event);
 assert(e.complete);assert.deepEqual(e.content,blocks);assert.equal(e.execution().stop_reason,'pause_turn');assert.equal(e.usage.server_tool_use.web_search_requests,1);
 const history={...body(),messages:[...body().messages,{role:'assistant',content:blocks},{role:'user',content:'Continue'}]};assert.doesNotThrow(()=>validateRequest(parseMessagesRequest(history,{allowAuxiliaryRequests:true})));
});
test('未闭合事件、外来工具和错误关联不交付为成功',()=>{
 for(const content of [[{type:'tool_use',id:'bad',name:'Bash',input:{command:'x'}}],[{...blocks[1],tool_use_id:'missing'}]]){
  const e=new ServerSearchEvents();assert.throws(()=>{for(const event of stream(content))e.accept(event);});
 }
 const e=new ServerSearchEvents();for(const event of stream().slice(0,-1))e.accept(event);assert.equal(e.complete,false);
});
test('真实搜索错误与空结果保留协议，不伪造链接',()=>{
 for(const content of [[],{type:'web_search_tool_result_error',error_code:'too_many_requests'}]){const e=new ServerSearchEvents();for(const event of stream([blocks[0],{...blocks[1],content}]))e.accept(event);assert.deepEqual(e.content[1].content,content);}
});
test('网关非流式/流式都保留服务端搜索块、引用与停止原因',async()=>{
 const logs=[];let executions=0;
 const server=await gateway({token:'test',port:0,allowAuxiliaryRequests:true,models:[{id:body().model}],onTiming:r=>logs.push(r),execute:async r=>{executions++;assert.equal(r.thinking.type,'adaptive');assert.equal(r.output_config.effort,'medium');return {role:'assistant',content:blocks,stop_reason:'pause_turn',usage:{input_tokens:12,output_tokens:25,server_tool_use:{web_search_requests:1}}};}});
 try{for(const streaming of [false,true]){const r=await fetch(`http://127.0.0.1:${server.port}/v1/messages`,{method:'POST',headers:{'content-type':'application/json','x-api-key':'test'},body:JSON.stringify({...body(),stream:streaming})});assert.equal(r.status,200);
 if(!streaming){const d=await r.json();assert.deepEqual(d.content,blocks);assert.equal(d.stop_reason,'pause_turn');assert.equal(d.usage.server_tool_use.web_search_requests,1);}
 else{const d=await r.text();assert(d.includes('OPAQUE_CITATION'));assert(d.includes('citations_delta'));assert(d.includes('OPAQUE_INDEX'));assert(d.includes('"stop_reason":"pause_turn"'));}}
 assert.equal(executions,2);assert(logs.some(r=>r.stage==='auxiliary_thinking_disabled_mapped_to_adaptive'));
 }finally{await server.close();}
});
test('搜索引擎只启用专用请求文件，无本机工具，并在原始响应结束时收尾',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'search-engine-test-'));let inspected=false;
 try{const result=await inferServerSearch(body(),{cli:'synthetic',home,configDir:path.join(home,'auth-not-read'),model:body().model,timeoutMs:10000,spawnProcess:(_cli,args,options)=>{
  assert(args.includes('--effort')&&args.includes('medium'));assert.equal(args[args.indexOf('--tools')+1],'');assert.equal(options.env.ANTHROPIC_AUTH_TOKEN,undefined);assert(options.env.UNBUNDLE_SERVER_SEARCH.startsWith(home));inspected=true;
  const script=`process.stdin.resume();process.stdin.on('end',()=>{for(const e of ${JSON.stringify(stream())})console.log(JSON.stringify(e));setTimeout(()=>{},20000);});`;
  return spawn(process.execPath,['-e',script],options);
 }});assert(inspected);assert.deepEqual(result.content,blocks);assert.deepEqual(await fs.readdir(home),[]);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
test('搜索取消和上游错误均清理临时文件，不自动重发',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'search-cancel-test-'));let calls=0;const controller=new AbortController();
 try{await assert.rejects(inferServerSearch(body(),{cli:'synthetic',home,configDir:home,model:body().model,signal:controller.signal,spawnProcess:(_cli,_args,options)=>{calls++;const child=spawn(process.execPath,['-e',"process.stdin.resume();setTimeout(()=>{},30000)"],options);setTimeout(()=>controller.abort(),80);return child;}}),/取消/);assert.equal(calls,1);assert.deepEqual(await fs.readdir(home),[]);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});

test('搜索历史不能夹带本机工具或图片，选择参数不能混淆',()=>{
 for(const [role,block] of [['assistant',{type:'tool_use',id:'x',name:'Read',input:{path:'x'}}],['user',{type:'tool_result',tool_use_id:'x',content:'x'}],['user',{type:'image',source:{type:'base64',data:'x'}}]]){
  assert.throws(()=>parseMessagesRequest({...body(),messages:[{role,content:[block]}]},{allowAuxiliaryRequests:true}),/搜索历史/);
 }
 assert.throws(()=>parseMessagesRequest({...body(),tool_choice:{type:'auto',name:'web_search'}},{allowAuxiliaryRequests:true}),/选择/);
});
test('搜索续接接受历史调用结果，拒绝重复调用、重复结果和超额调用',()=>{
 const request={...body(),messages:[{role:'assistant',content:[blocks[0]]}]};
 const resumed=new ServerSearchEvents(request);for(const event of stream([blocks[1],blocks[2]]))resumed.accept(event);assert(resumed.complete);
 for(const [req,content] of [[request,blocks],[body(),[blocks[0],blocks[1],blocks[1]]],[body(),[blocks[0],{...blocks[0],id:'second'}]]]){
  const e=new ServerSearchEvents(req);assert.throws(()=>{for(const event of stream(content))e.accept(event);},/重复|超过/);
 }
});
test('强制搜索没有执行时返回422，搜索错误码日志不含查询或密文',async()=>{
 const {createTiming}=await import('./timing.mjs');const logs=[];const timing=createTiming(r=>logs.push(r));
 timing.serverSearch([blocks[0],{...blocks[1],content:{type:'web_search_tool_result_error',error_code:'too_many_requests'}},{...blocks[1],content:{type:'web_search_tool_result_error',error_code:'secret-query'}}]);
 timing.failure({code:'secret-query',status:502});timing.finish('error');
 assert(logs.some(r=>r.searchErrors?.join(',')==='too_many_requests,unknown'));
 assert(!JSON.stringify(logs).includes('secret-query'));assert(!JSON.stringify(logs).includes('OPAQUE'));
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'search-force-test-'));
 try{await assert.rejects(inferServerSearch(body(),{cli:'synthetic',home,configDir:home,model:body().model,spawnProcess:(_cli,args,options)=>{
  assert.equal(args[args.indexOf('--max-turns')+1],'1');
  return spawn(process.execPath,['-e',`process.stdin.resume();process.stdin.on('end',()=>{for(const e of ${JSON.stringify(stream([blocks[2]]))})console.log(JSON.stringify(e));});`],options);
 }}),e=>e.code==='TOOL_CHOICE_UNSATISFIED'&&e.status===422);assert.deepEqual(await fs.readdir(home),[]);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
