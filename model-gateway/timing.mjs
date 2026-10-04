import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

// 耗时仅记录固定阶段、请求关联号和数值；禁止正文、工具参数及认证信息进入日志。
export function createTiming(sink) {
  const requestId = randomUUID();
  const start = performance.now();
  const stages = {};
  let progress;
  let lastProgressReport = 0;
  let ended = false;
  const publish = record => { try { sink?.({ type: 'gateway_timing', requestId, ...record }); } catch {} };
  return {
    requestId,
    mark(stage) {
      if (ended || stage in stages) return;
      stages[stage] = Math.round(performance.now() - start);
      publish({ stage, elapsedMs: stages[stage] });
    },
    // 只记录计数与固定事件名，最多每 30 秒报告一次；失败时保留最后进展。
    observe(event, counters) {
      if (ended) return;
      const allowed = ['message_start', 'tool_start', 'tool_delta', 'tool_stop', 'thinking', 'text', 'message_end', 'assistant', 'result', 'mcp_call', 'api_retry'];
      if (!allowed.includes(event)) return;
      const elapsedMs = Math.round(performance.now() - start);
      const metrics = {};
      for (const key of ['stdoutBytes', 'toolArgumentBytes', 'upstreamMessages', 'retryEvents', 'mcpCalls', 'pendingTools', 'completedTools']) {
        if (Number.isSafeInteger(counters?.[key]) && counters[key] >= 0) metrics[key] = counters[key];
      }
      progress = { event, lastEventMs: elapsedMs, ...metrics };
      if (elapsedMs - lastProgressReport >= 30000) {
        lastProgressReport = elapsedMs;
        publish({ stage: 'progress', elapsedMs, progress });
      }
    },
    finish(outcome) {
      if (ended) return;
      ended = true;
      publish({ stage: 'finished', outcome, elapsedMs: Math.round(performance.now() - start), stages, ...(progress ? { progress } : {}) });
    },
  };
}
