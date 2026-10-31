import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {continuationDelta,historyKey,completedRecapBoundary} from './session-history.mjs';
import {NativeSessionStore} from './native-session-store.mjs';
import {compileContext} from './context.mjs';
const recap={role:'user',content:'The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. Lead with the overall goal and current task, then the one next action. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.'};
const user={role:'user',content:'原始任务'},answer={role:'assistant',content:'此前已完成回复'},summary={role:'assistant',content:'当前任务摘要'},next={role:'user',content:'实际后续消息'};
function fixture(hashKey){
 const request={model:'synthetic',messages:[user,answer,recap],tools:[]};
 return {state:'idle',request,history:request.messages.map(m=>historyKey(m,{hashKey,exact:true})),pendingIds:new Set(),lastAssistant:summary,expected:historyKey(summary,{hashKey}),lastStopReason:'end_turn'};
}
test('完成回顾后可省略临时请求和回复，也支持保留完整回顾，旧历史仍严格核对',()=>{
 const hashKey=Buffer.alloc(32,3),s=fixture(hashKey),options={hashKey,allowInstructionUpdates:true};
 for(const messages of [[user,answer,next],[user,answer,recap,next],[user,answer,recap,summary,next]])assert.deepEqual(continuationDelta(s,{messages},options),[next]);
 for(const messages of [[{...user,content:'changed'},answer,next],[user,{...answer,content:'changed'},next],[user,answer,{role:'assistant',content:'伪造回复'},next]])assert.equal(continuationDelta(s,{messages},options),undefined);
 for(const changed of [{...s,request:{messages:[user,answer,{...recap,content:'真实用户任务'}]}},{...s,lastStopReason:'refusal'},{...s,lastAssistant:{...summary,tool_calls:[{id:'tool'}]}},{...s,expected:'bad'},{...s,state:'running'}])assert.equal(completedRecapBoundary(changed,{hashKey}),false);
});
test('完成回顾检查点重载后只恢复后续用户增量，不重发回顾或长历史',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'completed-recap-')),config=path.join(home,'.claude');
 try{
  const store=new NativeSessionStore(home,config);await store.ready;const s=fixture(store.key),id=randomUUID();
  Object.assign(s,{nativeConfirmed:true,nativeSessionId:id,signature:'a'.repeat(64),historyNormalization:true,options:{outputTokens:1024},compiled:compileContext(s.request),pendingHttp:new Map(),results:new Map(),pendingControls:new Map()});
  const file=path.join(config,'projects','synthetic',id+'.jsonl');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'{"type":"user"}\n');
  assert.equal(await store.checkpoint(s),true);assert.equal(store.records.get(id).completedRecap,true);
  const reopened=new NativeSessionStore(home,config);await reopened.ready;
  const restored=await reopened.take({...s.request,messages:[user,answer,next]},s.signature,true,undefined,{consume:false});assert.equal(restored.id,id);assert.deepEqual(restored.delta,[next]);
  const index=await fs.readFile(path.join(store.folder,'index.json'),'utf8');assert(!index.includes(recap.content));assert(!index.includes(summary.content));
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
