import { nativeHistoryBootstrap, nativeResumeSafety } from './native-history.mjs';

// 入口只选择表示方式；不执行工具，不伪造工具结果或 Thinking。
export function sessionEntry(request, compiled, options = {}) {
  const native = nativeHistoryBootstrap(request, compiled, options);
  const safety = nativeResumeSafety(native);
  if (!safety.safe) throw Object.assign(new Error('原生历史无法安全恢复；已禁止 JSON 历史回退'),
    { code: 'NATIVE_HISTORY_UNSAFE', reason: safety.reason, status: 409, retryable: false });
  if(native.history.length)throw Object.assign(new Error('缺少可验证的原生会话检查点；禁止导入或重建长历史'),
    {code:'NATIVE_RESUME_REQUIRED',status:409,retryable:false});
  return { ...native, mode: native.history.length ? 'native_history_restore' : 'native_new',
    reason: native.history.length ? 'desktop_history_import' : 'first_user_message',
    systemPrompt: native.systemPrompt };
}

export function nativeIncrement(request, compiled, options = {}) {
  const entry = sessionEntry(request, compiled, options);
  if (entry.mode !== 'native_new') throw Object.assign(new Error('增量输入不是单个原生用户轮次'),
    { code: 'NATIVE_INCREMENT_UNSAFE', status: 422, retryable: false });
  return entry.input;
}
