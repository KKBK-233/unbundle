import fs from 'node:fs/promises';
import path from 'node:path';
import tls from 'node:tls';
import assert from 'node:assert/strict';

// 隧道已启动时执行：只检查认证与证书，不发起模型推理。
const root = path.resolve(import.meta.dirname, '..');
const cloud = JSON.parse(await fs.readFile(path.join(root, '.local/cloud.json'), 'utf8'));
const token = (await fs.readFile(path.join(root, '.local/model-gateway/cloud-token'), 'utf8')).trim();
const base = 'http://127.0.0.1:18796';
const headers = { Authorization: `Bearer ${token}` };
assert.equal((await fetch(base + '/v1/models')).status, 401);
assert.equal((await fetch(base + '/v1/models', { headers: { Authorization: 'Bearer wrong-token' } })).status, 401);
assert.equal((await fetch(base + '/v1/models', { headers: { ...headers, Origin: 'https://untrusted.invalid' } })).status, 403);
const models = await (await fetch(base + '/v1/models', { headers })).json();
assert.deepEqual(models.data.map(item => item.id.replace(/^claude-code-(sonnet|opus|haiku)$/, 'claude-$1-5-5')), ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']);
const status = await (await fetch(base + '/status', { headers })).json();
assert.equal(status.checked, true);
if (!status.loggedIn) {
  const response = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-code-sonnet', messages: [{ role: 'user', content: 'auth-check' }], stream: true }) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'AUTH_REQUIRED');
}
const ca = await fs.readFile(path.join(root, '.local/frp/pki/ca.crt'));
await new Promise((resolve, reject) => {
  const socket = tls.connect({ host: cloud.host, port: cloud.frpPort || 18469, servername: 'harness-frps', ca });
  const timer = setTimeout(() => { socket.destroy(); reject(new Error('未收到双向 TLS 拒绝结果')); }, 10000);
  socket.once('error', error => { clearTimeout(timer); socket.destroy(); if (/certificate required|handshake failure/i.test(error.message)) resolve(); else reject(error); });
});
console.log(JSON.stringify({ gatewayAuth: 'PASS', originRejected: 'PASS', missingClientCertificate: 'REJECTED', cloudLoggedIn: status.loggedIn }));
