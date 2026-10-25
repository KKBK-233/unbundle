import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

// 本地只管理 frp 加密隧道和 OMP，所有 Claude 进程均在云端。
const root = path.resolve(import.meta.dirname, '..');
const folder = path.join(root, '.local/model-gateway');
const cloud = JSON.parse(await fs.readFile(path.join(root, '.local/cloud.json'), 'utf8'));
const token = (await fs.readFile(path.join(folder, 'cloud-token'), 'utf8')).trim();
const args = process.argv.slice(2);
const headers = { Authorization: `Bearer ${token}` };
const base = 'http://127.0.0.1:18796';
let tunnel, omp, stopping = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready() {
  try {
    const response = await fetch(`${base}/v1/models`, { headers, signal: AbortSignal.timeout(1500) });
    const value = await response.json();
    return response.ok && value.data?.some(model => ['claude-code-sonnet', 'claude-sonnet-5-5'].includes(model.id) && model.owned_by === 'velella-cloud');
  } catch { return false; }
}
function stop() { if (stopping) return; stopping = true; omp?.kill(); tunnel?.kill(); }
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, stop);
try {
  if (!await ready()) {
    const frpc = cloud.frpc || path.join(root, '.local/frp/frp_0.71.0_windows_amd64/frpc.exe');
    tunnel = spawn(frpc, ['-c', path.join(folder, 'visitor.toml')],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let frpError = '', failed = false;
    tunnel.stderr.on('data', chunk => { frpError = (frpError + chunk).slice(-2000); });
    tunnel.stdout.on('data', chunk => { frpError = (frpError + chunk).slice(-2000); });
    tunnel.on('error', error => { failed = true; frpError = error.message; });
    let connected = false;
    for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
      if (await ready()) { connected = true; break; }
      if (failed || tunnel.exitCode !== null) break;
      await pause(500);
    }
    if (!connected) throw new Error(`云端隧道连接失败：${frpError}`);
  }
  if (args.includes('--tunnel')) {
    console.log('加密隧道已就绪。可在 OMP 选择 velella-cloud/claude-code-sonnet；Ctrl+C 关闭。');
    while (!stopping) { await pause(1000); if (tunnel && tunnel.exitCode !== null) throw new Error('frp 进程已退出'); }
  } else {
    const response = await fetch(`${base}/status`, { headers, signal: AbortSignal.timeout(20000) });
    const status = await response.json();
    if (args.includes('--check')) console.log(JSON.stringify({ tunnel: true, ...status }));
    else {
      if (!response.ok || !status.loggedIn) throw new Error('AUTH_REQUIRED：隧道和模型配置已就绪，请先在云端登录 Claude Code。');
      const noProxy = [process.env.NO_PROXY || process.env.no_proxy, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
      omp = spawn('omp', ['--model', 'velella-cloud/claude-code-sonnet', '--smol', 'velella-cloud/claude-code-haiku', '--slow', 'velella-cloud/claude-code-opus', '--plan', 'velella-cloud/claude-code-sonnet', '--no-title', ...args],
        { stdio: 'inherit', env: { ...process.env, NO_PROXY: noProxy, no_proxy: noProxy } });
      tunnel?.once('close', () => { if (!stopping) { console.error('frp 进程已退出，正在停止本次 OMP。'); omp?.kill(); } });
      process.exitCode = await new Promise((resolve, reject) => { omp.once('close', code => resolve(code ?? 1)); omp.once('error', reject); });
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { stop(); }
