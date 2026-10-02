import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { infer } from './engine.mjs';

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
