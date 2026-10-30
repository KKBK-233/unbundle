import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fromAnthropic, anthropicWriter } from './anthropic.mjs';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';
import { EFFORTS } from './effort.mjs';
import { compileContext } from './context.mjs';
import { validateRequest } from './request.mjs';

const body = { model: 'claude-code-opus', system: [{ type: 'text', text: 'CALLER_RULE' }], max_tokens: 1024,
  messages: [{ role: 'user', content: '合成请求' }], thinking: { type: 'adaptive' }, output_config: { effort: 'high' } };
const headers = { 'x-api-key': 'test', 'content-type': 'application/json' };

test('原生入口移除前端旋转标记，正文内引用和系统规则原样保留', () => {
  const compile = marker => compileContext(fromAnthropic({ ...body, system: [
    { type: 'text', text: `x-anthropic-billing-header: cc_version=synthetic; cch=${marker};\n` },
    { type: 'text', text: '固定规则\nx-anthropic-billing-header: this is a quoted example' },
  ] }));
  const first = compile('one'), second = compile('two');
  assert.equal(first.systemPrompt, second.systemPrompt);
  assert(first.systemPrompt.includes('this is a quoted example'));
  assert(!first.systemPrompt.includes('cc_version=synthetic'));
  assert.equal(fromAnthropic({ ...body, system: 'x-anthropic-billing-header: synthetic\nKeep this instruction' }).messages[0].content, 'Keep this instruction');
});

test('Anthropic 保留指令和并行工具结果，拒绝无法兑现的参数', () => {
  const request = fromAnthropic({ ...body, messages: [...body.messages,
    { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'read', input: { path: 'a' } }, { type: 'tool_use', id: 'b', name: 'read', input: { path: 'b' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: [{ type: 'text', text: 'A' }] }, { type: 'tool_result', tool_use_id: 'b', content: 'B', is_error: true }] },
    { role: 'system', content: '动态规则' }] });
  assert.equal(request.reasoning_effort, 'high');
  assert.deepEqual(request.messages.map(message => message.role), ['system', 'user', 'assistant', 'tool', 'tool', 'system']);
  assert.equal(request.messages[2].tool_calls.length, 2);
  assert.deepEqual(request.messages[3].content, [{ type: 'text', text: 'A' }]);
  assert.equal(request.messages[4].content, 'B');
  assert.equal(request.messages[4].is_error, true);
  for (const extra of [{ thinking: { type: 'disabled' } }, { thinking: { type: 'enabled', budget_tokens: 1000 } },
    { output_config: { format: {} } }, { temperature: 0.3 }, { tools: [null] }, { tool_choice: { type: 'any' } },
    { messages: [{ role: 'user', content: [{ type: 'video' }] }] }]) assert.throws(() => fromAnthropic({ ...body, ...extra }), error => error.status === 400);
});

test('原生入口透传 user 图片，形状校验仍由上下文编译单点收口', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUg==';
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } };
  const request = fromAnthropic({ ...body, messages: [{ role: 'user', content: [{ type: 'text', text: '看这张图' }, image] }] });
  assert.deepEqual(request.messages.at(-1).content, [{ type: 'text', text: '看这张图' }, image]);
  // 无图片的消息仍输出合并文本，既有缓存前缀不因本次改动变形。
  assert.equal(fromAnthropic(body).messages.at(-1).content, '合成请求');
  // 坏图片在原生入口透传，但 validateRequest 经 compileContext 仍返回 400。
  const bad = fromAnthropic({ ...body, messages: [{ role: 'user', content: [{ type: 'image' }] }] });
  assert.throws(() => validateRequest(bad, { maxOutputTokens: 8192 }), error => error.status === 400);
  assert.throws(() => validateRequest(fromAnthropic({ ...body,
    messages: [{ role: 'assistant', content: [image] }, { role: 'user', content: 'hi' }] }), { maxOutputTokens: 8192 }), /assistant 消息中的图片/);
});

