import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gateway } from './server.mjs';
import { cloudModels, modelAliases, upstreamModels } from './cloud-models.mjs';
import { withGatewayRules } from './gateway-rules.mjs';
import { compileContext } from './context.mjs';

test('官方型号可被发现，旧会话入口归一化且保留思考档位', async () => {
  const received = [];
  const app = await gateway({ token: 'synthetic', port: 0, models: cloudModels(400000), modelAliases,
    execute: async request => { received.push(request); return { role: 'assistant', content: 'SYNTHETIC_OK' }; } });
  const headers = { authorization: 'Bearer synthetic', 'content-type': 'application/json' };
  try {
    const catalog = await (await fetch(`http://127.0.0.1:${app.port}/v1/models`, { headers })).json();
    assert.deepEqual(catalog.data.map(row => row.display_name), ['Sonnet 5.5', 'Opus 5.5', 'Haiku 5.5']);
    assert.equal(upstreamModels['claude-opus-5-5'], 'claude-opus-5-5[1m]');
    for (const model of ['claude-code-opus', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']) {
      const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST', headers,
        body: JSON.stringify({ model, max_tokens: 256, output_config: { effort: 'medium' },
          messages: [{ role: 'user', content: '合成模型路由检查' }] }) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).content[0].text, 'SYNTHETIC_OK');
      assert.equal(received.at(-1).model, modelAliases[model] || model);
      assert.equal(received.at(-1).reasoning_effort, 'medium');
    }
    const response = await fetch(`http://127.0.0.1:${app.port}/v1/messages`, { method: 'POST', headers,
      body: JSON.stringify({ model: 'untrusted-model', max_tokens: 16, messages: [{ role: 'user', content: '合成未知模型' }] }) });
    assert.equal(response.status, 400);
    assert.equal(received.length, 4);
  } finally { await app.close({discardFrozen:true}); }
});

test('VPS 规则进入编译后的系统提示，更新即时生效且不改写原历史', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'gateway-rules-'));
  const file = path.join(folder, 'CLAUDE.md');
  const original = { model: 'claude-opus-5-5', messages: [{ role: 'system', content: 'CALLER_SYSTEM' }, { role: 'user', content: '合成请求' }] };
  try {
    await fs.writeFile(file, '始终使用简体中文。');
    const augmented = await withGatewayRules(original, file);
    const compiled = compileContext(augmented);
    assert(compiled.systemPrompt.includes('始终使用简体中文。'));
    assert(compiled.systemPrompt.includes('CALLER_SYSTEM'));
    assert.equal(original.messages.length, 2);
    await fs.writeFile(file, '先读相关文件。');
    assert(compileContext(await withGatewayRules(original, file)).systemPrompt.includes('先读相关文件。'));
    assert.equal(await withGatewayRules(original), original);
    await fs.unlink(file);
    await assert.rejects(withGatewayRules(original, file), { code: 'GATEWAY_RULES_UNAVAILABLE' });
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
