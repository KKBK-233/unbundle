import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import yaml from 'js-yaml';

// 只新增云端 provider；原始 OMP 配置、默认模型和其他 provider 保持不变。
const root = path.resolve(import.meta.dirname, '..');
const folder = path.join(root, '.local/model-gateway');
const providerId = 'velella-cloud';
await fs.mkdir(folder, { recursive: true, mode: 0o700 });
const tokenFile = path.join(folder, 'cloud-token');
try { await fs.writeFile(tokenFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const token = (await fs.readFile(tokenFile, 'utf8')).trim();

const profile = process.env.USERPROFILE || process.env.HOME;
if (!profile) throw new Error('无法定位用户主目录');
const file = path.join(profile, '.omp/agent/models.yml');
const source = await fs.readFile(file, 'utf8');
const current = yaml.load(source);
if (current.providers?.[providerId]) {
  console.log(`OMP 已存在 ${providerId}，未覆盖`);
  process.exit(0);
}

const provider = {
  baseUrl: 'http://127.0.0.1:18796/v1',
  api: 'openai-completions',
  apiKey: token,
  compat: { supportsDeveloperRole: false },
  models: ['sonnet', 'opus', 'haiku'].map(name => ({
    id: `claude-code-${name}`,
    name: `Claude Code ${name} (Velella cloud)`,
    reasoning: false,
    input: ['text'],
    contextWindow: 64000,
    maxTokens: 8192,
  })),
};
const lines = source.split(/\r?\n/);
const index = lines.findIndex(line => /^providers:\s*$/.test(line));
if (index < 0) throw new Error('无法安全增量更新 providers，请人工核对 YAML 格式');
const addition = yaml.dump({ [providerId]: provider }, { lineWidth: -1, noRefs: true })
  .trimEnd().split('\n').map(line => `  ${line}`);
lines.splice(index + 1, 0, ...addition);
const updated = lines.join('\n');
const parsed = yaml.load(updated);
delete parsed.providers[providerId];
if (JSON.stringify(parsed) !== JSON.stringify(current)) throw new Error('配置校验失败：其他设置发生变化');

await fs.copyFile(file, `${file}.before-velella-cloud-${Date.now()}`);
await fs.writeFile(file, updated, 'utf8');
console.log(`已新增 OMP provider ${providerId}；默认模型保持不变。`);
