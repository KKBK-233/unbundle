import { compileContext } from './context.mjs';
import { resolveEffort } from './effort.mjs';

// 在发送 SSE 和启动 CLI 前拒绝无法兑现的生成参数，避免静默改变调用方意图。
export function validateRequest(body, { maxOutputTokens = 8192, maxImageBytes, maxTools = 0 } = {}) {
  const fail = (message, code = 'UNSUPPORTED_PARAMETER') => { throw Object.assign(new Error(message), { status: 400, code }); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('请求必须是 JSON 对象', 'INVALID_REQUEST');
  const supported = new Set(['model', 'messages', 'tools', 'tool_choice', 'stream', 'stream_options', 'max_tokens', 'max_completion_tokens', 'n', 'parallel_tool_calls', 'store', 'reasoning_effort', 'stop']);
  for (const key of Object.keys(body)) if (body[key] != null && !supported.has(key)) fail(`暂不支持参数 ${key}`);
  resolveEffort(body);
  const stops = typeof body.stop === 'string' ? [body.stop] : body.stop;
  if (stops != null && (!Array.isArray(stops) || stops.length > 4 || stops.some(value => typeof value !== 'string' || !value || value.length > 4096))) fail('stop 必须为非空字符串或最多四个非空字符串，单项最多 4096 字符');
  if (body.n != null && body.n !== 1) fail('仅支持 n=1');
  if (body.store != null && body.store !== false) fail('仅支持 store=false；网关不提供响应存储接口');
  if (body.parallel_tool_calls != null && typeof body.parallel_tool_calls !== 'boolean') fail('parallel_tool_calls 必须是布尔值');
  if (body.stream != null && typeof body.stream !== 'boolean') fail('stream 必须是布尔值');
  if (body.stream_options != null && (typeof body.stream_options !== 'object' || Array.isArray(body.stream_options) || Object.keys(body.stream_options).some(key => key !== 'include_usage') || (body.stream_options.include_usage != null && typeof body.stream_options.include_usage !== 'boolean'))) fail('stream_options 仅支持 include_usage 布尔值');
  // 对齐 Sub2API 的 Chat Completions 转换：新字段优先，兼容同时发送两个长度字段的客户端。
  // 接受上限与默认预算分开：扩大桌面兼容范围时，不提高未指定参数的请求预算。
  const limit = body.max_completion_tokens ?? body.max_tokens ?? Math.min(8192, maxOutputTokens);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxOutputTokens) fail(`输出 token 上限必须是 1..${maxOutputTokens} 的整数${typeof limit === 'number' ? `，收到 ${limit}` : ''}`);
  try { compileContext(body, { ...(maxImageBytes == null ? {} : { maxImageBytes }), maxTools }); }
  catch (error) { error.status = 400; error.code ||= 'INVALID_REQUEST'; throw error; }
  return limit;
}
