import {sessionHistory,historyKey} from './session-history.mjs';
import {callerRuntimeStatus} from './runtime-status.mjs';

// 取消确认只保存索引和 HMAC；不为恢复复制整段用户、工具或思考正文。
export function cancellationBoundary(session) {
  if(session.interrupted!==true||session.cancelConfirmed!==true)return;
  const messages=sessionHistory(session.request.messages),ids=session.cancelledReceiptIds||new Set();
  const receipts=messages.flatMap((m,index)=>m.role==='tool'&&ids.has(m.tool_call_id)?[{index,id:m.tool_call_id}]:[]);
  if(receipts.length>256)return;
  const boundary={version:1,trailingEnvironment:callerRuntimeStatus(messages.at(-1)||{})?.type==='environment',receipts};
  const index=messages.findLastIndex(m=>m.role==='assistant'),assistant=messages[index],calls=assistant?.tool_calls||[];
  const callIds=new Set(calls.map(c=>c.id)),tail=messages.slice(index+1),results=tail.filter(m=>m.role==='tool');
  if(index>=0&&calls.length&&callIds.size===calls.length&&calls.every(c=>ids.has(c.id))
    &&(assistant.content==null||typeof assistant.content==='string'&&!assistant.content.trim())
    &&results.length===callIds.size&&new Set(results.map(m=>m.tool_call_id)).size===callIds.size
    &&tail.every(m=>m.role==='tool'&&callIds.has(m.tool_call_id)||callerRuntimeStatus(m)?.type==='environment')){
    let start=index;while(start>0&&callerRuntimeStatus(messages[start-1])?.type==='environment')start--;
    boundary.completedTailStart=start;
  }
  return boundary;
}

export function validCancellationBoundary(value,length) {
  return value?.version===1&&typeof value.trailingEnvironment==='boolean'&&Array.isArray(value.receipts)&&value.receipts.length<=256
    &&value.receipts.every(v=>Number.isSafeInteger(v.index)&&v.index>=0&&v.index<length&&typeof v.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v.id))
    &&new Set(value.receipts.map(v=>v.index)).size===value.receipts.length
    &&(value.completedTailStart===undefined||Number.isSafeInteger(value.completedTailStart)&&value.completedTailStart>=0&&value.completedTailStart<length);
}

export function cancelledCheckpointDelta(row,request,{hashKey,allowInstructionUpdates=false}={}) {
  if(row.interrupted!==true||!validCancellationBoundary(row.cancellation,row.history.length))return;
  const messages=sessionHistory(request.messages),schemas=row.historyNormalization?request.tools:undefined;
  const key=m=>historyKey(m,{hashKey,exact:allowInstructionUpdates,toolSchemas:schemas});
  const match=(hash,index)=>{
    const actual=messages[index];if(!actual)return false;if(key(actual)===hash)return true;
    const receipt=row.cancellation.receipts.find(r=>r.index===index);
    return receipt&&key({role:'tool',tool_call_id:receipt.id,content:'[Tool result missing due to internal error]',is_error:true})===key(actual);
  };
  const lengths=[row.history.length,...(row.cancellation.trailingEnvironment?[row.history.length-1]:[]),...(row.cancellation.completedTailStart!==undefined?[row.cancellation.completedTailStart]:[])];
  for(const length of lengths){
    if(messages.length<=length||!row.history.slice(0,length).every(match))continue;
    let delta=messages.slice(length);
    // Desktop 的本地停止回执不是模型回复；只在已经确认取消的边界接受完整固定二元组。
    const plain=(m,role,text)=>m?.role===role&&m.content===text&&Object.keys(m).every(k=>['role','content'].includes(k));
    if(plain(delta[0],'user','[Request interrupted by user]')&&plain(delta[1],'assistant','No response requested.'))delta=delta.slice(2);
    if(delta.some(m=>m.role==='user')&&delta.every(m=>m.role==='user'||callerRuntimeStatus(m)?.type==='environment'||allowInstructionUpdates&&['system','developer'].includes(m.role)))return delta;
  }
}
