import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {sessionRelay} from './session-relay.mjs';
import {assistantMessage} from './session-history.mjs';
import {SUMMARY_SYSTEM,SUMMARY_HEADER,desktopSummary} from './compaction-boundary.mjs';
const fake=`import readline from 'node:readline';import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
const config=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).mcpServers.omp;
const emit=x=>console.log(JSON.stringify(x));let n=0,total=0;const nativeId=process.env.TEST_NATIVE_ID;const transcript=path.join(process.env.CLAUDE_CONFIG_DIR,'projects','synthetic',nativeId+'.jsonl');fs.mkdirSync(path.dirname(transcript),{recursive:true});fs.writeFileSync(transcript,'');
const reply=text=>{emit({type:'stream_event',event:{type:'message_start',message:{id:'m'+(++n),usage:{input_tokens:10}}}});emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text}}});emit({type:'result',is_error:false,result:text,modelUsage:{synthetic:{inputTokens:total+=10,outputTokens:n,cacheReadInputTokens:0,cacheCreationInputTokens:0}}});};
emit({type:'system',subtype:'init',session_id:nativeId,slash_commands:['compact'],capabilities:['interrupt_receipt_v1','interrupt_cancel_queued_v1']});
readline.createInterface({input:process.stdin}).on('line',async line=>{
 const frame=JSON.parse(line);fs.appendFileSync(process.argv[2],line+'\\n');
 if(frame.type==='control_request'){
  if(frame.request.subtype==='get_usage'){emit({type:'control_response',response:{subtype:'success',request_id:frame.request_id,response:{session:{model_usage:{synthetic:{inputTokens:total,outputTokens:n,cacheReadInputTokens:0,cacheCreationInputTokens:0}}}}}});return;}
  if(frame.request.subtype==='interrupt'){emit({type:'control_response',response:{subtype:'success',request_id:frame.request_id,response:{still_queued:[],cancelled:[]}}});emit({type:'result',terminal_reason:'aborted_streaming',is_error:true});return;}
  const servers=frame.request.servers;
  emit({type:'control_response',response:{subtype:'success',request_id:frame.request_id,response:{added:Object.keys(servers),errors:{}}}});return;
 }
 if(frame.shouldQuery===false){emit({type:'result',num_turns:0,duration_api_ms:0,user_message_uuid:frame.uuid,is_error:false});return;}
 if(frame.message?.content==='/compact'&&!frame.client_composed){
  if(process.env.COMPACTION_TEST_ANOMALY==='1'){
   emit({type:'stream_event',event:{type:'message_start',message:{id:'synthetic-compact-monitor'}}});
   emit({type:'stream_event',event:{type:'content_block_start',index:0,content_block:{type:'text',text:''}}});
   emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'<thinking>SYNTHETIC_MONITOR_ONLY</thinking>'}}});
   emit({type:'stream_event',event:{type:'content_block_stop',index:0}});
  }
  const uuid=randomUUID();const boundary={type:'system',subtype:'compact_boundary',uuid,compact_metadata:{pre_tokens:100000,post_tokens:200}};
  fs.appendFileSync(transcript,JSON.stringify(boundary)+'\\n'+JSON.stringify({type:'user',isCompactSummary:true,message:{content:process.env.TEST_SUMMARY_HEADER+'\\n\\nSummary:\\nactual task summary\\n\\nIf you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: '+transcript}})+'\\n');
  emit(boundary);total+=60000;emit({type:'result',is_error:false,result:'',usage:{input_tokens:0,output_tokens:0},modelUsage:{synthetic:{inputTokens:total,outputTokens:n+12,cacheReadInputTokens:0,cacheCreationInputTokens:0}}});return;
 }
 if(JSON.stringify(frame).includes('TOOL_TASK')){
  emit({type:'stream_event',event:{type:'message_start',message:{id:'m'+(++n)}}});
  emit({type:'assistant',message:{id:'m'+n,content:[{type:'tool_use',id:'tool-synthetic',name:'mcp__omp__Bash',input:{command:'synthetic'}}],stop_reason:'tool_use'}});
  emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'}}});
  if(process.env.COMPACTION_TEST_TIMEOUT==='1'){const timer=setInterval(()=>{if(!fs.existsSync(process.argv[2]+'.trigger'))return;clearInterval(timer);emit({type:'user',message:{role:'user',content:[{type:'tool_result',tool_use_id:'tool-synthetic',is_error:true,content:'synthetic timeout'}]}});},5);}
  const response=await fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'Bash',arguments:{command:'synthetic'},_meta:{'claudecode/toolUseId':'tool-synthetic'}}})}).catch(()=>null);
  if(!response)return;
  const result=await response.json();fs.appendFileSync(process.argv[2],JSON.stringify({receipt:result.result})+'\\n');reply('<analysis>private</analysis><summary>actual task summary</summary>');return;
 }
 reply(JSON.stringify(frame).includes('detailed summary')?'<analysis>private</analysis><summary>actual task summary</summary>':'READY');
});`;
const tools=[{type:'function',function:{name:'Bash',parameters:{type:'object',properties:{command:{type:'string'}}}}}];
const base={model:'claude-opus-5-5',max_tokens:1024,messages:[{role:'system',content:'original rules'},{role:'user',content:'task'}],tools};
const prompt={role:'user',content:'CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.\n\nYour task is to create a detailed summary of the conversation so far, preserving the task.'};
async function setup(timedOut=false,monitor=false){const home=await fs.mkdtemp(path.join(os.tmpdir(),'compact-roundtrip-')),log=path.join(home,'inputs.log');let spawns=0;
 const relay=sessionRelay({home,anomalyDir:monitor?path.join(home,'anomalies'):undefined,onAnomaly:()=>{},modelFor:x=>x,maxOutputTokens:1024,timeoutMs:4000,persistentSessions:true,liveInstructionUpdates:true,spawnProcess:(_c,args,opts)=>{spawns++;return spawn(process.execPath,['--input-type=module','-e',fake,args[args.indexOf('--mcp-config')+1],log],{...opts,env:{...opts.env,COMPACTION_TEST_ANOMALY:monitor?'1':'0',COMPACTION_TEST_TIMEOUT:timedOut?'1':'0',TEST_NATIVE_ID:args[args.indexOf('--session-id')+1],TEST_SUMMARY_HEADER:SUMMARY_HEADER}});}});
 return {relay,home,spawns:()=>spawns,triggerTimeout:()=>fs.writeFile(log+'.trigger','synthetic'),frames:async()=>(await fs.readFile(log,'utf8')).trim().split('\n').map(JSON.parse),async close(){await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}};
}

