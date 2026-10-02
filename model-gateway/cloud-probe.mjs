import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';
import { compileContext } from './context.mjs';
import { checkCliVersion } from './cli-compat.mjs';
import { inspectUpstream } from './probe-contract.mjs';

// 仅在云端运行：真实 Claude 连接回环模拟上游，经 STCP 让真实 OMP 执行读取。
if (process.platform !== 'linux') throw new Error('验收只能在云端运行，不允许启动本地 Claude');
const state = process.env.GATEWAY_STATE || '/home/harness/model-gateway';
const token = (await fs.readFile(path.join(state, 'token'), 'utf8')).trim();
const cli = process.env.CLAUDE_BIN || '/usr/local/bin/velella-claude';
await checkCliVersion(cli);
const selfTest = process.argv.includes('--self-test');
const instructionUpdates = process.argv.includes('--instruction-updates');
if (instructionUpdates && !selfTest) throw new Error('动态指令验收仅允许配合 --self-test 使用');
const smallOutput = process.argv.includes('--small-output');
if (smallOutput && !selfTest) throw new Error('小输出上限验收仅允许配合 --self-test 使用');
const outputArgument = process.argv.find(arg => arg.startsWith('--output-tokens='));
const probeOutputTokens = outputArgument ? Number(outputArgument.split('=')[1]) : smallOutput ? 1 : 1024;
if (outputArgument && (!selfTest || smallOutput || !Number.isInteger(probeOutputTokens) || probeOutputTokens < 1 || probeOutputTokens > 128000)) throw new Error('输出预算验收必须配合 --self-test，取值为 1..128000，且不能与 --small-output 混用');
const home = await fs.mkdtemp(path.join(state, 'probe-'));
let activeRequest, previous;
let calls = 0, service, timer;
let finish;
const finished = new Promise(resolve => { finish = resolve; });
const mock = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const endpoint = new URL(req.url, 'http://localhost').pathname;
    if (endpoint === '/v1/messages/count_tokens') { res.writeHead(200, { 'content-type': 'application/json' }).end('{"input_tokens":10}'); return; }
    if (endpoint !== '/v1/messages') { res.writeHead(200, { 'content-type': 'application/json' }).end('{}'); return; }
    const body = JSON.parse(raw); calls++;
    if (instructionUpdates) {
      const systemText = typeof body.system === 'string' ? body.system : body.system.filter(block => block.type === 'text').map(block => block.text).join('\n');
      assert(systemText.includes('SYNTHETIC_MID_SYSTEM') && systemText.includes('SYNTHETIC_MID_DEVELOPER'), '动态指令正文必须到达上游系统提示');
      const textBlocks = body.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'text');
      for (const [index, role] of [[2, 'system'], [3, 'developer']]) assert(textBlocks.some(block => block.text === JSON.stringify({ instruction_ref: `message_${index}`, role })), '上游必须保留动态指令原位引用');
      assert(!textBlocks.some(block => /SYNTHETIC_MID_(SYSTEM|DEVELOPER)/.test(block.text)), '历史不能重复指令正文');
    }
    assert.equal(body.max_tokens, activeRequest.max_completion_tokens ?? activeRequest.max_tokens ?? 8192, '调用方输出上限必须传递到上游');
    const inspection = inspectUpstream(body, activeRequest, selfTest ? previous : undefined);
    assert.deepEqual(inspection.report.cacheBreakpoint, { type: 'ephemeral', ttl: '5m' }, '缓存断点必须到达上游');
    const prompt = JSON.stringify({ system: body.system, messages: body.messages });
    inspection.report.environment = { homeInPrompt: prompt.includes(home), cwdInPrompt: prompt.includes(path.join(home, 'workspace')), requestDirectoryInPrompt: /request-[A-Za-z0-9]{6}/.test(prompt), promptBytes: Buffer.byteLength(prompt) };
    if (selfTest) assert(!inspection.report.environment.requestDirectoryInPrompt, '受控提示词不能夹带每轮随机请求目录');
    previous = inspection.snapshot;
    const tool = body.tools?.find(item => item.name === 'mcp__omp__read');
    assert(tool, '必须收到调用方工具映射');
    if (calls === 2) assert(JSON.stringify(body.messages).includes('OMP_CLOUD_FRP_PROOF'));
    console.log(JSON.stringify({ request: calls, ...inspection.report }));
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
  } catch (error) {
    console.error(error.message);
    res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: '合成上游契约校验失败' } }));
    process.exitCode = 1; finish();
  }
});
mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
try {
  service = await gateway({ token, port: selfTest ? 0 : 18796, maxOutputTokens: Math.max(8192, probeOutputTokens),
    models: [{ id: 'claude-code-sonnet', object: 'model', owned_by: 'velella-cloud' }],
    status: async () => ({ loggedIn: true, checked: true, probe: true }),
    execute: async (request, signal, onText) => {
      activeRequest = request;
      console.log(JSON.stringify({ callerContext: compileContext(request).metrics }));
      const result = await infer(request, {
        cli,
        home,
        model: 'synthetic-model',
        signal,
        onText,
        timeoutMs: 30000,
        maxOutputTokens: Math.max(8192, probeOutputTokens),
        testUpstream: { baseUrl: `http://127.0.0.1:${mock.address().port}`, token: 'synthetic-only' },
      });
      if (result.content === 'CLOUD_OMP_FRP_OK' && !selfTest) setTimeout(finish, 5000);
      return result;
    },
  });
  timer = setTimeout(() => { process.exitCode = 1; finish(); }, 120000);
  console.log('CLOUD_PROBE_READY');
  if (selfTest) {
    // 受控两轮复用调用方指令，通过临时 HTTP 端口验收，不占用正式服务。
    const request = { model: 'claude-code-sonnet', messages: [{ role: 'system', content: '合成验收固定指令' }, { role: 'user', content: '读取 proof.txt' }], tools: [{ type: 'function', function: { name: 'read', description: '读取本地文件', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }], max_tokens: probeOutputTokens };
    if (instructionUpdates) request.messages.push({ role: 'system', content: 'SYNTHETIC_MID_SYSTEM' }, { role: 'developer', content: 'SYNTHETIC_MID_DEVELOPER' });
    const invoke = async () => {
      const response = await fetch(`http://127.0.0.1:${service.port}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(40000) });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return result.choices[0].message;
    };
    const first = await invoke();
    assert.equal(first.tool_calls?.length, 1);
    request.messages.push(first, { role: 'tool', tool_call_id: first.tool_calls[0].id, content: 'OMP_CLOUD_FRP_PROOF' });
    assert.equal((await invoke()).content, 'CLOUD_OMP_FRP_OK');
  } else await finished;
  assert.equal(calls, 2);
  console.log(selfTest ? 'PASS: cloud CLI protocol and stable prompt prefix (synthetic tool result)' : 'PASS: cloud Claude, exact caller tools, returned local tool result');
} finally {
  clearTimeout(timer);
  await service?.close(); mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  // 只清理 mkdtemp 创建且仍位于验收目录内的临时状态。
  if (path.dirname(home) === state && path.basename(home).startsWith('probe-')) await fs.rm(home, { recursive: true, force: true });
}
