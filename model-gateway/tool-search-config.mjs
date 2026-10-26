// 仅打开官方 ToolSearch 元数据能力；不开放 VPS 的 Bash、Read、Write 等工具。
export function toolSearchConfig({ toolSearch = false, maxToolSearchCalls = 8 } = {}) {
  if (typeof toolSearch !== 'boolean') throw new Error('toolSearch 必须为布尔值');
  if (!Number.isSafeInteger(maxToolSearchCalls) || maxToolSearchCalls < 1 || maxToolSearchCalls > 64) throw new Error('maxToolSearchCalls 必须为 1..64');
  return { enabled: toolSearch, maxCalls: maxToolSearchCalls, builtin: toolSearch ? 'ToolSearch' : '', environment: toolSearch ? 'true' : 'false' };
}
