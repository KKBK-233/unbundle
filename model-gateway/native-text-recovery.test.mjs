import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMessagesRequest} from './anthropic.mjs';
import {pureText,isUserInput,toolReceipt} from './messages.mjs';
import {automaticRecoveryRequest} from './automatic-recovery.mjs';
import {continueRecoveryRequest} from './continue-recovery.mjs';
import {historyKey,continuationDelta,continuationToolResults,transientRecap,completedRecapBoundary,cancelledUserTextLength} from './session-history.mjs';
import {cancellationBoundary,cancelledCheckpointDelta} from './cancel-checkpoint.mjs';

const text=value=>[{type:'text',text:value}];
const image={type:'image',source:{type:'base64',media_type:'image/png',data:'aGVsbG8='}};
const user={role:'user',content:text('任务')};
const assistant={role:'assistant',content:[{type:'tool_use',id:'read-1',name:'Read',input:{file_path:'probe.txt'}}]};
const receipt=value=>({role:'user',content:[{type:'tool_result',tool_use_id:'read-1',content:text(value)}]});
const parse=messages=>parseMessagesRequest({model:'synthetic',max_tokens:1024,messages});

// 控制分支必须基于整个纯文本消息，不能跳过图片或工具块来识别“继续”。
test('严格文本视图支持原生纯文本数组，混合内容不能冒充控制指令',()=>{
  assert.equal(pureText({content:'继续'}),'继续');
  assert.equal(pureText({content:text('继续')}),'继续');
  assert.equal(pureText({content:[...text('继续'),...text('继续')]}),'继续\n继续');
  for(const content of [[...text('继续'),image],[...text('继续'),{type:'tool_result',tool_use_id:'x',content:'完成'}],[{type:'text',text:123}],null])assert.equal(pureText({content}),undefined);
  assert.equal(isUserInput({role:'user',content:[...text('继续'),...receipt('完成').content]}),false);
});

test('原生恢复尾部拒绝追加或替换工具结果，重复收据不会覆盖原结果',()=>{
  const saved=parse([user,assistant,receipt('原结果')]),session={state:'frozen',frozenRequest:saved};
  const follow={role:'user',content:text('改个方向')};
  const valid=parse([...saved.messages,follow]);
  assert.deepEqual(automaticRecoveryRequest(session,valid).tail,[follow]);
  const before=structuredClone(saved);
  for(const tail of [[receipt('替换')],[follow,receipt('替换')],[{role:'user',content:[...receipt('替换').content,...follow.content]}]]){
    assert.equal(automaticRecoveryRequest(session,parse([...saved.messages,...tail])),undefined);
  }
  assert.deepEqual(saved,before);
  assert.throws(()=>continuationToolResults([receipt('原结果'),receipt('替换')],1024),{code:'DUPLICATE_TOOL_RESULT'});
  assert.equal(toolReceipt(saved.messages.at(-1)).content[0].text,'原结果');
});

test('经 Messages 入站的纯继续和模式退出提示可恢复，混合图片或工具不可冒充',()=>{
  const frozenRequest=parse([user,assistant,receipt('完成')]),session={state:'frozen',recoveryArmed:true,frozenRequest};
  const resume={role:'user',content:text('继续')};
  const mode={role:'system',content:text('## Exited Auto Mode\n\nYou have exited auto mode. Resume using the dedicated tools for file reads, searches, and edits.')};
  assert.deepEqual(continueRecoveryRequest(session,parse([...frozenRequest.messages,resume,mode])),{...frozenRequest,stream:undefined});
  for(const follow of [{...resume,content:[...resume.content,image]},receipt('继续'),{...resume,content:text('继续并部署')},
    {role:'user',content:[...resume.content,...receipt('完成').content]}]){
    assert.equal(continueRecoveryRequest(session,parse([...frozenRequest.messages,follow])),undefined);
  }
});

test('工具结果后的原生文本数组保留用户身份，图片块不会被悄悄滤掉',()=>{
  const first=parse([user]),session={history:first.messages.map(historyKey),expected:historyKey(assistant),pendingIds:new Set(['read-1']),options:{allowToolHandoffUserMessages:true}};
  const follow={role:'user',content:text('停止旧方向，检查结果')};
  const request=parse([user,assistant,receipt('完成'),follow]);
  const delta=continuationDelta(session,request);
  assert.deepEqual(delta,request.messages.slice(2));
  const result=continuationToolResults(delta,1024).get('read-1');
  assert.equal(result.content[0].text,'完成');
  assert.deepEqual(JSON.parse(result.content[1].text).messages,[follow]);
  assert.equal(continuationDelta(session,parse([user,assistant,receipt('完成'),{...follow,content:[...follow.content,image]}])),undefined);
  const control={role:'user',content:text('继续')};
  assert(continuationDelta({...session,options:{}},parse([user,assistant,receipt('完成'),control])));
});

test('取消后的原生固定回执二元组仅作为已确认取消的控制，内存与检查点一致',()=>{
  const initial=parse([user]),hashKey=Buffer.alloc(32,17);
  const session={request:initial,history:initial.messages.map(m=>historyKey(m,{hashKey,exact:true})),interrupted:true,cancelConfirmed:true,pendingIds:new Set()};
  const row={...session,cancellation:cancellationBoundary(session)};
  const ack=[{role:'user',content:text('[Request interrupted by user]')},{role:'assistant',content:text('No response requested.')}],next={role:'user',content:text('新任务')};
  const request=parse([...initial.messages,...ack,next]),options={hashKey,allowInstructionUpdates:true};
  assert.deepEqual(continuationDelta(session,request,options),[next]);
  assert.deepEqual(cancelledCheckpointDelta(row,request,options),[next]);
  const mixed=parse([...initial.messages,{...ack[0],content:[...ack[0].content,image]},ack[1],next]);
  assert.equal(continuationDelta(session,mixed,options),undefined);
  assert.equal(cancelledCheckpointDelta(row,mixed,options),undefined);
});

test('原生多文本块取消后合并的新内容只发送后缀，旧块边界仍受指纹约束',()=>{
  for(const old of [user,{role:'user',content:[...text('第一段'),...text('第二段')]}]){
    const initial=parse([old]),hashKey=Buffer.alloc(32,19),options={hashKey,allowInstructionUpdates:true};
    const session={request:initial,history:initial.messages.map(m=>historyKey(m,{hashKey,exact:true})),interrupted:true,cancelConfirmed:true,pendingIds:new Set()};
    const row={...session,cancellation:cancellationBoundary(session)};
    const blocks=structuredClone(old.content);blocks.at(-1).text+='\n新增任务';
    const request=parse([{role:'user',content:blocks}]);
    assert.equal(cancelledUserTextLength(initial.messages),pureText(old).length);
    assert.deepEqual(continuationDelta(session,request,options),[{role:'user',content:'\n新增任务'}]);
    assert.deepEqual(cancelledCheckpointDelta(row,request,options),[{role:'user',content:'\n新增任务'}]);
  }
});

test('固定回顾支持原生文本数组，正文混合其他块不能触发省略边界',()=>{
  const prompt='The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. Lead with the overall goal and current task, then the one next action. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.';
  const recap={role:'user',content:text(prompt)},request=parse([user,recap]),answer={role:'assistant',content:text('任务摘要')};
  assert.equal(transientRecap(request.messages.at(-1)),true);
  assert.equal(transientRecap({...recap,content:[...recap.content,image]}),false);
  assert(completedRecapBoundary({state:'idle',request,lastAssistant:answer,pendingIds:new Set(),expected:historyKey(answer)}));
});
