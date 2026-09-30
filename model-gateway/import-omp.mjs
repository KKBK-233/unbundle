import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import yaml from 'js-yaml';

const providerId = 'velella-cloud';
const baseUrl = 'http://127.0.0.1:18796/v1';
const modelIds = ['sonnet', 'opus', 'haiku'].map(name => `claude-code-${name}`);
const readOptional = async file => { try { return await fs.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

// 先核对配置与令牌，再增量写入；既有供应商不自动覆盖，失配必须显式处理。
export async function importOmp({ file, tokenFile }) {
  const source = await readOptional(file);
  const current = yaml.load(source || '') ?? {};
  if (typeof current !== 'object' || Array.isArray(current) || (current.providers != null && (typeof current.providers !== 'object' || Array.isArray(current.providers)))) throw new Error('OMP 配置必须是 YAML 映射');
  const savedToken = await readOptional(tokenFile);
  const existing = current.providers?.[providerId];
  if (existing) {
    if (!savedToken?.trim() || existing.apiKey !== savedToken.trim()) throw new Error('已有 provider 与本地令牌缺失或不匹配；请核对云端令牌后手动同步，未修改配置');
    if (existing.baseUrl !== baseUrl || existing.api !== 'openai-completions' || !Array.isArray(existing.models) || modelIds.some(id => !existing.models.some(model => model.id === id))) throw new Error('已有 provider 地址、协议或模型不匹配；请人工核对，未修改配置');
    return { created: false };
  }
  if (savedToken !== null && !savedToken.trim()) throw new Error('本地令牌为空，未修改配置');
  const token = savedToken?.trim() || randomBytes(32).toString('hex');
  const provider = { baseUrl, api: 'openai-completions', apiKey: token,
    compat: { supportsDeveloperRole: false },
    models: modelIds.map(id => ({ id, name: `${id} (Velella cloud)`, reasoning: false, input: ['text'], contextWindow: 64000, maxTokens: 8192 })),
  };
  let updated;
  if (!Object.hasOwn(current, 'providers')) {
    updated = `${source || ''}\n${yaml.dump({ providers: { [providerId]: provider } }, { lineWidth: -1 })}`;
  } else {
    const lines = (source || '').split(/\r?\n/);
    const index = lines.findIndex(line => /^providers:\s*(?:\{\}\s*)?(?:#.*)?$/.test(line));
    if (index < 0) throw new Error('无法安全增量更新 providers，请人工核对 YAML 格式');
    lines[index] = lines[index].replace(/\{\}/, '');
    lines.splice(index + 1, 0, ...yaml.dump({ [providerId]: provider }, { lineWidth: -1 }).trimEnd().split('\n').map(line => `  ${line}`));
    updated = lines.join('\n');
  }
  const parsed = yaml.load(updated);
  const expected = { ...current, providers: { ...current.providers, [providerId]: provider } };
  if (!isDeepStrictEqual(parsed, expected)) throw new Error('配置校验失败：其他设置发生变化');
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.mkdir(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let createdToken = false;
  try {
    await fs.writeFile(temporary, updated, { flag: 'wx', mode: 0o600 });
    if (source !== null) await fs.copyFile(file, `${file}.before-velella-cloud-${Date.now()}`);
    if (savedToken === null) { await fs.writeFile(tokenFile, token, { flag: 'wx', mode: 0o600 }); createdToken = true; }
    await fs.rename(temporary, file);
  } catch (error) {
    if (createdToken) await fs.unlink(tokenFile);
    throw error;
  } finally { await fs.rm(temporary, { force: true }); }
  return { created: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const profile = process.env.USERPROFILE || process.env.HOME;
  if (!profile && !process.env.OMP_MODELS_FILE) throw new Error('无法定位用户主目录');
  const result = await importOmp({ file: process.env.OMP_MODELS_FILE || path.join(profile, '.omp/agent/models.yml'), tokenFile: path.resolve(import.meta.dirname, '../.local/model-gateway/cloud-token') });
  console.log(result.created ? '已新增 OMP 云端 provider；默认模型保持不变。' : 'OMP 云端 provider 与本地令牌一致。');
}
