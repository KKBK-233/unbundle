import {toolReceipt, toolUses, messageText} from './messages.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import { once } from 'node:events';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';
import { compileContext } from './context.mjs';
import { checkCliVersion } from './cli-compat.mjs';
import { inspectUpstream } from './probe-contract.mjs';

// 仅在云端运行：官方 CLI 连接回环模拟上游，验证 Messages 与 MCP 工具往返。
if (process.platform !== 'linux') throw new Error('验收只能在云端运行，不允许启动本地 Claude');
const state = process.env.GATEWAY_STATE || '/home/harness/model-gateway';
const token = randomBytes(24).toString('hex');
const cli = process.env.CLAUDE_BIN || '/usr/local/bin/velella-claude';
await checkCliVersion(cli);
if (!process.argv.includes('--self-test')) throw new Error('仅支持 --self-test 隔离协议验收');
const smallOutput = process.argv.includes('--small-output');
const images = process.argv.includes('--images');
// 自动更新验收可以使用实际模型 ID 和缓存 TTL，仍只连接回环模拟上游。
const cacheBreakpoint = process.argv.find(arg => arg.startsWith('--cache-ttl='))?.split('=')[1] || '5m';
const upstreamModel = process.argv.find(arg => arg.startsWith('--upstream-model='))?.split('=')[1];
if (!['5m', '1h'].includes(cacheBreakpoint)) throw new Error('自定义模型和缓存验收仅允许配合 --self-test 使用');
// 1x1 PNG：只用于确认图片块是否原样到达最终上游，不含任何真实画面或元数据。
const PROBE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const outputArgument = process.argv.find(arg => arg.startsWith('--output-tokens='));
const probeOutputTokens = outputArgument ? Number(outputArgument.split('=')[1]) : smallOutput ? 1 : 1024;
if (outputArgument && (smallOutput || !Number.isInteger(probeOutputTokens) || probeOutputTokens < 1 || probeOutputTokens > 128000)) throw new Error('输出预算验收必须配合 --self-test，取值为 1..128000，且不能与 --small-output 混用');
const home = await fs.mkdtemp(path.join(state, 'probe-'));
let activeRequest, previous;
let calls = 0, service, timer;
const mock = http.createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const endpoint = new URL(req.url, 'http://localhost').pathname;
    if (endpoint === '/v1/messages/count_tokens') { res.writeHead(200, { 'content-type': 'application/json' }).end('{"input_tokens":10}'); return; }
    if (endpoint !== '/v1/messages') { res.writeHead(200, { 'content-type': 'application/json' }).end('{}'); return; }
    const body = JSON.parse(raw); calls++;
    if (upstreamModel) assert.equal(body.model, upstreamModel.replace(/\[1m\]$/, ''), '实际模型 ID 必须到达模拟上游');
    assert.equal(body.output_config?.effort, activeRequest.output_config?.effort, '桌面思考档位必须原样到达最终上游');
    assert.equal(body.max_tokens, activeRequest.max_tokens, '调用方输出上限必须传递到上游');
    if (images) {
      // 本节回答唯一无法在本地验证的问题：官方 CLI 是否把图片块原样转发给上游。
      const blocks = body.messages.flatMap(message => Array.isArray(message.content) ? message.content : []);
      const imageBlocks = blocks.filter(block => block.type === 'image');
      assert.equal(imageBlocks.length, calls === 1 ? 1 : 2, '用户附件与第二轮工具截图必须完整到达上游');
      assert.equal(imageBlocks[0].source?.type, 'base64', '图片必须以 base64 内联到达上游');
      assert.equal(imageBlocks[0].source?.media_type, 'image/png', '图片类型必须原样到达上游');
      assert.equal(imageBlocks[0].source?.data, PROBE_PNG, '图片数据必须原样到达上游');
      // base64 只能出现在图片块里：出现在文本中说明被序列化进了历史正文。
      assert.equal(raw.split(PROBE_PNG).length - 1, imageBlocks.length, '每张图片的数据仅出现一次');
      for (const image of imageBlocks) assert.equal(image.source.data, PROBE_PNG);
      if (calls === 2) assert(blocks.some(block => block.type === 'text' && block.text.includes('"type":"tool_result"') && block.text.includes('image_ref')), '工具截图必须保留工具归属');
      assert(!blocks.some(block => block.type === 'text' && block.text.includes(PROBE_PNG)), '图片数据不能进入文本块');
      assert(blocks.some(block => block.type === 'text' && block.text.includes('image_ref')), '文本块必须保留图片原位引用');
    }
    const inspection = inspectUpstream(body, activeRequest, previous);
    assert.deepEqual(inspection.report.cacheBreakpoint, { type: 'ephemeral', ttl: cacheBreakpoint }, '缓存断点必须到达上游');
    const prompt = JSON.stringify({ system: body.system, messages: body.messages });
    inspection.report.environment = { homeInPrompt: prompt.includes(home), cwdInPrompt: prompt.includes(path.join(home, 'workspace')), requestDirectoryInPrompt: /request-[A-Za-z0-9]{6}/.test(prompt), promptBytes: Buffer.byteLength(prompt) };
    assert(!inspection.report.environment.requestDirectoryInPrompt, '受控提示词不能夹带每轮随机请求目录');
    previous = inspection.snapshot;
    const tool = body.tools?.find(item => item.name === 'mcp__caller__read');
    assert(tool, '必须收到调用方工具映射');
    if (calls === 2) assert(JSON.stringify(body.messages).includes('UNBUNDLE_PROOF'));
    console.log(JSON.stringify({ request: calls, ...inspection.report }));
    const content = calls === 1
      ? [{ type: 'tool_use', id: 'toolu_probe', name: tool.name, input: { path: 'proof.txt' } }]
      : [{ type: 'text', text: 'UNBUNDLE_OK' }];
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
    process.exitCode = 1;
  }
});
mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
try {
  service = await gateway({ token, port: 0, maxOutputTokens: Math.max(8192, probeOutputTokens),
    models: [{ id: 'claude-code-sonnet', object: 'model', owned_by: 'velella-cloud' }],
    status: async () => ({ loggedIn: true, checked: true, probe: true }),
    execute: async (request, signal, onText) => {
      activeRequest = request;
      console.log(JSON.stringify({ callerContext: compileContext(request).metrics }));
      const result = await infer(request, {
        cli,
        home,
        model: upstreamModel || 'synthetic-model',
        cacheBreakpoint,
        signal,
        onText,
        timeoutMs: 30000,
        maxOutputTokens: Math.max(8192, probeOutputTokens),
        testUpstream: { baseUrl: `http://127.0.0.1:${mock.address().port}`, token: 'synthetic-only', preserveModelAliases: !!upstreamModel },
      });
      return result;
    },
  });
  timer = setTimeout(() => { process.exitCode = 1; }, 120000);
  console.log('CLOUD_PROBE_READY');
  {
    // 受控两轮复用调用方指令，通过临时 HTTP 端口验收，不占用正式服务。
    const request = { model: 'claude-code-sonnet', system: '合成验收固定指令', messages: [{ role: 'user', content: '读取 proof.txt' }], tools: [{name: 'read', description: '读取本地文件', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }}], max_tokens: probeOutputTokens };
    // 图片只放在 user 消息，与运行时支持的范围一致；两轮都携带以验证跨轮前缀稳定。
    if (images) request.messages[0] = { role: 'user', content: [{ type: 'text', text: '读取 proof.txt' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PROBE_PNG } }] };
    const invoke = async () => {
      const wire = { ...request, thinking: { type: 'adaptive' }, output_config: { effort: calls ? 'low' : 'high' } };
      const response = await fetch(`http://127.0.0.1:${service.port}/v1/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(wire), signal: AbortSignal.timeout(40000) });
      const result = await response.json();
      assert.equal(response.status, 200, JSON.stringify(result));
      return {role: result.role, content: result.content};
    };
    const first = await invoke();
    assert.equal(toolUses(first).length, 1);
    request.messages.push(first, {role:'user', content:[{type:'tool_result', tool_use_id:toolUses(first)[0].id, content:'UNBUNDLE_PROOF'}]});
    if (images) toolReceipt(request.messages.at(-1)).content = [{ type: 'text', text: 'UNBUNDLE_PROOF' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PROBE_PNG } }];
    assert.equal(messageText(await invoke()), 'UNBUNDLE_OK');
  }
  assert.equal(calls, 2);
  console.log('PASS: cloud CLI protocol and stable prompt prefix (synthetic tool result)');
} finally {
  clearTimeout(timer);
  await service?.close(); mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  // 只清理 mkdtemp 创建且仍位于验收目录内的临时状态。
  if (path.dirname(home) === state && path.basename(home).startsWith('probe-')) await fs.rm(home, { recursive: true, force: true });
}
