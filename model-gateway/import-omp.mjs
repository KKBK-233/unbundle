import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { providerId, modelId, modelSelector, stateDir, modelsFile } from './config.mjs';

// 只新增独立供应商；解析前后校验其余设置，已有同名项不静默覆盖。
export async function importOmp({ file = modelsFile(), folder = stateDir } = {}) {
  let source = '';
  try { source = await fs.readFile(file, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const current = yaml.safeLoad(source) || {};
  if (typeof current !== 'object' || Array.isArray(current)) throw new Error('OMP 配置必须为对象');
  if (current.providers !== undefined && (!current.providers || typeof current.providers !== 'object' || Array.isArray(current.providers))) throw new Error('providers 必须为对象');
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const tokenFile = path.join(folder, 'token');
  if (Object.hasOwn(current.providers || {}, providerId)) {
    const token = await fs.readFile(tokenFile, 'utf8').catch(() => '');
    if (!token.trim() || current.providers[providerId]?.apiKey !== token.trim()) throw new Error('同名 OMP 供应商与本地令牌不一致，未覆盖；请核对配置');
    return { changed: false };
  }
  try { await fs.writeFile(tokenFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const token = (await fs.readFile(tokenFile, 'utf8')).trim();
  if (!token) throw new Error('本地令牌为空');
  const provider = { baseUrl: 'http://127.0.0.1:18795/v1', api: 'openai-completions', apiKey: token,
    compat: { supportsDeveloperRole: false }, models: [{ id: modelId, name: 'Claude Code Relay + DeepSeek (experimental)',
      reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 8192 }] };
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let updated;
  if (current.providers === undefined) {
    updated = source + (source && !source.endsWith('\n') ? newline : '') + yaml.safeDump({ providers: { [providerId]: provider } }, { lineWidth: -1, noRefs: true }).replaceAll('\n', newline);
  } else {
    const lines = source.split(/\r?\n/);
    const index = lines.findIndex(line => /^providers:\s*(?:#.*)?$/.test(line));
    if (index < 0) throw new Error('无法安全增量更新 providers；请将其改为 YAML 多行映射格式');
    const addition = yaml.safeDump({ [providerId]: provider }, { lineWidth: -1, noRefs: true }).trimEnd().split('\n').map(line => '  ' + line);
    lines.splice(index + 1, 0, ...addition);
    updated = lines.join(newline);
  }
  const parsed = yaml.safeLoad(updated);
  delete parsed.providers[providerId];
  if (current.providers === undefined) delete parsed.providers;
  if (JSON.stringify(parsed) !== JSON.stringify(current)) throw new Error('配置校验失败：其他设置发生变化');
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const backup = source ? `${file}.before-${providerId}-${Date.now()}` : undefined;
  if (backup) await fs.copyFile(file, backup);
  await fs.writeFile(file, updated, { encoding: 'utf8', mode: 0o600 });
  return { changed: true, backup };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await importOmp();
  console.log(result.changed ? `已新增 OMP 模型 ${modelSelector}；默认模型和其他供应商保持不变。` : 'OMP 模型已导入，未修改配置。');
  if (result.backup) console.log(`配置备份：${result.backup}`);
}
