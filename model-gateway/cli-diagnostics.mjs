import { performance } from 'node:perf_hooks';
import { toolDiagnostics } from './tool-diagnostics.mjs';

const stops = new Set(['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal', 'model_context_window_exceeded']);
const lifecycle = new Set(['refusal_continuation', 'refusal_no_fallback', 'fallback_request', 'server_fallback', 'query_model_change', 'streaming_fallback_began', 'tombstone']);
const systemEvents = new Set(['api_retry', 'model_refusal_fallback', 'refusal_retry', 'refusal_continuation', 'query_model_change']);
const id = value => typeof value === 'string' && /^(?:msg_|req_|chatcmpl-)[A-Za-z0-9_-]{1,120}$|^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) ? value : undefined;
const model = value => typeof value === 'string' && /^(?:claude[-/]|opus|sonnet|haiku)[A-Za-z0-9._:/-]{0,100}$/.test(value) ? value : undefined;
const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) ? value : undefined;
const label = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : undefined;
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
const defined = value => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
const enumValue = (value, values) => values.includes(value) ? value : undefined;

// 原因说明是上游诊断字段，不读取正文；限长并移除常见凭据、URL、控制字符及长编码串。
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

// 独立观察 CLI 原始事件；不改变回复、会话状态或重试，只保留诊断白名单。
export function cliDiagnostics({ requestId, sink, maxRecords = 256, maxPriorityRecords = 64 } = {}) {
  const started = performance.now(), messages = new Map();
  const counts = { messageStartEvents: 0, uniqueMessageIds: 0, missingMessageIds: 0, duplicateStarts: 0,
    refusalEvents: 0, apiRetries: 0, continuationEvents: 0, droppedRecords: 0, messageTrackingOverflow: 0 };
  let current, messageOrdinal = 0, sequence = 0, normal = 0, priority = 0, ended = false, observed = false;
  const write = (event, fields = {}, important = false, force = false) => {
    if (!force && (important ? priority >= maxPriorityRecords : normal >= maxRecords)) { counts.droppedRecords++; return; }
    if (important) priority++; else normal++;
    try { sink?.({ type: 'gateway_cli_event', requestId, sequence: ++sequence,
      elapsedMs: Math.round(performance.now() - started), event, ...defined(fields) }); } catch {}
  };
  const tools = toolDiagnostics(write);
  const message = (messageId, start = false) => {
    const key = id(messageId);
    let state = key && messages.get(key);
    if (!state) {
      state = { messageId: key, ordinal: ++messageOrdinal, starts: 0, streamTextBytes: 0, toolBlocks: 0 };
      if (key && messages.size < 256) { messages.set(key, state); counts.uniqueMessageIds++; }
      else if (key) counts.messageTrackingOverflow++;
      else counts.missingMessageIds++;
    }
    if (start) { if (state.starts++) counts.duplicateStarts++; }
    return state;
  };
  const details = (raw, fallback = {}) => {
    const category = raw && Object.hasOwn(raw, 'category') ? raw.category : fallback.apiRefusalCategory;
    const explanation = raw && Object.hasOwn(raw, 'explanation') ? raw.explanation : fallback.apiRefusalExplanation;
    return defined({ detailsPresent: raw != null || Object.hasOwn(fallback, 'apiRefusalCategory') || Object.hasOwn(fallback, 'apiRefusalExplanation'),
      category: category === null ? null : category === undefined ? undefined : label(category) || 'unknown',
      explanation: explanation === null ? null : refusalExplanation(explanation),
      explanationTruncated: typeof explanation === 'string' ? explanation.length > 512 : undefined });
  };
  const fallbackBlock = block => {
    if (block?.type !== 'fallback') return;
    write('fallback_block', { originalModel: model(block.from?.model), model: model(block.to?.model),
      trigger: enumValue(block.trigger?.type, ['refusal']),
      category: block.trigger?.category === null ? null : label(block.trigger?.category) }, true);
  };
  const upstreamRequestId = e => id(e.request_id) || id(e.requestId) || id(e._request_id);
  const boundary = (e, msg, source, state) => {
    const rawReason = msg?.stop_reason;
    if (typeof rawReason !== 'string' || !rawReason) return;
    const refused = rawReason === 'refusal';
    if (refused) counts.refusalEvents++;
    write('message_end', { source, messageId: state?.messageId, ordinal: state?.ordinal,
      upstreamRequestId: upstreamRequestId(e), model: model(msg.model),
      stopReason: stops.has(rawReason) ? rawReason : 'unknown',
      isApiError: e.is_api_error_message === true || e.isApiErrorMessage === true,
      streamTextBytes: state?.streamTextBytes, toolBlocks: state?.toolBlocks,
      ...details(msg.stop_details, e) }, refused);
  };
  return {
    toolCall(call) { if (!ended) { observed = true; tools.call(call); } },
    toolHandoff(calls) { if (!ended) { observed = true; tools.handoff(calls); } },
    context(value) {
      if (ended) return;
      observed = true;
      write('context', { cliVersion: version(value?.cliVersion), model: model(value?.model) });
    },
    accept(e) {
      if (ended || !e || typeof e !== 'object' || Array.isArray(e)) return;
      observed = true;
      tools.result(e);
      const inner = e.type === 'stream_event' ? e.event : e;
      const source = e.type === 'stream_event' ? 'stream' : 'direct';
      if (inner?.type === 'message_start') {
        counts.messageStartEvents++;
        current = message(inner.message?.id, true);
        write('message_start', { source, messageId: current.messageId, ordinal: current.ordinal,
          duplicateStart: current.starts > 1, model: model(inner.message?.model), upstreamRequestId: upstreamRequestId(e) });
      } else if (inner?.type === 'content_block_start') {
        fallbackBlock(inner.content_block);
        if (current && inner.content_block?.type === 'tool_use') current.toolBlocks++;
        if (current && inner.content_block?.type === 'text' && typeof inner.content_block.text === 'string') current.streamTextBytes += Buffer.byteLength(inner.content_block.text);
      } else if (inner?.type === 'content_block_delta') {
        if (current && inner.delta?.type === 'text_delta' && typeof inner.delta.text === 'string') current.streamTextBytes += Buffer.byteLength(inner.delta.text);
      } else if (inner?.type === 'message_delta') {
        boundary(e, inner.delta, source, current);
      } else if (inner?.type === 'message_stop') {
        write('message_stop', { source, messageId: current?.messageId, ordinal: current?.ordinal });
      } else if (e.type === 'assistant') {
        const state = message(e.message?.id);
        for (const block of Array.isArray(e.message?.content) ? e.message.content : []) fallbackBlock(block);
        boundary(e, e.message, 'assistant', state);
        // 错误占位即使没有结束原因也留事件，绝不复制错误正文或完整 message。
        if (!e.message?.stop_reason && (e.is_api_error_message || e.isApiErrorMessage)) {
          write('assistant_error', { messageId: state.messageId, upstreamRequestId: upstreamRequestId(e),
            errorCode: label(e.error), ...details(e.message?.stop_details, e) }, true);
        }
      } else if (e.type === 'result') {
        write('result', { isError: e.is_error === true,
          subtype: enumValue(e.subtype, ['success', 'error_during_execution', 'error_max_turns', 'error_max_budget_usd', 'error_max_structured_output_retries']),
          numTurns: integer(e.num_turns), upstreamRequestId: upstreamRequestId(e) }, e.is_error === true);
      } else if (lifecycle.has(e.type) || e.type === 'system' && systemEvents.has(e.subtype)) {
        const kind = e.type === 'system' ? e.subtype : e.type;
        if (kind === 'api_retry') counts.apiRetries++;
        if (['refusal_continuation', 'refusal_retry', 'model_refusal_fallback'].includes(kind)) counts.continuationEvents++;
        write(kind, { source: e.type === 'system' ? 'system' : 'cli', upstreamRequestId: upstreamRequestId(e),
          messageId: id(e.message?.message?.id) || id(e.message?.id),
          originalModel: model(e.originalModel ?? e.fromModel), model: model(e.toModel ?? e.fallbackModel),
          phase: enumValue(e.phase, ['begin', 'end']), direction: enumValue(e.direction, ['retry', 'restore']),
          trigger: enumValue(e.trigger ?? e.reason, ['refusal', 'sticky', 'no_events', 'stream_truncated']),
          scope: enumValue(e.scope, ['session', 'local']), attempt: integer(e.attempt),
          status: integer(e.status ?? e.status_code ?? e.statusCode ?? e.error?.status),
          ...details(e.stop_details, e) }, kind !== 'api_retry');
      } else if (e.type === 'system' && e.subtype === 'informational'
        && typeof e.content === 'string' && /^[^\r\n]{1,100}'s safeguards stopped the response above [·\u00b7] continuing once with that noted$/.test(e.content)) {
        counts.continuationEvents++;
        write('refusal_notice', { kind: 'continue_once' }, true);
      } else if (e.type === 'user' && (e.isMeta === true || e.is_meta === true || id(e.refusedMessageId))) {
        write('meta_message', { refusedMessageId: id(e.refusedMessageId), turnCompanion: e.turnCompanion === true }, true);
      }
    },
    finish(outcome) {
      if (ended) return;
      ended = true;
      if (observed) write('summary', { outcome, ...counts, ...tools.summary() }, false, true);
    },
  };
}
