// 首次无工具请求没有调用方副作用；临时额度拒绝不能成为永久历史封存。
export function statelessQuotaFailure(session,error){
 const turn=session.turn;
 if(error?.code!=='SESSION_LIMIT'||!turn||session.entryMode!=='native_new'||session.lastAssistant
   ||session.affinityHash||session.options.resumeNativeId||session.request.tools?.length
   ||session.pendingIds.size||session.pendingHttp.size||session.results.size
   ||turn.events.calls.size||turn.events.searchCalls.size)return false;
 const messages=session.request.messages.filter(m=>!['system','developer'].includes(m.role));
 return messages.length===1&&messages[0].role==='user';
}
