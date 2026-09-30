import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline';
import { compileContext } from './context.mjs';
import { CliEvents } from './cli-events.mjs';
import { validateRequest } from './request.mjs';

// 每轮独立进程、逐消息输入；工作目录固定，凭据继续由官方 CLI 管理。
export async function infer(request, { cli, home, configDir = path.join(home, '.claude'), model, signal, onText, timeoutMs = 180000, spawnProcess = spawn, testUpstream, cacheBreakpoint = '5m', maxOutputTokens = 8192, killGraceMs = 2000, maxCliOutputBytes = 16 * 1024 * 1024 }) {
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 65536) throw new Error('输出 token 上限无效');
  maxOutputTokens = validateRequest(request, { maxOutputTokens });
  if (!Number.isSafeInteger(maxCliOutputBytes) || maxCliOutputBytes < 1) throw new Error('CLI 输出字节上限无效');
  const { systemPrompt, input, available, exposedTools, metrics } = compileContext(request, { cacheBreakpoint });
  if (process.env.GATEWAY_CONTEXT_DIAGNOSTICS === '1') console.error(JSON.stringify({ type: 'gateway_context_bytes', ...metrics }));
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  const cwd = path.join(home, 'workspace');
  await fs.mkdir(cwd, { recursive: true, mode: 0o700 });
  const work = await fs.mkdtemp(path.join(home, 'request-'));
  const bearer = randomBytes(32).toString('hex');
  const events = new CliEvents(available, onText);
  let child, timer, killTimer, lines, errors = '', aborted = false, timedOut = false, protocolError;
  const group = process.platform !== 'win32';
  // 先温和退出，超时后终止同一进程组，避免残留进程持有输出管道。
  const kill = signalName => {
    if (!child?.pid) return;
    try { if (group) process.kill(-child.pid, signalName); else child.kill(signalName); } catch {}
  };
  const terminate = () => {
    kill('SIGTERM');
    if (!killTimer) killTimer = setTimeout(() => kill('SIGKILL'), killGraceMs);
  };
  const stop = () => { aborted = true; terminate(); };

  // MCP 仅提供工具定义；tools/call 不执行也不返回虚假结果，由消息结束事件终止 CLI。
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      let bytes = 0; const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 4 * 1024 * 1024) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400).end(); return; }
      const reply = value => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: value }));
      if (body.method === 'initialize') reply({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'omp-tool-relay', version: '0.5.0' } });
      else if (body.method === 'tools/list') reply({ tools: exposedTools });
      else if (body.method === 'tools/call') {
        if (!available.some(item => item.name === body.params?.name)) { res.writeHead(400).end(); return; }
        res.on('error', () => {});
      } else if (body.id === undefined) res.writeHead(202).end();
      else reply({});
    } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
  });
  const mcp = path.join(work, 'mcp.json');
  const promptFile = path.join(work, 'system.txt');
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const env = {};
    for (const k of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG']) if (process.env[k]) env[k] = process.env[k];
    Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', DISABLE_AUTOUPDATER: '1',
      ENABLE_TOOL_SEARCH: 'false', MCP_TOOL_TIMEOUT: String(timeoutMs), CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxOutputTokens) });
    // 测试上游只经显式参数注入，正式订阅入口不会传入此参数。
    if (testUpstream) Object.assign(env, { ANTHROPIC_BASE_URL: testUpstream.baseUrl, ANTHROPIC_AUTH_TOKEN: testUpstream.token, ANTHROPIC_MODEL: model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: model, ANTHROPIC_DEFAULT_HAIKU_MODEL: model, ANTHROPIC_DEFAULT_OPUS_MODEL: model });
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,
      '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',
      '--allowedTools', 'mcp__omp__*', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile];
    await fs.writeFile(mcp, JSON.stringify({ mcpServers: available.length ? { omp: { type: 'http', url: `http://127.0.0.1:${server.address().port}/mcp`, headers: { Authorization: `Bearer ${bearer}` } } } : {} }), { mode: 0o600 });
    await fs.writeFile(promptFile, systemPrompt, { mode: 0o600 });
    signal?.throwIfAborted();
    child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-2000); });
    // 在 readline 累积超长行前限制总字节数，保护小内存服务器。
    let outputBytes = 0;
    child.stdout.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > maxCliOutputBytes && !protocolError) {
        protocolError = new Error('CLI 输出超过字节上限'); lines?.close(); terminate();
      }
    });
    lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      let event; try { event = JSON.parse(line); } catch { return; }
      try {
        events.accept(event);
        if (events.toolEnd) terminate();
      } catch (error) { protocolError = error; terminate(); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    const code = await exited;
    if (aborted) throw new Error('请求已取消');
    if (timedOut) throw new Error('推理超时');
    if (protocolError) throw protocolError;
    if (events.toolEnd && events.calls.size) return { role: 'assistant', content: events.text || null, tool_calls: [...events.calls.values()], ...events.usage() };
    if (events.calls.size || events.toolEnd) throw new Error('CLI 工具消息不完整，未返回部分调用');
    if (code !== 0 || !events.result || events.result.is_error) {
      const detail = events.result?.result || errors;
      throw new Error((testUpstream ? String(detail || '').replaceAll(testUpstream.token, '[REDACTED]') : detail) || 'Claude 推理未完成');
    }
    return { role: 'assistant', content: events.result.result || events.text || '', ...events.usage() };
  } finally {
    clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', stop); lines?.close();
    kill('SIGKILL'); server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await fs.rm(mcp, { force: true }); await fs.rm(promptFile, { force: true });
    await fs.rmdir(work).catch(() => {});
  }
}
