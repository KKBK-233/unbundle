function safeDetail(detail) {
  return detail.replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '[URL已隐藏]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [已隐藏]')
    .replace(/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password)\s*[:=]\s*[^\s,;]+/gi, '[凭据已隐藏]')
    .replace(/[A-Za-z0-9_\-]{32,}/g, '[长标识已隐藏]').slice(0, 400);
}

// 仅分类CLI明确标记的失败，绝不把模型正文作为错误；不转发可能含凭据的原始错误文本。
export function cliFailure(result, apiMessage) {
  const sources = [result?.result, ...(Array.isArray(result?.errors) ? result.errors : []), apiMessage]
    .filter(value => typeof value === 'string').map(value => value.slice(0, 32768));
  const text = sources.join('\n').slice(0, 32768);
  let status, code, message;
  if (result?.subtype === 'error_max_turns') {
    status = 422; code = 'CLI_MAX_TURNS'; message = 'CLI 达到内部轮次上限，本轮未完成。';
  } else if (/prompt is too long|exceeds? (?:the )?context (?:window|limit)|request_too_large/i.test(text)) {
    status = 413; code = 'UPSTREAM_CONTEXT_LIMIT'; message = '上游拒绝请求：输入超过允许的上下文或请求大小。';
  } else {
    const explicit = text.match(/\bAPI Error:\s*(400|401|403|404|413|422|429|500|502|503|529)\b/i);
    status = explicit ? Number(explicit[1]) : /\bauthentication_error\b/i.test(text) ? 401
      : /\binvalid_request_error\b/i.test(text) ? 400 : /\brate_limit_error\b/i.test(text) ? 429
      : /\boverloaded_error\b/i.test(text) ? 529 : undefined;
    if (status) {
      code = `UPSTREAM_HTTP_${status}`;
      message = `Claude 上游返回 ${status} 错误。`;
      // 固定原因标签，不把上游可能回显的请求、凭据或任意文本写入响应。
      const reasons = [
        [/only authorized for use with Claude Code|credential[^\n]{0,80}cannot be used for other API requests/i, '上游认为凭据只能用于 Claude Code，拒绝了当前请求形式。'],
        [/OAuth token[^\n]{0,80}(?:expired|revoked)|token has expired/i, '上游报告授权令牌过期或已撤销。'],
        [/not available in your (?:country|region)|unsupported (?:country|region)/i, '上游报告当前地区不受支持。'],
        [/\bRequest not allowed\b/i, '上游仅说明 Request not allowed，未提供可确认的具体原因。'],
      ];
      const reason = reasons.find(([pattern]) => pattern.test(text));
      if (reason) message += reason[1];
      else {
        // 只向请求所属客户端返回结构化error.message；不记录原文，也不回显整份错误对象。
        for (const source of sources) {
          const start = source.indexOf('{');
          if (start < 0) continue;
          try {
            const value = JSON.parse(source.slice(start));
            const detail = value?.error?.message;
            if (typeof detail !== 'string' || !detail.trim()) continue;
            const safe = safeDetail(detail);
            message += `上游说明：${safe}`;
            break;
          } catch { /* 不猜测非JSON或混合正文中的任意错误内容。 */ }
        }
        // 官方CLI认证失败路径会提前把JSON转换成纯文本，必须保留状态码后的说明。
        if (!message.includes('上游说明：')) {
          const detail = sources.map(source => source.match(/^Failed to authenticate\. API Error:\s*403\s+([^\r\n]+)/i)?.[1])
            .find(value => value && !value.trim().startsWith('{') && !value.trim().startsWith('['));
          if (detail) message += `上游说明：${safeDetail(detail)}`;
        }
      }
    }
  }
  return Object.assign(new Error(message || '原生 CLI 本轮失败，未取得可安全识别的上游错误分类。'), {
    code: code || 'CLI_RUN_FAILED', ...(status ? { status } : {}),
    ...([400, 401, 403, 404, 413, 422].includes(status) ? { retryable: false } : {}),
  });
}
