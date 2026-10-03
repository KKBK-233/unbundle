import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { validateRequest } from './request.mjs';
import { fromAnthropic, anthropicContent, anthropicUsage, anthropicWriter } from './anthropic.mjs';
import { createTiming } from './timing.mjs';
import { scheduler } from './scheduler.mjs';

const DEFAULT_MODELS = [
  { id: 'claude-code-sonnet', object: 'model', owned_by: 'velella-cloud' },
];

// 模型请求独立执行；支持子智能体并发，超过进程容量时排队。
// 入站体在排队之前就已完整解析驻留，因此队列容量必须与请求体上限一起评估：
// 单个 32MB 请求的峰值驻留约 124MB（分片、拼接缓冲、UTF-8 字符串与解析结果同时在场）。
export async function gateway({ token, port = 18796, execute, models = DEFAULT_MODELS, beforeExecute, status, maxOutputTokens = 8192, onTiming, maxConcurrent = 3, maxQueued = 8, queueTimeoutMs = 600000, maxRequestBytes = 32 * 1024 * 1024, maxImageBytes = 5 * 1024 * 1024, maxInflightBytes = 64 * 1024 * 1024 } = {}) {
  if (!token) throw new Error('Missing gateway token');
  if (typeof execute !== 'function') throw new Error('Missing gateway executor');
  for (const [value, min, max] of [[maxRequestBytes, 1024, 64 * 1024 * 1024], [maxImageBytes, 1024, 32 * 1024 * 1024], [maxInflightBytes, 1024, 512 * 1024 * 1024]]) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('请求体或单图字节上限无效');
  }
  if (maxImageBytes > maxRequestBytes) throw new Error('单图上限不能超过请求体上限');
  if (maxRequestBytes > maxInflightBytes) throw new Error('单请求上限不能超过在场字节总量上限');

  const pool = scheduler({ maxConcurrent, maxQueued, queueTimeoutMs });
  const active = new Set();
  // 入站体在排队前已完整驻留，因此按字节记账而不只按请求数准入，避免大图把进程推过 cgroup 上限。
  let inflightBytes = 0;
  const server = http.createServer(async (req, res) => {
    // 原生客户端会附加 beta 查询参数；路由只匹配路径，不能将查询串当作模型错误。
    const pathname = req.url.split('?', 1)[0];
    if (process.env.GATEWAY_DIAGNOSTICS === '1') {
      console.log(req.method, req.url);
      res.on('finish', () => console.log('HTTP', res.statusCode));
    }

    const supplied = Buffer.from(req.headers.authorization || (req.headers['x-api-key'] ? `Bearer ${req.headers['x-api-key']}` : ''));
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.writeHead(401).end();
      return;
    }
    if (req.headers.origin) {
      res.writeHead(403).end();
      return;
    }

    const json = (statusCode, value) => {
      if (!res.headersSent) res.writeHead(statusCode, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.method === 'GET' && pathname === '/v1/models') {
      json(200, { object: 'list', data: models });
      return;
    }
    if (req.method === 'GET' && pathname === '/status' && status) {
      try { json(200, await status()); }
      catch { json(503, { error: { code: 'STATUS_UNAVAILABLE', message: '无法检查云端登录状态' } }); }
      return;
    }
    const anthropic = pathname === '/v1/messages';
    if (req.method !== 'POST' || (!anthropic && pathname !== '/v1/chat/completions')) {
      json(404, { error: { message: 'Not found' } });
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
    let heartbeat, release, reserved = 0;
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const parts = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > maxRequestBytes) {
          json(413, { error: { message: `请求体超过上限 ${Math.round(maxRequestBytes / 1024 / 1024)}MB`, code: 'REQUEST_TOO_LARGE' } });
          return;
        }
        // 边读边记账：大图并发时按总字节而不是请求数拒绝，避免进程被 cgroup 终止。
        inflightBytes += chunk.length; reserved += chunk.length;
        if (inflightBytes > maxInflightBytes) {
          res.setHeader('retry-after', '2');
          json(429, { error: { message: `同时处理的请求体总量超过 ${Math.round(maxInflightBytes / 1024 / 1024)}MB，请稍后重试`, code: 'INFLIGHT_BYTES_EXCEEDED' } });
          return;
        }
        parts.push(chunk);
      }
      let body;
      // 大图请求的峰值驻留由同时在场的副本数决定；拼接后立即释放分片与中间串。
      try {
        let raw = Buffer.concat(parts).toString('utf8');
        parts.length = 0;
        body = JSON.parse(raw);
        raw = '';
      } catch { parts.length = 0; json(400, { error: { message: 'Invalid JSON' } }); return; }
      if (anthropic) body = fromAnthropic(body);
      validateRequest(body, { maxOutputTokens, maxImageBytes });
      if (!models.some(model => model.id === body.model)) {
        json(400, { error: { message: 'Unknown model' } });
        return;
      }
      if (!Array.isArray(body.messages)) {
        json(400, { error: { message: 'messages must be an array' } });
        return;
      }

      const id = `chatcmpl-${randomUUID()}`;
      const nativeId = `msg_${randomUUID().replaceAll('-', '')}`;
      const created = Math.floor(Date.now() / 1000);
      const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
      timing.mark('request_validated');
      timing.mark('queue_started');
      release = await pool.acquire(controller.signal);
      timing.mark('queue_ready');
      timing.mark('auth_started');
      await beforeExecute?.(body, controller.signal, timing);
      timing.mark('auth_ready');
      if (controller.signal.aborted) return;

      let streamed = false;
      if (body.stream) {
        if (anthropic) { nativeWriter = anthropicWriter(res, nativeId, body.model); nativeWriter.start(); }
        else {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
          chunk({ role: 'assistant' });
        }
        heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 10000);
      }
      const execution = await execute(body, controller.signal, text => {
        if (text) timing.mark('first_text');
        if (body.stream && !controller.signal.aborted && text) {
          streamed = true;
          if (nativeWriter) nativeWriter.text(text);
          else chunk({ content: text });
        }
      }, timing);
      timing.mark('execution_complete');
      if (execution.content) timing.mark('first_text');
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
      outcome = 'success';
      timing.mark('response_complete');
    } catch (error) {
      outcome = ['INFERENCE_TIMEOUT', 'INFERENCE_IDLE_TIMEOUT'].includes(error.code) ? 'timeout' : 'error';
      if (!controller.signal.aborted) {
        const failure = { error: { message: error.message, type: 'gateway_error', code: error.code || 'GATEWAY_ERROR' } };
        if (res.headersSent) {
          if (nativeWriter) nativeWriter.error(error);
          else { res.write(`data: ${JSON.stringify(failure)}\n\n`); res.end(); }
        } else json(error.status || 502, failure);
      }
    } finally {
      clearInterval(heartbeat);
      active.delete(controller);
      // 字节记账必须无条件归还，否则 413/429/断线会让在场额度永久泄漏。
      inflightBytes -= reserved; reserved = 0;
      release?.();
      timing.finish(controller.signal.aborted ? 'cancelled' : outcome);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    get busy() { return active.size > 0; },
    get activeRequests() { return pool.running; },
    get queuedRequests() { return pool.queued; },
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
