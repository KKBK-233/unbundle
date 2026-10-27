import {cacheEnvironment} from './cache-policy.mjs';
import { toolSearchConfig } from './tool-search-config.mjs';
import { toolChoice, enforceToolChoice } from './tool-choice.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import readline from 'node:readline';
import { compileContext } from './context.mjs';
import { CliEvents } from './cli-events.mjs';
import { validateRequest } from './request.mjs';
import { resolveEffort } from './effort.mjs';
import { requestProbes } from './request-probes.mjs';
import { sessionQuotaFailure } from './session-quota-guard.mjs';

// 每轮独立进程、逐消息输入；工作目录固定，凭据继续由官方 CLI 管理。
export async function infer(request, { cli, home, configDir = path.join(home, '.claude'), model, signal, onText, timing, anomalyDir, cliVersion, toolSearch = false, maxToolSearchCalls = 8, timeoutMs = 0, idleTimeoutMs = 180000, spawnProcess = spawn, testUpstream, cacheBreakpoint = 'auto', maxImageBytes = 5 * 1024 * 1024, maxOutputTokens = 8192, killGraceMs = 2000, maxCliOutputBytes = 0, maxMcpRequestBytes = 32 * 1024 * 1024, maxTools = 0 }) {
  const discovery = toolSearchConfig({ toolSearch, maxToolSearchCalls });
  for (const value of [timeoutMs, idleTimeoutMs]) if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error('推理超时配置必须为 0..2147483647 毫秒；0 表示关闭');
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 128000) throw new Error('输出 token 上限无效');
  maxOutputTokens = validateRequest(request, { maxOutputTokens, maxImageBytes, maxTools });
  if (!Number.isSafeInteger(maxCliOutputBytes) || maxCliOutputBytes < 0) throw new Error('CLI 输出字节上限无效');
  if (!Number.isSafeInteger(maxMcpRequestBytes) || maxMcpRequestBytes < 1024 || maxMcpRequestBytes > 256 * 1024 * 1024) throw new Error('MCP 请求字节上限无效');
  const compiled = compileContext(request, { cacheBreakpoint, maxImageBytes, maxTools });
  const { available, exposedTools, metrics } = compiled;
  // 默认逐轮路线继续接受调用方历史；原生模式的检查点约束只在会话池中执行。
  const {systemPrompt, input} = compiled;
  timing?.mark('context_ready');
  if (process.env.GATEWAY_CONTEXT_DIAGNOSTICS === '1') console.error(JSON.stringify({ type: 'gateway_context_bytes', requestId: timing?.requestId, ...metrics, requestedOutputTokens: maxOutputTokens, effort: resolveEffort(request) || 'auto' }));
  await fs.mkdir(home, { recursive: true, mode: 0o700 });
  const cwd = path.join(home, 'workspace');
  await fs.mkdir(cwd, { recursive: true, mode: 0o700 });
  const work = await fs.mkdtemp(path.join(home, 'request-'));
  const bearer = randomBytes(32).toString('hex');
  const stops = request.stop == null ? [] : typeof request.stop === 'string' ? [request.stop] : request.stop;
  const probes = requestProbes({anomalyDir,requestId:timing?.requestId,
    context:{...metrics,model:request.model,effort:resolveEffort(request)||'auto',requestedOutputTokens:maxOutputTokens,cliVersion}});
  const policy = toolChoice(request);
  const events = new CliEvents(available, text => { probes.output(text); if (!policy.required && !policy.single) onText?.(text); }, stops, { allowToolSearch: discovery.enabled, maxToolSearchCalls: discovery.maxCalls });
  let probeOutcome = 'completed';
  let child, timer, idleTimer, killTimer, lines, errors = '', aborted = false, timedOut = false, idleTimedOut = false, protocolError;
  let outputBytes = 0, toolArgumentBytes = 0, upstreamMessages = 0, retryEvents = 0, mcpCalls = 0;
  // 仅向阶段日志提供大小和计数，不记录工具名、参数、回复或凭据。
  const observe = event => timing?.observe?.(event, { stdoutBytes: outputBytes, toolArgumentBytes, upstreamMessages, retryEvents, mcpCalls,
    pendingTools: events.blocks.size, completedTools: events.calls.size, recoveredToolStops: events.recoveredToolStops });
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
  // 思考与工具参数片段也算上游进展；CLI 自身心跳和 stderr 不延长无进展时限。
  const refreshProgress = () => {
    clearTimeout(idleTimer);
    if (idleTimeoutMs > 0) idleTimer = setTimeout(() => { idleTimedOut = true; timing?.mark('idle_timeout'); terminate(); }, idleTimeoutMs);
  };

  // MCP 仅提供工具定义；tools/call 不执行也不返回虚假结果，由消息结束事件终止 CLI。
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${bearer}`) { res.writeHead(401).end(); return; }
      if (req.method !== 'POST') { res.writeHead(405).end(); return; }
      let bytes = 0; const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > maxMcpRequestBytes) { res.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400).end(); return; }
      const reply = value => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: value }));
      if (body.method === 'initialize') reply({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'omp-tool-relay', version: '0.5.0' } });
      else if (body.method === 'tools/list') reply({ tools: exposedTools });
      else if (body.method === 'tools/call') {
        if (!available.some(item => item.name === body.params?.name)) { res.writeHead(400).end(); return; }
        mcpCalls++; observe('mcp_call');
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
      ENABLE_TOOL_SEARCH: discovery.environment, MCP_TOOL_TIMEOUT: String(timeoutMs || 2147483647), CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxOutputTokens) });
    Object.assign(env, cacheEnvironment(cacheBreakpoint));
    // 测试上游只经显式参数注入，正式订阅入口不会传入此参数。
    if (testUpstream) {
      Object.assign(env, { ANTHROPIC_BASE_URL: testUpstream.baseUrl, ANTHROPIC_AUTH_TOKEN: testUpstream.token });
      if (!testUpstream.preserveModelAliases) Object.assign(env, { ANTHROPIC_MODEL: model,
        ANTHROPIC_DEFAULT_SONNET_MODEL: model, ANTHROPIC_DEFAULT_HAIKU_MODEL: model, ANTHROPIC_DEFAULT_OPUS_MODEL: model });
    }
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', discovery.builtin, '--strict-mcp-config', '--mcp-config', mcp,
      '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',
      '--allowedTools', 'mcp__omp__*', '--no-session-persistence', '--max-turns', String(discovery.enabled ? discovery.maxCalls + 2 : 2), '--model', model, '--system-prompt-file', promptFile];
    if (discovery.enabled) args.splice(args.indexOf('--allowedTools') + 1, 0, 'ToolSearch');
    const effort = resolveEffort(request);
    if (effort) args.push('--effort', effort);
    await fs.writeFile(mcp, JSON.stringify({ mcpServers: available.length ? { omp: { type: 'http', url: `http://127.0.0.1:${server.address().port}/mcp`, headers: { Authorization: `Bearer ${bearer}` } } } : {} }), { mode: 0o600 });
    await fs.writeFile(promptFile, systemPrompt, { mode: 0o600 });
    signal?.throwIfAborted();
    child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    child.once('spawn', () => timing?.mark('cli_spawned'));
    const exited = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    // 有进展的长任务默认不受整轮时限限制；可单独启用总时限或无进展时限。
    if (timeoutMs > 0) timer = setTimeout(() => { timedOut = true; timing?.mark('total_timeout'); terminate(); }, timeoutMs);
    refreshProgress();
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-2000); });
    // 可选累计输出预算；默认不因协议与签名累计字节数中止有进展的请求。
    child.stdout.on('data', chunk => {
      outputBytes += chunk.length;
      if (maxCliOutputBytes > 0 && outputBytes > maxCliOutputBytes && !protocolError) {
        protocolError = new Error('CLI 输出超过字节上限'); lines?.close(); terminate();
      }
    });
    lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => {
      let event; try { event = JSON.parse(line); } catch { return; }
      probes.accept(event);
      timing?.mark('cli_first_event');
      const inner = event.type === 'stream_event' ? event.event : undefined;
      if (inner?.type === 'message_start') upstreamMessages++;
      if (inner?.type === 'content_block_delta' && inner.delta?.type === 'input_json_delta' && typeof inner.delta.partial_json === 'string') {
        toolArgumentBytes += Buffer.byteLength(inner.delta.partial_json);
      }
      if (event.type === 'system' && event.subtype === 'api_retry') { retryEvents++; observe('api_retry'); }
      if (['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'].includes(inner?.type)
        || ['assistant', 'result'].includes(event.type)) refreshProgress();
      if (inner?.type === 'message_start') {timing?.onUsage?.({upstream_usage:inner.message?.usage});timing?.mark('upstream_message_start');}
      if(event.type==='assistant'&&!event.is_api_error_message)timing?.onUsage?.({upstream_usage:event.message?.usage});
      if (inner?.type === 'content_block_delta' && inner.delta?.type === 'thinking_delta') timing?.mark('first_thinking');
      if (inner?.type === 'content_block_start' && inner.content_block?.type === 'tool_use') timing?.mark('first_tool');
      if (inner?.type === 'message_delta' && inner.delta?.stop_reason) timing?.mark('upstream_message_end');
      try {
        const closesTool = inner?.type === 'content_block_stop' && events.blocks.has(inner.index);
        events.accept(event);
        if (inner?.type === 'message_start') observe('message_start');
        else if (inner?.type === 'content_block_start' && inner.content_block?.type === 'tool_use') observe('tool_start');
        else if (inner?.type === 'content_block_delta') {
          const phase = { input_json_delta: 'tool_delta', thinking_delta: 'thinking', text_delta: 'text' }[inner.delta?.type];
          if (phase) observe(phase);
        } else if (closesTool) observe('tool_stop');
        else if (inner?.type === 'message_delta' && inner.delta?.stop_reason) observe('message_end');
        else if (['assistant', 'result'].includes(event.type)) observe(event.type);
        // 输出达到调用方上限即结束，防止 CLI 自行续写超过这一轮的额度。
        if (events.outputLimitReached || events.stopSequence !== undefined) kill('SIGKILL');
        else if (events.toolEnd) terminate();
      } catch (error) { protocolError = error; terminate(); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    const code = await exited;
    timing?.mark('cli_exit');
    if (aborted) throw new Error('请求已取消');
    if (timedOut) throw Object.assign(new Error(`推理达到总时限（${timeoutMs / 1000} 秒）`), { code: 'INFERENCE_TIMEOUT' });
    if (idleTimedOut) throw Object.assign(new Error(`上游连续 ${idleTimeoutMs / 1000} 秒没有推理进展`), { code: 'INFERENCE_IDLE_TIMEOUT' });
    if (protocolError) throw protocolError;
    if (events.stopSequence !== undefined || events.outputLimitReached || events.toolEnd) enforceToolChoice(policy, [...events.calls.values()], events.usage());
    if (events.stopSequence !== undefined) return { role: 'assistant', content: events.text, stop_sequence: events.stopSequence, ...events.usage() };
    events.flushText();
    if (events.outputLimitReached) return { role: 'assistant', content: events.text, finish_reason: 'length', ...events.usage() };
    if (events.toolEnd && events.calls.size) return { role: 'assistant', content: events.text || null, tool_calls: [...events.calls.values()], ...events.usage() };
    if (events.blocks.size || events.calls.size || events.toolEnd) throw new Error('CLI 工具消息不完整，未返回部分调用');
    if (code !== 0 || !events.result || events.result.is_error) {
      const detail = events.result?.result || errors;
      // 明确的账户额度错误交给服务层终止重试；不从模型正文或任意 stderr 猜测额度。
      const quota = events.result?.is_error && sessionQuotaFailure(events.result.result, events.usage());
      if (quota) throw quota;
      throw new Error((testUpstream ? String(detail || '').replaceAll(testUpstream.token, '[REDACTED]') : detail) || 'Claude 推理未完成');
    }
    if (!events.receivedText) { events.emit(events.result.result || ''); events.flushText(); }
    enforceToolChoice(policy, [], events.usage());
    return { role: 'assistant', content: events.text || '', ...(events.stopSequence !== undefined ? { stop_sequence: events.stopSequence } : {}), ...events.usage() };
  } catch (error) {
    probeOutcome = aborted ? 'cancelled' : timedOut || idleTimedOut ? 'timeout' : 'error';
    throw error;
  } finally {
    await probes.finish(probeOutcome);
    clearTimeout(timer); clearTimeout(idleTimer); clearTimeout(killTimer); signal?.removeEventListener('abort', stop); lines?.close();
    kill('SIGKILL'); server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await fs.rm(mcp, { force: true }); await fs.rm(promptFile, { force: true });
    await fs.rmdir(work).catch(() => {});
    timing?.mark('cleanup_complete');
  }
}