test('原生工具结果支持图片，保留调用 ID、错误状态与并行结果次序', async () => {
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } };
  const wire = { ...body, messages: [{ role: 'assistant', content: ['a', 'b'].map(id => ({ type: 'tool_use', id, name: 'read', input: {} })) },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: [{ type: 'text', text: '截图' }, image] },
      { type: 'tool_result', tool_use_id: 'b', content: [image] }, { type: 'text', text: '分析两张图' }] }] };
  const request = fromAnthropic(wire);
  assert.deepEqual(request.messages.map(message => message.role), ['system', 'assistant', 'tool', 'tool', 'user']);
  assert.equal(request.messages[2].tool_call_id, 'a');
  assert.equal(request.messages[2].is_error, true);
  assert.equal(compileContext(request).metrics.imageCount, 2);
  let executions = 0;
  const server = await gateway({ token: 'test', port: 0, models: [{ id: body.model }], execute: async request => {
    executions++; assert.equal(compileContext(request).metrics.imageCount, 2);
    return { role: 'assistant', content: 'OK' };
  } });
  const invoke = value => fetch(`http://127.0.0.1:${server.port}/v1/messages`, { method: 'POST', headers, body: JSON.stringify(value) });
  try {
    assert.equal((await invoke(wire)).status, 200);
    const bad = structuredClone(wire); bad.messages[1].content[0].content[1].source.data = 'A';
    assert.equal((await invoke(bad)).status, 400);
    assert.equal(executions, 1);
    assert.equal(server.inflightBytes, 0);
  } finally { await server.close({discardFrozen:true}); }
});

test('原生接口流式文本、并行工具和缓存三桶保持一致，阶段日志不泄露内容', async () => {
  const logs = [];
  const execution = { role: 'assistant', content: 'VISIBLE', tool_calls: [1, 2].map(id => ({ id: `call_${id}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: `file${id}` }) } })),
    upstream_usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } };
  const app = await gateway({ token: 'test', port: 0, models: [{ id: body.model }], onTiming: entry => logs.push(entry),
    execute: async (request, _signal, onText, timing) => { assert.equal(request.reasoning_effort, 'high'); timing.mark('cli_spawned'); onText('VIS'); onText('IBLE'); return execution; } });
  try {
    for (const stream of [false, true]) {
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages?beta=true`, { method: 'POST', headers, body: JSON.stringify({ ...body, stream }) });
      assert.equal(response.status, 200);
      if (!stream) {
        const result = await response.json();
        assert.equal(result.stop_reason, 'tool_use');
        assert.equal(result.content.filter(block => block.type === 'tool_use').length, 2);
        assert.deepEqual(result.usage, execution.upstream_usage);
      } else {
        const result = (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
        assert.equal(result.filter(event => event.type === 'content_block_delta' && event.delta.type === 'text_delta').map(event => event.delta.text).join(''), 'VISIBLE');
        assert.equal(result.filter(event => event.type === 'content_block_start' && event.content_block.type === 'tool_use').length, 2);
        assert.deepEqual(result.find(event => event.type === 'message_delta').usage, execution.upstream_usage);
        assert.equal(result.at(-1).type, 'message_stop');
      }
    }
    const ended = logs.filter(entry => entry.stage === 'finished');
    assert.equal(ended.length, 2);
    for (const entry of ended) {
      assert.equal(entry.outcome, 'success');
      assert(entry.stages.first_text >= entry.stages.auth_ready);
      assert(entry.stages.response_complete >= entry.stages.first_text);
    }
    assert(!JSON.stringify(logs).includes('CALLER_RULE'));
    assert(!JSON.stringify(logs).includes('VISIBLE'));
  } finally { await app.close({discardFrozen:true}); }
});

test('原生流心跳经过 SDK 的 ping 过滤后仍有事件，空正文不影响后续工具和用量', { timeout: 18000 }, async () => {
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const app = await gateway({ token: 'test', port: 0, models: [{ id: body.model }], execute: (_r,_s,_t,timing) => {timing.onUsage({upstream_usage:{input_tokens:7,output_tokens:0,cache_read_input_tokens:13,cache_creation_input_tokens:17}});return pending;} });
  const controller = new AbortController();
  let reader;
  try {
    const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, {
      method: 'POST', headers, body: JSON.stringify({ ...body, stream: true }), signal: controller.signal,
    });
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let wire = '';
    // 模拟模型一直思考且无正文；只认 SSE 数据事件，不把注释算作心跳。
    while (!wire.includes('"delta":{"type":"text_delta","text":""}')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      wire += decoder.decode(chunk.value, { stream: true });
    }
    complete({ role: 'assistant', content: null,
      tool_calls: [{ id: 'read_1', type: 'function', function: { name: 'read', arguments: '{"path":"synthetic"}' } }],
      upstream_usage: { input_tokens: 7, output_tokens: 11, cache_read_input_tokens: 13, cache_creation_input_tokens: 17 } });
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      wire += decoder.decode(chunk.value, { stream: true });
    }
    const events = wire.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
    assert.equal(events[0].type, 'message_start');
    assert.deepEqual(events.find(event => event.type === 'ping'), { type: 'ping' });
    // 与官方 SDK 一致地忽略 ping；客户端仍能收到零长度内容片段，且不会收到虚构回复。
    const parsed = events.filter(event => event.type !== 'ping');
    assert(parsed.some(event => event.type === 'content_block_delta' && event.delta.text === ''));
    assert.equal(parsed.filter(event => event.type === 'content_block_delta' && event.delta.type === 'text_delta').map(event => event.delta.text).join(''), '');
    const tool = events.find(event => event.type === 'content_block_start' && event.content_block.type === 'tool_use');
    assert.equal(tool.index, 1);
    assert(events.some(event => event.type === 'content_block_stop' && event.index === 0));
    assert.equal(tool.content_block.id, 'read_1');
    const end = events.find(event => event.type === 'message_delta');
    assert.equal(end.delta.stop_reason, 'tool_use');
    assert.equal(end.usage.output_tokens, 11);
    assert.equal(events.at(-1).type, 'message_stop');
    assert.equal(app.activeRequests, 0);
  } finally {
    complete({ role: 'assistant', content: 'cleanup' });
    controller.abort();
    reader?.releaseLock();
    await app.close({discardFrozen:true});
  }
});

