import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { infer } from './engine.mjs';
import { EFFORTS } from './effort.mjs';
import { checkCliVersion } from './cli-compat.mjs';

// 云端真实 CLI 只连接回环模拟上游，保留模型别名解析，不读取正式 OAuth。
if (process.platform !== 'linux') throw new Error('仅在云端执行思考强度验收');
const cli = process.env.CLAUDE_BIN || '/usr/local/bin/velella-claude';
await checkCliVersion(cli);
const state = process.env.GATEWAY_STATE || '/home/harness/model-gateway';
const home = await fs.mkdtemp(path.join(state, 'effort-probe-'));
let expected, received, failure;
const mock = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const endpoint = new URL(req.url, 'http://localhost').pathname;
    if (endpoint === '/v1/messages/count_tokens') { res.writeHead(200).end('{"input_tokens":10}'); return; }
    if (endpoint !== '/v1/messages') { res.writeHead(200).end('{}'); return; }
    const body = JSON.parse(raw);
    received++;
    assert.equal(body.output_config?.effort, expected.effort, '实际上游思考强度必须与选择一致');
    assert(body.model.includes(expected.model), 'CLI 别名必须仍属于所选模型');
    console.log(JSON.stringify({ model: body.model, effort: body.output_config.effort, thinkingType: body.thinking?.type }));
    const message = { id: 'msg_effort', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    send('message_start', { message });
    send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'EFFORT_OK' } });
    send('content_block_stop', { index: 0 });
    send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } });
    send('message_stop', {}); res.end();
  } catch (error) {
    failure = error;
    res.writeHead(400, { 'content-type': 'application/json' }).end('{"type":"error","error":{"type":"invalid_request_error","message":"effort mismatch"}}');
  }
});
try {
  mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
  for (const model of ['sonnet', 'opus']) for (const effort of EFFORTS) {
    expected = { model, effort }; received = 0; failure = undefined;
    const result = await infer({ model: `claude-code-${model}`, reasoning_effort: effort, messages: [{ role: 'user', content: '合成强度验收' }] }, { cli, home, model, timeoutMs: 20000,
      testUpstream: { baseUrl: `http://127.0.0.1:${mock.address().port}`, token: 'synthetic-only', preserveModelAliases: true } });
    if (failure) throw failure;
    assert.equal(received, 1); assert.equal(result.content, 'EFFORT_OK');
    assert.equal(result.reasoning_content, undefined);
  }
  console.log('PASS: ten model/effort combinations reached mock upstream');
} finally {
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  if (path.dirname(home) === state && path.basename(home).startsWith('effort-probe-')) await fs.rm(home, { recursive: true, force: true });
}
