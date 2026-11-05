import {isServerSearch} from './server-search.mjs';
import {inferServerSearch} from './server-search-engine.mjs';
import { toolSearchConfig } from './tool-search-config.mjs';
import { DEFAULT_CACHE_BREAKPOINT } from './cache-policy.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { gateway } from './server.mjs';
import { validatePromptProfile } from './context.mjs';
import { infer } from './engine.mjs';
import { checkCliVersion, readCliRelease } from './cli-compat.mjs';
import { loadExperimentUpstream } from './experiment-upstream.mjs';
import { validateNativeClientEnvironment,supportsNativeSearch } from './native-client-environment.mjs';
import { cloudModels, modelAliases, upstreamModels as claudeUpstreamModels } from './cloud-models.mjs';
import { withGatewayRules } from './gateway-rules.mjs';
import { sessionRelay } from './session-relay.mjs';

// 云端专用入口：官方 CLI 持有认证；网关仅检查登录布尔状态。
if (process.platform !== 'linux') throw new Error('此入口只在 Linux 云服务器运行');
const base = process.env.GATEWAY_STATE || '/home/harness/model-gateway';
// 异常自动取证仅落白名单元数据；设为 off 可关闭，正常请求不写文件。
const anomalyDir = process.env.GATEWAY_ANOMALY_DIR === 'off' ? undefined : process.env.GATEWAY_ANOMALY_DIR || path.join(base, 'anomalies');
// 实验默认关闭；单独进程显式开启，避免无意改变原生会话语义。
const promptProfile = validatePromptProfile(process.env.GATEWAY_PROMPT_PROFILE || 'standard');
if (process.env.GATEWAY_PROMPT_TRACE != null && !['0', '1'].includes(process.env.GATEWAY_PROMPT_TRACE)) throw new Error('GATEWAY_PROMPT_TRACE 必须为 0 或 1');
const promptTraceDir = process.env.GATEWAY_PROMPT_TRACE === '1' ? path.join(base, 'prompt-experiment') : undefined;
if ((promptProfile !== 'standard' || promptTraceDir) && process.env.GATEWAY_SESSION_RELAY === '1') throw new Error('提示词实验目前仅支持逐轮 CLI，请关闭原生会话模式');
const externalUpstream = await loadExperimentUpstream({provider:process.env.GATEWAY_EXPERIMENT_UPSTREAM || 'claude',keyFile:process.env.GATEWAY_GLM_KEY_FILE});
if (externalUpstream && process.env.GATEWAY_SESSION_RELAY === '1') throw new Error('GLM 实验仅支持逐轮 CLI');
const upstreamModels = externalUpstream ? Object.fromEntries(Object.keys(claudeUpstreamModels).map(id=>[id,externalUpstream.model])) : claudeUpstreamModels;
if (process.env.GATEWAY_PROMPT_TRACE_CONTENT != null && !['0','1'].includes(process.env.GATEWAY_PROMPT_TRACE_CONTENT)) throw new Error('详细内容日志开关无效');
const promptTraceContent = process.env.GATEWAY_PROMPT_TRACE_CONTENT === '1';
if (promptTraceContent && (!promptTraceDir || !externalUpstream)) throw new Error('详细内容日志仅允许在 GLM 实验且启用日志时使用');
if (process.env.GATEWAY_EXPERIMENT_CLIENT_ENV != null && !['0','1'].includes(process.env.GATEWAY_EXPERIMENT_CLIENT_ENV)) throw new Error('客户端环境实验开关无效');
const clientEnvironment = process.env.GATEWAY_EXPERIMENT_CLIENT_ENV === '1';
if (process.env.GATEWAY_NATIVE_CLIENT_ENV != null && !['0', '1'].includes(process.env.GATEWAY_NATIVE_CLIENT_ENV)) throw new Error('原生客户端环境实验开关无效');
const nativeClientEnvironment = process.env.GATEWAY_NATIVE_CLIENT_ENV === '1';
if (clientEnvironment && !externalUpstream) throw new Error('客户端环境修正仅允许 GLM 实验');
const home = path.join(base, externalUpstream ? 'glm-runtime-home' : 'runtime-home');
const cli = process.env.CLAUDE_BIN || '/usr/local/bin/velella-claude';
const configDir = externalUpstream ? path.join(home,'.claude') : process.env.CLAUDE_CONFIG_DIR || '/home/harness/state/runtime-home/.claude';
const port = Number(process.env.GATEWAY_PORT || 18796);
const maxOutputTokens = Number(process.env.GATEWAY_MAX_OUTPUT_TOKENS || 128000);
const timeoutMs = Number(process.env.GATEWAY_TIMEOUT_MS || 0);
const idleTimeoutMs = Number(process.env.GATEWAY_IDLE_TIMEOUT_MS || 180000);
// 长时间调用方工具不占用模型推理；独立于推理空闲时限与会话闲置回收。
const toolWaitTimeoutMs=Number(process.env.GATEWAY_TOOL_WAIT_TIMEOUT_MS||1800000);
if(!Number.isSafeInteger(toolWaitTimeoutMs)||toolWaitTimeoutMs<1000||toolWaitTimeoutMs>2147483647)throw new Error('工具总等待必须为 1000..2147483647 毫秒');
// 仅开放官方 ToolSearch 元数据发现，文件和命令工具仍由 Desktop 执行。
if (process.env.GATEWAY_TOOL_SEARCH != null && !['0', '1'].includes(process.env.GATEWAY_TOOL_SEARCH)) throw new Error('GATEWAY_TOOL_SEARCH 必须为 0 或 1');
const toolSearch = process.env.GATEWAY_TOOL_SEARCH !== '0';
const maxToolSearchCalls = Number(process.env.GATEWAY_MAX_TOOL_SEARCH_CALLS || 8);
toolSearchConfig({ toolSearch, maxToolSearchCalls });
const maxConcurrent = Number(process.env.GATEWAY_MAX_CONCURRENT || 3);
// 入站体在排队前已完整驻留内存，队列容量按 32MB 请求的峰值占用收窄。
const maxQueued = Number(process.env.GATEWAY_MAX_QUEUED || 8);
const queueTimeoutMs = Number(process.env.GATEWAY_QUEUE_TIMEOUT_MS || 600000);
const bodyIdleTimeoutMs = Number(process.env.GATEWAY_BODY_IDLE_TIMEOUT_MS || 30000);
const bodyTimeoutMs = Number(process.env.GATEWAY_BODY_TIMEOUT_MS || 600000);
const maxRequestBytes = Number(process.env.GATEWAY_MAX_REQUEST_BYTES || 32 * 1024 * 1024);
const maxImageBytes = Number(process.env.GATEWAY_MAX_IMAGE_BYTES || 5 * 1024 * 1024);
// 同时在场的入站体总量：按 MemoryMax=768M 反推，单份数据最多约四份副本同时存在。
const maxInflightBytes = Number(process.env.GATEWAY_MAX_INFLIGHT_BYTES || 64 * 1024 * 1024);
// 0 表示不施加额外工具数量或累计 CLI 输出限制；MCP 预算默认跟随入站体。
const maxTools = Number(process.env.GATEWAY_MAX_TOOLS || 0);
const maxCliOutputBytes = Number(process.env.GATEWAY_MAX_CLI_OUTPUT_BYTES || 0);
const maxMcpRequestBytes = Number(process.env.GATEWAY_MAX_MCP_REQUEST_BYTES || maxRequestBytes);
const contextWindow = Number(process.env.GATEWAY_CONTEXT_WINDOW || 400000);
if (!Number.isSafeInteger(contextWindow) || contextWindow < 100000 || contextWindow > 1000000) throw new Error('上下文窗口声明无效');
for (const value of [timeoutMs, idleTimeoutMs]) if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error('推理超时配置必须为 0..2147483647 毫秒；0 表示关闭');
if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 128000) throw new Error('输出 token 上限无效');
for (const [value, min, max] of [[maxRequestBytes, 1024, 256 * 1024 * 1024], [maxImageBytes, 1024, 32 * 1024 * 1024], [maxInflightBytes, 1024, 512 * 1024 * 1024]]) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('请求体或单图字节上限无效');
}
for (const value of [maxTools, maxCliOutputBytes]) if (!Number.isSafeInteger(value) || value < 0) throw new Error('工具数量或 CLI 输出字节上限无效');
if (!Number.isSafeInteger(maxMcpRequestBytes) || maxMcpRequestBytes < 1024 || maxMcpRequestBytes > 256 * 1024 * 1024) throw new Error('MCP 请求字节上限无效');
const startupCliVersion = await checkCliVersion(cli);
if (clientEnvironment && startupCliVersion !== '2.1.316') throw new Error('客户端环境修正仅验证过 CLI 2.1.316');
const startupRelease = await readCliRelease();
await validateNativeClientEnvironment({enabled:nativeClientEnvironment, release:startupRelease, cliVersion:startupCliVersion, externalUpstream, clientEnvironment, sessionRelay:process.env.GATEWAY_SESSION_RELAY === '1', home});
await fs.mkdir(home, { recursive: true, mode: 0o700 });
const token = (await fs.readFile(path.join(base, 'token'), 'utf8')).trim();
const models = cloudModels(contextWindow).map(item=>externalUpstream?{...item,display_name:'GLM-5.3 ('+item.anthropic_family_tier+' compatibility)',owned_by:'glm-experiment'}:item);
const rulesFile = process.env.GATEWAY_RULES_FILE;
// 候选默认关闭；开启后仅追加的真实指令可经原生MCP控制通道续接。
const liveInstructionUpdates = process.env.GATEWAY_LIVE_INSTRUCTION_UPDATES === '1';
// 保存真实原生会话以便完成轮次后恢复；须显式启用，不改变现有部署。
const persistentSessions = process.env.GATEWAY_NATIVE_SESSION_PERSISTENCE === '1';
const nativeSessionTtlMs = Number(process.env.GATEWAY_SESSION_TTL_MS || 1800000);
const archiveRetentionMs = Number(process.env.GATEWAY_ARCHIVE_RETENTION_DAYS || 30) * 86400000;
// 显式启用原生会话；关闭后恢复逐轮 CLI 路径，不在失败时自动双发。
const nativeRelay = process.env.GATEWAY_SESSION_RELAY === '1' ? sessionRelay({
  cli, home, configDir, modelFor: model => upstreamModels[model], maxSessions: Number(process.env.GATEWAY_MAX_SESSIONS || 2),
  sessionTtlMs: nativeSessionTtlMs,archiveRetentionMs,toolWaitTimeoutMs,
  maxTools, maxCliOutputBytes, maxMcpRequestBytes, cacheBreakpoint: process.env.GATEWAY_CACHE_BREAKPOINT || DEFAULT_CACHE_BREAKPOINT,
  maxImageBytes, maxOutputTokens, timeoutMs, idleTimeoutMs, toolSearch, maxToolSearchCalls, liveInstructionUpdates,
  persistentSessions, cliVersion: startupCliVersion, anomalyDir,
  requireLiveToolContinuation: true,
  preserveCancelledSession: true,
  allowToolHandoffUserMessages: true,
  onCliAudit: record => console.error(JSON.stringify(record)),
  onSessionEvent: record => console.error(JSON.stringify(record)),
}) : undefined;
function authStatus() {
  if (externalUpstream) return Promise.resolve({loggedIn:true,checked:false,authMode:'api_key',keyConfigured:true});
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
const nativeServerSearch=nativeClientEnvironment&&supportsNativeSearch(startupRelease);
const server = await gateway({ token, port, allowAuxiliaryRequests:nativeServerSearch, models, modelAliases, status: async () => ({ ...await authStatus(), cliVersion: (await readCliRelease())?.version || startupCliVersion, busy: server.busy || nativeRelay?.maintenance===true || (nativeRelay?.frozenSize || 0)>0,
  activeRequests: server.activeRequests, queuedRequests: server.queuedRequests, receivingRequests: server.receivingRequests, maxConcurrent, maxQueued, contextWindow, upstreamModels, promptProfile, promptTraceEnabled: Boolean(promptTraceDir), promptTraceContent, clientEnvironment, nativeClientEnvironment, nativeServerSearch, cliModified:startupRelease?.modified === true, cliPatchId:startupRelease?.modified ? startupRelease.patchId : null, upstreamProvider: externalUpstream?.provider || 'claude',
  nativeSessionRelay: Boolean(nativeRelay), nativeSessions: (nativeRelay?.size || 0)+(nativeRelay?.frozenSize || 0), nativeFrozenSessions:nativeRelay?.frozenSize || 0, liveInstructionUpdates: Boolean(nativeRelay) && liveInstructionUpdates,
  nativeSessionMaintenance:nativeRelay?.maintenance===true, nativeSessionPersistence: Boolean(nativeRelay) && persistentSessions,
  nativeCompactionProtocol:nativeRelay&&persistentSessions?'cli_command_boundary_v1':null,
  sessionRecoveryAvailable:Boolean(nativeRelay), nativeHistoryImportAllowed:false, nativeFreezePreservesProcess:true, nativeHistoryFallback: false, stickySessions: Boolean(nativeRelay), sessionErrorQuarantine: Boolean(nativeRelay),
  nativeSessionTtlMs,nativeArchiveRetentionMs:archiveRetentionMs,nativeToolWaitTimeoutMs:toolWaitTimeoutMs,strictNativeToolContinuation: Boolean(nativeRelay),
  inputModalities: ['text', 'image'], timeoutMs, idleTimeoutMs, toolSearch, maxToolSearchCalls, maxTools, maxCliOutputBytes, maxMcpRequestBytes, maxRequestBytes, maxImageBytes, maxInflightBytes, inflightBytes: server.inflightBytes }), maxOutputTokens, maxTools, maxConcurrent, maxQueued, queueTimeoutMs, bodyIdleTimeoutMs, bodyTimeoutMs, maxRequestBytes, maxImageBytes, maxInflightBytes,
  onTiming: process.env.GATEWAY_TIMING_DIAGNOSTICS === '0' ? undefined : record => console.error(JSON.stringify(record)),
  async beforeExecute(request) {
    if (externalUpstream) return;
    const auth = await authStatus();
    if (!auth.loggedIn) throw Object.assign(new Error(auth.checked ? 'AUTH_REQUIRED：请在云服务器登录 Claude Code' : 'AUTH_CHECK_FAILED：云端认证状态检查失败'), { status: auth.checked ? 401 : 503, code: auth.checked ? 'AUTH_REQUIRED' : 'AUTH_CHECK_FAILED' });
  },
  sessionControl:nativeRelay,
  execute: async (request, signal, onText, timing, affinity) => {
    const prepared = await withGatewayRules(request, rulesFile);
    if(isServerSearch(prepared)){
      if(!nativeServerSearch)throw Object.assign(new Error('当前 CLI 不支持服务端搜索'),{status:400,code:'UNSUPPORTED_PARAMETER'});
      return inferServerSearch(prepared,{cli,home,configDir,model:upstreamModels[request.model],signal,timing,promptProfile,timeoutMs,idleTimeoutMs,maxCliOutputBytes});
    }
    if (nativeRelay) return nativeRelay.infer(prepared, { signal, onText, timing, affinity });
    return infer(prepared, { cli, home, configDir, model: upstreamModels[request.model], signal, onText, timing,
    anomalyDir, cliVersion: (await readCliRelease())?.version || startupCliVersion, promptProfile, promptTraceDir, promptTraceContent, externalUpstream, clientEnvironment, traceSecrets:[token],
    maxTools, maxCliOutputBytes, maxMcpRequestBytes, cacheBreakpoint: process.env.GATEWAY_CACHE_BREAKPOINT || DEFAULT_CACHE_BREAKPOINT, maxImageBytes, maxOutputTokens, timeoutMs, idleTimeoutMs, toolSearch, maxToolSearchCalls });
  },
});
console.log(`云端模型入口监听 127.0.0.1:${port}；工具由客户端执行`);
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, async () => { if(nativeRelay?.maintenance){console.error(JSON.stringify({type:'shutdown_blocked',code:'SESSION_MAINTENANCE'}));return;} if(nativeRelay?.frozenSize){console.error(JSON.stringify({type:'shutdown_blocked',code:'FROZEN_SESSION_RETAINED',sessions:nativeRelay.frozenSize}));return;} await server.close(); await nativeRelay?.close(); process.exit(0); });
