import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CliEvents } from './cli-events.mjs';
import { infer } from './engine.mjs';
import { gateway } from './server.mjs';
import { createTiming } from './timing.mjs';

const available = [{ name: 'read', original: 'read' }];
const stream = event => ({ type: 'stream_event', event });
const start = index => stream({ type: 'content_block_start', index,
  content_block: { type: 'tool_use', id: `tool_${index}`, name: 'mcp__omp__read', input: {} } });
const delta = (index, partial_json) => stream({ type: 'content_block_delta', index,
  delta: { type: 'input_json_delta', partial_json } });
const stop = index => stream({ type: 'content_block_stop', index });
const end = reason => stream({ type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 10 } });
const begin = stream({ type: 'message_start', message: { id: 'msg_tools', usage: { input_tokens: 20, output_tokens: 0 } } });
const snapshot = (index, input) => ({ type: 'assistant', message: { id: 'msg_tools', content: [
  { type: 'tool_use', id: `tool_${index}`, name: 'mcp__omp__read', input },
] } });

// 模拟缺失块结束事件，必须等整条消息结束且参数完整，才能交付工具调用。
test('消息结束补齐缺失的工具块结束事件，保持并行工具与聚合事件去重', () => {
  const events = new CliEvents(available);
  for (const event of [begin, start(1), delta(1, '{"path":"a"}'), stop(1), start(3),
    delta(3, '{"path":'), delta(3, '"中文.txt"}'), snapshot(3, { path: '中文.txt' })]) events.accept(event);
  assert.equal(events.toolEnd, false);
  assert.equal(events.blocks.size, 1);
  events.accept(end('tool_use'));
  assert.equal(events.toolEnd, true);
  assert.equal(events.blocks.size, 0);
  assert.equal(events.recoveredToolStops, 1);
  assert.deepEqual([...events.calls.values()].map(value => JSON.parse(value.function.arguments)), [{ path: 'a' }, { path: '中文.txt' }]);
  events.accept(stop(3));
  events.accept(snapshot(3, { path: '中文.txt' }));
  assert.equal(events.calls.size, 2);
  assert.equal(events.recoveredToolStops, 1);
});

test('正常工具块关闭不计入补充收尾', () => {
  const events = new CliEvents(available);
  for (const event of [begin, start(0), delta(0, '{}'), stop(0), end('tool_use')]) events.accept(event);
  assert.equal(events.calls.size, 1);
  assert.equal(events.recoveredToolStops, 0);
});

test('消息结束不能修补残缺 JSON、伪造空参数或绕过工具校验', () => {
  for (const input of ['', '{"path":', '{"path":"PRIVATE_ARGUMENT"', '{} trailing', 'null', '[]', '42']) {
    const events = new CliEvents(available);
    for (const event of [begin, start(0), delta(0, input)]) events.accept(event);
    assert.throws(() => events.accept(end('tool_use')), error => {
      assert(!error.message.includes('PRIVATE_ARGUMENT'));
      return /工具/.test(error.message);
    });
    assert.equal(events.toolEnd, false);
  }
  const unknown = new CliEvents([]);
  for (const event of [begin, start(0), delta(0, '{}')]) unknown.accept(event);
  assert.throws(() => unknown.accept(end('tool_use')), /无效的工具/);
  const conflict = new CliEvents(available);
  for (const event of [begin, start(0), delta(0, '{"path":"a"}'), snapshot(0, { path: 'b' })]) conflict.accept(event);
  assert.throws(() => conflict.accept(end('tool_use')), /ID 冲突/);
  assert.equal(conflict.toolEnd, false);
});

test('截断与新消息边界不能充当工具完成信号', () => {
  for (const boundary of [end('max_tokens'), begin]) {
    const events = new CliEvents(available);
    for (const event of [begin, start(0), delta(0, '{}')]) events.accept(event);
    assert.throws(() => events.accept(boundary), /不完整/);
    assert.equal(events.toolEnd, false);
    assert.equal(events.calls.size, 0);
  }
});

