import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {sessionRelay} from './session-relay.mjs';
import {assistantMessage} from './session-history.mjs';

// 只使用合成 CLI 与回环 MCP，验证写入参数的核验发生在调用方执行之前。
const fake=String.raw`import fs from 'node:fs';import readline from 'node:readline';
const config=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).mcpServers.omp,mode=process.argv[2];
const emit=x=>console.log(JSON.stringify(x));
const rpc=(id,name,args)=>fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args,_meta:{'claudecode/toolUseId':id}}})});
readline.createInterface({input:process.stdin}).once('line',async()=>{
 emit({type:'stream_event',event:{type:'message_start',message:{id:'m1',usage:{input_tokens:1,output_tokens:0}}}});
 if(mode!=='aggregate-only'){
 emit({type:'stream_event',event:{type:'content_block_start',index:1,content_block:{type:'tool_use',id:'second',name:'mcp__omp__Write',input:{}}}});
 emit({type:'stream_event',event:{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:mode==='incomplete'?'{"path":':JSON.stringify({path:'synthetic.txt',content:mode==='consistent'?'AGGREGATE_VALUE':'ACTUAL_MCP_VALUE'})}}});
 }
 emit({type:'assistant',message:{id:'m1',...(mode==='snapshot-conflict'||mode==='stopped-conflict'?{}:{stop_reason:'tool_use'}),content:[
 {type:'tool_use',id:'first',name:'mcp__omp__Read',input:{path:'synthetic.txt'}},
 {type:'tool_use',id:'second',name:'mcp__omp__Write',input:{path:'synthetic.txt',content:'AGGREGATE_VALUE'}}]}});
 if(mode==='stopped-conflict')emit({type:'stream_event',event:{type:'content_block_stop',index:1}});
 if(mode==='snapshot-conflict'||mode==='stopped-conflict')emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'}}});
 const first=await rpc('first','Read',{path:'synthetic.txt'});await first.text();
 const second=await rpc('second','Write',{path:'synthetic.txt',content:mode==='consistent'?'AGGREGATE_VALUE':'ACTUAL_MCP_VALUE'});await second.text();
 emit({type:'stream_event',event:{type:'message_start',message:{id:'m2',usage:{input_tokens:1,output_tokens:0}}}});
 emit({type:'result',is_error:false,result:'DONE'});
}).on('error',()=>{});`;
for(const mode of ['conflict','incomplete','aggregate-only','snapshot-conflict','stopped-conflict','consistent'])test('串行批量工具交付边界：'+mode,async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'audit-serial-'));
 const request={model:'synthetic',max_tokens:1024,messages:[{role:'user',content:'audit'}],tools:['Read','Write'].map(name=>({type:'function',function:{name,parameters:{type:'object'}}}))};
 const relay=sessionRelay({home,model:'synthetic',maxOutputTokens:1024,timeoutMs:4000,requireLiveToolContinuation:true,
 spawnProcess:(_c,args,opts)=>spawn(process.execPath,['--input-type=module','-e',fake,args[args.indexOf('--mcp-config')+1],mode],opts)});
 try{
  if(mode==='consistent'){
    const first=await relay.infer(request);assert.equal(first.tool_calls.length,2);
    const next={...request,messages:[...request.messages,assistantMessage(first),...first.tool_calls.map(c=>({role:'tool',tool_call_id:c.id,content:'SYNTHETIC_RECEIPT'}))]};
    assert.equal((await relay.infer(next)).content,'DONE');
  }else await assert.rejects(relay.infer(request), { code: 'NATIVE_TOOL_FALLBACK_UNVERIFIED', status: 409, retryable: false });

 }finally{await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});

