import fs from 'node:fs/promises';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseOptions, sshArgs, shellQuote, rootCommand, packageSource, unpackSourceCommand } from '../deploy/unbundle.mjs';

// 安装器必须在接管前拒绝其他应用、错误令牌和忙碌请求，所有数据均为合成数据。
test('首次安装与重跑保护已有服务、应用和令牌', () => {
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'unittest', 'test_bootstrap.py'],
    { cwd: path.resolve(import.meta.dirname, '../deploy'), timeout: 15000 });
});

// 对抗参数注入及配置越界；这些输入不能进入 SSH 或文件系统操作。
test('部署参数拒绝命令注入、路径穿越和无效端口', () => {
  for (const args of [
    ['install', '--profile', '../other'], ['install', '--host', '-oProxyCommand=bad'],
    ['install', '--host', 'root@host;touch bad'], ['install', '--ssh-port', '0'],
    ['install', '--local-port', '65536'], ['install', '--password', 'SYNTHETIC'],
    ['install', '--identity'], ['install', '--unknown'], ['instlal'],
  ]) assert.throws(() => parseOptions(args));
  assert.deepEqual(parseOptions(['install', '--host', 'my-vps', '--profile', 'community', '--local-port', '18797']),
    { command: 'install', profile: 'community', host: 'my-vps', 'local-port': '18797' });
});

// sudo 必须执行完整脚本，内部单引号保持字面量，不能由外层 shell 提前解析。
test('远端提升权限包装完整脚本并引用内部单引号', () => {
  const script = "printf '%s' 'synthetic'; test -f /tmp/example";
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
  const command = rootCommand(script);
  assert(command.includes(`then sh -c ${shellQuote(script)}; else sudo -n sh -c ${shellQuote(script)}; fi`));
});

// 保留用户 SSH 配置与密钥代理；隧道必须显式绑定本机回环并拒绝转发失败。
test('SSH 隧道参数复用已有配置，密钥作为独立参数且不关闭主机校验', () => {
  const profile = { host: 'my-vps', identity: 'C:/synthetic path/id_ed25519', sshPort: 2222, proxyJump: 'my-jump', localPort: 18797 };
  const args = sshArgs(profile, { forward: true });
  assert(args.includes('StrictHostKeyChecking=yes'));
  assert(args.includes('ForwardAgent=no'));
  assert(args.includes('ExitOnForwardFailure=yes'));
  assert(args.includes('127.0.0.1:18797:127.0.0.1:18796'));
  assert.equal(args[args.indexOf('-i') + 1], profile.identity);
  assert.equal(args.at(-1), 'my-vps');
  assert(!args.includes('-F')); assert(!args.includes('-A'));
  const interactive = sshArgs(profile, { interactive: true });
  assert(interactive.includes('-tt')); assert(!interactive.includes('BatchMode=yes'));
});

// 使用真实仓库清单打包，确保删除旧目录后安装链路仍可运行。
test('当前安装源可打包且只包含程序清单',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'unbundle-package-'));
 try{
  const archive=path.join(folder,'source.tar.gz');await packageSource(archive);
  const files=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
  assert(files.includes('model-gateway/messages.mjs'));
  assert(files.includes('deploy/bootstrap.py'));
  assert(files.every(file=>/^(model-gateway\/|deploy\/|package(?:-lock)?\.json$)/.test(file)));
  assert(!files.some(file=>file.includes('cloud-client.mjs')||file.includes('import-omp.mjs')));
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});

// 在 POSIX 执行实际远端解压命令，重试来源不能继承旧 staging 内的已删文件。
test('失败重跑从全新目录解压源码，拒绝复用已有目录', {skip: process.platform === 'win32'}, async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'unbundle-retry-'));
  try {
    const archive = path.join(folder, 'source.tar.gz');
    await packageSource(archive);
    await fs.mkdir(path.join(folder, 'deploy'));
    await fs.writeFile(path.join(folder, 'deploy/install-frp.sh'), 'STALE');
    await fs.writeFile(path.join(folder, 'gateway-token'), 'SYNTHETIC');
    for (const name of ['source-first', 'source-retry']) {
      const destination = path.join(folder, name);
      execFileSync('sh', ['-c', unpackSourceCommand(folder, destination)]);
      assert.equal(await fs.readFile(path.join(folder, 'gateway-token'), 'utf8'), 'SYNTHETIC');
      await fs.access(path.join(destination, 'deploy/bootstrap.py'));
      await assert.rejects(fs.access(path.join(destination, 'deploy/install-frp.sh')), {code: 'ENOENT'});
      assert.throws(() => execFileSync('sh', ['-c', unpackSourceCommand(folder, destination)], {stdio: 'pipe'}));
    }
  } finally { await fs.rm(folder, {recursive: true, force: true}); }
});
