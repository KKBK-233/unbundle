import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { validateRequest } from './request.mjs';
import { fromAnthropic, anthropicContent, anthropicUsage, anthropicWriter } from './anthropic.mjs';
import { createTiming } from './timing.mjs';
import { scheduler } from './scheduler.mjs';
import { readRequestBody } from './request-body.mjs';
import { emptyOutputGuard, terminalNotice } from './empty-output-guard.mjs';
import { sessionQuotaGuard } from './session-quota-guard.mjs';
import { gatewayError } from './gateway-error.mjs';

const DEFAULT_MODELS = [
  { id: 'claude-code-sonnet', object: 'model', owned_by: 'velella-cloud' },
];

// 模型请求独立执行；支持子智能体并发，超过进程容量时排队。
// 入站体在排队之前就已完整解析驻留，因此队列容量必须与请求体上限一起评估：
// 单个 32MB 请求的峰值驻留约 124MB（分片、拼接缓冲、UTF-8 字符串与解析结果同时在场）。
export async function gateway({ token, port = 18796, execute, models = DEFAULT_MODELS, beforeExecute, status, maxOutputTokens = 8192, onTiming, maxConcurrent = 3, maxQueued = 8, queueTimeoutMs = 600000, bodyIdleTimeoutMs = 30000, bodyTimeoutMs = 600000, maxRequestBytes = 32 * 1024 * 1024, maxImageBytes = 5 * 1024 * 1024, maxInflightBytes = 64 * 1024 * 1024 } = {}) {
  if (!token) throw new Error('Missing gateway token');
  if (typeof execute !== 'function') throw new Error('Missing gateway executor');
  for (const value of [bodyIdleTimeoutMs, bodyTimeoutMs]) if (!Number.isSafeInteger(value) || value < 1 || value > 1800000) throw new Error('上传超时配置必须为 1..1800000 毫秒');
  for (const [value, min, max] of [[maxRequestBytes, 1024, 64 * 1024 * 1024], [maxImageBytes, 1024, 32 * 1024 * 1024], [maxInflightBytes, 1024, 512 * 1024 * 1024]]) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('请求体或单图字节上限无效');
  }
  if (maxImageBytes > maxRequestBytes) throw new Error('单图上限不能超过请求体上限');
  if (maxRequestBytes > maxInflightBytes) throw new Error('单请求上限不能超过在场字节总量上限');

  const pool = scheduler({ maxConcurrent, maxQueued, queueTimeoutMs });
  const outputGuard = emptyOutputGuard();
  const quotaGuard = sessionQuotaGuard();
  const active = new Set();
  const receiving = new Set();
  // 入站体在排队前已完整驻留，因此按字节记账而不只按请求数准入，避免大图把进程推过 cgroup 上限。
  let inflightBytes = 0;
  const server = http.createServer(async (req, res) => {
    // 原生客户端会附加 beta 查询参数；路由只匹配路径，不能将查询串当作模型错误。
    const pathname = req.url.split('?', 1)[0];
    const anthropic = pathname === '/v1/messages';
    if (process.env.GATEWAY_DIAGNOSTICS === '1') {
      console.log(req.method, req.url);
      res.on('finish', () => console.log('HTTP', res.statusCode));
    }

    // 所有 JSON 错误都带稳定诊断码；Anthropic 使用原生错误外层，成功响应不经过转换。
    const json = (statusCode, value) => {
      if (value.error) {
        const failure = gatewayError({ ...value.error, status: statusCode });
        statusCode = failure.status;
        value = { ...(anthropic ? { type: 'error' } : {}), error: failure.error };
      }
      if (!res.headersSent) res.writeHead(statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    const supplied = Buffer.from(req.headers.authorization || (req.headers['x-api-key'] ? `Bearer ${req.headers['x-api-key']}` : ''));
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      json(401, { error: { message: '中继访问令牌无效', code: 'INVALID_GATEWAY_TOKEN' } });
      return;
    }
    if (req.headers.origin) {
      json(403, { error: { message: '不允许浏览器跨域调用中继', code: 'ORIGIN_REJECTED' } });
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/models') {
      json(200, { object: 'list', data: models });
      return;
    }
    if (req.method === 'GET' && pathname === '/status' && status) {
      try { json(200, await status()); }
      catch { json(503, { error: { code: 'STATUS_UNAVAILABLE', message: '无法检查云端登录状态' } }); }
      return;
    }
    if (req.method !== 'POST' || (!anthropic && pathname !== '/v1/chat/completions')) {
      json(404, { error: { message: 'Not found', code: 'ROUTE_NOT_FOUND' } });
      return;
    }
    if (active.size >= maxConcurrent + maxQueued) {
      res.setHeader('retry-after', '2');
      json(429, { error: { message: '请求队列已满，请稍后重试', code: 'QUEUE_FULL' } });
      return;
    }

    const timing = createTiming(onTiming);
    res.setHeader('x-relay-request-id', timing.requestId);
    timing.mark('request_received');
    let outcome = 'rejected', nativeWriter;
    const controller = new AbortController();
    active.add(controller);
    receiving.add(controller);
    let heartbeat, release, reserved = 0;
    // 客户端可能先关闭请求方向、再关闭响应方向；两条路径都要及时取消上游 CLI，避免插话后旧请求继续占用资源。
    const abortFromClient = () => {
      if (!controller.signal.aborted && !res.writableEnded) { timing.mark('downstream_disconnected'); controller.abort(); }
    };
    req.on('aborted', abortFromClient);
    req.on('error', abortFromClient);
    res.on('error', abortFromClient);
    res.on('close', abortFromClient);
    try {
      const expectedBytes = req.headers['content-length'] == null ? undefined : Number(req.headers['content-length']);
      timing.upload(0, expectedBytes);
      let buffer = await readRequestBody(req, { idleMs: bodyIdleTimeoutMs, totalMs: bodyTimeoutMs,
        maxBytes: maxRequestBytes, signal: controller.signal,
        onProgress(bytes) { timing.mark('request_body_first_byte'); timing.upload(bytes, expectedBytes); },
        reserve(bytes) {
          // 超出总量时不先增加计数，已保留的字节统一由 finally 归还。
          if (inflightBytes + bytes > maxInflightBytes) {
            res.setHeader('retry-after', '2');
            throw Object.assign(new Error('同时处理的请求体总量超过上限，请稍后重试'), { status: 429, code: 'INFLIGHT_BYTES_EXCEEDED' });
          }
          inflightBytes += bytes; reserved += bytes;
        },
      });
      receiving.delete(controller);
      timing.mark('request_body_complete');
      let body;
      // 大图请求的峰值驻留由同时在场的副本数决定；拼接后立即释放分片与中间串。
      try {
        let raw = buffer.toString('utf8');
        buffer = undefined;
        body = JSON.parse(raw);
        raw = '';
      } catch { buffer = undefined; json(400, { error: { message: 'Invalid JSON', code: 'INVALID_JSON' } }); return; }
      if (anthropic) body = fromAnthropic(body);
      const outputTokens = validateRequest(body, { maxOutputTokens, maxImageBytes });
      if (!models.some(model => model.id === body.model)) {
        json(400, { error: { message: 'Unknown model', code: 'UNKNOWN_MODEL' } });
        return;
      }
      if (!Array.isArray(body.messages)) {
        json(400, { error: { message: 'messages must be an array', code: 'INVALID_REQUEST' } });
        return;
      }

      const id = `chatcmpl-${randomUUID()}`;
      const nativeId = `msg_${randomUUID().replaceAll('-', '')}`;
      const created = Math.floor(Date.now() / 1000);
      const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
      timing.mark('request_validated');
      const requestFingerprint = outputGuard.fingerprint(body, outputTokens);
      let quotaBlocked = quotaGuard.check();
      let blocked = quotaBlocked || outputGuard.check(body, requestFingerprint);
      if (!blocked) {
        timing.mark('queue_started');
        release = await pool.acquire(controller.signal);
        timing.mark('queue_ready');
        // 等待期间前一轮可能已耗尽预算，必须在认证和启动 CLI 前重新检查。
        quotaBlocked = quotaGuard.check();
        blocked = quotaBlocked || outputGuard.check(body, requestFingerprint);
        if (!blocked) {
          timing.mark('auth_started');
          await beforeExecute?.(body, controller.signal, timing);
          timing.mark('auth_ready');
          quotaBlocked = quotaGuard.check();
          blocked = quotaBlocked || outputGuard.check(body, requestFingerprint);
        }
      }
      if (controller.signal.aborted) return;

      let streamed = false, visibleText = false;
      if (body.stream) {
        if (anthropic) { nativeWriter = anthropicWriter(res, nativeId, body.model); nativeWriter.start(); }
        else {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
          chunk({ role: 'assistant' });
        }
        // Anthropic 入口发送原生 ping，长思考期间也能被客户端空闲检测识别。
        heartbeat = setInterval(() => {
          if (nativeWriter) nativeWriter.ping();
          else res.write(': heartbeat\n\n');
        }, 10000);
      }
      let quotaStopped = false;
      const emitText = text => {
        if (text?.trim()) visibleText = true;
        if (text) timing.mark('first_text');
        if (body.stream && !controller.signal.aborted && text) {
          streamed = true;
          if (nativeWriter) nativeWriter.text(text);
          else chunk({ content: text });
        }
      };
      let execution;
      try {
        execution = blocked ? terminalNotice(blocked) : await execute(body, controller.signal, emitText, timing);
      } catch (error) {
        const notice = quotaGuard.record(error);
        // 已输出正文时保留原错误，不把部分任务伪装成完整的额度提示；后续请求仍受冷却保护。
        if (!notice || visibleText) throw error;
        quotaStopped = true; execution = notice;
      }
      if (!blocked) timing.mark('execution_complete');
      const original = execution;
      execution = outputGuard.finish(requestFingerprint, execution, visibleText);
      const stoppedEmpty = execution !== original;
      if (blocked || stoppedEmpty || quotaStopped) {
        timing.mark(quotaBlocked ? 'session_quota_retry_blocked' : quotaStopped ? 'session_quota_stopped' : blocked ? 'empty_output_retry_blocked' : 'empty_output_limit_stopped');
        // 上游只发空白时流已打开，仍需显式补上网关提示；不能因 streamed=true 丢失提示。
        if (body.stream && streamed) {
          if (nativeWriter) nativeWriter.text(execution.content);
          else chunk({ content: execution.content });
        }
      } else if (execution.content) timing.mark('first_text');
      if (execution.tool_calls?.length) timing.mark('first_tool');
      if (controller.signal.aborted) return;
      // 用量放在响应顶层，避免 Harness 把统计字段写进 assistant 历史。
      const { usage, upstream_usage, usage_complete, finish_reason, stop_sequence, ...message } = execution;
      const statistics = { ...(usage ? { usage } : {}), ...(upstream_usage ? { upstream_usage, usage_complete } : {}) };

      const finish = finish_reason === 'length' ? 'length' : message.tool_calls?.length ? 'tool_calls' : 'stop';
      if (anthropic) {
        const reason = stop_sequence !== undefined ? 'stop_sequence' : finish === 'length' ? 'max_tokens' : finish === 'tool_calls' ? 'tool_use' : 'end_turn';
        if (body.stream) nativeWriter.finish(execution, reason);
        else json(200, { id: nativeId, type: 'message', role: 'assistant', model: body.model, content: anthropicContent(execution), stop_reason: reason, stop_sequence: stop_sequence ?? null, usage: anthropicUsage(execution) });
      } else if (body.stream) {
        if (message.content && !streamed) chunk({ content: message.content });
        if (message.tool_calls) chunk({ tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) });
        chunk({}, finish);
        if (body.stream_options?.include_usage && usage) res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model, choices: [], ...statistics })}\n\n`);
        res.end('data: [DONE]\n\n');
      } else {
        json(200, { id, object: 'chat.completion', created, model: body.model, choices: [{ index: 0, message, finish_reason: finish }], ...statistics });
      }
      outcome = blocked ? 'blocked' : quotaStopped ? 'session_limit' : stoppedEmpty ? 'empty_output_limit' : 'success';
      timing.mark('response_complete');
    } catch (error) {
      const bodyTimeout = ['REQUEST_BODY_IDLE_TIMEOUT', 'REQUEST_BODY_TIMEOUT'].includes(error.code);
      if (bodyTimeout) timing.mark(error.code === 'REQUEST_BODY_IDLE_TIMEOUT' ? 'request_body_idle_timeout' : 'request_body_timeout');
      if (error.code === 'REQUEST_BODY_ABORTED') timing.mark('downstream_disconnected');
      outcome = bodyTimeout || ['INFERENCE_TIMEOUT', 'INFERENCE_IDLE_TIMEOUT'].includes(error.code) ? 'timeout' : 'error';
      // 未收完的 HTTP 请求不能复用；先送出可读错误，再关连接，不等剩余正文。
      if (!req.complete && !res.headersSent && !res.destroyed) {
        res.setHeader('connection', 'close');
        // 丢弃已拒绝的后续上传；交给 Node 在响应写完后关闭，立即 destroy 会让 Windows 丢失错误正文。
        req.resume();
      }
      if (!controller.signal.aborted) {
        const failure = gatewayError(error);
        if (res.headersSent) {
          if (nativeWriter) nativeWriter.error(error);
          else { res.write(`data: ${JSON.stringify({ error: failure.error })}\n\n`); res.end(); }
        } else json(failure.status, { error: failure.error });
      }
    } finally {
      clearInterval(heartbeat);
      req.off('aborted', abortFromClient);
      req.off('error', abortFromClient);
      res.off('error', abortFromClient);
      res.off('close', abortFromClient);
      active.delete(controller);
      receiving.delete(controller);
      // 字节记账必须无条件归还，否则 413/429/断线会让在场额度永久泄漏。
      inflightBytes -= reserved; reserved = 0;
      release?.();
      timing.finish(controller.signal.aborted || outcome === 'error' && req.aborted ? 'cancelled' : outcome);
    }
  });

  // 请求体由应用按进展限时；保留 Node 的请求头保护，避免默认五分钟先返回无正文 408。
  server.requestTimeout = 0;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    get busy() { return active.size > 0; },
    get activeRequests() { return pool.running; },
    get queuedRequests() { return pool.queued; },
    get receivingRequests() { return receiving.size; },
    maxConcurrent, maxQueued, maxRequestBytes, maxImageBytes, maxInflightBytes,
    get inflightBytes() { return inflightBytes; },
    async close() {
      pool.close();
      for (const controller of active) controller.abort();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
