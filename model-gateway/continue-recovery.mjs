import {isUserInput,pureText} from './messages.mjs';
import {withoutOutputBudget} from './session-budget.mjs';
import {stableJson} from './context.mjs';
import {sessionHistory} from './session-history.mjs';
import {retryIdentity} from './session-recovery.mjs';
import {callerRuntimeStatus} from './runtime-status.mjs';

// “继续”只作为已人工核验、已允许恢复的交接控制；不允许混入新任务或改写工具结果。
export function continueRecoveryRequest(session,request,{allowBudgetChange=false}={}){
 if(session.state!=='frozen'||!session.recoveryArmed||!session.frozenRequest)return;
 const incoming=sessionHistory(request.messages),saved=sessionHistory(session.frozenRequest.messages),tail=incoming.slice(saved.length);
 const resume=m=>isUserInput(m)&&typeof pureText(m)==='string'&&/^(?:继续\s*){1,8}$/.test(pureText(m).trim())&&!Object.keys(m).some(k=>!['role','content'].includes(k));
 const mode=m=>m?.role==='system'&&typeof pureText(m)==='string'&&/^\s*(?:<total_tokens>\d+ tokens left<\/total_tokens>\s*)*## Exited Auto Mode\s+You have exited auto mode\. Resume using the dedicated tools for file reads, searches, and edits\.\s*(?:<total_tokens>\d+ tokens left<\/total_tokens>\s*)*$/.test(pureText(m))&&!Object.keys(m).some(k=>!['role','content'].includes(k));
 const directory=m=>callerRuntimeStatus(m)?.type==='environment'&&!Object.keys(m).some(k=>!['role','content'].includes(k));
 if(tail.length<1||tail.length>9||!resume(tail[0])||!tail.every(m=>resume(m)||mode(m)||directory(m)))return;
 const envelope=({messages,stream,...rest})=>allowBudgetChange?withoutOutputBudget(rest):rest;
 if(stableJson(envelope(request))!==stableJson(envelope(session.frozenRequest)))return;
 if(saved.some((m,i)=>stableJson(m)!==stableJson(incoming[i])))return;
 return {...session.frozenRequest,stream:request.stream};
}
