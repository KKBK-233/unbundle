import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import yaml from 'js-yaml';
import { EFFORTS, resolveEffort, ompThinking } from './effort.mjs';
import { infer } from './engine.mjs';
import { gateway } from './server.mjs';
import { importOmp } from './import-omp.mjs';
import { CliEvents } from './cli-events.mjs';

const base = { model: 'claude-code-sonnet', messages: [{ role: 'user', content: '合成测试' }] };
test('思考档位按模型校验，auto 使用 CLI 默认，不偷换关闭语义', () => {
  for (const model of ['claude-code-sonnet', 'claude-code-opus', 'claude-code-haiku']) for (const reasoning_effort of EFFORTS) assert.equal(resolveEffort({ model, reasoning_effort }), reasoning_effort);
  for (const reasoning_effort of [undefined, null, 'auto']) assert.equal(resolveEffort({ ...base, reasoning_effort }), undefined);
  for (const reasoning_effort of ['off', 'none', 'minimal', 'HIGH', '', {}, 1]) assert.throws(() => resolveEffort({ ...base, reasoning_effort }), { code: 'UNSUPPORTED_REASONING_EFFORT' });
  assert.throws(() => resolveEffort({ model: 'unsupported-model', reasoning_effort: 'low' }));
  assert.deepEqual(ompThinking('claude-code-haiku').thinking.efforts, EFFORTS);
});

test('无效强度在发出 SSE 或执行模型前返回 400', async () => {
  let calls = 0;
  const app = await gateway({ token: 'synthetic', port: 0, execute: async () => { calls++; return { role: 'assistant', content: 'ok' }; } });
  try {
    const response = await fetch(`http://127.0.0.1:${app.port}/v1/chat/completions`, { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ ...base, reasoning_effort: 'off', stream: true }) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'UNSUPPORTED_REASONING_EFFORT');
    assert.equal(calls, 0);
  } finally { await app.close({discardFrozen:true}); }
});

// 用 Node 子进程检查真实 argv，不在本地运行 Claude，也不把强度写进提示词。
test('所选档位逐请求传入 CLI，auto 和后续未指定请求不会继承上一档位', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-effort-'));
  const options = { cli: 'fake', home, model: 'sonnet', spawnProcess: (_cli, args, opts) => {
    assert.equal(opts.env.FORCE_PROMPT_CACHING_5M, '1');
    const fake = `let input='';for await (const chunk of process.stdin) input+=chunk;console.log(JSON.stringify({type:'result',result:JSON.stringify({args:process.argv.slice(1),input})}));`;
    return spawn(process.execPath, ['--input-type=module', '-e', fake, '--', ...args], opts);
  } };
  try {
    let previous;
    for (const reasoning_effort of [...EFFORTS, 'auto', undefined]) {
      const result = JSON.parse((await infer({ ...base, reasoning_effort }, options)).content);
      const index = result.args.indexOf('--effort');
      if (EFFORTS.includes(reasoning_effort)) assert.equal(result.args[index + 1], reasoning_effort);
      else assert.equal(index, -1);
      if (previous) assert.equal(result.input, previous);
      previous = result.input;
    }
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test('升级 OMP 只改变云端模型能力，保留凭据、默认模型和其他 provider', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-effort-import-'));
  const file = path.join(dir, 'models.yml'), tokenFile = path.join(dir, 'token');
  try {
    await fs.writeFile(file, '# 原有配置\ndefaultModel: untouched\nproviders:\n  other:\n    apiKey: synthetic-other\n');
    await importOmp({ file, tokenFile });
    const old = yaml.load(await fs.readFile(file, 'utf8'));
    for (const model of old.providers['velella-cloud'].models) { model.reasoning = false; delete model.thinking; delete model.compat; }
    await fs.writeFile(file, '# 原有配置\n' + yaml.dump(old, { lineWidth: -1 }));
    const token = await fs.readFile(tokenFile, 'utf8');
    assert.equal((await importOmp({ file, tokenFile, updateThinking: true })).updated, true);
    const current = yaml.load(await fs.readFile(file, 'utf8'));
    assert.equal(current.defaultModel, old.defaultModel);
    assert.deepEqual(current.providers.other, old.providers.other);
    assert.equal(current.providers['velella-cloud'].apiKey, old.providers['velella-cloud'].apiKey);
    assert.equal(await fs.readFile(tokenFile, 'utf8'), token);
    assert.equal(current.providers['velella-cloud'].models[0].thinking.defaultLevel, 'medium');
    assert.deepEqual(current.providers['velella-cloud'].models.find(model => model.id === 'claude-code-haiku').thinking.efforts, EFFORTS);
    assert.equal((await importOmp({ file, tokenFile, updateThinking: true })).updated, false);
    assert((await fs.readdir(dir)).some(name => name.includes('.before-velella-cloud-')));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('新建 provider 声明图片输入，升级只补齐模态且保留用户追加项', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-input-import-'));
  const file = path.join(dir, 'models.yml'), tokenFile = path.join(dir, 'token');
  try {
    assert.equal((await importOmp({ file, tokenFile })).created, true);
    const created = yaml.load(await fs.readFile(file, 'utf8'));
    for (const model of created.providers['velella-cloud'].models) assert.deepEqual(model.input, ['text', 'image']);

    // 退回旧的纯文本声明并追加一个用户自定义模态，验证升级不是整体覆盖。
    const stale = structuredClone(created);
    stale.providers['velella-cloud'].models[0].input = ['text', 'synthetic-extra'];
    stale.providers['velella-cloud'].models[1].input = ['text'];
    await fs.writeFile(file, yaml.dump(stale, { lineWidth: -1 }));
    assert.equal((await importOmp({ file, tokenFile, updateInput: true })).updated, true);
    const current = yaml.load(await fs.readFile(file, 'utf8'));
    assert.deepEqual(current.providers['velella-cloud'].models[0].input, ['text', 'synthetic-extra', 'image']);
    assert.deepEqual(current.providers['velella-cloud'].models[1].input, ['text', 'image']);
    assert.equal(current.providers['velella-cloud'].apiKey, created.providers['velella-cloud'].apiKey);
    assert.equal((await importOmp({ file, tokenFile, updateInput: true })).updated, false);
    // 不带任何升级标记时不触碰既有配置。
    assert.equal((await importOmp({ file, tokenFile })).created, false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('思考内容不进入返回文本或工具消息', () => {
  const output = [];
  const events = new CliEvents([], text => output.push(text));
  events.accept({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'SYNTHETIC_THINKING' } } });
  events.accept({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'SYNTHETIC_THINKING' }, { type: 'text', text: '最终回答' }] } });
  assert.equal(events.text, '最终回答');
  assert.deepEqual(output, ['最终回答']);
});
