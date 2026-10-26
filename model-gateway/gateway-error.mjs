// HTTP 与 SSE 共用错误分类；明确未登录需要重新认证，不能当作临时服务故障。
export function gatewayError(error) {
  const supplied = error?.status;
  const status = error?.code === 'AUTH_REQUIRED' ? 401
    : Number.isInteger(supplied) && supplied >= 400 && supplied <= 599 ? supplied : 502;
  const types = { 400: 'invalid_request_error', 401: 'authentication_error', 403: 'permission_error',
    404: 'not_found_error', 413: 'request_too_large', 422: 'invalid_request_error', 429: 'rate_limit_error' };
  const statistics = error?.statistics;
  const upstream = statistics?.upstream_usage || error?.upstream_usage;
  const usage = upstream && Object.fromEntries(['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']
    .filter(key => Number.isFinite(upstream[key]) && upstream[key] >= 0).map(key => [key, upstream[key]]));
  return { status, error: { type: types[status] || 'api_error',
    code: typeof error?.code === 'string' && error.code ? error.code : 'GATEWAY_ERROR',
    message: typeof error?.message === 'string' && error.message ? error.message : '中继处理请求失败',
    ...(error?.retryable === false ? { retryable: false } : {}),
    ...(usage && Object.keys(usage).length ? { upstream_usage: usage } : {}) } };
}
