import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {CliEvents} from './cli-events.mjs';
import {NativeCliSession} from './native-cli-session.mjs';
import {sessionRelay} from './session-relay.mjs';
import {assistantMessage} from './session-history.mjs';
const available=[{name:'Read',original:'Read'}];
const call={type:'tool_use',id:'tool1',name:'mcp__omp__Read',input:{path:'synthetic.txt'}};
const full={type:'assistant',message:{id:'m1',stop_reason:'tool_use',content:[call],usage:{input_tokens:2,output_tokens:3}}};

test('完整工具消息结束与流式调用去重，重复快照不能重复交付或覆盖参数',()=>{
 const e=new CliEvents(available);
 e.accept({type:'stream_event',event:{type:'message_start',message:{id:'m1'}}});
 e.accept({type:'stream_event',event:{type:'content_block_start',index:0,content_block:{...call,input:{}}}});
 e.accept({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(call.input)}}});
 e.accept(full);e.accept(full);
 assert.equal(e.calls.size,1);assert.equal(e.toolEnd,true);assert.equal(e.blocks.size,0);
 assert.throws(()=>e.accept({...full,message:{...full.message,content:[{...call,input:{path:'changed'}}]}}),/冲突/);
});

test('错误占位、缺少结束信号、未知工具和残缺参数不能完成交接',()=>{
 const e=new CliEvents(available);e.accept({...full,is_api_error_message:true});assert.equal(e.calls.size,0);
 e.accept({...full,message:{...full.message,stop_reason:null}});assert.equal(e.toolEnd,false);
 assert.throws(()=>new CliEvents([]).accept(full),/无效/);
 const broken=new CliEvents(available);
 broken.accept({type:'stream_event',event:{type:'content_block_start',index:0,content_block:call}});
 broken.accept({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:'{"path":'}}});
 assert.throws(()=>broken.accept(full),/未完整结束/);assert.equal(broken.toolEnd,false);
});

test('重复完整正文与先流式后完整正文不重复输出，后续非流式消息仍保留',()=>{
 const e=new CliEvents([]),message={type:'assistant',message:{id:'text1',content:[{type:'text',text:'A'}],stop_reason:'end_turn'}};
 e.accept({type:'stream_event',event:{type:'message_start',message:{id:'text1'}}});
 e.accept({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'A'}}});
 e.accept(message);e.accept(message);
 e.accept({...message,message:{...message.message,id:'text2',content:[{type:'text',text:'B'}]}});
 assert.equal(e.text,'AB');
});

test('原生入口仅将明确 API 重试视为进展，保留本轮总时限',()=>{
 const session=new NativeCliSession({}, {}, {});let progress=0;
 session.progress=()=>progress++;
 const totalTimer={};session.turn={audit:{line:JSON.parse},probes:{accept(){}},awaitingStart:true,timer:totalTimer};
 session.line(JSON.stringify({type:'system',subtype:'status'}));assert.equal(progress,0);
 session.line(JSON.stringify({type:'system',subtype:'api_retry'}));assert.equal(progress,1);
 assert.equal(session.turn.timer,totalTimer);assert.equal(session.turn.awaitingStart,true);
});

// 模拟 CLI 仅访问本次测试的回环 MCP；每次工具结果只交回一次，不请求账号模型。
const fake=String.raw`import fs from 'node:fs';import readline from 'node:readline';
const args=JSON.parse(process.argv[1]),mode=process.argv[2],emit=x=>console.log(JSON.stringify(x));
const config=JSON.parse(fs.readFileSync(args[args.indexOf('--mcp-config')+1],'utf8')).mcpServers.omp;
readline.createInterface({input:process.stdin}).on('line',async line=>{
 if(JSON.parse(line).type!=='user')return;
 const call={type:'tool_use',id:'tool1',name:'mcp__omp__Read',input:{path:'synthetic.txt'}};
 emit({type:'system',subtype:'api_retry'});
 emit({type:'assistant',message:{id:'m1',stop_reason:'tool_use',content:[call],usage:{input_tokens:2,output_tokens:3}}});
 if(mode==='missing')return;
 const response=await fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'rpc',method:'tools/call',params:{name:'Read',arguments:mode==='conflict'?{path:'changed'}:call.input,_meta:{'claudecode/toolUseId':'tool1'}}})});
 if(!response.ok)return;
 const reply=await response.json();
 emit({type:'assistant',message:{id:'m2',stop_reason:'end_turn',content:[{type:'text',text:reply.result.content[0].text}],usage:{input_tokens:4,output_tokens:2}}});
 emit({type:'result',is_error:false,result:''});
});`;
for(const mode of ['normal','missing','conflict'])test('完整 assistant 的真实 MCP 往返：'+mode,async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'assistant-fallback-'));let spawns=0;
 const relay=sessionRelay({home,cli:'synthetic',modelFor:x=>x,maxOutputTokens:8192,timeoutMs:5000,handoffTimeoutMs:500,
  requireLiveToolContinuation:true,spawnProcess:(_c,args,options)=>{spawns++;return spawn(process.execPath,['--input-type=module','-e',fake,JSON.stringify(args),mode],options);}});
 const request={model:'synthetic',max_tokens:1024,messages:[{role:'user',content:'read'}],tools:[{type:'function',function:{name:'Read',parameters:{type:'object',properties:{path:{type:'string'}}}}}]};
 try{
  if(mode!=='normal')await assert.rejects(relay.infer(request),{code:mode==='missing'?'CLI_TOOL_HANDOFF_TIMEOUT':'NATIVE_TOOL_ID_MISMATCH'});
  else{
   const first=await relay.infer(request);assert.equal(first.tool_calls.length,1);assert.equal(first.tool_calls[0].id,'tool1');
   const continuation={...request,messages:[...request.messages,assistantMessage(first),{role:'tool',tool_call_id:'tool1',content:'ACTUAL_RESULT'}]};
   await assert.rejects(relay.infer({...continuation,max_tokens:512}),{code:'SESSION_OUTPUT_BUDGET_TOO_SMALL'});
   assert.equal(relay.frozenSize,0);
   const second=await relay.infer({...continuation,max_tokens:2048});
   assert.equal(second.content,'ACTUAL_RESULT');assert.equal(spawns,1);assert.equal(second.usage.completion_tokens,2);
  }
 }finally{await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});
