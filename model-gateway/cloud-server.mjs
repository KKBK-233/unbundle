import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { gateway } from './server.mjs';
import { infer } from './engine.mjs';
import { checkCliVersion } from './cli-compat.mjs';

// 云端专用入口：官方 CLI 持有认证；网关仅检查登录布尔状态。
if (process.platform !== 'linux') throw new Error('此入口只在 Linux 云服务器运行');
const base = process.env.GATEWAY_STATE || '/home/harness/model-gateway';
const home = path.join(base, 'runtime-home');
const cli = process.env.CLAUDE_BIN || '/usr/local/bin/velella-claude';
const configDir = process.env.CLAUDE_CONFIG_DIR || '/home/harness/state/runtime-home/.claude';
const port = Number(process.env.GATEWAY_PORT || 18796);
const maxOutputTokens = Number(process.env.GATEWAY_MAX_OUTPUT_TOKENS || 128000);
const timeoutMs = Number(process.env.GATEWAY_TIMEOUT_MS || 600000);
const idleTimeoutMs = Number(process.env.GATEWAY_IDLE_TIMEOUT_MS || 180000);
const maxConcurrent = Number(process.env.GATEWAY_MAX_CONCURRENT || 3);
const maxQueued = Number(process.env.GATEWAY_MAX_QUEUED || 64);
const queueTimeoutMs = Number(process.env.GATEWAY_QUEUE_TIMEOUT_MS || 600000);
const contextWindow = Number(process.env.GATEWAY_CONTEXT_WINDOW || 400000);
if (!Number.isSafeInteger(contextWindow) || contextWindow < 100000 || contextWindow > 1000000) throw new Error('上下文窗口声明无效');
for (const value of [timeoutMs, idleTimeoutMs]) if (!Number.isSafeInteger(value) || value < 1 || value > 1800000) throw new Error('推理超时配置必须为 1..1800000 毫秒');
if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 128000) throw new Error('输出 token 上限无效');
await checkCliVersion(cli);
await fs.mkdir(home, { recursive: true, mode: 0o700 });
const token = (await fs.readFile(path.join(base, 'token'), 'utf8')).trim();
const models = ['sonnet', 'opus', 'haiku'].map(name => ({ id: `claude-code-${name}`, object: 'model', owned_by: 'velella-cloud', context_window: name === 'haiku' ? Math.min(200000, contextWindow) : contextWindow }));
function authStatus() {
  return new Promise(resolve => {
    execFile(cli, ['auth', 'status', '--json'], {
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: home, CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      timeout: 15000, maxBuffer: 65536,
    }, (error, output) => {
      try { const value = JSON.parse(output); resolve({ loggedIn: !error && value.loggedIn === true, checked: typeof value.loggedIn === 'boolean' }); }
      catch { resolve({ loggedIn: false, checked: false }); }
    });
  });
}
const server = await gateway({ token, port, models, status: async () => ({ ...await authStatus(), busy: server.busy,
  activeRequests: server.activeRequests, queuedRequests: server.queuedRequests, maxConcurrent, maxQueued, contextWindow }), maxOutputTokens, maxConcurrent, maxQueued, queueTimeoutMs,
  onTiming: process.env.GATEWAY_TIMING_DIAGNOSTICS === '0' ? undefined : record => console.error(JSON.stringify(record)),
  async beforeExecute(request) {
    const auth = await authStatus();
    if (!auth.loggedIn) throw Object.assign(new Error(auth.checked ? 'AUTH_REQUIRED：请在云服务器登录 Claude Code' : 'AUTH_CHECK_FAILED：云端认证状态检查失败'), { status: 503, code: auth.checked ? 'AUTH_REQUIRED' : 'AUTH_CHECK_FAILED' });
  },
  execute: (request, signal, onText, timing) => infer(request, { cli, home, configDir, model: request.model.slice('claude-code-'.length), signal, onText, timing,
    cacheBreakpoint: process.env.GATEWAY_CACHE_BREAKPOINT || '5m', maxOutputTokens, timeoutMs, idleTimeoutMs }),
});
console.log(`云端模型入口监听 127.0.0.1:${port}；工具由客户端执行`);
for (const event of ['SIGINT', 'SIGTERM']) process.once(event, async () => { await server.close(); process.exit(0); });
