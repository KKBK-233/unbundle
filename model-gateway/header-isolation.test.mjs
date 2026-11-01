import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';
import { sessionRelay } from './session-relay.mjs';

// 经过真实 HTTP 入口和转换器，在模拟 CLI 边界核对头部、归因和父进程凭据隔离。
for (const native of [false, true]) test(`${native ? '原生会话' : '逐轮进程'}不把入站头部、metadata 或父进程凭据带入 CLI`, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gateway-header-isolation-'));
  const keys = ['ANTHROPIC_CUSTOM_HEADERS', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'];
  const original = keys.map(key => process.env[key]);
  for (const key of keys) process.env[key] = 'PRIVATE_PARENT_' + key;
  const captured = [];
  const fake = `import readline from 'node:readline';const emit=x=>console.log(JSON.stringify(x));
    readline.createInterface({input:process.stdin}).on('line',()=>{
      emit({type:'stream_event',event:{type:'message_start',message:{id:'msg_isolation'}}});
      emit({type:'assistant',message:{id:'msg_isolation',content:[{type:'text',text:'ISOLATION_OK'}],stop_reason:'end_turn'}});
      emit({type:'result',subtype:'success',is_error:false,result:'ISOLATION_OK'});
    });`;
  const options = { cli: 'synthetic', home, model: 'claude-opus-5-5', modelFor: value => value, timeoutMs: 5000,
    spawnProcess(_cli, args, opts) {
      const prompt = fsSync.readFileSync(args[args.indexOf('--system-prompt-file') + 1], 'utf8');
      const record = { args, env: opts.env, prompt, input: '' }; captured.push(record);
      const child = spawn(process.execPath, ['--input-type=module', '-e', fake], opts);
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = (chunk, ...rest) => { record.input += String(chunk); return write(chunk, ...rest); };
      const end = child.stdin.end.bind(child.stdin);
      child.stdin.end = (chunk, ...rest) => { if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) record.input += String(chunk); return end(chunk, ...rest); };
      return child;
    } };
  let app, relay;
  try {
    relay = native ? sessionRelay(options) : undefined;
    app = await gateway({ token: 'test', port: 0, models: [{ id: 'claude-opus-5-5' }],
      execute: (body, signal, onText, timing) => native ? relay.infer(body, { signal, onText, timing }) : infer(body, { ...options, signal, onText, timing }) });
    const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json',
        'x-claude-code-wiggly-dove': 'PRIVATE_INBOUND_HEADER', 'anthropic-beta': 'PRIVATE_BETA_HEADER' },
      body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 1024,
        metadata: { user_id: 'PRIVATE_METADATA' },
        system: 'x-anthropic-billing-header: cc_gateway=PRIVATE_BILLING\nCALLER_RULE',
        messages: [{ role: 'user', content: 'CONVERSATION_ONLY' }] }) });
    const value = await response.json();
    assert.equal(response.status, 200, JSON.stringify(value));
    assert.equal(value.content[0].text, 'ISOLATION_OK');
    assert.equal(captured.length, 1);
    const wire = JSON.stringify(captured);
    for (const marker of ['PRIVATE_INBOUND_HEADER', 'PRIVATE_BETA_HEADER', 'PRIVATE_METADATA', 'PRIVATE_BILLING', 'PRIVATE_PARENT_']) assert(!wire.includes(marker), marker);
    assert(wire.includes('CONVERSATION_ONLY')); assert(wire.includes('CALLER_RULE'));
    for (const key of keys) assert.equal(captured[0].env[key], undefined);
  } finally {
    await app?.close(); await relay?.close({ discardFrozen: true });
    for (const [index, key] of keys.entries()) { if (original[index] === undefined) delete process.env[key]; else process.env[key] = original[index]; }
    await fs.rm(home, { recursive: true, force: true });
  }
});
