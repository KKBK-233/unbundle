import { compileContext } from './context.mjs';
import { resolveEffort } from './effort.mjs';

// 在发送 SSE 和启动 CLI 前拒绝无法兑现的生成参数，避免静默改变调用方意图。
export function validateRequest(body, { maxOutputTokens = 8192 } = {}) {
  const fail = (message, code = 'UNSUPPORTED_PARAMETER') => { throw Object.assign(new Error(message), { status: 400, code }); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('请求必须是 JSON 对象', 'INVALID_REQUEST');
  const supported = new Set(['model', 'messages', 'tools', 'tool_choice', 'stream', 'stream_options', 'max_tokens', 'max_completion_tokens', 'n', 'parallel_tool_calls', 'store', 'reasoning_effort']);
  for (const key of Object.keys(body)) if (body[key] != null && !supported.has(key)) fail(`暂不支持参数 ${key}`);
  resolveEffort(body);
  if (body.n != null && body.n !== 1) fail('仅支持 n=1');
  if (body.store != null && body.store !== false) fail('仅支持 store=false；网关不提供响应存储接口');
  if (body.parallel_tool_calls != null && body.parallel_tool_calls !== true) fail('暂不支持禁止并行工具调用');
  if (body.stream != null && typeof body.stream !== 'boolean') fail('stream 必须是布尔值');
  if (body.stream_options != null && (typeof body.stream_options !== 'object' || Array.isArray(body.stream_options) || Object.keys(body.stream_options).some(key => key !== 'include_usage') || (body.stream_options.include_usage != null && typeof body.stream_options.include_usage !== 'boolean'))) fail('stream_options 仅支持 include_usage 布尔值');
  if (body.max_tokens != null && body.max_completion_tokens != null) fail('不能同时指定两个输出长度参数');
  const limit = body.max_completion_tokens ?? body.max_tokens ?? maxOutputTokens;
  if (!Number.isInteger(limit) || limit < 256 || limit > maxOutputTokens) fail(`输出 token 上限必须是 256..${maxOutputTokens} 的整数`);
  try { compileContext(body); }
  catch (error) { error.status = 400; error.code ||= 'INVALID_REQUEST'; throw error; }
  return limit;
}
