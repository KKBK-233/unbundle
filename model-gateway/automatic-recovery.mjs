import {createHmac,randomBytes} from 'node:crypto';
const attemptKey=randomBytes(32);
import {withoutOutputBudget} from './session-budget.mjs';
import {stableJson} from './context.mjs';
import {sessionHistory} from './session-history.mjs';
import {retryIdentity} from './session-recovery.mjs';

export const automaticRecoveryIdentity=request=>createHmac('sha256',attemptKey).update(retryIdentity(request)).digest('hex');

// 新消息只触发同一封存请求的恢复；不能借恢复替换旧历史、工具参数或已返回的结果。
export function automaticRecoveryRequest(session,request,{allowBudgetChange=false}={}){
 if(session.state!=='frozen'||!session.frozenRequest)return;
 const saved=sessionHistory(session.frozenRequest.messages),incoming=sessionHistory(request.messages);
 const tail=incoming.slice(saved.length);
 if(!tail.some(m=>m.role==='user')||!tail.every(m=>['user','system','developer'].includes(m.role)))return;
 const envelope=({messages,stream,...rest})=>allowBudgetChange?withoutOutputBudget(rest):rest;
 if(stableJson(envelope(request))!==stableJson(envelope(session.frozenRequest)))return;
 if(saved.some((m,i)=>stableJson(m)!==stableJson(incoming[i])))return;
 return {request:{...session.frozenRequest,stream:request.stream},tail,identity:automaticRecoveryIdentity(request)};
}
