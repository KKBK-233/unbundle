import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { infer } from './engine.mjs';
import { createTiming } from './timing.mjs';

// 大型工具参数分片期间允许持续进展；中断时保留大小和待完成块，不返回部分调用。
test('大工具消息停顿后可结束，中途超时保留参数大小与重试计数', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-large-tool-'));
  const payload = '中文'.repeat(35000);
  const request = { model: 'claude-code-opus', tools: [{ type: 'function', function: { name: 'write_file', parameters: { type: 'object' } } }],
    messages: [{ role: 'user', content: 'synthetic' }] };
  const makeProcess = finish => (_cli, _args, options) => spawn(process.execPath, ['--input-type=module', '-e', `
    for await (const chunk of process.stdin) {}
    const emit = event => console.log(JSON.stringify(event));
    const stream = event => emit({type:'stream_event',event});
    stream({type:'message_start',message:{id:'large',usage:{input_tokens:1,output_tokens:0}}});
    stream({type:'content_block_start',index:0,content_block:{type:'tool_use',id:'call',name:'mcp__omp__write_file',input:{}}});
    emit({type:'system',subtype:'api_retry'});
    stream({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify({content:'中文'.repeat(35000)})}});
    if (${finish}) setTimeout(() => {
      stream({type:'content_block_stop',index:0});
      stream({type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:1}});
    }, 650);
    setInterval(() => {},1000);
  `], options);
  const common = { home, cli: 'mock', model: 'mock', timeoutMs: 3000, killGraceMs: 20 };
  try {
    const success = await infer(request, { ...common, idleTimeoutMs: 1500, spawnProcess: makeProcess(true) });
    assert.equal(JSON.parse(success.tool_calls[0].function.arguments).content, payload);
    const records = [];
    const timing = createTiming(value => records.push(value));
    await assert.rejects(infer(request, { ...common, idleTimeoutMs: 400, spawnProcess: makeProcess(false),
      timing }), error => error.code === 'INFERENCE_IDLE_TIMEOUT');
    // infer 由服务层结束计时；单独调用时显式封存同一记录。
    timing.finish('timeout');
    assert(records.some(value => value.stage === 'idle_timeout'));
    const snapshot = records.at(-1).progress;
    assert.equal(snapshot.toolArgumentBytes, Buffer.byteLength(JSON.stringify({ content: payload })));
    assert.equal(snapshot.pendingTools, 1);
    assert.equal(snapshot.retryEvents, 1);
    assert(!JSON.stringify(records).includes('中文'));
    assert.deepEqual(await fs.readdir(home), ['workspace']);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

// 模拟持续思考、无进展心跳和总时限，验证超时不会误杀进展或留下子进程状态。
test('持续思考延长无进展期限，CLI 心跳不能延长，总时限始终有效', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-timeout-'));
  const request = { model: 'claude-code-opus', messages: [{ role: 'user', content: 'synthetic' }] };
  const makeProcess = mode => (_cli, _args, options) => spawn(process.execPath, ['--input-type=module', '-e', `
    for await (const chunk of process.stdin) {}
    const emit = event => console.log(JSON.stringify(event));
    let count = 0;
    const timer = setInterval(() => {
      emit(${JSON.stringify(mode === 'noise' ? { type: 'system', subtype: 'heartbeat' } : { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'HIDDEN' } } })});
      if (++count === 10 && ${JSON.stringify(mode)} === 'finish') {
        clearInterval(timer); emit({type:'result',result:'DONE'});
      }
    }, 70);
  `], options);
  const common = { home, cli: 'mock', model: 'mock', timeoutMs: 2500, idleTimeoutMs: 400, killGraceMs: 20 };
  try {
    assert.equal((await infer(request, { ...common, spawnProcess: makeProcess('finish') })).content, 'DONE');
    for (const [mode, extra, expected] of [
      ['noise', {}, 'INFERENCE_IDLE_TIMEOUT'],
      ['progress', { timeoutMs: 300 }, 'INFERENCE_TIMEOUT'],
    ]) {
      const stages = [];
      await assert.rejects(infer(request, { ...common, ...extra, spawnProcess: makeProcess(mode), timing: { mark: value => stages.push(value) } }), error => error.code === expected);
      assert(stages.includes(mode === 'noise' ? 'idle_timeout' : 'total_timeout'));
      assert(stages.includes('cleanup_complete'));
    }
    assert.deepEqual(await fs.readdir(home), ['workspace']);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});
