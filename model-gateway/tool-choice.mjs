// CLI 没有公开的强制选择参数；在交付 Desktop 前验证，不自动重复推理。
const invalid = message => Object.assign(new Error(message), { status: 400, code: 'INVALID_TOOL_CHOICE', retryable: false });
export function toolChoice(request) {
  const value = request.tool_choice ?? 'auto';
  let mode, name;
  if (typeof value === 'string' && ['auto', 'none', 'required'].includes(value)) mode = value;
  else if (value && typeof value === 'object' && !Array.isArray(value) && value.type === 'function'
    && Object.keys(value).every(key => ['type', 'function'].includes(key))
    && value.function && Object.keys(value.function).length === 1 && typeof value.function.name === 'string') {
    mode = 'named'; name = value.function.name;
  } else throw invalid('tool_choice 必须为 auto、none、required 或指定 function');
  const names = (request.tools || []).map(tool => tool?.function?.name);
  if (mode === 'required' && !names.length || mode === 'named' && !names.includes(name)) throw invalid('强制工具选择需要存在的工具定义');
  if (request.parallel_tool_calls != null && typeof request.parallel_tool_calls !== 'boolean') throw invalid('parallel_tool_calls 必须为布尔值');
  return { mode, name, required: ['required', 'named'].includes(mode), single: request.parallel_tool_calls === false };
}
export function toolChoicePrompt(policy) {
  if (!policy.required && !policy.single) return '';
  return '\nCaller tool policy for this response: ' + JSON.stringify({ required: policy.required,
    ...(policy.name ? { tool: policy.name } : {}), ...(policy.single ? { maximum_calls: 1 } : {}) })
    + '. Fulfil this policy with caller MCP tools. ToolSearch is discovery and does not satisfy a required caller tool call.';
}
export function enforceToolChoice(policy, calls = [], statistics) {
  if (policy.required && !calls.length || policy.mode === 'none' && calls.length
    || policy.name && calls.some(call => call.function.name !== policy.name) || policy.single && calls.length > 1) {
    throw Object.assign(new Error('CLI 输出未满足调用方工具选择约束；未交付工具、不自动重试'),
      { code: 'TOOL_CHOICE_UNSATISFIED', status: 422, retryable: false, ...(statistics ? { statistics } : {}) });
  }
}
