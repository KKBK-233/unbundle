import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import readline from 'node:readline';

// 每次调用均独立：完整历史由 OMP 提供，服务端不复用隐藏会话。
export async function infer(request, { cli, home, baseUrl, key, model, signal, timeoutMs = 180000 }) {
  if (!Array.isArray(request.messages) || !request.messages.length) throw new Error('messages 不能为空');
  const tools = request.tools || [];
  if (!Array.isArray(tools) || tools.length > 128) throw new Error('工具列表无效');
  const mapped = tools.map((tool, index) => {
    if (tool.type !== 'function' || !tool.function?.name || !tool.function.parameters) throw new Error('仅支持 function tools');
    return { name: `tool_${index}`, original: tool.function.name, description: `${tool.function.name}: ${tool.function.description || ''}`, inputSchema: tool.function.parameters };
  });
  for (const message of request.messages) {
    if (Array.isArray(message.content) && message.content.some(block => block.type !== 'text')) throw new Error('第一版只支持文本消息，不支持图片或音频');
  }
  if (request.tool_choice && request.tool_choice !== 'auto' && request.tool_choice !== 'none') throw new Error('第一版仅支持 tool_choice auto 或 none');
  const available = request.tool_choice === 'none' ? [] : mapped;
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  const work = await fs.mkdtemp(path.join(home, 'request-'));
  const bearer = randomBytes(32).toString('hex');
  let child, captured, result, errors = '', aborted = false, timedOut = false;
  // 此 MCP 只捕获工具请求并停止推理，绝不调用文件或命令执行器。
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4 * 1024 * 1024) { res.writeHead(413).end(); return; } }
    let body; try { body = JSON.parse(raw); } catch { res.writeHead(400).end(); return; }
    const reply = value => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: value }));
    if (body.method === 'initialize') reply({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'omp-tool-relay', version: '0.1.0' } });
    else if (body.method === 'tools/list') reply({ tools: available.map(({ original, ...tool }) => tool) });
    else if (body.method === 'tools/call') {
      const tool = available.find(item => item.name === body.params?.name);
      if (!tool) { res.writeHead(400).end(); return; }
      if (!captured) captured = { id: `call_${randomUUID().replaceAll('-', '')}`, type: 'function', function: { name: tool.original, arguments: JSON.stringify(body.params.arguments || {}) } };
      child?.kill();
      // 不向 CLI 返回成功结果，避免它把尚未执行的工具当成已执行。
      res.on('error', () => {});
    } else if (body.id === undefined) res.writeHead(202).end();
    else reply({});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const mcp = path.join(work, 'mcp.json');
  await fs.writeFile(mcp, JSON.stringify({ mcpServers: available.length ? { omp: { type: 'http', url: `http://127.0.0.1:${server.address().port}/mcp`, headers: { Authorization: `Bearer ${bearer}` } } } : {} }), { mode: 0o600 });
  const env = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG']) if (process.env[k]) env[k] = process.env[k];
  Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', DISABLE_AUTOUPDATER: '1',
    ENABLE_TOOL_SEARCH: 'false', MCP_TOOL_TIMEOUT: '180000', CLAUDE_CODE_MAX_OUTPUT_TOKENS: '8192' });
  if (key) Object.assign(env, { ANTHROPIC_BASE_URL: baseUrl, ANTHROPIC_AUTH_TOKEN: key, ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model, ANTHROPIC_DEFAULT_HAIKU_MODEL: model, ANTHROPIC_DEFAULT_OPUS_MODEL: model });
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,
    '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',
    '--allowedTools', 'mcp__omp__*', '--no-session-persistence', '--max-turns', '2', '--model', model,
    '--system-prompt', 'You are the model backend for OMP. Continue the conversation supplied as JSON, respecting its system/developer instructions. The messages array is the chronological conversation; role=tool entries are actual tool results from OMP. Use only supplied MCP tools when you need a tool. Never claim a tool executed before receiving its result. Do not describe the transport or JSON wrapper. Reply in the language of the user.'];
  const stop = () => { aborted = true; child?.kill(); };
  const timer = setTimeout(() => { timedOut = true; child?.kill(); }, timeoutMs);
  try {
    signal?.throwIfAborted();
    child = spawn(cli, args, { env, cwd: work, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    signal?.addEventListener('abort', stop, { once: true });
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-2000); });
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => { try { const event = JSON.parse(line); if (event.type === 'result') result = event; } catch {} });
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ messages: request.messages }));
    const code = await exited;
    if (aborted) throw new Error('请求已取消');
    if (timedOut) throw new Error('推理超时');
    if (captured) return { role: 'assistant', content: null, tool_calls: [captured] };
    if (code !== 0 || !result || result.is_error) throw new Error((key ? (result?.result || errors).replaceAll(key, '[REDACTED]') : result?.result || errors) || 'Claude 推理未完成');
    return { role: 'assistant', content: result.result || '' };
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', stop); child?.kill();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await fs.rm(mcp, { force: true });
    await fs.rmdir(work).catch(() => {});
  }
}
