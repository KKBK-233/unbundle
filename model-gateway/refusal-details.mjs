// 拒绝原因只交付诊断白名单；恢复信用令牌和其他内部字段不进入响应或日志。
export function refusalDetails(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const details = {};
  if (value.category === null || typeof value.category === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value.category)) details.category = value.category;
  if (value.explanation === null) details.explanation = null;
  else if (typeof value.explanation === 'string') details.explanation = refusalExplanation(value.explanation);
  return Object.keys(details).length ? details : undefined;
}

// 说明不读取回复正文；限长并移除常见凭据、URL、控制字符及长编码串。
export function refusalExplanation(value) {
  if (typeof value !== 'string') return undefined;
  const text = value.slice(0, 8192)
    .replace(/-----BEGIN[\s\S]*?(?:-----END[^\r\n]*|$)/g, '[REDACTED]')
    .replace(/(?:https?|wss?):\/\/[^\s<>"']+/gi, '[URL]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;"']+/gi, '[REDACTED]')
    .replace(/\b(?:sk-ant-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_.-]{20,})/g, '[REDACTED]')
    .replace(/\b(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|fallback_credit_token|creditCode|password)\b["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, '[REDACTED]')
    .replace(/[A-Za-z0-9_+/=-]{64,}/g, '[REDACTED]')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  return text.slice(0, 512);
}
