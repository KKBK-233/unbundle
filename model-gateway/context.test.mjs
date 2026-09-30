import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { compileContext } from './context.mjs';
import { infer } from './engine.mjs';

const tools = [{ type: 'function', function: { name: 'read_file', description: 'TOOL_DESCRIPTION_SENTINEL', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }];

test('指令只传一次，工具定义不嵌入历史，调用方原始内容不被删改', () => {
  const messages = [
    { role: 'system', content: 'SYSTEM_SENTINEL' },
    { role: 'developer', content: [{ type: 'text', text: 'DEVELOPER_SENTINEL' }] },
    { role: 'user', content: '重复原文应保留' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: '重复原文应保留' },
  ];
  const request = { messages, tools };
  const original = structuredClone(request);
  const compiled = compileContext(request);
  assert.deepEqual(request, original);
  assert.equal(compiled.systemPrompt.split('SYSTEM_SENTINEL').length - 1, 1);
  assert.equal(compiled.systemPrompt.split('DEVELOPER_SENTINEL').length - 1, 1);
  assert(!compiled.input.includes('SYSTEM_SENTINEL'));
  assert(!compiled.input.includes('DEVELOPER_SENTINEL'));
  assert(!compiled.input.includes('TOOL_DESCRIPTION_SENTINEL'));
  assert.deepEqual(JSON.parse(compiled.input).message.content.map(block => JSON.parse(block.text)), messages.slice(2));
  assert.equal(compiled.metrics.toolCount, 1);
  assert.deepEqual(compiled.exposedTools[0].inputSchema, tools[0].function.parameters);
  assert.equal(compiled.metrics.historyBytes, Buffer.byteLength(compiled.input));
  assert(!JSON.stringify(compiled.metrics).includes('SENTINEL'));
  assert.deepEqual(compileContext({ messages, tools, tool_choice: 'none' }).exposedTools, []);
  assert.throws(() => compileContext({ messages: [{ role: 'user', content: [{ type: 'image_url' }] }] }), /只支持文本/);
});

// 使用 Node 模拟 CLI，只读取临时协议文件并请求回环 MCP，不启动真实 Claude。
const fakeCli = `
import fs from 'node:fs/promises';
const args = process.argv.slice(1);
const value = flag => args[args.indexOf(flag) + 1];
const system = await fs.readFile(value('--system-prompt-file'), 'utf8');
const config = JSON.parse(await fs.readFile(value('--mcp-config'), 'utf8'));
let input = ''; for await (const chunk of process.stdin) input += chunk;
const conversation = { messages: JSON.parse(input).message.content.map(block => JSON.parse(block.text)) };
const mcp = config.mcpServers.omp;
const rpc = async (method, params) => {
  const response = await fetch(mcp.url, { method: 'POST', headers: { ...mcp.headers, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return (await response.json()).result;
};
const exposed = mcp ? (await rpc('tools/list')).tools : [];
if (conversation.messages.at(-1)?.content === 'REQUEST_TOOL') {
  console.log(JSON.stringify({type:'assistant',message:{id:'msg_tool',content:[{type:'tool_use',id:'call_1',name:'mcp__omp__'+exposed[0].name,input:{path:'proof.txt'}}]}}));
  console.log(JSON.stringify({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'}}}));
  await rpc('tools/call', { name: exposed[0].name, arguments: { path: 'proof.txt' } });
} else {
  console.log(JSON.stringify({ type: 'result', result: JSON.stringify({ system, conversation, exposed, args }) }));
}
`;

test('模拟进程验证长指令文件、工具往返和临时文件清理', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gateway-context-'));
  const options = {
    cli: 'mock-only', home, model: 'mock-model', timeoutMs: 10000,
    spawnProcess: (_cli, args, options) => spawn(process.execPath, ['--input-type=module', '-e', fakeCli, '--', ...args], options),
  };
  try {
    const instruction = 'CALLER_RULE_中文'.repeat(4000);
    const messages = [{ role: 'system', content: instruction }, { role: 'user', content: 'REQUEST_TOOL' }];
    const first = await infer({ messages, tools }, options);
    assert.equal(first.tool_calls[0].function.name, 'read_file');
    assert.deepEqual(JSON.parse(first.tool_calls[0].function.arguments), { path: 'proof.txt' });
    messages.push(first, { role: 'tool', tool_call_id: first.tool_calls[0].id, content: 'REAL_TOOL_RESULT' });
    const next = JSON.parse((await infer({ messages, tools }, options)).content);
    assert(next.system.includes(instruction));
    assert.deepEqual(next.conversation.messages, messages.slice(1));
    assert.equal(next.exposed.length, 1);
    assert.equal(next.exposed[0].name, 'read_file');
    assert.equal(next.args[next.args.indexOf('--tools') + 1], '');
    assert(!next.args.includes('--bare'));
    assert(!next.args.includes('--append-system-prompt'));
    assert(!next.args.includes('--resume'));
    assert(!next.args.some(arg => arg.includes(instruction)));
    const none = JSON.parse((await infer({ messages, tools, tool_choice: 'none' }, options)).content);
    assert.deepEqual(none.exposed, []);
    assert.deepEqual(await fs.readdir(home), ['workspace']);
    await fs.rmdir(path.join(home, 'workspace'));
  } finally {
    await fs.rmdir(home);
  }
});
