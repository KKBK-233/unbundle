import { performance } from 'node:perf_hooks';

// 直接观察 CLI 管道，独立于响应转换器；只输出固定名称和数值，不保留内容。
export function cliOutputAudit({ requestId, sink } = {}) {
  const started = performance.now();
  const counts = { stdoutBytes: 0, stderrBytes: 0, lines: 0, malformedLines: 0, invalidValues: 0,
    otherEvents: 0, directApiEvents: 0, apiRetryEvents: 0, messageStarts: 0, messageStops: 0,
    streamTextBytes: 0, streamToolStarts: 0, toolArgumentBytes: 0, thinkingDeltas: 0,
    thinkingBytes: 0, emptyThinkingDeltas: 0,
    thinkingEstimateEvents: 0, thinkingEstimatedDeltaTokens: 0,
    nativeThinkingEstimateEvents: 0, nativeThinkingEstimatedTokens: 0, nativeThinkingEstimatedDeltaTokens: 0,
    signatureDeltas: 0, assistantTextBytes: 0, assistantToolBlocks: 0, resultEvents: 0,
    resultTextBytes: 0, resultErrors: 0 };
  let ended = false, lastReport = 0, visibleReported = false, unusualReported = false;
  const bytes = value => typeof value === 'string' ? Buffer.byteLength(value) : 0;
  const estimate = value => Number.isSafeInteger(value) && value >= 0;
  const publish = event => {
    try { sink?.({ type: 'cli_output_audit', requestId, event, elapsedMs: Math.round(performance.now() - started), ...counts }); } catch {}
  };
  const inspectStream = event => {
    if (event?.type === 'message_start') counts.messageStarts++;
    if (event?.type === 'message_stop') counts.messageStops++;
    if (event?.type === 'content_block_start') {
      if (event.content_block?.type === 'text') counts.streamTextBytes += bytes(event.content_block.text);
      if (event.content_block?.type === 'tool_use') counts.streamToolStarts++;
    }
    if (event?.type !== 'content_block_delta') return;
    if (event.delta?.type === 'text_delta') counts.streamTextBytes += bytes(event.delta.text);
    if (event.delta?.type === 'input_json_delta') counts.toolArgumentBytes += bytes(event.delta.partial_json);
    if (event.delta?.type === 'thinking_delta') {
      counts.thinkingDeltas++;
      const size = bytes(event.delta.thinking);
      counts.thinkingBytes += size;
      if (!size) counts.emptyThinkingDeltas++;
      // API片段中的估算增量，与CLI system/thinking_tokens是同一进度的两种表示，分别记录，不能相加计费。
      if (estimate(event.delta.estimated_tokens)) {
        counts.thinkingEstimateEvents++;
        counts.thinkingEstimatedDeltaTokens += event.delta.estimated_tokens;
      }
    }
    if (event.delta?.type === 'signature_delta') counts.signatureDeltas++;
  };
  return {
    stdout(chunk) { if (!ended) counts.stdoutBytes += chunk.length; },
    stderr(chunk) { if (!ended) counts.stderrBytes += chunk.length; },
    line(value) {
      if (ended) return;
      counts.lines++;
      let event;
      try { event = JSON.parse(value); } catch { counts.malformedLines++; }
      if (event != null && (typeof event !== 'object' || Array.isArray(event))) { counts.invalidValues++; event = undefined; }
      else if (event === null) counts.invalidValues++;
      if (event && typeof event === 'object') {
        if (event.type === 'stream_event') inspectStream(event.event);
        else if (['message_start', 'message_stop', 'message_delta', 'content_block_start', 'content_block_delta', 'content_block_stop'].includes(event.type)) {
          counts.directApiEvents++; inspectStream(event);
        } else if (event.type === 'assistant') {
          for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
            if (block?.type === 'text') counts.assistantTextBytes += bytes(block.text);
            if (block?.type === 'tool_use') counts.assistantToolBlocks++;
          }
        } else if (event.type === 'result') {
          counts.resultEvents++; counts.resultTextBytes += bytes(event.result);
          if (event.is_error) counts.resultErrors++;
        } else if (!['system', 'user', 'tool_progress', 'tool_use_summary', 'rate_limit_event', 'auth_status'].includes(event.type)) counts.otherEvents++;
        if (event.type === 'system' && event.subtype === 'api_retry') counts.apiRetryEvents++;
        if (event.type === 'system' && event.subtype === 'thinking_tokens') {
          counts.nativeThinkingEstimateEvents++;
          if (estimate(event.estimated_tokens)) counts.nativeThinkingEstimatedTokens = event.estimated_tokens;
          if (estimate(event.estimated_tokens_delta)) counts.nativeThinkingEstimatedDeltaTokens += event.estimated_tokens_delta;
        }
      }
      const visible = counts.streamTextBytes + counts.streamToolStarts + counts.assistantTextBytes + counts.assistantToolBlocks + counts.resultTextBytes;
      const unusual = counts.malformedLines + counts.invalidValues + counts.otherEvents + counts.directApiEvents;
      if (visible && !visibleReported) { visibleReported = true; publish('first_output'); }
      if (unusual && !unusualReported) { unusualReported = true; publish('protocol_difference'); }
      if (performance.now() - started - lastReport >= 30000) { lastReport = performance.now() - started; publish('progress'); }
      return event || undefined;
    },
    finish() { if (ended) return; ended = true; publish('summary'); },
  };
}
