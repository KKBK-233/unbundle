export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export function modelEfforts(model) {
  return ['claude-code-sonnet', 'claude-code-opus', 'claude-code-haiku', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'].includes(model) ? [...EFFORTS] : [];
}
export function resolveEffort(request) {
  const effort = request.output_config?.effort;
  if (effort == null || effort === 'auto') return undefined;
  const supported = modelEfforts(request.model);
  if (!supported.includes(effort)) throw Object.assign(new Error(`${request.model} 不支持 output_config.effort=${String(effort)}；可用档位：${supported.join(', ') || '仅 auto'}`), { status: 400, code: 'UNSUPPORTED_REASONING_EFFORT' });
  return effort;
}
