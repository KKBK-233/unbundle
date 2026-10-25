import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CliEvents } from './cli-events.mjs';
import { infer } from './engine.mjs';
import { fromAnthropic } from './anthropic.mjs';
import { validateRequest } from './request.mjs';
import { gateway } from './server.mjs';

test('停止串跨片段不泄露，最早命中生效，未命中的前缀正常输出', () => {
  const output = [];
  const events = new CliEvents([], text => output.push(text), ['END', 'STOP']);
  events.emit('before ST'); events.emit('OP after END'); events.emit('leak');
  assert.equal(events.text, 'before '); assert.equal(output.join(''), 'before '); assert.equal(events.stopSequence, 'STOP');
  const partial = new CliEvents([], undefined, ['END']);
  partial.emit('test E'); partial.flushText(); assert.equal(partial.text, 'test E');
  for (const stop of ['', [''], ['a', 'b', 'c', 'd', 'e'], [3]]) {
    assert.throws(() => validateRequest({ messages: [{ role: 'user', content: 'synthetic' }], stop }));
  }
  assert.deepEqual(fromAnthropic({ model: 'claude-code-sonnet', max_tokens: 16, messages: [], stop_sequences: ['END'] }).stop, ['END']);
});

test('停止串终止挂起进程，原生 JSON 与 SSE 都返回准确结束原因', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-stop-'));
  const fake = `for await(const c of process.stdin){};
    for(const text of ['AL','LOW<','STOP>secret']) console.log(JSON.stringify({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text}}}));
    setInterval(()=>{},1000);`;
  const app = await gateway({ token: 'stop-test', port: 0, execute: (body, signal, onText) => infer(body, {
    cli: 'fake', home, model: 'mock', signal, onText, timeoutMs: 3000,
    spawnProcess: (_cli, _args, options) => spawn(process.execPath, ['--input-type=module', '-e', fake], options),
  }) });
  try {
    for (const stream of [false, true]) {
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST',
        headers: { 'x-api-key': 'stop-test', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-code-sonnet', max_tokens: 16, messages: [{ role: 'user', content: 'classifier probe' }], stop_sequences: ['<STOP>'], stream }),
      });
      assert.equal(response.status, 200);
      if (!stream) {
        const result = await response.json(); assert.equal(result.content[0].text, 'ALLOW');
        assert.equal(result.stop_reason, 'stop_sequence'); assert.equal(result.stop_sequence, '<STOP>');
      } else {
        const events = (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
        assert.equal(events.filter(e => e.type === 'content_block_delta').map(e => e.delta.text).join(''), 'ALLOW');
        assert.deepEqual(events.find(e => e.type === 'message_delta').delta, { stop_reason: 'stop_sequence', stop_sequence: '<STOP>' });
      }
    }
    assert.deepEqual(await fs.readdir(home), ['workspace']);
  } finally { await app.close({discardFrozen:true}); await fs.rm(home, { recursive: true, force: true }); }
});
