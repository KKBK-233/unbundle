import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { modelFrpConfig } from './frp-config.mjs';
import { serverToml } from '../src/frp.mjs';

// 只生成本项目私有配置，不输出令牌；CA 私钥不会写入部署目录。
const root = path.resolve(import.meta.dirname, '..');
const folder = path.join(root, '.local/model-gateway');
const frp = path.join(root, '.local/frp');
const cloud = JSON.parse(await fs.readFile(path.join(root, '.local/cloud.json'), 'utf8'));
await fs.mkdir(folder, { recursive: true, mode: 0o700 });
const file = path.join(folder, 'stcp-secret');
try { await fs.writeFile(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
const secret = (await fs.readFile(file, 'utf8')).trim();
await fs.writeFile(path.join(folder, 'visitor.toml'), modelFrpConfig({ visitor: true, secret, host: cloud.host, serverPort: cloud.frpPort || 18469, certDir: path.join(frp, 'pki'), tokenFile: path.join(frp, 'token') }), { mode: 0o600 });
const serverState = cloud.serverStateDir || '/home/harness/model-gateway';
const serverFrp = cloud.serverFrpDir || '/etc/harness-frp';
await fs.writeFile(path.join(folder, 'cloud-frpc.toml'), modelFrpConfig({
  visitor: false,
  secret,
  host: '127.0.0.1',
  serverPort: cloud.frpPort || 18469,
  certDir: path.posix.join(serverState, 'pki'),
  trustedCaFile: path.posix.join(serverFrp, 'pki/ca.crt'),
  tokenFile: path.posix.join(serverFrp, 'token'),
  certName: 'cloud',
}), { mode: 0o600 });
await fs.writeFile(path.join(frp, 'frps.server.toml'), serverToml({
  bindAddr: '0.0.0.0',
  serverPort: cloud.frpPort || 18469,
  certDir: '/etc/harness-frp/pki',
  tokenFile: '/etc/harness-frp/token',
}), { mode: 0o600 });
console.log('已生成双向 TLS 与加密 STCP 配置');
