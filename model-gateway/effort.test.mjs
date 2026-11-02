import {messageText} from './messages.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { EFFORTS, resolveEffort } from './effort.mjs';
import { infer } from './engine.mjs';
import { gateway } from './server.mjs';
import { CliEvents } from './cli-events.mjs';

const base = { model: 'claude-code-sonnet', messages: [{ role: 'user', content: '合成测试' }] };
test('思考档位按模型校验，auto 使用 CLI 默认，不偷换关闭语义', () => {
  for (const model of ['claude-code-sonnet', 'claude-code-opus', 'claude-code-haiku']) for (const reasoning_effort of EFFORTS) assert.equal(resolveEffort({model, output_config: {effort:reasoning_effort}}), reasoning_effort);
  for (const reasoning_effort of [undefined, null, 'auto']) assert.equal(resolveEffort({...base, output_config: {effort:reasoning_effort}}), undefined);
  for (const reasoning_effort of ['off', 'none', 'minimal', 'HIGH', '', {}, 1]) assert.throws(() => resolveEffort({...base, output_config: {effort:reasoning_effort}}), { code: 'UNSUPPORTED_REASONING_EFFORT' });
  assert.throws(() => resolveEffort({model: 'unsupported-model', output_config: {effort:'low'}}));
});

test('无效强度在发出 SSE 或执行模型前返回 400', async () => {
  let calls = 0;
  const app = await gateway({ token: 'synthetic', port: 0, execute: async () => { calls++; return { role: 'assistant', content: 'ok' }; } });
  try {
    const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({...base, stream: true, output_config: {effort:'off'}}) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'UNSUPPORTED_REASONING_EFFORT');
    assert.equal(calls, 0);
  } finally { await app.close({discardFrozen:true}); }
});

// 用 Node 子进程检查真实 argv，不在本地运行 Claude，也不把强度写进提示词。
test('所选档位逐请求传入 CLI，auto 和后续未指定请求不会继承上一档位', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-effort-'));
  const options = { cli: 'fake', home, model: 'sonnet', spawnProcess: (_cli, args, opts) => {
    assert.equal(opts.env.FORCE_PROMPT_CACHING_5M, undefined);
    const fake = `let input='';for await (const chunk of process.stdin) input+=chunk;console.log(JSON.stringify({type:'result',result:JSON.stringify({args:process.argv.slice(1),input})}));`;
    return spawn(process.execPath, ['--input-type=module', '-e', fake, '--', ...args], opts);
  } };
  try {
    let previous;
    for (const reasoning_effort of [...EFFORTS, 'auto', undefined]) {
      const result = JSON.parse(messageText((await infer({...base, output_config: {effort:reasoning_effort}}, options))));
      const index = result.args.indexOf('--effort');
      if (EFFORTS.includes(reasoning_effort)) assert.equal(result.args[index + 1], reasoning_effort);
      else assert.equal(index, -1);
      if (previous) assert.equal(result.input, previous);
      previous = result.input;
    }
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test('思考内容不进入返回文本或工具消息', () => {
  const output = [];
  const events = new CliEvents([], text => output.push(text));
  events.accept({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'SYNTHETIC_THINKING' } } });
  events.accept({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'SYNTHETIC_THINKING' }, { type: 'text', text: '最终回答' }] } });
  assert.equal(events.text, '最终回答');
  assert.deepEqual(output, ['最终回答']);
});