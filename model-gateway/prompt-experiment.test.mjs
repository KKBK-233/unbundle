import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {compileContext, RELAY_PROMPT} from './context.mjs';
import {createPromptTrace} from './prompt-trace.mjs';

const request = () => ({ model:'claude-opus-5-5', system:'CLIENT_PRIVATE_RULE', messages:[{role:'user',content:'CLIENT_PRIVATE_TASK'},{role:'developer',content:'CLIENT_UPDATE'},{role:'system',content:'<total_tokens>100 tokens left</total_tokens>'}], tools:[{name:'Read',input_schema:{type:'object',properties:{path:{type:'string'}}}}] });
const stream = (trace,event) => trace.accept({type:'stream_event',event});

test('最小头保留客户端指令、动态规则、工具定义和历史，仅精简网关说明',()=>{
 const baseline=compileContext(request()), minimal=compileContext(request(),{promptProfile:'minimal'});
 assert(baseline.systemPrompt.startsWith(RELAY_PROMPT));
 assert(!/relay server|caller computer|Native compaction|gateway/i.test(minimal.systemPrompt));
 for(const text of ['CLIENT_PRIVATE_RULE','CLIENT_UPDATE','system instructions','Runtime status'])assert(minimal.systemPrompt.includes(text));
 assert.equal(minimal.input,baseline.input);assert.deepEqual(minimal.exposedTools,baseline.exposedTools);assert.deepEqual(minimal.policy,baseline.policy);
 assert(minimal.metrics.relayBytes<baseline.metrics.relayBytes);
 assert.throws(()=>compileContext(request(),{promptProfile:'unknown'}));
});

test('没有运行状态或中途指令时不注入对应说明，强制工具政策仍保留',()=>{
 const r=request();r.messages=r.messages.slice(0,1);r.tool_choice={type:'tool',name:'Read',disable_parallel_tool_use:true};
 const c=compileContext(r,{promptProfile:'minimal'});assert.equal(c.promptComponents.runtime,'');assert.equal(c.promptComponents.updates,'');assert(c.systemPrompt.includes('maximum_calls'));assert(c.policy.required);
});

test('日志只保存生成头和事件统计，按上游消息去重用量，分片关键词不丢失',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'prompt-trace-test-'));const logs=[];
 try{
  const trace=createPromptTrace({directory,compiled:compileContext(request(),{promptProfile:'minimal'}),sink:x=>logs.push(x)});
  stream(trace,{type:'message_start',message:{id:'SECRET_MESSAGE_ID',usage:{input_tokens:2,cache_read_input_tokens:50}}});
  stream(trace,{type:'content_block_start',content_block:{type:'thinking',thinking:''}});
  for(const thinking of ['REPLY_PRIVATE gate','way Windows'])stream(trace,{type:'content_block_delta',delta:{type:'thinking_delta',thinking}});
  stream(trace,{type:'content_block_start',content_block:{type:'tool_use',name:'mcp__caller__Read',input:{path:'SECRET_TOOL_PATH'}}});
  stream(trace,{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:5}});
  trace.accept({type:'assistant',message:{id:'SECRET_MESSAGE_ID',usage:{input_tokens:2,cache_read_input_tokens:50,output_tokens:5}}});
  await trace.finish('completed');await trace.finish('completed');
  const files=await fs.readdir(directory);assert.equal(files.length,1);const raw=await fs.readFile(path.join(directory,files[0]),'utf8'),record=JSON.parse(raw);
  for(const secret of ['CLIENT_PRIVATE_RULE','CLIENT_PRIVATE_TASK','CLIENT_UPDATE','SECRET_MESSAGE_ID','SECRET_TOOL_PATH','REPLY_PRIVATE'])assert(!raw.includes(secret));
  assert.deepEqual(record.summary.observedUsage,{input_tokens:2,output_tokens:5,cache_read_input_tokens:50});assert.equal(record.summary.thinking.mentions.gateway,1);assert.equal(record.summary.thinking.mentions.windows,1);
  assert.equal(logs.filter(x=>x.event==='summary').length,1);if(process.platform!=='win32')assert.equal((await fs.stat(path.join(directory,files[0]))).mode&0o777,0o600);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('日志数量和事件数有界，不删除不属于实验的文件',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'prompt-trace-test-'));
 try{
  await fs.writeFile(path.join(directory,'keep.txt'),'keep');
  for(let i=0;i<3;i++){const trace=createPromptTrace({directory,compiled:compileContext(request()),maxFiles:2,sink:()=>{}});for(let j=0;j<150;j++)trace.accept({type:'system',subtype:'api_retry'});await trace.finish('completed');}
  const files=(await fs.readdir(directory)).filter(x=>x.endsWith('.json'));assert.equal(files.length,2);assert.equal(await fs.readFile(path.join(directory,'keep.txt'),'utf8'),'keep');
  const record=JSON.parse(await fs.readFile(path.join(directory,files[0]),'utf8'));assert.equal(record.events.length,128);assert.equal(record.summary.droppedEvents,22);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('日志关闭不产生副作用，磁盘写入失败不影响完成',async()=>{
 assert.equal(createPromptTrace(),undefined);
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'prompt-trace-test-')),file=path.join(directory,'file');const logs=[];
 try{await fs.writeFile(file,'keep');const trace=createPromptTrace({directory:file,compiled:compileContext(request()),sink:x=>logs.push(x)});await trace.finish('error');assert(logs.some(x=>x.event==='write_failed'));assert.equal(await fs.readFile(file,'utf8'),'keep');}
 finally{await fs.rm(directory,{recursive:true,force:true});}
});
