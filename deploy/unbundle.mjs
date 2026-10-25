import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const entry = path.join(root, 'deploy/unbundle.mjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
const emit = value => console.log(JSON.stringify(value));

// 参数只影响独立部署配置；SSH 密码、账号令牌和私钥不接受为命令行参数。
export function parseOptions(args) {
  const options = { command: args[0] || 'help', profile: 'default' };
  if (!['help', 'install', 'start', 'stop', 'login', 'doctor', 'export-client', 'tunnel-worker','sessions','session-recover','session-handoff'].includes(options.command)) throw new Error('未知命令：' + options.command);
  const flags = new Set(['live', 'no-autostart']);
  const values = new Set(['profile', 'host', 'identity', 'ssh-port', 'local-port', 'proxy-jump','session','output']);
  for (let index = 1; index < args.length; index++) {
    const name = args[index].replace(/^--/, '');
    if (!args[index].startsWith('--')) throw new Error('无效参数');
    if (flags.has(name)) options[name] = true;
    else if (values.has(name) && args[index + 1] && !args[index + 1].startsWith('--')) options[name] = args[++index];
    else throw new Error(`未知参数或缺少值：--${name}`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(options.profile)) throw new Error('部署配置名只能包含字母、数字、短横线和下划线');
  for (const key of ['host', 'proxy-jump']) if (options[key] && (!/^[a-zA-Z0-9_.@:[\],-]+$/.test(options[key]) || options[key].startsWith('-'))) throw new Error('SSH 目标格式无效');
  for (const key of ['ssh-port', 'local-port']) if (options[key] && (!/^\d+$/.test(options[key]) || +options[key] < 1 || +options[key] > 65535)) throw new Error('端口必须为 1..65535');
  return options;
}

// 整段远端脚本使用同一权限执行，避免 sudo 只覆盖首条命令。
export const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
export const rootCommand = command => `if [ "$(id -u)" = 0 ]; then sh -c ${shellQuote(command)}; else sudo -n sh -c ${shellQuote(command)}; fi`;

// 复用用户的 SSH 配置与 agent；严格校验已知主机，不转发本地 agent 到服务器。
export function sshArgs(profile, { interactive = false, forward = false } = {}) {
  const args = ['-o', 'StrictHostKeyChecking=yes', '-o', 'ForwardAgent=no', '-o', 'ConnectTimeout=15'];
  if (!interactive) args.push('-o', 'BatchMode=yes');
  if (profile.identity) args.push('-i', profile.identity);
  if (profile.sshPort) args.push('-p', String(profile.sshPort));
  if (profile.proxyJump) args.push('-J', profile.proxyJump);
  if (interactive) args.push('-tt');
  if (forward) args.push('-N', '-T', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3', '-L', `127.0.0.1:${profile.localPort}:127.0.0.1:18796`);
  args.push(profile.host);
  return args;
}

function execute(binary, args, { input, inherit = false, outputFile } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: root, windowsHide: !inherit,
      stdio: inherit ? 'inherit' : ['pipe', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.once('error', reject);
    if (!inherit) {
      child.stdout.on('data', chunk => {
        if (outputFile) process.stdout.write(chunk);
        else output = (output + chunk).slice(-65536);
      });
      child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4096); });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    child.once('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(
      binary === 'ssh' ? `SSH/远端步骤失败（${code}）：${errors.trim() || '请检查上方阶段日志'}` : `${binary} 退出码 ${code}`)));
  });
}

// 只重试连接级失败；安装任务通过固定临时单元去重，断线不会重新执行正在运行的安装。
async function sshCommand(profile, command, options) {
  for (let attempt = 0; ; attempt++) {
    try { return await execute('ssh', [...sshArgs(profile), command], options); }
    catch (error) {
      if (attempt >= 3 || !/SSH\/远端步骤失败（255）/.test(error.message)
        || !/reset|closed|timed out|broken pipe|refused/i.test(error.message)) throw error;
      emit({ ssh: 'retry', attempt: attempt + 1 });
      await pause(2000 * (attempt + 1));
    }
  }
}

