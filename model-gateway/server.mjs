import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { validateRequest } from './request.mjs';
import { fromAnthropic, anthropicContent, anthropicUsage, anthropicWriter } from './anthropic.mjs';
import { createTiming } from './timing.mjs';

const DEFAULT_MODELS = [
  { id: 'claude-code-sonnet', object: 'model', owned_by: 'velella-cloud' },
];

// 提供最小 OpenAI Chat Completions 兼容层，并串行化单个 Claude Code 会话。
export async function gateway({ token, port = 18796, execute, models = DEFAULT_MODELS, beforeExecute, status, maxOutputTokens = 8192, onTiming } = {}) {
  if (!token) throw new Error('Missing gateway token');
  if (typeof execute !== 'function') throw new Error('Missing gateway executor');

  let busy = false;
  const active = new Set();
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
    if (busy) {
      json(429, { error: { message: '模型入口当前只允许一个请求，请等待上一轮结束。' } });
      return;
    }

    busy = true;
    const timing = createTiming(onTiming);
    res.setHeader('x-relay-request-id', timing.requestId);
    timing.mark('request_received');
    let outcome = 'rejected', nativeWriter;
    const controller = new AbortController();
    active.add(controller);
    let heartbeat;
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const parts = []; let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) {
          json(413, { error: { message: 'Request too large' } });
          return;
        }
        parts.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(parts).toString('utf8')); }
      catch { json(400, { error: { message: 'Invalid JSON' } }); return; }
      if (anthropic) body = fromAnthropic(body);
      validateRequest(body, { maxOutputTokens });
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
      const { usage, upstream_usage, usage_complete, finish_reason, ...message } = execution;
      const statistics = { ...(usage ? { usage } : {}), ...(upstream_usage ? { upstream_usage, usage_complete } : {}) };

      const finish = finish_reason === 'length' ? 'length' : message.tool_calls?.length ? 'tool_calls' : 'stop';
      if (anthropic) {
        const reason = finish === 'length' ? 'max_tokens' : finish === 'tool_calls' ? 'tool_use' : 'end_turn';
        if (body.stream) nativeWriter.finish(execution, reason);
        else json(200, { id: nativeId, type: 'message', role: 'assistant', model: body.model, content: anthropicContent(execution), stop_reason: reason, stop_sequence: null, usage: anthropicUsage(execution) });
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
      busy = false;
      timing.finish(controller.signal.aborted ? 'cancelled' : outcome);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    get busy() { return busy; },
    async close() {
      for (const controller of active) controller.abort();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
