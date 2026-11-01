import {isUserInput, isToolReceipt, toolReceipt, toolUses, contentBlocks, messageText, splitToolResults, pureText} from './messages.mjs';
import { createHmac, randomBytes } from 'node:crypto';
import { stableJson, normalizeImage } from './context.mjs';
import { callerRuntimeStatus } from './runtime-status.mjs';
import { assistantDifference } from './assistant-diff.mjs';
import { mappedBashAssistant } from './bash-roundtrip.mjs';

// 仅用于匹配同一调用方的历史前缀；不保存正文、工具参数或可离线猜测的裸哈希。
const key = randomBytes(32);
export function runtimeStatus(message) {
  const value = pureText(message);
  return message.role === 'system' && typeof value === 'string'
    && /^\s*(?:<total_tokens>\d+ tokens left<\/total_tokens>\s*)+$/.test(value);
}
export function sessionHistory(messages) { return splitToolResults(messages).filter(message => !runtimeStatus(message)); }
// 客户端离开后自动发出的固定回顾请求，不是需要重新执行的用户任务。
export function transientRecap(message) {
  return isUserInput(message)&&Object.keys(message).every(k=>['role','content'].includes(k))
    &&pureText(message)==='The user stepped away and is coming back. Recap in under 40 words, 1-2 plain sentences, no markdown. Lead with the overall goal and current task, then the one next action. Skip root-cause narrative, fix internals, secondary to-dos, and em-dash tangents.';
}
export function completedRecapBoundary(session,{hashKey,toolSchemas}={}) {
  const last=session.request&&sessionHistory(session.request.messages).at(-1),answer=session.lastAssistant;
  return session.state==='idle'&&!session.turn&&!session.interrupted&&!session.pendingIds.size
    &&transientRecap(last)&&answer?.role==='assistant'&&!!pureText(answer)?.trim()
    &&!toolUses(answer)?.length&&session.lastStopReason!=='refusal'
    &&session.expected===historyKey(answer,{hashKey,toolSchemas});
}
// 客户端会合并连续 user 文本；取消边界只记录原文本长度，不保存正文。
export function cancelledUserTextLength(messages) {
  const last=messages.at(-1),text=pureText(last);
  if(isUserInput(last)&&text?.length
    &&Object.keys(last).every(key=>['role','content'].includes(key)))return text.length;
}
export function replacementUserInput(message) {
  if(!isUserInput(message)||Object.keys(message).some(k=>!['role','content'].includes(k)))return false;
  return typeof message.content==='string'?!!message.content.trim():Array.isArray(message.content)&&message.content.length>0
    &&message.content.every(b=>b?.type==='text'&&typeof b.text==='string'||b?.type==='image');
}
export function splitCancelledUserMessage(messages,history,length,keyFor) {
  if(!Number.isSafeInteger(length)||length<=0||!history.length)return messages;
  const index=history.length-1,actual=messages[index],text=pureText(actual);
  if(!isUserInput(actual)||typeof text!=='string'||text.length<=length
    ||Object.keys(actual).some(key=>!['role','content'].includes(key)))return messages;
  let original={role:'user',content:text.slice(0,length)};
  // 原生多文本块保留旧块边界，不能把已完成历史拍平成另一个指纹。
  if(Array.isArray(actual.content)){
    const blocks=[];let remaining=length;
    for(const block of actual.content){
      if(blocks.length)remaining--;
      if(remaining<0)break;
      blocks.push({...block,text:block.text.slice(0,remaining)});
      remaining-=block.text.length;
      if(remaining<=0)break;
    }
    original={role:'user',content:blocks};
  }
  const suffix=text.slice(length);
  // 原文本须逐字节匹配已保存的 HMAC，后缀只作为新用户输入，不能重发原任务。
  if(!suffix.trim()||keyFor(original)!==history[index])return messages;
  return [...messages.slice(0,index),original,{role:'user',content:suffix},...messages.slice(index+1)];
}

