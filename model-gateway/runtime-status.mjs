// 只识别客户端固定格式的数值余量和目录快照；夹带额外规则时仍按系统指令处理。
export function callerRuntimeStatus(message) {
  const content = Array.isArray(message.content) && message.content.length === 1 ? message.content[0].text : message.content;
  if (message.role !== 'system' || typeof content !== 'string') return;
  if (/^\s*(?:<total_tokens>\d+ tokens left<\/total_tokens>\s*)+$/.test(content)) return { type: 'tokens' };
  const match = /^\s*(?:<total_tokens>\d+ tokens left<\/total_tokens>\s*)*# Environment update\r?\n - Primary working directory: ([^\r\n]+) \(was ([^\r\n]+)\)\r?\n(?:\s*<total_tokens>\d+ tokens left<\/total_tokens>\s*)*$/.exec(content);
  if (!match) return;
  const absolute = value => /^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(value) && !/[\x00-\x1f<>]/.test(value);
  if (!absolute(match[1]) || !absolute(match[2])) return;
  return { type: 'environment', cwd: match[1], previousCwd: match[2] };
}
