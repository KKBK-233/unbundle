// 默认交给官方 CLI 按认证和请求类型选择 TTL；显式配置才覆盖。
export function cacheEnvironment(mode = 'auto') {
  if (!['auto', '5m', '1h', 'off'].includes(mode)) throw new Error('缓存断点必须为 auto、5m、1h 或 off');
  if (mode === '5m') return { FORCE_PROMPT_CACHING_5M: '1' };
  if (mode === '1h') return { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' };
  if (mode === 'off') return { DISABLE_PROMPT_CACHING: '1' };
  return {};
}
