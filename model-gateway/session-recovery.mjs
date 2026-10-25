import {callerRuntimeStatus}from './runtime-status.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {continuationDelta,sessionHistory,historyKey}from './session-history.mjs';
import {assistantDifference}from './assistant-diff.mjs';
import {stableJson}from './context.mjs';
import {mappedBashAssistant}from './bash-roundtrip.mjs';
export const recoveryError=(code,message)=>Object.assign(new Error(message),{code,status:409,retryable:false});
export function recoveryDelta(session,request,options={}) {
 if(session.frozenTurn||!['idle','waiting-tool'].includes(session.freezePreviousState))throw recoveryError('RECOVERY_BOUNDARY_UNSAFE','冻结发生在推理中途，不能按工具交接恢复');
 const messages=sessionHistory(request.messages),actual=messages[session.history.length];
 if(!actual)throw recoveryError('RECOVERY_HISTORY_MISMATCH','缺少原工具交接历史');
 let proxy=session;
 const matchOptions={hashKey:options.hashKey,toolSchemas:session.historyNormalization?request.tools:undefined};
 const strictMatch=historyKey(actual,matchOptions)===session.expected;
 const mappedMatch=!strictMatch&&session.request&&historyKey(mappedBashAssistant(actual,session.request.messages),matchOptions)===session.expected;
 if(!strictMatch&&!mappedMatch){
  const difference=assistantDifference(session.expectedFingerprint,actual,{hashKey:options.hashKey});
  if(difference.classification!=='representation_candidate')throw recoveryError('RECOVERY_ARGUMENTS_CHANGED','工具参数或正文发生真实变化，不能解冻');
  proxy={...session,expected:historyKey(actual,{hashKey:options.hashKey,toolSchemas:session.historyNormalization?request.tools:undefined})};
 }
 const delta=continuationDelta(proxy,request,options);
 if(delta?.some(m=>['system','developer'].includes(m.role)&&!callerRuntimeStatus(m)))throw recoveryError('RECOVERY_CONTROL_UPDATE_REQUIRED','恢复请求包含新的控制指令，需单独核验');
 if(!delta)throw recoveryError('RECOVERY_HISTORY_MISMATCH','历史、指令或工具结果不能安全匹配');
 if(session.pendingControls.size||[...session.pendingHttp.values()].some(p=>p.res?.destroyed))throw recoveryError('RECOVERY_CONNECTION_LOST','原 MCP 连接或控制状态不可恢复');
 return delta;
}
export function retryIdentity(request){const {stream,...rest}=request;return stableJson(rest);}
const idPattern=/^(?:[a-f0-9]{24}|[a-f0-9-]{36})$/i;
export async function archivedSessions(home){
 const root=path.join(home,'quarantined-sessions'),rows=[];
 try {for(const dir of await fs.readdir(root,{withFileTypes:true})){
  if(!dir.isDirectory()||dir.isSymbolicLink())continue;
  const folder=path.join(root,dir.name),file=path.join(folder,'metadata.json');
  try{const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>65536)continue;
   const metadata=JSON.parse(await fs.readFile(file,'utf8'));if(idPattern.test(metadata.sessionId))rows.push({folder,metadata});
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }}catch(error){if(error.code!=='ENOENT')throw error;}
 return rows;
}
export async function exportHandoff(home,id){
 if(!idPattern.test(id))throw recoveryError('SESSION_NOT_FOUND','会话标识无效');
 const row=(await archivedSessions(home)).find(r=>[r.metadata.sessionId,r.metadata.nativeSessionId].includes(id));
 if(!row)throw recoveryError('SESSION_NOT_FOUND','没有此会话的归档');
 const file=path.join(row.folder,'handoff-state.json'),st=await fs.lstat(file);
 if(!st.isFile()||st.isSymbolicLink()||st.size>32*1024*1024)throw recoveryError('HANDOFF_EXPORT_UNAVAILABLE','归档大小或文件类型无效');
 const data=JSON.parse(await fs.readFile(file,'utf8')),calls=data.assistant?.tool_calls||data.calls||[];
 let lines=['# 任务交接（不自动恢复或重建原会话）','','先核验当前文件、进程及备份状态，不要重复执行已完成的编辑、发布或数据库操作。',`归档原因：${row.metadata.reason}`,''];
 let request;try{const requestFile=path.join(row.folder,'desktop-request.json'),stat=await fs.lstat(requestFile);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=32*1024*1024)request=JSON.parse(await fs.readFile(requestFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(request){const user=[...(request.messages||[])].reverse().filter(m=>m.role==='user').map(m=>typeof m.content==='string'?m.content:(m.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n')).find(text=>text.trim().length>20&&!/^(继续|continue|resume)$/i.test(text.trim()));
  if(user)lines.push('## 最近用户要求（节选，请先核验）',...user.slice(0,1200).split('\n').map(line=>'> '+line),'');
 }
 lines.push('## 最后一批工具');
 for(const call of calls.slice(0,32)){
  const name=call.function?.name||'未知工具';let input={};try{input=JSON.parse(call.function?.arguments||'{}');}catch{}
  const receipt=request?.messages?.find(m=>m.role==='tool'&&m.tool_call_id===call.id);
  lines.push(`- ${name}${typeof input.file_path==='string'?'：'+input.file_path.slice(0,200):''}（${receipt?'已收到结果'+(receipt.is_error?'，标记为错误':'，未标记为错误'):'结果待核验'}）`);
  if(typeof input.description==='string')lines.push('  工具说明：'+input.description.replace(/[\r\n]/g,' ').slice(0,200));
  const plan=input.plan||input.steps;if(Array.isArray(plan))for(const step of plan.slice(0,20))lines.push(`  - ${String(step.status||'待核验')}：${String(step.step||step.description||step.content||'').slice(0,240)}`);
 }
 lines.push('','完整原始命令和工具结果保留在受限归档中；此交接不包含整段历史，也不授权重放命令。');
 return {sessionId:row.metadata.sessionId,markdown:lines.join('\n')+'\n',modelRequests:0};
}