test('保活与真实正文共用文本块，不重复输出或覆盖最终用量', () => {
  const writes = [];
  const writer = anthropicWriter({ writeHead() {}, write: value => writes.push(value), end() {} }, 'msg_test', body.model);
  writer.start(); writer.usage({upstream_usage:{input_tokens:7}}); writer.ping(); writer.ping(); writer.text('真正的正文');
  writer.finish({ content: '真正的正文', upstream_usage: { input_tokens: 7, output_tokens: 11 } }, 'end_turn');
  const events = writes.map(wire => JSON.parse(wire.split('\ndata: ')[1]));
  assert.equal(events.filter(event => event.type === 'content_block_start').length, 1);
  assert.equal(events.filter(event => event.type === 'content_block_stop').length, 1);
  assert.equal(events.filter(event => event.type === 'content_block_delta').map(event => event.delta.text).join(''), '真正的正文');
  assert.equal(events.find(event => event.type === 'message_delta').usage.output_tokens, 11);
});

test('Anthropic 各思考档位经过 HTTP 到达 CLI，取消和超时仍清理并记录阶段', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'native-effort-'));
  const logs = [];
  const options = { home, cli: 'mock', model: 'mock', timeoutMs: 5000,
    spawnProcess: (_cli, args, options) => spawn(process.execPath, ['--input-type=module', '-e', `
      for await (const chunk of process.stdin) {}
      const args=process.argv.slice(1), i=args.indexOf('--effort');
      console.log(JSON.stringify({type:'stream_event',event:{type:'message_start',message:{id:'m'}}}));
      console.log(JSON.stringify({type:'stream_event',event:{type:'content_block_delta',delta:{type:'thinking_delta',thinking:'HIDDEN'}}}));
      console.log(JSON.stringify({type:'result',result:i<0?'auto':args[i+1]}));`, '--', ...args], options) };
  const app = await gateway({ token: 'test', port: 0, models: [{ id: body.model }], onTiming: record => logs.push(record),
    execute: (request, signal, onText, timing) => infer(request, { ...options, signal, onText, timing }) });
  try {
    for (const effort of [...EFFORTS, 'auto']) {
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST', headers, body: JSON.stringify({ ...body, output_config: { effort } }) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).content[0].text, effort);
    }
    assert(logs.some(entry => entry.stage === 'first_thinking'));
    assert(logs.some(entry => entry.stage === 'cleanup_complete'));
    assert(!JSON.stringify(logs).includes('HIDDEN'));
    const hanging = (_cli, _args, options) => spawn(process.execPath, ['-e', 'process.stdin.resume(); setInterval(()=>{},1000)'], options);
    const marks = [];
    await assert.rejects(infer(fromAnthropic(body), { ...options, spawnProcess: hanging, timeoutMs: 50, killGraceMs: 20, timing: { mark: name => marks.push(name) } }), error => error.code === 'INFERENCE_TIMEOUT');
    assert(marks.includes('cli_exit') && marks.includes('cleanup_complete'));
    const controller = new AbortController();
    const pending = infer(fromAnthropic(body), { ...options, spawnProcess: (...args) => {
      const child = hanging(...args); child.once('spawn', () => controller.abort()); return child;
    }, signal: controller.signal, killGraceMs: 20 });
    const cancelled = assert.rejects(pending, /取消/);
    await cancelled;
    assert.deepEqual(await fs.readdir(home), ['workspace']);
  } finally { await app.close({discardFrozen:true}); await fs.rm(home, { recursive: true, force: true }); }
});
