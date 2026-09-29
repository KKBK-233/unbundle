import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { importOmp } from './import-omp.mjs';
import { providerId } from './config.mjs';

// 配置回归使用系统临时目录，绝不读取或修改用户的真实 OMP 配置。
async function fixture(t, source) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-code-relay-test-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const file = path.join(home, 'models.yml');
  const folder = path.join(home, 'state');
  if (source !== undefined) await fs.writeFile(file, source);
  return { file, folder };
}

test('导入保留其他供应商、默认模型与注释，备份并可重复执行', async t => {
  const source = '# 保留原始说明\r\ndefaultModel: other/model\r\nproviders:\r\n  other:\r\n    apiKey: synthetic-only\r\n    models: []\r\n';
  const options = await fixture(t, source);
  const result = await importOmp(options);
  assert.equal(result.changed, true);
  assert.equal(await fs.readFile(result.backup, 'utf8'), source);
  const updated = await fs.readFile(options.file, 'utf8');
  assert(updated.startsWith('# 保留原始说明\r\n'));
  const parsed = yaml.safeLoad(updated);
  const added = parsed.providers[providerId];
  assert.equal(added.apiKey, await fs.readFile(path.join(options.folder, 'token'), 'utf8'));
  assert.equal(added.baseUrl, 'http://127.0.0.1:18795/v1');
  delete parsed.providers[providerId];
  assert.deepEqual(parsed, yaml.safeLoad(source));
  assert.equal((await importOmp(options)).changed, false);
  assert.equal(await fs.readFile(options.file, 'utf8'), updated);
});

test('新机器支持不存在的配置文件及无 providers 的配置', async t => {
  for (const source of [undefined, '# 原配置\ndefaultModel: other/model\n']) {
    const options = await fixture(t, source);
    await importOmp(options);
    const parsed = yaml.safeLoad(await fs.readFile(options.file, 'utf8'));
    assert(parsed.providers[providerId]);
    if (source) assert.equal(parsed.defaultModel, 'other/model');
  }
});

test('已有同名供应商但令牌不一致时拒绝覆盖', async t => {
  const source = `providers:\n  ${providerId}:\n    apiKey: synthetic-other\n`;
  const options = await fixture(t, source);
  await assert.rejects(importOmp(options), /不一致/);
  assert.equal(await fs.readFile(options.file, 'utf8'), source);
});

test('不支持的 YAML 结构与危险标签不写回原配置', async t => {
  for (const source of ['providers: []\n', 'providers: {other: {}}\n', 'providers: !!js/function "function () {}"\n']) {
    const options = await fixture(t, source);
    await assert.rejects(importOmp(options));
    assert.equal(await fs.readFile(options.file, 'utf8'), source);
  }
});
