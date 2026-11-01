const invalid = message => Object.assign(new Error(message), { status: 400, code: 'INVALID_TOOL_CHOICE', retryable: false });
export function toolChoice(request) {
 const value=request.tool_choice??{type:'auto'};
 if(!value||typeof value!=='object'||Array.isArray(value)||!['auto','none','any','tool'].includes(value.type)
   ||Object.keys(value).some(k=>!['type','name','disable_parallel_tool_use'].includes(k))
   ||value.type==='tool'&&(typeof value.name!=='string'||!value.name)||value.type!=='tool'&&value.name!=null
   ||value.disable_parallel_tool_use!=null&&typeof value.disable_parallel_tool_use!=='boolean')throw invalid('tool_choice 格式无效');
 const names=(request.tools||[]).map(t=>t.name),name=value.type==='tool'?value.name:undefined;
 const mode=value.type==='any'?'required':value.type==='tool'?'named':value.type;
 if(mode==='required'&&!names.length||name&&!names.includes(name))throw invalid('强制工具选择需要存在的工具定义');
 return {mode,name,required:['required','named'].includes(mode),single:value.disable_parallel_tool_use===true};
}
export function toolChoicePrompt(policy) {
  if (!policy.required && !policy.single) return '';
  return '\nCaller tool policy for this response: ' + JSON.stringify({ required: policy.required,
    ...(policy.name ? { tool: policy.name } : {}), ...(policy.single ? { maximum_calls: 1 } : {}) })
    + '. Fulfil this policy with caller MCP tools. ToolSearch is discovery and does not satisfy a required caller tool call.';
}
export function enforceToolChoice(policy, calls = [], statistics) {
  if (policy.required && !calls.length || policy.mode === 'none' && calls.length
    || policy.name && calls.some(call => call.name !== policy.name) || policy.single && calls.length > 1) {
    throw Object.assign(new Error('CLI 输出未满足调用方工具选择约束；未交付工具、不自动重试'),
      { code: 'TOOL_CHOICE_UNSATISFIED', status: 422, retryable: false, ...(statistics ? { statistics } : {}) });
  }
}
