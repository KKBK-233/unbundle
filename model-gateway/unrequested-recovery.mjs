import {continuationDelta,sessionHistory} from './session-history.mjs';
import {callerRuntimeStatus} from './runtime-status.mjs';
import {recoveryDelta} from './session-recovery.mjs';

const eligible=session=>session.state==='frozen'&&session.freezeReason==='CLI_UNREQUESTED_CONTINUATION'&&session.freezePreviousState==='waiting-tool'
  &&!session.frozenTurn&&!session.turn&&session.pendingIds.size>0&&!session.results.size&&!session.pendingControls.size;

// 只处理调用方没有回传新工具调用、且原有历史完整的新用户增量。
export function unrequestedRecoveryDelta(session,request,options) {
  if(!eligible(session))return;
  if(sessionHistory(request.messages).some(m=>session.pendingIds.has(m.tool_call_id)||m.tool_calls?.some(c=>session.pendingIds.has(c.id))))return;
  const delta=continuationDelta({...session,interrupted:true,cancelledReceiptIds:undefined},request,options);
  if(!delta||delta.some(m=>m.role!=='user'&&callerRuntimeStatus(m)?.type!=='environment'))return;
  return delta;
}

// 有完整真实回执时，按原 ID/名称/参数严格验证；随后中断旧等待并原生保存回执。
export function unrequestedToolRecoveryDelta(session,request,options){
  if(!eligible(session))return;
  try{
    const delta=recoveryDelta({...session,pendingHttp:new Map()},request,options);
    if(delta.filter(m=>m.role==='tool').length!==session.pendingIds.size)return;
    return delta;
  }catch{return;}
}

export function cancelledWaitContext(session){
  return {role:'user',content:JSON.stringify({kind:'caller_tool_wait_cancelled',
    calls:[...session.pendingIds].map(id=>({id,name:session.lastCalls?.get(id)?.function?.name})),
    execution:'unknown',note:'Only the native wait was cancelled. The caller supplied no receipt for these calls. Do not assume success or failure; inspect actual state before repeating any operation with side effects.'})};
}

// 部分文本取消后，必须确认原输入已停止，才能接回新的用户增量。
export function cancelledGenerationDelta(session,request,options){
 const turn=session.frozenTurn;
 if(session.state!=='frozen'||session.freezeReason!=='REQUEST_CANCELLED'||session.freezePreviousState!=='cancelling'
  ||!turn?.inputUuid||session.turn||session.pendingIds.size||session.pendingHttp.size||session.pendingControls.size||session.results.size
  ||turn.events.calls.size)return;
 const delta=continuationDelta({...session,interrupted:true,cancelledReceiptIds:undefined},request,options);
 if(!delta||delta.some(m=>m.role!=='user'&&callerRuntimeStatus(m)?.type!=='environment'))return;
 return delta;
}
