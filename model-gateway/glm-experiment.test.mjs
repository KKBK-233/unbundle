import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createPromptContent} from './prompt-content.mjs';
import {createPromptTrace} from './prompt-trace.mjs';
import {compileContext} from './context.mjs';
import {loadExperimentUpstream} from './experiment-upstream.mjs';
const stream=(capture,event)=>capture.accept({type:'stream_event',event});

test('详细记录保存实际思考和正文、交接与回执，跨分片密钥不泄露',()=>{
 const secret='synthetic-private-api-key-123456789';
 const request={messages:[{role:'assistant',content:[]},{role:'user',content:[{type:'tool_result',tool_use_id:'tool_1',content:'READ_OK'}]}]};
 const capture=createPromptContent({request,secrets:[secret]});
 stream(capture,{type:'message_start',message:{id:'msg_1'}});
 stream(capture,{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:''}});
 stream(capture,{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'THOUGHT '+secret.slice(0,16)}});
 assert(!JSON.stringify(capture.snapshot()).includes(secret.slice(0,16)));
 stream(capture,{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:secret.slice(16)+' END'}});
 stream(capture,{type:'content_block_start',index:1,content_block:{type:'text',text:'VISIBLE'}});
 stream(capture,{type:'content_block_start',index:2,content_block:{type:'tool_use',id:'tool_2',name:'mcp__caller__Read',input:{}}});
 stream(capture,{type:'content_block_delta',index:2,delta:{type:'input_json_delta',partial_json:'{"path":"D:\\\\fixture.txt","api_key":"ANOTHER_SECRET"}'}});
 capture.handoff([{id:'tool_2',name:'Read',input:{path:'D:\\fixture.txt',token:secret}}]);
 capture.accept({type:'assistant',message:{id:'msg_1',content:[{type:'text',text:'DUPLICATE'}]}});
 const s=capture.snapshot(),raw=JSON.stringify(s);
 assert(raw.includes('THOUGHT'));assert(raw.includes('VISIBLE'));assert(raw.includes('READ_OK'));assert(raw.includes('tool_handoff'));assert(!raw.includes(secret));assert(!raw.includes('ANOTHER_SECRET'));assert(!raw.includes('DUPLICATE'));
});

test('单轮内容和条目有上限，聚合回退与错误信息也可复盘',()=>{
 const capture=createPromptContent({maxBytes:32,maxEntries:2});
 capture.accept({type:'assistant',message:{id:'x',content:[{type:'thinking',thinking:'a'.repeat(100)},{type:'text',text:'b'.repeat(100)}]}});
 capture.accept({type:'result',is_error:true,result:'error'});
 const s=capture.snapshot();assert.equal(s.capturedBytes,32);assert.equal(s.records.length,2);assert.equal(s.truncatedBytes,168);assert.equal(s.droppedEntries,1);
});

test('详细日志最终原子覆盖进度快照，内容不进入普通日志',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'prompt-detail-')),logs=[];
 try{
  const request={messages:[{role:'user',content:'PRIVATE_INPUT'}]};
  const trace=createPromptTrace({directory,captureContent:true,request,compiled:compileContext(request),model:'glm-5.3',sink:r=>logs.push(r)});
  stream(trace,{type:'message_start',message:{id:'msg_1'}});stream(trace,{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'PRIVATE_THOUGHT'}});
  await trace.finish('completed');
  const files=await fs.readdir(directory);assert.equal(files.length,1);
  const record=JSON.parse(await fs.readFile(path.join(directory,files[0]),'utf8'));assert.equal(record.state,'finished');assert.equal(record.model,'glm-5.3');assert(JSON.stringify(record.detail).includes('PRIVATE_THOUGHT'));assert(!JSON.stringify(logs).includes('PRIVATE_THOUGHT'));assert(!JSON.stringify(record).includes('PRIVATE_INPUT'));
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});

test('GLM 独立密钥必需且入口固定；缺失密钥不回退订阅',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'glm-config-')),file=path.join(directory,'key');
 try{
  assert.equal(await loadExperimentUpstream(),undefined);await assert.rejects(loadExperimentUpstream({provider:'glm'}));await assert.rejects(loadExperimentUpstream({provider:'other',keyFile:file}));
  await fs.writeFile(file,'synthetic-private-test-key',{mode:0o600});const config=await loadExperimentUpstream({provider:'glm',keyFile:file});assert.equal(config.model,'glm-5.3');assert.equal(config.baseUrl,'https://open.bigmodel.cn/api/anthropic');
  if(process.platform!=='win32'){await fs.chmod(file,0o644);await assert.rejects(loadExperimentUpstream({provider:'glm',keyFile:file}));}
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
