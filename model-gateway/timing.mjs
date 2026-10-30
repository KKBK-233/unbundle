import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { cliDiagnostics } from './cli-diagnostics.mjs';

// 耗时仅记录固定阶段、结束原因枚举、请求关联号和数值；禁止正文、工具参数及认证信息进入日志。
export function createTiming(sink) {
  const requestId = randomUUID();
  const start = performance.now();
  const cli = cliDiagnostics({ requestId, sink });
  const stages = {};
  let progress;
  let upstreamStopReason;
  let upstreamRefusal = false;
  let upload;
  let lastProgressReport = 0;
  let ended = false;
  const publish = record => { try { sink?.({ type: 'gateway_timing', requestId, ...record }); } catch {} };
  return {
    requestId,
    // 原始 CLI 元数据不依赖响应解析器，错误占位及续接通知也可追踪。
    cliContext(value) { if (!ended) cli.context(value); },
    cliEvent(event) { if (!ended) cli.accept(event); },
    cliTool(call) { if (!ended) cli.toolCall(call); },
    toolHandoff(calls) { if (!ended) cli.toolHandoff(calls); },
    bindResponse(responseId, protocol) {
      if (ended || !/^(?:msg_|chatcmpl-)[a-zA-Z0-9-]{1,80}$/.test(responseId)) return;
      if (!['anthropic', 'chat_completions'].includes(protocol)) return;
      publish({ stage: 'response_binding', responseId, protocol });
    },
    // 每次结束事件立即记录；保留拒绝标记，未知值不原样写入日志。
    upstreamStop(reason) {
      if (ended || typeof reason !== 'string' || !reason) return;
      const allowed = ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal', 'model_context_window_exceeded'];
      upstreamStopReason = allowed.includes(reason) ? reason : 'unknown';
      upstreamRefusal ||= reason === 'refusal';
      publish({ stage: 'upstream_stop', elapsedMs: Math.round(performance.now() - start), stopReason: upstreamStopReason });
    },
    // 仅记录上传字节数，不保存或哈希用户正文。
    upload(receivedBytes, expectedBytes) {
      if (ended || !Number.isSafeInteger(receivedBytes) || receivedBytes < 0) return;
      upload = { receivedBytes };
      if (Number.isSafeInteger(expectedBytes) && expectedBytes >= 0) upload.expectedBytes = expectedBytes;
    },
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
      for (const key of ['stdoutBytes', 'toolArgumentBytes', 'upstreamMessages', 'retryEvents', 'mcpCalls', 'pendingTools', 'completedTools', 'recoveredToolStops']) {
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
      cli.finish(outcome);
      publish({ stage: 'finished', outcome, elapsedMs: Math.round(performance.now() - start), stages, ...(upstreamStopReason ? { upstreamStopReason, upstreamRefusal } : {}), ...(progress ? { progress } : {}), ...(upload ? { upload } : {}) });
    },
  };
}