test('原生压缩同样记录异常元数据，不把候选标签或正文写入记录',async()=>{
 const s=await setup(false,true);try{
  const first=await s.relay.infer(base);
  const summary=await s.relay.infer({...base,messages:[...base.messages,assistantMessage(first),prompt]});
  assert.match(summary.content,/actual task summary/);assert(!summary.content.includes('SYNTHETIC_MONITOR_ONLY'));
  const files=await fs.readdir(path.join(s.home,'anomalies'));assert.equal(files.length,1);
  const raw=await fs.readFile(path.join(s.home,'anomalies',files[0]),'utf8'),record=JSON.parse(raw);
  assert(record.signals.some(s=>s.signal==='thinking_tag_in_text'));assert.equal(record.summary.outcome,'completed');
  assert(!raw.includes('SYNTHETIC_MONITOR_ONLY'));assert(!raw.includes('actual task summary'));
 }finally{await s.close();}
});
for(const tool of [false,true])test(`完整摘要往返${tool?'先交接真实工具结果':''}复用同一CLI，不导入旧历史`,async()=>{
 const s=await setup();try{
  const original=tool?{...base,messages:[base.messages[0],{role:'user',content:'TOOL_TASK'}]}:base;
  const first=await s.relay.infer(original);
  const receipt={role:'tool',tool_call_id:'tool-synthetic',content:'REAL_RESULT'};
  const summaryRequest={...base,tools:base.tools,max_tokens:2048,messages:[base.messages[0],...original.messages.slice(1),assistantMessage(first),...(tool?[receipt]:[]),prompt,{role:'system',content:'<total_tokens>100 tokens left</total_tokens>'}]};
  // 摘要输出预算可变化，不能因此新建 CLI。
  summaryRequest.max_tokens=1024;
  const summary=await s.relay.infer(summaryRequest);assert.match(summary.content,/actual task summary/);assert.equal(summary.upstream_usage.input_tokens,60000);const replay=await s.relay.infer(summaryRequest);assert.equal(replay.usage.total_tokens,0);
  const wrapper={role:'user',content:SUMMARY_HEADER+'\n\n<tools-used>Bash</tools-used>\n'+desktopSummary(summary.content)+'\nContinue the conversation.'};
  const next={...base,messages:[base.messages[0],wrapper,{role:'user',content:'next task'}]};
  assert.equal((await s.relay.infer(next)).content,'READY');assert.equal(s.spawns(),1);
  const later={...next,messages:[...next.messages,{role:'assistant',content:'READY'},{role:'user',content:'later'}]};
  assert.equal((await s.relay.infer(later)).content,'READY');assert.equal(s.spawns(),1);
  const frames=await s.frames();const last=JSON.stringify(frames.at(-1));assert(!last.includes('original rules'));assert(!last.includes('actual task summary'));assert(!last.includes('TOOL_TASK'));
  assert.equal(frames.filter(f=>f.message?.content==='/compact').length,1);if(tool){assert.equal(frames.filter(f=>f.type==='user'&&f.shouldQuery===false&&JSON.stringify(f).includes('REAL_RESULT')).length,1);assert.equal(frames.filter(f=>f.receipt).length,0);}
 }finally{await s.close();}
});
import {gateway} from './server.mjs';
test('Anthropic HTTP JSON/SSE 的压缩请求和后续对话均复用原 CLI',async()=>{
 for(const stream of [false,true]){
  const s=await setup(),app=await gateway({token:'synthetic',port:0,models:[{id:base.model}],maxOutputTokens:1024,execute:(request,signal,onText,timing,affinity)=>s.relay.infer(request,{signal,onText,timing,affinity})});
  try{
   const httpTools=[{name:'Bash',input_schema:tools[0].function.parameters}];
   const call=async body=>{
    const response=await fetch(`http://127.0.0.1:${app.port}/v1/messages`,{method:'POST',headers:{'x-api-key':'synthetic','content-type':'application/json'},body:JSON.stringify({...body,stream})});
    assert.equal(response.status,200);
    if(!stream){const value=await response.json();assert.equal(value.type,'message');return value.content.map(b=>b.text||'').join('');}
    const events=(await response.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
    assert(events.some(e=>e.type==='message_stop'));assert(!events.some(e=>e.type==='error'));
    return events.filter(e=>e.delta?.type==='text_delta').map(e=>e.delta.text).join('');
   };
   const envelope={model:base.model,max_tokens:1024};
   const first=await call({...envelope,system:'original rules',tools:httpTools,messages:[{role:'user',content:'task'}]});
   const summary=await call({...envelope,system:[{type:'text',text:"You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK."},{type:'text',text:SUMMARY_SYSTEM}],tools:[],messages:[{role:'user',content:'task'},{role:'assistant',content:first},prompt]});
   const next=await call({...envelope,system:'original rules',tools:httpTools,messages:[{role:'user',content:SUMMARY_HEADER+'\n\n<tools-used>Bash</tools-used>\n'+desktopSummary(summary)},{role:'user',content:'new task'}]});
   assert.equal(next,'READY');assert.equal(s.spawns(),1);
  }finally{await app.close({discardFrozen:true});await s.close();}
 }
});

test('工具超时已冻结时禁止暗中解除和再次压缩',async()=>{
 const s=await setup(true);try{
  const original={...base,messages:[base.messages[0],{role:'user',content:'TOOL_TASK'}]};const first=await s.relay.infer(original);await s.triggerTimeout();
  for(let i=0;i<100;i++){if((await s.relay.listSessions()).sessions[0].state==='frozen')break;await new Promise(r=>setTimeout(r,10));}
  const request={...original,messages:[...original.messages,assistantMessage(first),{role:'tool',tool_call_id:'tool-synthetic',content:'REAL_AFTER_TIMEOUT'},prompt]};
  await assert.rejects(s.relay.infer(request),{code:'COMPACTION_SESSION_UNVERIFIED'});assert.equal((await s.frames()).filter(f=>f.message?.content==='/compact').length,0);
 }finally{await s.close();}
});
