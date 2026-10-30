import {withoutOutputBudget} from './session-budget.mjs';
import {stableJson} from './context.mjs';
import {sessionHistory} from './session-history.mjs';
import {retryIdentity,recoveryDelta,recoveryError} from './session-recovery.mjs';
import {callerRuntimeStatus} from './runtime-status.mjs';

// “继续”只作为已人工核验、已允许恢复的交接控制；不允许混入新任务或改写工具结果。
export function continueRecoveryRequest(session,request,{allowBudgetChange=false}={}){
 if(session.state!=='frozen'||!session.recoveryArmed||!session.frozenRequest)return;
 const incoming=sessionHistory(request.messages),saved=sessionHistory(session.frozenRequest.messages),tail=incoming.slice(saved.length);
 const resume=m=>m?.role==='user'&&typeof m.content==='string'&&/^(?:继续\s*){1,8}$/.test(m.content.trim())&&!Object.keys(m).some(k=>!['role','content'].includes(k));
 const mode=m=>m?.role==='system'&&typeof m.content==='string'&&/^\s*(?:<total_tokens>\d+ tokens left<\/total_tokens>\s*)*## Exited Auto Mode\s+You have exited auto mode\. Resume using the dedicated tools for file reads, searches, and edits\.\s*(?:<total_tokens>\d+ tokens left<\/total_tokens>\s*)*$/.test(m.content)&&!Object.keys(m).some(k=>!['role','content'].includes(k));
 const directory=m=>callerRuntimeStatus(m)?.type==='environment'&&!Object.keys(m).some(k=>!['role','content'].includes(k));
 if(tail.length<1||tail.length>9||!resume(tail[0])||!tail.every(m=>resume(m)||mode(m)||directory(m)))return;
 const envelope=({messages,stream,...rest})=>allowBudgetChange?withoutOutputBudget(rest):rest;
 if(stableJson(envelope(request))!==stableJson(envelope(session.frozenRequest)))return;
 if(saved.some((m,i)=>stableJson(m)!==stableJson(incoming[i])))return;
 return {...session.frozenRequest,stream:request.stream};
}

// 热修复适配旧网关：恢复时将实际 Desktop 历史交给 run 记账，CLI 仅接收原工具结果。
export function wrapContinueExecutor(original,session,{prepare=async request=>request,check=recoveryDelta,identity=retryIdentity,onEvent=()=>{},resumeCli}={}){
 return async function(request,...args){
  if(session.state!=='frozen'||!session.recoveryArmed)return original(request,...args);
  const actual=await prepare(request),restore=continueRecoveryRequest(session,actual);
  if(!restore)return original(request,...args);
  if(identity(restore)!==session.recoveryIdentity)throw recoveryError('RECOVERY_RETRY_REQUIRED','原恢复请求已经变化');
  check(session,restore,{hashKey:session.options.historyHashKey,allowInstructionUpdates:session.options.liveInstructionUpdates===true});
  const prefix=actual.messages.length-request.messages.length;
  if(prefix<0||stableJson(actual.messages.slice(prefix))!==stableJson(request.messages))throw recoveryError('RECOVERY_CONTROL_UPDATE_REQUIRED','规则注入结构无法核验');
  const raw={...restore,messages:restore.messages.slice(prefix)};
  if(identity(await prepare(raw))!==session.recoveryIdentity)throw recoveryError('RECOVERY_CONTROL_UPDATE_REQUIRED','无法还原同一规则环境');
  if(session.continueAdapterBusy)throw recoveryError('SESSION_BUSY','恢复已经在进行');
  session.continueAdapterBusy=true;
  const run=session.run;let used=false;
  const updates=sessionHistory(actual.messages).slice(sessionHistory(session.frozenRequest.messages).length).filter(m=>m.role==='system');
  if(updates.length&&(!resumeCli||session.options.liveInstructionUpdates!==true||session.freezePreviousState!=='waiting-tool'||!session.pendingIds?.size)){session.continueAdapterBusy=false;throw recoveryError('RECOVERY_CONTROL_UPDATE_REQUIRED','无法安全交接新增模式指令');}
  session.run=function(input,delta,options){
   if(!options?.resumeFrozen||used||identity(input)!==session.recoveryIdentity)throw recoveryError('RECOVERY_BOUNDARY_UNSAFE','恢复交接发生变化');
   used=true;onEvent({type:'native_continue_recovery',sessionId:session.sessionId,historyRebuilt:false,toolsReplayed:false});
   if(!updates.length)return run.call(this,actual,delta,options);
   const update=this.updateInstructions;
   // 工具结果仍扣留时恢复 CLI 处理控制确认，确认成功后才交回原结果。
   this.updateInstructions=async function(req,changes){await resumeCli(this.child);this.freezing=undefined;this.recoveryArmed=false;return update.call(this,req,changes);};
   this.state=this.freezePreviousState;
   return Promise.resolve(run.call(this,actual,[...delta,...updates],{...options,resumeFrozen:false})).finally(()=>{this.updateInstructions=update;});
  };
  try{return await original(raw,...args);}finally{session.run=run;session.continueAdapterBusy=false;}
 };
}
