// 默认保留一小时缓存；显式 auto 时仍交给官方 CLI 选择。
export const DEFAULT_CACHE_BREAKPOINT = '1h';
export function cacheEnvironment(mode = DEFAULT_CACHE_BREAKPOINT) {
  if (!['auto', '5m', '1h', 'off'].includes(mode)) throw new Error('缓存断点必须为 auto、5m、1h 或 off');
  if (mode === '5m') return { FORCE_PROMPT_CACHING_5M: '1' };
  if (mode === '1h') return { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' };
  if (mode === 'off') return { DISABLE_PROMPT_CACHING: '1' };
  return {};
}
