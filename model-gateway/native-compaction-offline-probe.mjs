// 仅用于隔离网络和空白 HOME 的合成协议验收，不使用账号凭据。
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {sessionRelay} from './session-relay.mjs';
import {assistantMessage} from './session-history.mjs';
import {SUMMARY_HEADER,desktopSummary} from './compaction-boundary.mjs';
const home=process.argv[2],model='claude-opus-4-6',cli=process.env.CLAUDE_TEST_BIN;
if(!home||!cli)throw Error('Provide a fresh test HOME argument and CLAUDE_TEST_BIN.');
if(await fs.readlink('/proc/self/ns/net')===await fs.readlink('/proc/1/ns/net'))throw Error('A separate loopback-only network namespace is required.');
await fs.mkdir(home,{recursive:true});if((await fs.readdir(home)).length)throw Error('Test HOME must be empty; never use an account HOME.');
const requests=[],diagnostics=[],trace=[];let relay,failSummary=false;
const emit=(r,type,value)=>r.write(`event: ${type}\ndata: ${JSON.stringify({type,...value})}\n\n`);
const mock=http.createServer(async(req,res)=>{
 let raw='';for await(const c of req)raw+=c;
 if(req.url.includes('count_tokens'))return res.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":100}');
 if(!req.url.startsWith('/v1/messages'))return res.writeHead(404).end();
 const body=JSON.parse(raw),summary=raw.includes('Your task is to create a detailed summary')||raw.includes('summarizing conversations');
 const tool=!summary&&JSON.stringify(body.messages.at(-1)).includes('SYNTHETIC_TOOL_TASK');
 requests.push({summary,tool,systemHash:createHash('sha256').update(JSON.stringify(body.system)).digest('hex'),toolCount:body.tools?.length||0,cacheBreakpoints:(raw.match(/"cache_control"/g)||[]).length,bytes:Buffer.byteLength(JSON.stringify(body.messages)),old:raw.includes('SYNTHETIC_LARGE_TASK'),receiptOccurrences:(raw.match(/SYNTHETIC_REAL_RESULT/g)||[]).length,summaryOccurrences:(raw.match(/SYNTHETIC_NATIVE_SUMMARY/g)||[]).length,last:JSON.stringify(body.messages.at(-1)).slice(0,90)});
 const text=summary?'<summary>SYNTHETIC_NATIVE_SUMMARY: the old task was finished.</summary>':'SYNTHETIC_READY';
 const usage={input_tokens:summary?60000:10000,output_tokens:12,cache_creation_input_tokens:0,cache_read_input_tokens:0};
 if(summary&&failSummary)return res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({type:'error',error:{type:'invalid_request_error',message:'Synthetic non-retryable summary failure'}}));
 if(!body.stream)return res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({id:'msg_'+randomUUID(),type:'message',role:'assistant',model:body.model,content:[{type:'text',text}],stop_reason:'end_turn',stop_sequence:null,usage}));
 res.writeHead(200,{'content-type':'text/event-stream'});emit(res,'message_start',{message:{id:'msg_'+randomUUID(),type:'message',role:'assistant',model:body.model,content:[],stop_reason:null,stop_sequence:null,usage:{...usage,output_tokens:0}}});
 if(tool){emit(res,'content_block_start',{index:0,content_block:{type:'tool_use',id:'tool_synthetic',name:'mcp__omp__Bash',input:{}}});emit(res,'content_block_delta',{index:0,delta:{type:'input_json_delta',partial_json:'{"command":"synthetic-only"}'}});}
 else{emit(res,'content_block_start',{index:0,content_block:{type:'text',text:''}});emit(res,'content_block_delta',{index:0,delta:{type:'text_delta',text}});}
 emit(res,'content_block_stop',{index:0});emit(res,'message_delta',{delta:{stop_reason:tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:12}});emit(res,'message_stop',{});res.end();
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const options={home,cli,modelFor:x=>x,maxOutputTokens:1024,persistentSessions:true,liveInstructionUpdates:true,timeoutMs:20000,idleTimeoutMs:20000,toolWaitTimeoutMs:20000,testUpstream:{baseUrl:`http://127.0.0.1:${mock.address().port}`,token:'synthetic-offline-only'},onSessionEvent:e=>diagnostics.push(e)};
const base={model,max_tokens:1024,tools:[{type:'function',function:{name:'Bash',parameters:{type:'object',properties:{command:{type:'string'}}}}}],messages:[{role:'system',content:'Offline synthetic verification only.'},{role:'user',content:'SYNTHETIC_LARGE_TASK '+('x '.repeat(12000))}]};
options.spawnProcess=(cli,args,o)=>{const child=spawn(cli,args,o);let buf='';const write=child.stdin.write.bind(child.stdin);child.stdin.write=(s,...a)=>{trace.push({direction:'in',value:JSON.parse(s)});return write(s,...a);};child.stdout.on('data',c=>{buf+=c;let at;while((at=buf.indexOf('\n'))>=0){try{const e=JSON.parse(buf.slice(0,at));if(['result','control_response','user','system'].includes(e.type))trace.push({direction:'out',value:e});}catch{}buf=buf.slice(at+1);}});return child;};
const prompt={role:'user',content:'CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.\n\nYour task is to create a detailed summary of the conversation so far, preserving the task.'};
try{
 relay=sessionRelay(options);const first=await relay.infer(base);assert.equal(first.content,'SYNTHETIC_READY');
 const secondRequest={...base,messages:[...base.messages,assistantMessage(first),{role:'user',content:'/clear'}]},second=await relay.infer(secondRequest);assert.equal(second.content,'SYNTHETIC_READY');
 await relay.close();relay=sessionRelay(options);
 const summaryRequest={...base,messages:[...secondRequest.messages,assistantMessage(second),prompt]};
 const summary=await relay.infer(summaryRequest);assert.equal(summary.upstream_usage.input_tokens,60000);assert.match(summary.content,/SYNTHETIC_NATIVE_SUMMARY/);
 const count=requests.length;const replay=await relay.infer(summaryRequest);assert.equal(replay.usage.total_tokens,0);assert.equal(requests.length,count);
 const nextRequest={...base,messages:[base.messages[0],{role:'user',content:SUMMARY_HEADER+'\n\n'+desktopSummary(summary.content)},{role:'user',content:'SYNTHETIC_NEXT'}]};
 const next=await relay.infer(nextRequest);assert.equal(next.content,'SYNTHETIC_READY');assert.equal(requests.at(-1).old,false);assert.equal(requests.at(-1).summaryOccurrences,1);
 await new Promise(r=>setTimeout(r,200));await relay.close();relay=sessionRelay(options);
 const resumedRequest={...nextRequest,messages:[...nextRequest.messages,assistantMessage(next),{role:'user',content:'SYNTHETIC_RESUMED'}]},resumed=await relay.infer(resumedRequest);assert.equal(resumed.content,'SYNTHETIC_READY');assert.equal(requests.at(-1).old,false);
 const toolRequest={...base,messages:[...resumedRequest.messages,assistantMessage(resumed),{role:'user',content:'SYNTHETIC_TOOL_TASK'}]},toolResult=await relay.infer(toolRequest);assert.equal(toolResult.tool_calls.length,1);
 const pendingSummaryRequest={...toolRequest,messages:[...toolRequest.messages,assistantMessage(toolResult),{role:'tool',tool_call_id:toolResult.tool_calls[0].id,content:'SYNTHETIC_REAL_RESULT'},prompt]};
 const pendingSummary=await relay.infer(pendingSummaryRequest);assert.equal(pendingSummary.upstream_usage.input_tokens,60000);
 const pendingNextRequest={...base,messages:[base.messages[0],{role:'user',content:SUMMARY_HEADER+'\n\n'+desktopSummary(pendingSummary.content)},{role:'user',content:'SYNTHETIC_AFTER_TOOL_COMPACT'}]};
 const pendingNext=await relay.infer(pendingNextRequest);assert.equal(pendingNext.content,'SYNTHETIC_READY');assert.equal(requests.at(-1).receiptOccurrences,1);assert.equal(requests.filter(r=>r.summary).length,2);
 failSummary=true;const failedRequest={...pendingNextRequest,messages:[...pendingNextRequest.messages,assistantMessage(pendingNext),prompt]};
 await assert.rejects(relay.infer(failedRequest));const failedCount=requests.length;await assert.rejects(relay.infer(failedRequest),{code:'COMPACTION_SESSION_UNVERIFIED'});assert.equal(requests.length,failedCount);assert.equal((await relay.listSessions()).sessions[0].state,'frozen');
 console.log(JSON.stringify({networkIsolated:true,realModelRequests:0,requests,compactUsage:summary.upstream_usage,events:diagnostics.filter(e=>e.type==='session_restore'||e.type==='native_compaction'),passed:true}));
}catch(e){console.log(JSON.stringify({error:e.message,code:e.code,stack:e.stack,requests,diagnostics,trace:trace.slice(-20)}));process.exitCode=1;}
finally{await relay?.close({discardFrozen:true});mock.closeAllConnections();await new Promise(r=>mock.close(r));}
