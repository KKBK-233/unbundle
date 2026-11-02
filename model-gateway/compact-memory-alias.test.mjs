import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseMessagesRequest} from './anthropic.mjs';
import {compileContext} from './context.mjs';
import {compactionBoundary} from './compaction-boundary.mjs';
import {NativeSessionStore} from './native-session-store.mjs';
import {historyKey,sessionHistory} from './session-history.mjs';
import {toolReceipt} from './messages.mjs';

const text=value=>[{type:'text',text:value}];
const memoryFile='C:/Users/caller/.claude/projects/project/memory/MEMORY.md';
const answer={role:'assistant',content:text('记忆已保存')};
const prompt={role:'user',content:text('Your task is to create a detailed summary of this conversation.')};
const memoryHeader='<system-reminder>\nCodebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.\n\nContents of ';

// 使用真实原生工具收据结构；记忆正文按 Desktop 格式构造，不依赖别名生成器。
function fixture({file=memoryFile,failed=false}={}){
 const memory='请保留测试记忆';
 const request=parseMessagesRequest({model:'synthetic',max_tokens:1024,system:text('原始规则'),
  tools:[{name:'Write',input_schema:{type:'object',properties:{file_path:{type:'string'},content:{type:'string'}}}}],messages:[
   {role:'user',content:text('保存记忆')},
   {role:'assistant',content:[{type:'tool_use',id:'write-memory',name:'Write',input:{file_path:file,content:memory}}]},
   {role:'user',content:[{type:'tool_result',tool_use_id:'write-memory',content:text('updated successfully'),...(failed?{is_error:true}:{})}]},
  ]});
 const extra=memoryHeader+file+" (user's auto-memory, persists across conversations):\n\n"+memory+'\n</system-reminder>';
 const summary={...structuredClone(request),tool_choice:{type:'none'}};
 toolReceipt(summary.messages.at(-1)).content.push({type:'text',text:extra});
 summary.messages.push(structuredClone(answer),structuredClone(prompt));
 return {request,summary,extra};
}
function liveSession(request,hashKey){
 return {state:'idle',request,lastAssistant:answer,pendingIds:new Set(),
  history:sessionHistory(request.messages).map(message=>historyKey(message,{hashKey})),expected:historyKey(answer,{hashKey})};
}
function assertMemory(boundary,extra){
 assert(boundary,'已核验自动记忆不应阻断压缩');
 assert.equal(boundary.additionalUsers.length,1);
 assert.equal(boundary.additionalUsers[0].role,'user');
 assert(boundary.additionalUsers[0].content.endsWith(extra),'自动记忆应完整作为独立上下文保留');
 assert.deepEqual(boundary.receipts,[],'已完成工具不应再次交付');
}
function changedSummaries(summary){
 const memoryChanged=structuredClone(summary);toolReceipt(memoryChanged.messages[2]).content.at(-1).text+='FORGED';
 const receiptChanged=structuredClone(summary);toolReceipt(receiptChanged.messages[2]).content[0].text='FORGED';
 const pathChanged=structuredClone(summary);toolReceipt(pathChanged.messages[2]).content.at(-1).text=toolReceipt(pathChanged.messages[2]).content.at(-1).text.replace('MEMORY.md','other.txt');
 return [memoryChanged,receiptChanged,pathChanged];
}

// 活跃会话同时覆盖完整末条回复与 Desktop 复用最后一次 API 输入的形态。
test('自动记忆工具收据别名可压缩存活会话，正文独立保留且工具不重放',()=>{
 const {request,summary,extra}=fixture(),session=liveSession(request),before=structuredClone(request);
 assertMemory(compactionBoundary(session,summary),extra);
 const withoutAnswer={...summary,messages:summary.messages.filter((_,index)=>index!==3)};
 assertMemory(compactionBoundary(session,withoutAnswer),extra);
 for(const changed of changedSummaries(summary))assert.equal(compactionBoundary(session,changed),undefined);
 for(const options of [{failed:true},{file:memoryFile.replace('MEMORY.md','other.txt')}]){
  const invalid=fixture(options);assert.equal(compactionBoundary(liveSession(invalid.request),invalid.summary),undefined);
 }
 assert.deepEqual(request,before,'不能修改原始工具结果');
});

// 只在临时目录写合成 transcript，重新加载真实索引后验证持久恢复，不启动 CLI。
test('自动记忆别名可恢复持久压缩检查点，篡改或失败写入不能匹配',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'compact-memory-alias-'));
 try{
  for(const [index,options]of [{},{failed:true},{file:memoryFile.replace('MEMORY.md','other.txt')}].entries()){
   const root=path.join(home,String(index)),config=path.join(root,'.claude');
   const store=new NativeSessionStore(root,config);await store.ready;
   const {request,summary,extra}=fixture(options),compiled=compileContext(request);
   const id='00000000-0000-4000-8000-000000000099',folder=path.join(config,'projects','synthetic');
   await fs.mkdir(folder,{recursive:true});await fs.writeFile(path.join(folder,id+'.jsonl'),'synthetic transcript\n');
   const session={...liveSession(request,store.key),nativeConfirmed:true,nativeSessionId:id,signature:'a'.repeat(64),options:{outputTokens:1024},compiled};
   assert.equal(await store.checkpoint(session),true);
   const restarted=new NativeSessionStore(root,config);await restarted.ready;
   const restore=value=>restarted.takeForCompaction(value,compiled,undefined,{consume:false});
   if(index===0){
    const restored=await restore(summary);assert(restored);assert.equal(restored.row.id,id);assertMemory(restored.boundary,extra);
    assertMemory((await restore({...summary,messages:summary.messages.filter((_,i)=>i!==3)})).boundary,extra);
    for(const changed of changedSummaries(summary))assert.equal(await restore(changed),undefined);
   }else assert.equal(await restore(summary),undefined);
   assert.equal(restarted.records.size,1,'验证失败不能消费已保存检查点');
  }
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
