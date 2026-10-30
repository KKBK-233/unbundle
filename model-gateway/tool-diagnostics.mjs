// 工具诊断仅输出固定类别与计数；自由搜索词、路径、参数、结果正文和自定义工具名不入日志。
const coreTools = new Set(['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'NotebookEdit']);
const category = name => coreTools.has(name) ? name : 'other';
const referenceCategory = name => category(typeof name === 'string' && name.startsWith('mcp__omp__') ? name.slice(10) : name);
const categories = names => [...new Set(names)].sort();

// 同一请求内以调用 ID 去重，最多跟踪 256 个；不会跨会话建立读取权限或自动重试。
export function toolDiagnostics(write, { maxTracked = 256 } = {}) {
  const tracked = new Map();
  const counts = { toolSearchCalls: 0, callerToolCalls: 0, toolHandoffCalls: 0, toolTrackingOverflow: 0 };
  return {
    call(call) {
      if (!call || typeof call.id !== 'string' || !call.id || call.id.length > 256
        || !['search', 'caller'].includes(call.kind) || tracked.has(call.id)) return;
      if (tracked.size >= maxTracked) { counts.toolTrackingOverflow++; return; }
      const state = { ordinal: tracked.size + 1, kind: call.kind, resultSeen: false };
      tracked.set(call.id, state);
      if (call.kind === 'search') {
        counts.toolSearchCalls++;
        // 只有 select: 精确工具选择才提取固定类别；自然语言搜索完全不解析、不留存。
        const query = typeof call.query === 'string' ? call.query.trim() : '';
        const select = query.startsWith('select:');
        const names = select ? query.slice(7, 4103).split(/[\s,]+/).filter(Boolean) : [];
        write('tool_call', { toolOrdinal: state.ordinal, kind: 'discovery', tool: 'ToolSearch',
          queryMode: select ? 'select' : query ? 'search' : 'unknown',
          ...(select ? { targetTools: categories(names.map(referenceCategory)), targetCount: names.length,
            targetsTruncated: query.length > 4103 } : {}) });
      } else {
        counts.callerToolCalls++;
        write('tool_call', { toolOrdinal: state.ordinal, kind: 'caller', tool: category(call.name),
          ...(call.name === 'Read' && ['explicit', 'default'].includes(call.readRange) ? { readRange: call.readRange } : {}) });
      }
    },
    result(event) {
      if (event?.type !== 'user' || !Array.isArray(event.message?.content)) return;
      for (const block of event.message.content.slice(0, 256)) {
        if (block?.type !== 'tool_result') continue;
        const state = tracked.get(block.tool_use_id);
        if (!state || state.kind !== 'search' || state.resultSeen) continue;
        state.resultSeen = true;
        const content = Array.isArray(block.content) ? block.content : [];
        const refs = content.slice(0, 256).filter(b => b?.type === 'tool_reference');
        // 无结构化引用不等于发现失败：纯文本结果不可安全推断出已加载的工具。
        write('tool_search_result', { toolOrdinal: state.ordinal, isError: block.is_error === true,
          referenceCount: refs.length, referencedTools: categories(refs.map(b => referenceCategory(b.tool_name))),
          referencesTruncated: content.length > 256 });
      }
    },
    handoff(calls) {
      if (!Array.isArray(calls)) return;
      for (const call of calls) {
        counts.toolHandoffCalls++;
        write('tool_handoff', { toolOrdinal: tracked.get(call?.id)?.ordinal, tool: category(call?.function?.name), phase: 'response_ready' });
      }
    },
    summary() { return { ...counts }; },
  };
}
