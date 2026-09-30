import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const DEFAULT_MODELS = [
  { id: 'claude-code-sonnet', object: 'model', owned_by: 'velella-cloud' },
];

// 提供最小 OpenAI Chat Completions 兼容层，并串行化单个 Claude Code 会话。
export async function gateway({ token, port = 18796, execute, models = DEFAULT_MODELS, beforeExecute, status } = {}) {
  if (!token) throw new Error('Missing gateway token');
  if (typeof execute !== 'function') throw new Error('Missing gateway executor');

  let busy = false;
  const active = new Set();
  const server = http.createServer(async (req, res) => {
    if (process.env.GATEWAY_DIAGNOSTICS === '1') {
      console.log(req.method, req.url);
      res.on('finish', () => console.log('HTTP', res.statusCode));
    }

    const supplied = Buffer.from(req.headers.authorization || '');
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
    if (req.method === 'GET' && req.url === '/v1/models') {
      json(200, { object: 'list', data: models });
      return;
    }
    if (req.method === 'GET' && req.url === '/status' && status) {
      try { json(200, await status()); }
      catch { json(503, { error: { code: 'STATUS_UNAVAILABLE', message: '无法检查云端登录状态' } }); }
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
      json(404, { error: { message: 'Not found' } });
      return;
    }
    if (busy) {
      json(429, { error: { message: '模型入口当前只允许一个请求，请等待上一轮结束。' } });
      return;
    }

    busy = true;
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
      if (!models.some(model => model.id === body.model)) {
        json(400, { error: { message: 'Unknown model' } });
        return;
      }
      if (!Array.isArray(body.messages)) {
        json(400, { error: { message: 'messages must be an array' } });
        return;
      }

      const id = `chatcmpl-${randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);
      const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
      await beforeExecute?.(body, controller.signal);
      if (controller.signal.aborted) return;

      let streamed = false;
      if (body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        chunk({ role: 'assistant' });
        heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 10000);
      }
      const execution = await execute(body, controller.signal, text => {
        if (body.stream && !controller.signal.aborted && text) {
          streamed = true;
          chunk({ content: text });
        }
      });
      if (controller.signal.aborted) return;
      // 用量放在响应顶层，避免 Harness 把统计字段写进 assistant 历史。
      const { usage, upstream_usage, usage_complete, ...message } = execution;
      const statistics = { ...(usage ? { usage } : {}), ...(upstream_usage ? { upstream_usage, usage_complete } : {}) };

      const finish = message.tool_calls?.length ? 'tool_calls' : 'stop';
      if (body.stream) {
        if (message.content && !streamed) chunk({ content: message.content });
        if (message.tool_calls) chunk({ tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) });
        chunk({}, finish);
        if (body.stream_options?.include_usage && usage) res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: body.model, choices: [], ...statistics })}\n\n`);
        res.end('data: [DONE]\n\n');
      } else {
        json(200, { id, object: 'chat.completion', created, model: body.model, choices: [{ index: 0, message, finish_reason: finish }], ...statistics });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const failure = { error: { message: error.message, type: 'gateway_error', code: error.code || 'GATEWAY_ERROR' } };
        if (res.headersSent) {
          res.write(`data: ${JSON.stringify(failure)}\n\n`);
          res.end();
        } else json(error.status || 502, failure);
      }
    } finally {
      clearInterval(heartbeat);
      active.delete(controller);
      busy = false;
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    async close() {
      for (const controller of active) controller.abort();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
  };
}