export function historyKey(message, { exact = false, hashKey = key, toolSchemas } = {}) {
  // 字符串和单文本块采用相同的历史指纹；多块及工具相对顺序保持严格。
  const clean=blocks=>contentBlocks(blocks).map(block=>{
    const {cache_control,...value}=block;
    if(value.type==='text'&&!exact)value.text=value.text.replace(/\r\n/g,'\n').trim();
    if(value.type==='tool_result')value.content=clean(value.content);
    return value;
  });
  const content=clean(message.content);
  // 仅忽略对象键顺序与已确认的 Edit 默认值，始终保留原始内容块顺序。
  const normalized={...message,content:exact?content:content||null};
  if(Array.isArray(content))normalized.content=content.map(block=>{
    if(block.type!=='tool_use')return block;
    const schema=toolSchemas?.find(t=>t.name===block.name)?.input_schema;
    if(block.name==='Edit'&&schema?.properties?.replace_all?.type==='boolean'&&schema.properties.replace_all.default===false
      &&!schema.required?.includes('replace_all')&&block.input?.replace_all===false){const input={...block.input};delete input.replace_all;return {...block,input};}
    return block;
  });
  return createHmac('sha256', hashKey).update(stableJson(normalized)).digest('hex');
}
export function assistantMessage(execution) { return {role:'assistant',content:contentBlocks(execution.content)}; }
export function continuationDelta(session, request, { allowInstructionUpdates = false, onReject, onAssistantMismatch, onReceiptAlias, onCancelledTailProjection, hashKey } = {}) {
  const reject = reason => { onReject?.(reason); return undefined; };
  const toolSchemas=session.historyNormalization===true ? request.tools : undefined;
  let messages = sessionHistory(request.messages);
  // 已完成的固定临时回顾保留在原生历史；客户端可省略这一对界面消息。
  if(!session.interrupted&&!session.pendingIds.size
    &&(session.completedRecap===true||completedRecapBoundary(session,{hashKey,toolSchemas}))){
    const base=session.history.length-1;
    if(base>=0&&messages.length>base&&session.history.slice(0,base).every((h,i)=>h===historyKey(messages[i],{exact:allowInstructionUpdates,hashKey,toolSchemas}))){
      let delta=messages.slice(base);
      if(historyKey(delta[0],{exact:allowInstructionUpdates,hashKey,toolSchemas})===session.history.at(-1))delta=delta.slice(1);
      if(delta[0]?.role==='assistant'&&historyKey(delta[0],{hashKey,toolSchemas})===session.expected)delta=delta.slice(1);
      if(delta.some(m=>isUserInput(m))&&delta.every(m=>isUserInput(m)||callerRuntimeStatus(m)?.type==='environment'||allowInstructionUpdates&&['system','developer'].includes(m.role)))return delta;
    }
  }
  let prefix = session.history;
  const prior=session.interrupted===true&&session.request?sessionHistory(session.request.messages):undefined;
  if(session.interrupted===true&&session.cancelConfirmed===true&&!session.pendingIds.size
    &&replacementUserInput(prior?.at(-1))&&messages.length===session.history.length
    &&session.history.every((h,i)=>h===historyKey(messages[i],{exact:allowInstructionUpdates,hashKey,toolSchemas})))return [messages.at(-1)];
  if(session.interrupted===true&&session.cancelConfirmed===true&&prior)messages=splitCancelledUserMessage(messages,
    session.history,cancelledUserTextLength(prior),m=>historyKey(m,{exact:allowInstructionUpdates,hashKey,toolSchemas}));
  if(session.interrupted===true&&session.request){
    // 已确认中断的末条用户输入可由新任务替换；原生保留取消记录，已完成前缀仍须完整匹配。
    if(session.cancelConfirmed===true&&prior.length===prefix.length&&replacementUserInput(prior.at(-1))
      &&replacementUserInput(messages[prefix.length-1])
      &&(pureText(messages[prefix.length-1])===undefined||pureText(prior.at(-1))===undefined||pureText(messages[prefix.length-1]).trim()!==pureText(prior.at(-1)).trim())
      &&(!messages[prefix.length-1]||historyKey(messages[prefix.length-1],{exact:allowInstructionUpdates,hashKey,toolSchemas})!==prefix.at(-1)))prefix=prefix.slice(0,-1);
    // Send now 可把新消息插到末尾目录快照之前；只移动纯环境事实，不放宽历史正文。
    if(prior.length===prefix.length&&prior.length&&callerRuntimeStatus(prior.at(-1))?.type==='environment')prefix=prefix.slice(0,-1);
  }
  const matchPrefix=(value,index)=>{
    const actual=messages[index],actualKey=historyKey(actual,{exact:allowInstructionUpdates,hashKey,toolSchemas});
    if(actualKey===value)return true;
    // Send now 会用固定“结果缺失”占位符替换收据；只接受原生取消已确认、
    // 且本轮实际交回过的同 ID。原生真实结果保持权威，不重新提交或执行工具。
    const original=prior?.[index];
    if(!session.cancelledReceiptIds?.has(toolReceipt(actual)?.tool_use_id)||!isToolReceipt(actual)||toolReceipt(actual)?.is_error!==true
      ||pureText(toolReceipt(actual))!=='[Tool result missing due to internal error]'
      ||Object.keys(actual).some(k=>!['role','content'].includes(k))
      ||!isToolReceipt(original)||toolReceipt(original)?.tool_use_id!==toolReceipt(actual)?.tool_use_id
      ||historyKey(original,{exact:allowInstructionUpdates,hashKey,toolSchemas})!==value)return false;
    try{onReceiptAlias?.({toolKey:historyKey({role:'user', content:[{type:'tool_result', tool_use_id:toolReceipt(actual)?.tool_use_id, content:''}]},{hashKey}),originalKey:value,placeholderKey:actualKey,nativeResultPreserved:true});}catch{}
    return true;
  };
  let matches=messages.length>prefix.length&&prefix.every(matchPrefix);
  if(!matches&&prior?.length===session.history.length&&session.cancelledReceiptIds?.size){
    const assistantIndex=prior.findLastIndex(m=>m.role==='assistant'),assistant=prior[assistantIndex];
    const calls=toolUses(assistant)||[],ids=new Set(calls.map(c=>c.id));
    let base=assistantIndex;
    while(base>0&&callerRuntimeStatus(prior[base-1])?.type==='environment')base--;
    const tail=prior.slice(base),receipts=tail.filter(m=>isToolReceipt(m));
    const emptyText=assistant&&!messageText(assistant).trim();
    const verified=base>=0&&calls.length>0&&ids.size===calls.length&&emptyText
      &&calls.every(c=>session.cancelledReceiptIds.has(c.id))&&receipts.length===ids.size
      &&new Set(receipts.map(m=>toolReceipt(m)?.tool_use_id)).size===ids.size&&receipts.every(m=>ids.has(toolReceipt(m)?.tool_use_id))
      &&tail.every((m,i)=>historyKey(m,{exact:allowInstructionUpdates,hashKey,toolSchemas})===session.history[base+i]
        &&(base+i===assistantIndex||isToolReceipt(m)&&ids.has(toolReceipt(m)?.tool_use_id)||callerRuntimeStatus(m)?.type==='environment'));
    const candidate=session.history.slice(0,base),delta=messages.slice(base);
    if(verified&&messages.length>base&&candidate.every(matchPrefix)&&delta.some(m=>isUserInput(m))
      &&delta.every(m=>isUserInput(m)||callerRuntimeStatus(m)?.type==='environment'||allowInstructionUpdates&&['system','developer'].includes(m.role))){
      prefix=candidate;matches=true;
      try{onCancelledTailProjection?.({omittedDesktopMessages:session.history.length-base,completedTools:ids.size,nativeTailPreserved:true,toolResultsResubmitted:false});}catch{}
    }
  }
  if(messages.length<=prefix.length)return reject('messages_not_appended');
  if(!matches)return reject('history_prefix_mismatch');
  if (session.interrupted === true) {
    // 仅接受已确认中断后的用户增量；原生已完成工具事实保留，不猜补或重放工具。
    let delta = messages.slice(prefix.length);
    const plain=(m,role,content)=>m?.role===role&&pureText(m)===content&&Object.keys(m).every(k=>['role','content'].includes(k));
    if(session.cancelConfirmed===true&&plain(delta[0],'user','[Request interrupted by user]')&&plain(delta[1],'assistant','No response requested.'))delta=delta.slice(2);
    if (!delta.some(message => isUserInput(message)) || delta.some(message => !isUserInput(message)
      && !(callerRuntimeStatus(message)?.type === 'environment'
        || allowInstructionUpdates && ['system', 'developer'].includes(message.role)))) return reject('unsafe_interrupted_delta');
    return delta;
  }
  if (!session.expected) return reject('no_expected_assistant');
  const actual=messages[prefix.length];
  const strictMatch=historyKey(actual,{hashKey,toolSchemas})===session.expected;
  // 使用原调用发出前保存的请求，不采用本轮新出现或工具执行后的 cwd。
  const mappedMatch=!strictMatch&&session.request&&historyKey(mappedBashAssistant(actual,session.request.messages),{hashKey,toolSchemas})===session.expected;
  if (!strictMatch&&!mappedMatch) {
    try { onAssistantMismatch?.(assistantDifference(session.expectedFingerprint,messages[prefix.length],{hashKey})); } catch {}
    return reject('assistant_message_mismatch');
  }
  const delta = messages.slice(prefix.length + 1);
  const allowedUpdate = message => callerRuntimeStatus(message)?.type === 'environment'
    || allowInstructionUpdates && ['system', 'developer'].includes(message.role);
  if (session.pendingIds.size) {
    const tools = delta.filter(message => isToolReceipt(message));
    if (tools.length !== session.pendingIds.size) return reject('tool_result_count_mismatch');
    // Desktop 会在图片工具结果后另附 user 角色的尺寸注释。只接受固定格式的
    // 显示数据和纯“继续”控制；生产显式启用时，还允许完整收据之后的用户文本，
    // 经 caller_handoff_context 独立标注用户身份，不覆盖原工具正文。
    const note=/^\[Image: original [1-9]\d{0,5}x[1-9]\d{0,5}, displayed at [1-9]\d{0,5}x[1-9]\d{0,5}\. Multiply coordinates by \d+(?:\.\d+)? to map to original image\.\]$/;
    const resume=/^(?:继续\s*){1,8}$/;
    const users=delta.filter(m=>isUserInput(m)),lastTool=delta.findLastIndex(m=>isToolReceipt(m));
    const parts=users.flatMap(m=>pureText(m)?.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean)||[]);
    const imageCount=tools.reduce((n,m)=>n+(contentBlocks(toolReceipt(m)?.content).filter(b=>b.type==='image').length),0);
    const handoffUser = (message,i) => session.options?.allowToolHandoffUserMessages===true
      &&isUserInput(message)&&i>lastTool&&pureText(message)?.trim()
      &&!Object.keys(message).some(k=>!['role','content'].includes(k));
    if(parts.filter(s=>note.test(s)).length>imageCount
      ||parts.filter(s=>resume.test(s)).length>8
      ||delta.some((message,i)=>!isToolReceipt(message)&&!allowedUpdate(message)
        &&!handoffUser(message,i)
        &&!(isUserInput(message)&&i>lastTool&&typeof pureText(message)==='string'
          &&!Object.keys(message).some(k=>!['role','content'].includes(k))
          &&pureText(message).trim()&&pureText(message).trim().split(/\r?\n/).every(s=>!s.trim()||note.test(s.trim())||resume.test(s.trim())))))return reject('unsafe_tool_delta');
    const ids = new Set(tools.map(message => toolReceipt(message)?.tool_use_id));
    if (ids.size !== tools.length || [...ids].some(id => !session.pendingIds.has(id))) return reject('tool_result_id_mismatch');
  } else if (!delta.some(message => isUserInput(message)) || delta.some(message => !isUserInput(message) && !allowedUpdate(message))) return reject('unsafe_user_delta');
  return delta;
}

