import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';
import { compileContext } from './context.mjs';

// 仅在云端运行：真实 Claude 连接回环模拟上游，经 STCP 让真实 OMP 执行读取。
if (process.platform !== 'linux') throw new Error('验收只能在云端运行，不允许启动本地 Claude');
const state = process.env.GATEWAY_STATE || '/home/harness/model-gateway';
const home = await fs.mkdtemp(path.join(state, 'probe-'));
const token = (await fs.readFile(path.join(state, 'token'), 'utf8')).trim();
const cli = process.env.CLAUDE_BIN || '/usr/local/bin/velella-claude';
let calls = 0, service, timer;
let finish;
const finished = new Promise(resolve => { finish = resolve; });
const mock = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    if (!req.url.startsWith('/v1/messages')) { res.writeHead(200, { 'content-type': 'application/json' }).end('{}'); return; }
    const body = JSON.parse(raw); calls++;
    const tool = body.tools?.find(item => item.name.endsWith('tool_0'));
    assert(tool, '必须收到调用方工具映射');
    assert(!body.tools.some(item => ['Bash', 'Read', 'Write', 'Edit'].includes(item.name)), '不能夹带云端文件工具');
    if (calls === 2) assert(JSON.stringify(body.messages).includes('OMP_CLOUD_FRP_PROOF'));
    console.log(JSON.stringify({ request: calls, upstreamTools: body.tools.map(tool => tool.name), systemBytes: Buffer.byteLength(JSON.stringify(body.system)), historyBytes: Buffer.byteLength(JSON.stringify(body.messages)) }));
    const content = calls === 1
      ? [{ type: 'tool_use', id: 'toolu_probe', name: tool.name, input: { path: 'proof.txt' } }]
      : [{ type: 'text', text: 'CLOUD_OMP_FRP_OK' }];
    const message = { id: 'msg_probe', type: 'message', role: 'assistant', model: body.model, content, stop_reason: calls === 1 ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
    if (!body.stream) { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(message)); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    send('message_start', { message: { ...message, content: [], stop_reason: null } });
    const block = content[0];
    send('content_block_start', { index: 0, content_block: block.type === 'tool_use' ? { ...block, input: {} } : { type: 'text', text: '' } });
    send('content_block_delta', { index: 0, delta: block.type === 'tool_use' ? { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } : { type: 'text_delta', text: block.text } });
    send('content_block_stop', { index: 0 });
    send('message_delta', { delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 10 } });
    send('message_stop', {}); res.end();
  } catch (error) { console.error(error.message); res.destroy(); process.exitCode = 1; finish(); }
});
mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
try {
  service = await gateway({ token, port: 18796,
    models: [{ id: 'claude-code-sonnet', object: 'model', owned_by: 'velella-cloud' }],
    status: async () => ({ loggedIn: true, checked: true, probe: true }),
    execute: async (request, signal, onText) => {
      console.log(JSON.stringify({ callerContext: compileContext(request).metrics }));
      const result = await infer(request, {
        cli,
        home,
        model: 'synthetic-model',
        signal,
        onText,
        timeoutMs: 30000,
        testUpstream: { baseUrl: `http://127.0.0.1:${mock.address().port}`, token: 'synthetic-only' },
      });
      if (result.content === 'CLOUD_OMP_FRP_OK') setTimeout(finish, 5000);
      return result;
    },
  });
  timer = setTimeout(() => { process.exitCode = 1; finish(); }, 120000);
  console.log('CLOUD_PROBE_READY');
  await finished;
  assert.equal(calls, 2);
  console.log('PASS: cloud Claude, no cloud file tools, returned local tool result');
} finally {
  clearTimeout(timer);
  await service?.close(); mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  // 只清理 mkdtemp 创建且仍位于验收目录内的临时状态。
  if (path.dirname(home) === state && path.basename(home).startsWith('probe-')) await fs.rm(home, { recursive: true, force: true });
}
