import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';

// 版本只允许已完成协议验收的 CLI；升级后先跑模拟上游探针，再修改白名单。
export const SUPPORTED_CLI_VERSIONS = ['2.1.280'];
const releaseFile = () => process.env.GATEWAY_CLI_RELEASE_FILE || (process.platform === 'linux' ? '/usr/local/share/claude-relay/cli-release.json' : undefined);
export function validateCliVersion(output, accepted = SUPPORTED_CLI_VERSIONS) {
  const version = output.trim().match(/^(\d+\.\d+\.\d+)(?:\s|$)/)?.[1];
  if (!accepted.includes(version)) throw new Error(`未验收的 Claude CLI 版本；需要 ${accepted.join(', ')}`);
  return version;
}
// 自动更新器签名校验及模拟验收成功后写入只读凭据；请求进程不自行更新。
export async function readCliRelease(file = releaseFile()) {
  if (!file) return null;
  let stat;
  try { stat = await fs.stat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if ((stat.mode & 0o022) || (process.platform === 'linux' && stat.uid !== 0)) throw new Error('CLI 验收记录必须由 root 管理且不可由组或其他用户写入');
  const record = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(record.version) || !/^[a-f0-9]{64}$/.test(record.sha256) || record.protocol !== 1) throw new Error('CLI 验收记录无效');
  return record;
}
export async function checkCliVersion(cli, { releaseFile: file = releaseFile() } = {}) {
  const { stdout } = await promisify(execFile)(cli, ['--version'], { timeout: 15000, maxBuffer: 4096 });
  const release = await readCliRelease(file);
  if (!release) return validateCliVersion(stdout);
  const version = validateCliVersion(stdout, [release.version]);
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(cli)) digest.update(chunk);
  if (digest.digest('hex') !== release.sha256) throw new Error('CLI 二进制与验收记录不一致');
  return version;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(await checkCliVersion(process.argv[2]));
