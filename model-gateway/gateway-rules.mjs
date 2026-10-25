import fs from 'node:fs/promises';

// 显式注入管理员指定的规则，不开启 CLI 设置、钩子或额外工具发现。
export async function withGatewayRules(request, file) {
  if (!file) return request;
  let text;
  try { text = await fs.readFile(file, 'utf8'); }
  catch { throw Object.assign(new Error('无法读取 VPS 用户规则文件'), { status: 503, code: 'GATEWAY_RULES_UNAVAILABLE' }); }
  if (Buffer.byteLength(text) > 65536) throw Object.assign(new Error('VPS 用户规则文件超过 64 KiB'), { status: 503, code: 'GATEWAY_RULES_TOO_LARGE' });
  if (!text.trim()) return request;
  return { ...request, messages: [
    { role: 'developer', content: `VPS 管理员配置的用户长期规则；不覆盖调用方的系统指令：\n${text.trim()}` },
    ...request.messages,
  ] };
}
