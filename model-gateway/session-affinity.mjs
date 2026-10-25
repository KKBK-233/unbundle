// 会话身份通过 HTTP 元数据传递，不进入模型正文，也不代替历史一致性检查。
export function sessionAffinity(headers = {}) {
  const key = headers['x-claude-proxy-session-key'];
  const mode = headers['x-claude-proxy-session-mode'];
  if (key === undefined && mode === undefined) return undefined;
  if ((mode !== undefined && mode !== 'sticky') || typeof key !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(key)) {
    throw Object.assign(new Error('固定会话需要 1..128 位可见 ASCII 会话键，模式须为 sticky'),
      { code: 'INVALID_SESSION_AFFINITY', status: 400, retryable: false });
  }
  return { key };
}
