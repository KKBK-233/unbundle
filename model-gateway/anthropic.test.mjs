import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fromAnthropic } from './anthropic.mjs';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';
import { EFFORTS } from './effort.mjs';

const body = { model: 'claude-code-opus', system: [{ type: 'text', text: 'CALLER_RULE' }], max_tokens: 1024,
  messages: [{ role: 'user', content: '合成请求' }], thinking: { type: 'adaptive' }, output_config: { effort: 'high' } };
const headers = { 'x-api-key': 'test', 'content-type': 'application/json' };

test('Anthropic 保留指令和并行工具结果，拒绝无法兑现的参数', () => {
  const request = fromAnthropic({ ...body, messages: [...body.messages,
    { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'read', input: { path: 'a' } }, { type: 'tool_use', id: 'b', name: 'read', input: { path: 'b' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: [{ type: 'text', text: 'A' }] }, { type: 'tool_result', tool_use_id: 'b', content: 'B', is_error: true }] },
    { role: 'system', content: '动态规则' }] });
  assert.equal(request.reasoning_effort, 'high');
  assert.deepEqual(request.messages.map(message => message.role), ['system', 'user', 'assistant', 'tool', 'tool', 'system']);
  assert.equal(request.messages[2].tool_calls.length, 2);
  assert.equal(request.messages[3].content, 'A');
  assert.deepEqual(JSON.parse(request.messages[4].content), { is_error: true, content: 'B' });
  for (const extra of [{ thinking: { type: 'disabled' } }, { thinking: { type: 'enabled', budget_tokens: 1000 } },
    { output_config: { format: {} } }, { temperature: 0.3 }, { tools: [null] }, { tool_choice: { type: 'any' } },
    { messages: [{ role: 'user', content: [{ type: 'image' }] }] }]) assert.throws(() => fromAnthropic({ ...body, ...extra }), error => error.status === 400);
});

test('原生接口流式文本、并行工具和缓存三桶保持一致，阶段日志不泄露内容', async () => {
  const logs = [];
  const execution = { role: 'assistant', content: 'VISIBLE', tool_calls: [1, 2].map(id => ({ id: `call_${id}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: `file${id}` }) } })),
    upstream_usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } };
  const app = await gateway({ token: 'test', port: 0, models: [{ id: body.model }], onTiming: entry => logs.push(entry),
    execute: async (request, _signal, onText, timing) => { assert.equal(request.reasoning_effort, 'high'); timing.mark('cli_spawned'); onText('VIS'); onText('IBLE'); return execution; } });
  try {
    for (const stream of [false, true]) {
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST', headers, body: JSON.stringify({ ...body, stream }) });
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
  } finally { await app.close(); }
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
  } finally { await app.close(); await fs.rm(home, { recursive: true, force: true }); }
});