// 原结果各块保持原样，附加的调用方状态明确标记来源，不冒称工具原始输出。
export function continuationToolResults(delta, maxImageBytes) {
  const snapshots = delta.filter(message => callerRuntimeStatus(message)?.type === 'environment').map(message => ({
    ...callerRuntimeStatus(message), content: message.content,
  }));
  const results = delta.filter(message => isToolReceipt(message)).map(message => [toolReceipt(message)?.tool_use_id, mcpToolResult(message, maxImageBytes)]);
  if(new Set(results.map(([id])=>id)).size!==results.length)throw Object.assign(new Error('工具收据 ID 重复，未覆盖原结果'),{code:'DUPLICATE_TOOL_RESULT',status:400});
  if (snapshots.length && results.length) results[0][1].content.push({ type: 'text', text: stableJson({ kind: 'caller_runtime_status', snapshots }) });
  const annotations=delta.filter(m=>isUserInput(m)).map(m=>({role:'user',content:m.content}));
  if(annotations.length&&results.length)results[0][1].content.push({type:'text',text:stableJson({kind:'caller_handoff_context',source:'caller_user_messages',messages:annotations})});
  return new Map(results);
}

// MCP 结果由调用方提供；网关不执行工具，也不生成占位结果。
export function mcpToolResult(message,maxImageBytes) {
 const result=toolReceipt(message);
 if(!result)throw new Error('缺少原生工具结果');
 const content=contentBlocks(result.content).map(block=>{
  if(block.type==='text')return {...block};
  const {native}=normalizeImage(block,maxImageBytes);
  return {type:'image',data:native.source.data,mimeType:native.source.media_type};
 });
 return {content,...(result.is_error?{isError:true}:{})};
}
