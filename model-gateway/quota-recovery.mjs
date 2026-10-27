import {sessionQuotaFailure} from './session-quota-guard.mjs';
import {continuationDelta,sessionHistory,historyKey,assistantMessage} from './session-history.mjs';

// 只恢复已收到原生终止结果的额度失败；不恢复流式中断或未完成的工具。
export function quotaRecoveryDelta(session,request,options={}) {
 const turn=session.frozenTurn,result=turn?.events?.result;
 if(session.state!=='frozen'||session.freezeReason!=='SESSION_LIMIT'||session.turn
   ||!result?.is_error||result.terminal_reason!=='api_error'||!sessionQuotaFailure(result.result)
   ||turn.events.text?.trim()||turn.events.calls?.size||turn.events.blocks?.size
   ||session.pendingIds.size||session.pendingHttp.size||session.results.size||session.pendingControls.size)return;
 const messages=sessionHistory(request.messages),index=session.history.length;
 const notice=session.quotaFailureNotice||sessionQuotaFailure(result.result).message;
 const actual=messages[index];
 // 网关自己的合成额度通知不属于原生历史，只能按完整正文严格匹配后排除。
 const expected=historyKey(assistantMessage({content:notice}),{hashKey:options.hashKey});
 const tail=actual?.role==='assistant'&&historyKey(actual,{hashKey:options.hashKey})===expected
   ?[...messages.slice(0,index),...messages.slice(index+1)]:messages;
 return continuationDelta({...session,interrupted:true,request:undefined}, {...request,messages:tail},options);
}