// 假 CLI 只输出合成事件，验证进程桥和两个 HTTP 协议，不接触账号或真实模型。
test('缺失块结束事件仍可通过两种 HTTP 协议交付完整工具，记录脱敏计数', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-end-'));
  const trace = [begin, start(0), delta(0, '{"path":"example.txt"}'), end('tool_use')];
  const script = `for await (const chunk of process.stdin) {};
    for (const event of ${JSON.stringify(trace)}) console.log(JSON.stringify(event));
    setInterval(() => {}, 1000);`;
  const records = [];
  const app = await gateway({ token: 'synthetic', port: 0,
    execute: (body, signal, onText) => {
      const timing = createTiming(value => records.push(value));
      return infer(body, { cli: 'synthetic', home, model: 'mock', signal, onText, timing, timeoutMs: 5000, killGraceMs: 20,
        spawnProcess: (_cli, _args, options) => spawn(process.execPath, ['--input-type=module', '-e', script], options),
      }).then(value => { timing.finish('success'); return value; });
    },
  });
  try {
    for (const native of [false, true]) for (const streaming of [false, true]) {
      const parameters = { type: 'object', properties: { path: { type: 'string' } } };
      const body = { model: 'claude-code-sonnet', messages: [{ role: 'user', content: '合成测试' }], stream: streaming,
        ...(native ? { max_tokens: 1024, tools: [{ name: 'read', input_schema: parameters }] }
          : { tools: [{ type: 'function', function: { name: 'read', parameters } }] }),
      };
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/${native ? 'messages' : 'chat/completions'}`, {
        method: 'POST', headers: { authorization: 'Bearer synthetic', 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const text = await response.text();
      assert.equal(response.status, 200, text);
      if (streaming) {
        assert(!text.includes('"type":"error"'), text);
        assert(text.includes('example.txt'), text);
        assert(text.includes(native ? '"stop_reason":"tool_use"' : '"finish_reason":"tool_calls"'), text);
      } else {
        const result = JSON.parse(text);
        if (native) {
          assert.equal(result.stop_reason, 'tool_use');
          assert.deepEqual(result.content, [{ type: 'tool_use', id: 'tool_0', name: 'read', input: { path: 'example.txt' } }]);
        } else {
          assert.equal(result.choices[0].finish_reason, 'tool_calls');
          assert.equal(result.choices[0].message.tool_calls[0].function.arguments, '{"path":"example.txt"}');
        }
      }
    }
    const finished = records.filter(record => record.stage === 'finished');
    assert.equal(finished.length, 4);
    for (const record of finished) {
      assert.equal(record.progress.recoveredToolStops, 1);
      assert.equal(record.progress.pendingTools, 0);
      assert.equal(record.progress.completedTools, 1);
    }
    assert(!JSON.stringify(records).includes('example.txt'));
  } finally { await app.close({discardFrozen:true}); await fs.rm(home, { recursive: true, force: true }); }
});

test('CLI 退出前没有工具消息结束信号时，不把未完成工具当成文本成功返回', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-end-missing-'));
  const trace = [begin, start(0), delta(0, '{}'), { type: 'result', is_error: false, result: '完成' }];
  const script = `for await (const chunk of process.stdin) {}; for (const event of ${JSON.stringify(trace)}) console.log(JSON.stringify(event));`;
  try {
    await assert.rejects(infer({ messages: [{ role: 'user', content: '合成测试' }], tools: [
      { type: 'function', function: { name: 'read', parameters: { type: 'object' } } },
    ] }, { cli: 'synthetic', home, model: 'mock', timeoutMs: 5000,
      spawnProcess: (_cli, _args, options) => spawn(process.execPath, ['--input-type=module', '-e', script], options),
    }), /工具消息不完整/);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});


test('MCP 校验模式也不接受同一 ID 的两份冲突完整参数',()=>{
 const events=new CliEvents(available,undefined,[],{preferAggregateWithMcpValidation:true});events.accept(snapshot(0,{path:'a'}));assert.throws(()=>events.accept(snapshot(0,{path:'b'})),/ID 冲突/);
});
