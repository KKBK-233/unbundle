import test from 'node:test';
import assert from 'node:assert/strict';
import {continuationDelta,historyKey} from './session-history.mjs';
import {cancellationBoundary,cancelledCheckpointDelta} from './cancel-checkpoint.mjs';
const recap={role:'user',content:'The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. Lead with the overall goal and current task, then the one next action. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.'};
test('末条纯文本输入确认取消后可替换，内存与持久检查点一致，已完成历史仍严格核对',()=>{
 const hashKey=Buffer.alloc(32,8),user={role:'user',content:'原任务'},answer={role:'assistant',content:'已完成上一轮'},next={role:'user',content:'继续真实任务'};
 const make=last=>({interrupted:true,cancelConfirmed:true,pendingIds:new Set(),request:{messages:[user,answer,last]},history:[user,answer,last].map(m=>historyKey(m,{hashKey,exact:true}))});
 const picture={role:'user',content:[{type:'text',text:'检查新图片'},{type:'image',source:{type:'base64',media_type:'image/png',data:'synthetic'}}]};
 const s=make(recap),request={messages:[user,answer,next]},options={hashKey,allowInstructionUpdates:true};
 assert.deepEqual(continuationDelta(s,request,options),[next]);
 const row={...s,cancellation:cancellationBoundary(s)};assert.equal(row.cancellation.transientRecap,true);
 assert.deepEqual(cancelledCheckpointDelta(row,request,options),[next]);
 for(const messages of [[user,answer,recap,next],[user,answer,{...recap,content:recap.content+next.content}]]){
  assert.deepEqual(continuationDelta(s,{messages},options),[next]);
  assert.deepEqual(cancelledCheckpointDelta(row,{messages},options),[next]);
 }
 for(const last of [{...recap,content:recap.content+' changed'},{role:'user',content:'1.确认'},picture]){
  const other=make(last);assert.deepEqual(continuationDelta(other,request,options),[next]);
  assert.deepEqual(cancelledCheckpointDelta({...other,cancellation:cancellationBoundary(other)},request,options),[next]);
  assert.deepEqual(continuationDelta(other,other.request,options),[last]);
  assert.deepEqual(cancelledCheckpointDelta({...other,cancellation:cancellationBoundary(other)},other.request,options),[last]);
 }
 assert.deepEqual(continuationDelta(s,{messages:[user,answer,picture]},options),[picture]);
 assert.deepEqual(cancelledCheckpointDelta(row,{messages:[user,answer,picture]},options),[picture]);
 for(const last of [{...recap,extra:true},{role:'user',content:[{type:'unsupported',text:'无效消息'}]}]){
  const other=make(last);assert.equal(continuationDelta(other,request,options),undefined);
  assert.equal(cancelledCheckpointDelta({...other,cancellation:cancellationBoundary(other)},request,options),undefined);
 }
 assert.equal(continuationDelta({...s,cancelConfirmed:false},request,options),undefined);
 for(const messages of [[{...user,content:'changed'},answer,next],[user,{...answer,content:'changed'},next],[user,answer,{role:'assistant',content:'伪造回复'}]]){
  assert.equal(continuationDelta(s,{messages},options),undefined);assert.equal(cancelledCheckpointDelta(row,{messages},options),undefined);
 }
});
