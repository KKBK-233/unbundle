import {normalizeImage,stableJson} from './context.mjs';
import {callerRuntimeStatus} from './runtime-status.mjs';
import {randomUUID} from 'node:crypto';

// 只描述实际导入的可见历史，不暗示恢复了缺失的思考或已退出的原生进程。
export const NATIVE_HISTORY_PROMPT = '\nEarlier native user, assistant and tool-result messages were imported from the caller conversation. Continue from the latest caller input. Preserve original tool IDs and supplied results; imported completed calls are history, not requests to execute them again. Do not invent missing results or reasoning. Caller instruction references keep their original positions.';

// 临时resume文件仅保存调用方真实历史，不填造历史用量或工具执行结果。
export function nativeResumeSeed(bootstrap, { sessionId, cwd, model }) {
  const safety = nativeResumeSafety(bootstrap);
  if (!safety.safe) throw new Error(`原生历史恢复边界不安全：${safety.reason}`);
  let parentUuid = null;
  return bootstrap.history.map(message => {
    const uuid = randomUUID();
    const row = { type: message.role, uuid, parentUuid, sessionId, cwd, timestamp: new Date().toISOString(),
      message: message.role === 'assistant' ? { ...message, id: `msg_${randomUUID().replaceAll('-', '')}`,
        type: 'message', model, stop_reason: message.content.some(block => block.type === 'tool_use') ? 'tool_use' : 'end_turn' } : message };
    parentUuid = uuid;
    return JSON.stringify(row);
  }).join('\n') + (bootstrap.history.length ? '\n' : '');
}

// 官方resume会整理未完成工具边界；候选入口不能靠合成占位或重复结果跨过它。
export function nativeResumeSafety(bootstrap) {
  const pending = new Set(), seen = new Set();
  for (const frame of bootstrap.history) for (const block of frame.content) {
    if (block.type === 'tool_use') {
      if (seen.has(block.id)) return { safe: false, reason: 'duplicate_tool_id' };
      seen.add(block.id); pending.add(block.id);
    } else if (block.type === 'tool_result' && !pending.delete(block.tool_use_id)) {
      return { safe: false, reason: 'orphan_tool_result' };
    }
  }
  if (pending.size || bootstrap.current.content.some(block => block.type === 'tool_result'))
    return { safe: false, reason: 'pending_tool_boundary' };
  const last = bootstrap.history.at(-1);
  const completedToolResults = last?.role === 'user' && last.content.length > 0
    && last.content.every(block => block.type === 'tool_result')
    && bootstrap.current.content.some(block => block.type === 'image' || block.type === 'text' && block.text.trim());
  if (last && last.role !== 'assistant' && !completedToolResults)
    return { safe: false, reason: 'incomplete_turn_boundary' };
  return { safe: true };
}

// 本地候选入口使用的历史转换：保留真实角色和结果，不执行工具。
export function nativeHistoryBootstrap(request,compiled,{maxImageBytes=5242880}={}) {
  const frames=[];
  const append=(role,content)=>{
    if(!content.length)return;
    if(frames.at(-1)?.role===role)frames.at(-1).content.push(...content);
    else frames.push({role,content});
  };
  const blocks=content=>typeof content==='string'?[{type:'text',text:content}]:
    (content||[]).map(b=>b.type==='text'?{type:'text',text:b.text}:normalizeImage(b,maxImageBytes).native);
  let start=0;
  while(start<request.messages.length&&['system','developer'].includes(request.messages[start].role))start++;
  for(let i=start;i<request.messages.length;i++) {
    const m=request.messages[i];
    if(['system','developer'].includes(m.role)) {
      const status=callerRuntimeStatus(m);
      if(status?.type==='tokens')continue;
      append('user',[{type:'text',text:stableJson(status?
        {kind:'caller_runtime_status',snapshots:[{...status,content:m.content}]}:
        {role:m.role,instruction_ref:`message_${i}`})}]);
    } else if(m.role==='user') {
      const content=blocks(m.content);
      // 工具结果之后的真实用户输入是新一轮；不能再次合并成悬空工具交接。
      if(content.length && frames.at(-1)?.role==='user' && frames.at(-1).content.some(block=>block.type==='tool_result'))frames.push({role:'user',content});
      else append('user',content);
    }
    else if(m.role==='assistant') {
      const content=blocks(m.content);
      for(const call of m.tool_calls||[]) {
        const mapped=(compiled.historicalTools || compiled.available).find(t=>t.original===call.function.name);
        if(!mapped)throw Object.assign(new Error('原生历史中的工具不在当前映射中'),{code:'NATIVE_HISTORY_TOOL_UNAVAILABLE',status:409,retryable:false});
        content.push({type:'tool_use',id:call.id,name:'mcp__omp__'+mapped.name,input:JSON.parse(call.function.arguments)});
      }
      append('assistant',content);
    } else if(m.role==='tool')append('user',[{type:'tool_result',tool_use_id:m.tool_call_id,
      content:blocks(m.content),...(m.is_error?{is_error:true}:{})}]);
    else throw new Error('原生历史角色无效');
  }
  if(frames.at(-1)?.role!=='user')throw new Error('原生历史需要以调用方输入或工具结果结束');
  const current=frames.at(-1),history=frames.slice(0,-1);
  const systemPrompt=compiled.nativeSystemPrompt+(history.length?NATIVE_HISTORY_PROMPT:'');
  return {history,current,systemPrompt,input:JSON.stringify({type:'user',message:current})+'\n'};
}
