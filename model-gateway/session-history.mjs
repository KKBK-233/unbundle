import { createHmac, randomBytes } from 'node:crypto';
import { stableJson, normalizeImage } from './context.mjs';
import { callerRuntimeStatus } from './runtime-status.mjs';
import { assistantDifference } from './assistant-diff.mjs';
import { mappedBashAssistant } from './bash-roundtrip.mjs';

// 仅用于匹配同一调用方的历史前缀；不保存正文、工具参数或可离线猜测的裸哈希。
const key = randomBytes(32);
export function runtimeStatus(message) {
  const value = Array.isArray(message.content) && message.content.length === 1 ? message.content[0].text : message.content;
  return message.role === 'system' && typeof value === 'string'
    && /^\s*(?:<total_tokens>\d+ tokens left<\/total_tokens>\s*)+$/.test(value);
}
export function sessionHistory(messages) { return messages.filter(message => !runtimeStatus(message)); }
export function historyKey(message, { exact = false, hashKey = key, toolSchemas } = {}) {
  const content = !exact && typeof message.content === 'string' ? message.content.replace(/\r\n/g, '\n').trim() : message.content;
  // Desktop 可能按工具 schema 重排 input 键；参数字符串内的 JSON 也须规范化。
  // 仅忽略 JSON 对象键顺序，保留 ID、工具名、数组顺序与所有参数值。
  const normalized = { ...message, content: exact ? content : content || null };
  if (Array.isArray(message.tool_calls)) normalized.tool_calls = message.tool_calls.map(call => {
    if (typeof call?.function?.arguments !== 'string') return call;
    let args;
    try { args = JSON.parse(call.function.arguments); } catch { return call; }
    const schema=toolSchemas?.find(tool=>tool?.function?.name===call.function.name)?.function?.parameters;
    // 仅规范化已确认的 Desktop Edit 默认值；真实参数变化和其他工具仍严格比较。
    if(call.function.name==='Edit' && schema?.properties?.replace_all?.type==='boolean'
      && schema.properties.replace_all.default===false && !schema.required?.includes('replace_all')
      && args && typeof args==='object' && !Array.isArray(args) && args.replace_all===false) {
      args={...args};delete args.replace_all;
    }
    return { ...call, function: { ...call.function, arguments: stableJson(args) } };
  });
  return createHmac('sha256', hashKey).update(stableJson(normalized)).digest('hex');
}
export function assistantMessage(execution) {
  return { role: 'assistant', content: execution.content || null,
    ...(execution.tool_calls?.length ? { tool_calls: execution.tool_calls } : {}) };
}
export function continuationDelta(session, request, { allowInstructionUpdates = false, onReject, onAssistantMismatch, onReceiptAlias, onCancelledTailProjection, hashKey } = {}) {
  const reject = reason => { onReject?.(reason); return undefined; };
  const toolSchemas=session.historyNormalization===true ? request.tools : undefined;
  const messages = sessionHistory(request.messages);
  let prefix = session.history;
  const prior=session.interrupted===true&&session.request?sessionHistory(session.request.messages):undefined;
  if(session.interrupted===true&&session.request){
    // Send now 可把新消息插到末尾目录快照之前；只移动纯环境事实，不放宽历史正文。
    if(prior.length===prefix.length&&prior.length&&callerRuntimeStatus(prior.at(-1))?.type==='environment')prefix=prefix.slice(0,-1);
  }
  const matchPrefix=(value,index)=>{
    const actual=messages[index],actualKey=historyKey(actual,{exact:allowInstructionUpdates,hashKey,toolSchemas});
    if(actualKey===value)return true;
    // Send now 会用固定“结果缺失”占位符替换收据；只接受原生取消已确认、
    // 且本轮实际交回过的同 ID。原生真实结果保持权威，不重新提交或执行工具。
    const original=prior?.[index];
    if(!session.cancelledReceiptIds?.has(actual?.tool_call_id)||actual.role!=='tool'||actual.is_error!==true
      ||actual.content!=='[Tool result missing due to internal error]'
      ||Object.keys(actual).some(k=>!['role','tool_call_id','content','is_error'].includes(k))
      ||original?.role!=='tool'||original.tool_call_id!==actual.tool_call_id
      ||historyKey(original,{exact:allowInstructionUpdates,hashKey,toolSchemas})!==value)return false;
    try{onReceiptAlias?.({toolKey:historyKey({role:'tool',tool_call_id:actual.tool_call_id},{hashKey}),originalKey:value,placeholderKey:actualKey,nativeResultPreserved:true});}catch{}
    return true;
  };
  let matches=messages.length>prefix.length&&prefix.every(matchPrefix);
  if(!matches&&prior?.length===session.history.length&&session.cancelledReceiptIds?.size){
    const assistantIndex=prior.findLastIndex(m=>m.role==='assistant'),assistant=prior[assistantIndex];
    const calls=assistant?.tool_calls||[],ids=new Set(calls.map(c=>c.id));
    let base=assistantIndex;
    while(base>0&&callerRuntimeStatus(prior[base-1])?.type==='environment')base--;
    const tail=prior.slice(base),receipts=tail.filter(m=>m.role==='tool');
    const emptyText=assistant&&(assistant.content==null||typeof assistant.content==='string'&&!assistant.content.trim());
    const verified=base>=0&&calls.length>0&&ids.size===calls.length&&emptyText
      &&calls.every(c=>session.cancelledReceiptIds.has(c.id))&&receipts.length===ids.size
      &&new Set(receipts.map(m=>m.tool_call_id)).size===ids.size&&receipts.every(m=>ids.has(m.tool_call_id))
      &&tail.every((m,i)=>historyKey(m,{exact:allowInstructionUpdates,hashKey,toolSchemas})===session.history[base+i]
        &&(base+i===assistantIndex||m.role==='tool'&&ids.has(m.tool_call_id)||callerRuntimeStatus(m)?.type==='environment'));
    const candidate=session.history.slice(0,base),delta=messages.slice(base);
    if(verified&&messages.length>base&&candidate.every(matchPrefix)&&delta.some(m=>m.role==='user')
      &&delta.every(m=>m.role==='user'||callerRuntimeStatus(m)?.type==='environment'||allowInstructionUpdates&&['system','developer'].includes(m.role))){
      prefix=candidate;matches=true;
      try{onCancelledTailProjection?.({omittedDesktopMessages:session.history.length-base,completedTools:ids.size,nativeTailPreserved:true,toolResultsResubmitted:false});}catch{}
    }
  }
  if(messages.length<=prefix.length)return reject('messages_not_appended');
  if(!matches)return reject('history_prefix_mismatch');
  if (session.interrupted === true) {
    // 仅接受已确认中断后的用户增量；原生已完成工具事实保留，不猜补或重放工具。
    const delta = messages.slice(prefix.length);
    if (!delta.some(message => message.role === 'user') || delta.some(message => message.role !== 'user'
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
    const tools = delta.filter(message => message.role === 'tool');
    if (tools.length !== session.pendingIds.size) return reject('tool_result_count_mismatch');
    // Desktop 会在图片工具结果后另附 user 角色的尺寸注释。只接受固定格式的
    // 显示数据和纯“继续”控制；生产显式启用时，还允许完整收据之后的用户文本，
    // 经 caller_handoff_context 独立标注用户身份，不覆盖原工具正文。
    const note=/^\[Image: original [1-9]\d{0,5}x[1-9]\d{0,5}, displayed at [1-9]\d{0,5}x[1-9]\d{0,5}\. Multiply coordinates by \d+(?:\.\d+)? to map to original image\.\]$/;
    const resume=/^(?:继续\s*){1,8}$/;
    const users=delta.filter(m=>m.role==='user'),lastTool=delta.findLastIndex(m=>m.role==='tool');
    const parts=users.flatMap(m=>typeof m.content==='string'?m.content.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean):[]);
    const imageCount=tools.reduce((n,m)=>n+(Array.isArray(m.content)?m.content.filter(b=>['image','image_url'].includes(b?.type)).length:0),0);
    const handoffUser = (message,i) => session.options?.allowToolHandoffUserMessages===true
      &&message.role==='user'&&i>lastTool&&typeof message.content==='string'&&message.content.trim()
      &&!Object.keys(message).some(k=>!['role','content'].includes(k));
    if(parts.filter(s=>note.test(s)).length>imageCount
      ||parts.filter(s=>resume.test(s)).length>8
      ||delta.some((message,i)=>message.role!=='tool'&&!allowedUpdate(message)
        &&!handoffUser(message,i)
        &&!(message.role==='user'&&i>lastTool&&typeof message.content==='string'
          &&!Object.keys(message).some(k=>!['role','content'].includes(k))
          &&message.content.trim()&&message.content.trim().split(/\r?\n/).every(s=>!s.trim()||note.test(s.trim())||resume.test(s.trim())))))return reject('unsafe_tool_delta');
    const ids = new Set(tools.map(message => message.tool_call_id));
    if (ids.size !== tools.length || [...ids].some(id => !session.pendingIds.has(id))) return reject('tool_result_id_mismatch');
  } else if (!delta.some(message => message.role === 'user') || delta.some(message => message.role !== 'user' && !allowedUpdate(message))) return reject('unsafe_user_delta');
  return delta;
}

// 原结果各块保持原样，附加的调用方状态明确标记来源，不冒称工具原始输出。
export function continuationToolResults(delta, maxImageBytes) {
  const snapshots = delta.filter(message => callerRuntimeStatus(message)?.type === 'environment').map(message => ({
    ...callerRuntimeStatus(message), content: message.content,
  }));
  const results = delta.filter(message => message.role === 'tool').map(message => [message.tool_call_id, mcpToolResult(message, maxImageBytes)]);
  if (snapshots.length && results.length) results[0][1].content.push({ type: 'text', text: stableJson({ kind: 'caller_runtime_status', snapshots }) });
  const annotations=delta.filter(m=>m.role==='user').map(m=>({role:'user',content:m.content}));
  if(annotations.length&&results.length)results[0][1].content.push({type:'text',text:stableJson({kind:'caller_handoff_context',source:'caller_user_messages',messages:annotations})});
  return new Map(results);
}

// MCP 结果由调用方提供；网关不执行工具，也不生成占位结果。
export function mcpToolResult(message, maxImageBytes) {
  const content = typeof message.content === 'string'
    ? [{ type: 'text', text: message.content }] : (message.content || []).map(block => {
      if (block.type === 'text') return { type: 'text', text: block.text };
      const { native } = normalizeImage(block, maxImageBytes);
      return { type: 'image', data: native.source.data, mimeType: native.source.media_type };
    });
  return { content, ...(message.is_error ? { isError: true } : {}) };
}
