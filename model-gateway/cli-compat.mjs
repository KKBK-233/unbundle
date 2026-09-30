import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// 版本只允许已完成协议验收的 CLI；升级后先跑模拟上游探针，再修改白名单。
export const SUPPORTED_CLI_VERSIONS = ['2.1.277'];
export function validateCliVersion(output) {
  const version = output.trim().match(/^(\d+\.\d+\.\d+)(?:\s|$)/)?.[1];
  if (!SUPPORTED_CLI_VERSIONS.includes(version)) throw new Error(`未验收的 Claude CLI 版本；需要 ${SUPPORTED_CLI_VERSIONS.join(', ')}`);
  return version;
}
export async function checkCliVersion(cli) {
  const { stdout } = await promisify(execFile)(cli, ['--version'], { timeout: 15000, maxBuffer: 4096 });
  return validateCliVersion(stdout);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(await checkCliVersion(process.argv[2]));
