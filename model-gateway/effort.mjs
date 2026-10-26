// 与已验收 CLI 版本配套：只开放已验证的模型档位，不把 off/minimal 偷换成 low。
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export function modelEfforts(model) {
  return ['claude-code-sonnet', 'claude-code-opus', 'claude-code-haiku', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'].includes(model) ? [...EFFORTS] : [];
}
export function resolveEffort(request) {
  const effort = request.reasoning_effort;
  if (effort == null || effort === 'auto') return undefined;
  const supported = modelEfforts(request.model);
  if (!supported.includes(effort)) throw Object.assign(new Error(`${request.model} 不支持 reasoning_effort=${String(effort)}；可用档位：${supported.join(', ') || '仅 auto'}`), { status: 400, code: 'UNSUPPORTED_REASONING_EFFORT' });
  return effort;
}
// OMP 只提供强度选择；响应仍仅包含最终文本和工具调用。
export function ompThinking(model) {
  const efforts = modelEfforts(model);
  return efforts.length ? { reasoning: true, thinking: { mode: 'effort', efforts, defaultLevel: 'medium', requiresEffort: true }, compat: { supportsReasoningEffort: true, supportsReasoningParams: true, thinkingFormat: 'openai' } } : { reasoning: false };
}
