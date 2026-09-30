import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import { gateway } from './server.mjs';

// 真实 OMP 连接本地合成网关，只读临时文件；不启动 Claude，不使用真实模型密钥。
const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-omp-'));
const token = 'synthetic-omp-test';
let calls = 0;
const app = await gateway({ token, port: 0, execute: async request => {
  calls++;
  console.log(JSON.stringify({ request: calls, fields: Object.keys(request).sort(), toolCount: request.tools?.length || 0 }));
  if (calls === 1) {
    assert(request.tools.some(tool => tool.function.name === 'read'));
    return { role: 'assistant', content: null, tool_calls: [{ id: 'omp_probe', type: 'function', function: { name: 'read', arguments: JSON.stringify({ path: path.join(folder, 'proof.txt') }) } }] };
  }
  assert(request.messages.some(message => message.role === 'tool' && JSON.stringify(message.content).includes('OMP_SYNTHETIC_PROOF')));
  return { role: 'assistant', content: 'OMP_PROTOCOL_OK' };
} });
try {
  const agent = path.join(folder, 'agent');
  await fs.mkdir(agent);
  await fs.writeFile(path.join(folder, 'proof.txt'), 'OMP_SYNTHETIC_PROOF');
  await fs.writeFile(path.join(agent, 'models.yml'), yaml.dump({ providers: { 'relay-probe': { api: 'openai-completions', baseUrl: `http://127.0.0.1:${app.port}/v1`, apiKey: token, compat: { supportsDeveloperRole: false }, models: [{ id: 'claude-code-sonnet', name: 'Synthetic', input: ['text'], reasoning: false, contextWindow: 64000, maxTokens: 8192 }] } } }));
  const child = spawn(process.env.OMP_BIN || 'omp', ['--model', 'relay-probe/claude-code-sonnet', '--smol', 'relay-probe/claude-code-sonnet', '--slow', 'relay-probe/claude-code-sonnet', '--plan', 'relay-probe/claude-code-sonnet', '--no-title', '--no-session', '--no-extensions', '--no-skills', '--no-rules', '--no-lsp', '--tools', 'read', '--max-time', '45', '-p', '读取 proof.txt，然后回答测试结果'], { cwd: folder, windowsHide: true, env: { ...process.env, PI_CODING_AGENT_DIR: agent, OMP_PROFILE: '', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', value => { output = (output + value).slice(-16000); });
  child.stderr.on('data', value => { output = (output + value).slice(-16000); });
  const timer = setTimeout(() => child.kill(), 60000);
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 0, output);
    assert.equal(calls, 2, output);
    assert(output.includes('OMP_PROTOCOL_OK'), output);
    console.log('PASS: real OMP, request validation and local tool round trip');
  } finally { clearTimeout(timer); child.kill(); }
} finally {
  await app.close();
  await fs.rm(folder, { recursive: true, force: true });
}