const profileDir = name => path.join(root, '.local/profiles', name);
async function profileOf(name) {
  const profile = JSON.parse(await fs.readFile(path.join(profileDir(name), 'profile.json'), 'utf8'));
  parseOptions(['help', '--profile', name, '--host', profile.host, '--local-port', String(profile.localPort)]);
  return profile;
}
async function jsonFile(file, value) {
  const temp = file + '.tmp';
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temp, file);
}
async function tokenOf(name) { return (await fs.readFile(path.join(profileDir(name), 'gateway-token'), 'utf8')).trim(); }
async function statusOf(name) {
  const profile = await profileOf(name);
  const response = await fetch(`http://127.0.0.1:${profile.localPort}/status`, {
    headers: { authorization: `Bearer ${await tokenOf(name)}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`网关状态 HTTP ${response.status}`);
  return response.json();
}
async function availablePort(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => server.close(resolve));
}

// 首次生成独立访问令牌；重跑复用原配置，拒绝把旧令牌无意发送到另一台服务器。
async function prepare(options) {
  const folder = profileDir(options.profile);
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, 'profile.json');
  if (await exists(file)) {
    const previous = await profileOf(options.profile);
    if (options.host && options.host !== previous.host) throw new Error('已有配置对应另一台服务器，请另选 --profile');
    for (const [key, field] of [['local-port', 'localPort'], ['ssh-port', 'sshPort'], ['identity', 'identity'], ['proxy-jump', 'proxyJump']]) {
      if (options[key] && String(previous[field] || '') !== options[key]) throw new Error(`已有配置的 --${key} 不同，请另选 --profile`);
    }
    return previous;
  }
  if (!options.host) throw new Error('首次安装需提供 --host，例如 root@203.0.113.10 或已有 SSH Host 名');
  const profile = { schemaVersion: 1, transport: 'ssh', host: options.host, localPort: +(options['local-port'] || 18796),
    ...(options.identity ? { identity: path.resolve(options.identity) } : {}),
    ...(options['ssh-port'] ? { sshPort: +options['ssh-port'] } : {}),
    ...(options['proxy-jump'] ? { proxyJump: options['proxy-jump'] } : {}) };
  await availablePort(profile.localPort);
  const tokenFile = path.join(folder, 'gateway-token');
  try { await fs.writeFile(tokenFile, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await jsonFile(file, profile);
  return profile;
}

async function install(options) {
  const profile = await prepare(options);
  const folder = profileDir(options.profile);
  // 只打包明确列出的程序，不上传 .local、用户配置、SSH 私钥或 Claude 登录文件。
  const archive = path.join(folder, 'source.tar.gz');
  await execute('tar', ['-czf', archive, '--exclude=__pycache__', '--exclude=*.pyc', 'model-gateway', 'src', 'deploy', 'package.json', 'package-lock.json']);
  const remote = (command, extra) => sshCommand(profile, command, extra);
  const stateFile = path.join(folder, 'install-state.json');
  const saved = await exists(stateFile) ? JSON.parse(await fs.readFile(stateFile, 'utf8')) : {};
  const stage = saved.stage || await remote('umask 077; mktemp -d /var/tmp/unbundle-install.XXXXXXXX');
  if (!/^\/var\/tmp\/unbundle-install\.[a-zA-Z0-9]+$/.test(stage)) throw new Error('远端临时目录格式无效');
  await jsonFile(stateFile, { stage });
  const unit = `unbundle-install-${options.profile}`;
  const asRoot = rootCommand;
  const running = await remote(asRoot(`systemctl is-active ${unit} 2>/dev/null || true`));
  if (!['active', 'activating'].includes(running)) {
    await remote(`mkdir -p ${stage} && cat > ${stage}/source.tar.gz`, { input: await fs.readFile(archive) });
    await remote(`umask 077; cat > ${stage}/gateway-token`, { input: await fs.readFile(path.join(folder, 'gateway-token')) });
    // 极简系统可能尚无 Python；前置安装也放在独立单元，SSH 中断不会杀掉 apt。
    const bootstrap = `if ! command -v python3 >/dev/null; then `
      + `printf '%s\\n' '{"state":"running","phase":"python"}' > ${stage}/result.json; `
      + `if ! (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3); then `
      + `printf '%s\\n' '{"state":"failed","phase":"python","reason":"Python bootstrap failed"}' > ${stage}/result.json; exit 1; fi; fi; `
      + `exec python3 ${stage}/deploy/bootstrap.py --source ${stage} --token-file ${stage}/gateway-token --result-file ${stage}/result.json`;
    await remote(`tar -xzf ${stage}/source.tar.gz -C ${stage} && ` + asRoot(
      `if systemctl is-active --quiet ${unit}; then true; else systemctl reset-failed ${unit} 2>/dev/null; rm -f ${stage}/result.json; systemd-run --quiet --collect --unit=${unit} sh -c ${shellQuote(bootstrap)}; fi`));
  }
  let lastPhase, completed = false, polls = 0;
  const deadline = Date.now() + 45 * 60000;
  while (Date.now() < deadline) {
    const raw = await remote(asRoot(`if test -f ${stage}/result.json; then cat ${stage}/result.json; else printf '{}'; fi`));
    const result = JSON.parse(raw);
    if (result.phase && result.phase !== lastPhase) { emit(result); lastPhase = result.phase; }
    if (result.state === 'failed') throw new Error(`安装失败：${result.reason}。修复后重跑同一 install 命令。`);
    if (result.state === 'completed') { completed = true; break; }
    if (++polls % 6 === 0) {
      const active = await remote(asRoot(`systemctl is-active ${unit} 2>/dev/null || true`));
      if (!['active', 'activating', 'reloading'].includes(active)) throw new Error('安装进程意外退出；请检查远端安装单元日志，然后重跑同一命令');
    }
    await pause(5000);
  }
  if (!completed) throw new Error('安装尚未结束，稍后重跑同一命令读取原任务进度');
  // 安装成功才删除本次上传的临时目录；失败时保留用于重跑诊断。
  await remote(asRoot(`rm -rf -- ${stage}`));
  await fs.rm(stateFile, { force: true });
  await start(options.profile);
  if (!options['no-autostart']) await autostart(options.profile);
  await exportClient(options.profile);
  await doctor(options.profile, false);
}

// 后台维护 SSH 转发；重连只恢复通道，不声称恢复已断开的模型请求。
async function worker(name) {
  const folder = profileDir(name), profile = await profileOf(name);
  const lock = path.join(folder, 'tunnel.lock'), stopped = path.join(folder, 'tunnel.stop');
  let file;
  try { file = await fs.open(lock, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const old = Number(await fs.readFile(lock, 'utf8'));
    if (Number.isInteger(old) && old > 0) {
      try { process.kill(old, 0); return; } catch {}
    } else if (Date.now() - (await fs.stat(lock)).mtimeMs < 10000) return;
    await fs.unlink(lock); file = await fs.open(lock, 'wx', 0o600);
  }
  await file.writeFile(String(process.pid)); await file.close();
  let ending = false, child;
  const stop = () => { ending = true; child?.kill(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const monitor = setInterval(async () => { if (await exists(stopped)) stop(); }, 1000);
  try {
    let delay = 1000;
    while (!ending && !await exists(stopped)) {
      await availablePort(profile.localPort);
      const started = Date.now();
      const code = await new Promise(resolve => {
        child = spawn('ssh', sshArgs(profile, { forward: true }), { windowsHide: true, stdio: 'ignore' });
        child.once('error', () => resolve(-1)); child.once('close', resolve);
      });
      await jsonFile(path.join(folder, 'tunnel-status.json'), { state: ending ? 'stopped' : 'reconnecting', lastExit: code, at: new Date().toISOString() });
      if (!ending) await pause(delay);
      delay = Date.now() - started > 60000 ? 1000 : Math.min(delay * 2, 30000);
    }
  } finally { clearInterval(monitor); child?.kill(); await fs.rm(lock, { force: true }); }
}

async function start(name) {
  const folder = profileDir(name);
  await fs.rm(path.join(folder, 'tunnel.stop'), { force: true });
  try { await statusOf(name); emit({ tunnel: 'ready', profile: name }); return; } catch {}
  const profile = await profileOf(name);
  await availablePort(profile.localPort);
  // 启动前先验证 SSH 登录和转发策略，认证失败不会留下隐藏的重试循环。
  await sshCommand(profile, 'true');
  const child = spawn(process.execPath, [entry, 'tunnel-worker', '--profile', name], {
    detached: true, windowsHide: true, stdio: 'ignore' });
  child.unref();
  for (let attempt = 0; attempt < 45; attempt++) {
    try { await statusOf(name); emit({ tunnel: 'ready', profile: name, localPort: profile.localPort }); return; }
    catch { await pause(1000); }
  }
  await fs.writeFile(path.join(folder, 'tunnel.stop'), 'startup-failed');
  throw new Error('SSH 隧道未就绪；检查远端 AllowTcpForwarding、端口占用及 SSH 连接');
}

async function autostart(name) {
  if (process.platform !== 'win32') { emit({ autostart: 'manual', next: `node deploy/unbundle.mjs start --profile ${name}` }); return; }
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const args = `"${entry}" tunnel-worker --profile ${name}`;
  const script = `$ErrorActionPreference='Stop'
$action=New-ScheduledTaskAction -Execute ${quote(process.execPath)} -Argument ${quote(args)}
$user=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName ${quote('Unbundle-' + name)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
`;
  try {
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
    emit({ autostart: 'windows-logon-task', profile: name });
  } catch { emit({ autostart: 'not-installed', profile: name, next: `node deploy/unbundle.mjs start --profile ${name}` }); }
}

// 导出 CLI 专用设置与 Desktop 填写说明，不覆盖客户端现有供应商或活动配置。
async function exportClient(name) {
  const profile = await profileOf(name), folder = profileDir(name), base = `http://127.0.0.1:${profile.localPort}`;
  await jsonFile(path.join(folder, 'claude-code.settings.json'), { env: {
    ANTHROPIC_BASE_URL: base, ANTHROPIC_AUTH_TOKEN: await tokenOf(name),
    ANTHROPIC_MODEL: 'claude-code-sonnet', ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-code-sonnet',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-code-opus', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-code-haiku',
  } });
  await jsonFile(path.join(folder, 'desktop-config.json'), {
    inferenceProvider: 'gateway', inferenceGatewayBaseUrl: base,
    inferenceGatewayApiKey: await tokenOf(name), inferenceGatewayAuthScheme: 'bearer',
    inferenceModels: ['sonnet', 'opus', 'haiku'].map(tier => ({ name: `claude-${tier}-5-5`,
      labelOverride: `${tier[0].toUpperCase()}${tier.slice(1)} 5.5`, anthropicFamilyTier: tier, isFamilyDefault: true })),
    modelCatalogEnabled: true, defaultModelEffort: 'medium',
  });
  await fs.writeFile(path.join(folder, 'desktop-setup.md'), `# Claude Desktop 接入\n\n先运行 doctor，确认隧道和登录。\n\n打开 Help → Troubleshooting → Enable Developer Mode，重启后进入 Developer → Configure Third-Party Inference。创建独立配置，优先导入同目录 desktop-config.json；没有导入入口时手动填写：\n\n- Gateway URL：${base}\n- 认证：Bearer Token（或 x-api-key）\n- 令牌：读取同目录 gateway-token，勿提交到 Git 或粘贴到公开聊天\n- 模型：claude-code-sonnet / claude-code-opus / claude-code-haiku\n\n保存后按客户端要求完全退出并重开。不会自动覆盖已有 Desktop 配置；CLI 的 settings 文件不控制 Desktop 路由。\n`, { mode: 0o600 });
  emit({ clientFiles: folder, desktopConfigured: false });
}

async function doctor(name, live) {
  const profile = await profileOf(name), base = `http://127.0.0.1:${profile.localPort}`;
  const headers = { authorization: `Bearer ${await tokenOf(name)}`, 'content-type': 'application/json' };
  const status = await statusOf(name);
  const rejected = await fetch(base + '/v1/models', { signal: AbortSignal.timeout(5000) });
  if (rejected.status !== 401) throw new Error('网关匿名访问未被拒绝');
  const modelsResponse = await fetch(base + '/v1/models', { headers, signal: AbortSignal.timeout(5000) });
  const models = await modelsResponse.json();
  if (!modelsResponse.ok || models.data?.length !== 3) throw new Error('模型列表检查失败');
  const result = { profile: name, tunnel: true, gateway: true, authenticationEnforced: true,
    loggedIn: status.loggedIn === true, checked: status.checked === true, cliVersion: status.cliVersion,
    maxConcurrent: status.maxConcurrent, inferenceTested: false, desktopTested: false };
  if (live) {
    if (!result.loggedIn) throw new Error('请先运行 login，由账号持有人完成官方授权');
    const response = await fetch(base + '/v1/messages', { method: 'POST', headers, signal: AbortSignal.timeout(180000),
      body: JSON.stringify({ model: 'claude-code-sonnet', max_tokens: 1024, output_config: { effort: 'low' },
        messages: [{ role: 'user', content: '这是部署连通性检查。只回复 UNBUNDLE_OK。' }] }) });
    const value = await response.json();
    if (!response.ok || !value.content?.some(block => block.type === 'text' && block.text.trim() === 'UNBUNDLE_OK')) throw new Error('真实推理未返回预期的验收标记');
    result.inferenceTested = true;
  }
  emit(result);
  await jsonFile(path.join(profileDir(name), 'doctor-result.json'), result);
}

async function sessionAction(options) {
 const profile=await profileOf(options.profile),id=options.session;
 if(options.command!=='sessions'&&!/^(?:[a-f0-9]{24}|[a-f0-9-]{36})$/i.test(id||''))throw new Error('需要 --session 会话标识');
 const action=options.command==='session-recover'?'recover':'handoff';
 const route=options.command==='sessions'?'/sessions':`/sessions/${id}/${action}`;
 const response=await fetch(`http://127.0.0.1:${profile.localPort}${route}`,{method:options.command==='session-recover'?'POST':'GET',headers:{authorization:`Bearer ${await tokenOf(options.profile)}`},signal:AbortSignal.timeout(20000)});
 const body=await response.json();if(!response.ok)throw new Error(`${body.error?.code||response.status}：${body.error?.message||'会话操作失败'}`);
 if(options.command==='session-handoff'){
  const output=options.output?path.resolve(options.output):path.join(profileDir(options.profile),`handoff-${id}.md`);
  await fs.writeFile(output,body.markdown,{mode:0o600,flag:'wx'});emit({handoffFile:output,modelRequests:0});
 }else emit(body);
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  switch (options.command) {
    case 'sessions': case 'session-recover': case 'session-handoff': await sessionAction(options);break;
    case 'install': await install(options); break;
    case 'start': await start(options.profile); break;
    case 'tunnel-worker': await worker(options.profile); break;
    case 'stop': await fs.writeFile(path.join(profileDir(options.profile), 'tunnel.stop'), 'user-requested'); emit({ stopping: options.profile }); break;
    case 'login': {
      const profile = await profileOf(options.profile);
      await execute('ssh', [...sshArgs(profile, { interactive: true }), 'if [ "$(id -u)" = 0 ]; then bash /home/harness/app/deploy/model-login.sh; else sudo -n bash /home/harness/app/deploy/model-login.sh; fi'], { inherit: true });
      break;
    }
    case 'doctor': await doctor(options.profile, options.live); break;
    case 'export-client': await exportClient(options.profile); break;
    default: console.log('Unbundle：install --host root@VPS [--profile 名称] [--local-port 18796]；sessions / session-recover --session ID / session-handoff --session ID；login / start / stop / doctor [--live] / export-client --profile 名称');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
