import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {sessionRelay} from './session-relay.mjs';
import {assistantMessage} from './session-history.mjs';

// 模拟 CLI 只连接本次网关的回环 MCP，验证完整工具结果确实交还同一进程。
const fake=String.raw`import fs from 'node:fs';import readline from 'node:readline';
const args=JSON.parse(process.argv[1]),emit=x=>console.log(JSON.stringify(x));let turns=0;
const text=(id,value)=>{emit({type:'stream_event',event:{type:'message_start',message:{id,usage:{input_tokens:2}}}});emit({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:value}}});emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:2}}});emit({type:'result',result:value});};
readline.createInterface({input:process.stdin}).on('line',async line=>{
 const frame=JSON.parse(line);if(frame.type!=='user')return;
 if(turns++){text('later','READY');return;}
 emit({type:'stream_event',event:{type:'message_start',message:{id:'first',usage:{input_tokens:2}}}});
 emit({type:'assistant',message:{content:[{type:'tool_use',id:'image-call',name:'mcp__omp__Screenshot',input:{}}]}});
 emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:2}}});
 const mcp=JSON.parse(fs.readFileSync(args[args.indexOf('--mcp-config')+1],'utf8')).mcpServers.omp;
 const response=await fetch(mcp.url,{method:'POST',headers:{...mcp.headers,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'rpc',method:'tools/call',params:{name:'Screenshot',arguments:{},_meta:{'claudecode/toolUseId':'image-call'}}})});
 const result=(await response.json()).result;
 text('continued',JSON.stringify({image:result.content[0],context:JSON.parse(result.content[1].text)}));
});`;

test('图片显示注释与继续穿过真实 MCP HTTP 交接，后续用户轮次仍复用同一 CLI',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'image-handoff-'));let spawns=0;
 const relay=sessionRelay({home,cli:'synthetic',modelFor:x=>x,maxOutputTokens:1024,timeoutMs:5000,
  spawnProcess:(_cli,args,options)=>{spawns++;return spawn(process.execPath,['--input-type=module','-e',fake,JSON.stringify(args)],options);}});
 const base={model:'synthetic',max_tokens:1024,tools:[{type:'function',function:{name:'Screenshot',parameters:{type:'object'}}}],messages:[{role:'user',content:'screenshot'}]};
 try{
  const first=await relay.infer(base);assert.equal(first.tool_calls[0].id,'image-call');
  const data=Buffer.from('89504e470d0a1a0a','hex').toString('base64');
  const receipt={role:'tool',tool_call_id:'image-call',content:[{type:'image',source:{type:'base64',media_type:'image/png',data}}]};
  const annotation={role:'user',content:'[Image: original 1920x2160, displayed at 1778x2000. Multiply coordinates by 1.08 to map to original image.]'};
  const resume={role:'user',content:'继续'};
  const request={...base,messages:[...base.messages,assistantMessage(first),receipt,annotation,resume]};
  const second=await relay.infer(request),value=JSON.parse(second.content);
  assert.equal(value.image.data,data);assert.equal(value.context.kind,'caller_handoff_context');
  assert.deepEqual(value.context.messages,[annotation,resume]);assert.equal(spawns,1);
  assert.equal((await relay.infer({...base,messages:[...request.messages,assistantMessage(second),{role:'user',content:'next'}]})).content,'READY');
  assert.equal(spawns,1);
 }finally{await relay.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});
