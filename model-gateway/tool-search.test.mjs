import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CliEvents } from './cli-events.mjs';
import { infer } from './engine.mjs';
import { sessionRelay } from './session-relay.mjs';
import { toolSearchConfig } from './tool-search-config.mjs';
import { assistantMessage } from './session-history.mjs';

const start = id => ({ type: 'stream_event', event: { type: 'message_start', message: { id, usage: { input_tokens: 10, output_tokens: 0 } } } });
const search = id => ({ type: 'assistant', message: { id: 'search-' + id, usage: { input_tokens: 10, output_tokens: 5 },
  content: [{ type: 'tool_use', id, name: 'ToolSearch', input: { query: 'select:mcp__omp__Read' } }] } });
const end = { type: 'stream_event', event: { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } } };

test('只在显式启用时允许官方元数据搜索；不开放服务器文件或命令工具', () => {
  assert.equal(toolSearchConfig().builtin, ''); assert.equal(toolSearchConfig({ toolSearch: true }).builtin, 'ToolSearch');
  assert.throws(() => toolSearchConfig({ maxToolSearchCalls: 0 }));
  assert.throws(() => new CliEvents([], undefined).accept(search('s1')), /无效的工具调用/);
  const events = new CliEvents([], undefined, [], { allowToolSearch: true });
  events.accept(start('first')); events.accept(search('s1')); events.accept(end);
  assert.equal(events.calls.size, 0); assert.equal(events.toolEnd, false);
  assert.throws(() => events.accept({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'bad', name: 'Bash', input: {} }] } }), /无效的工具调用/);
});

test('内部搜索的聚合和流式事件去重，搜索后真实 MCP 调用仍完整交付，用量跨消息累计', () => {
  const events = new CliEvents([{ name: 'Read', original: 'Read' }], undefined, [], { allowToolSearch: true });
  events.accept(start('first'));
  events.accept({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 's1', name: 'ToolSearch', input: {} } } });
  events.accept({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"select:mcp__omp__Read"}' } } });
  events.accept({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } });
  events.accept(end); events.accept({ ...search('s1'), message: { ...search('s1').message, id: 'first' } });
  assert.equal(events.searchCalls.size, 1); assert.equal(events.toolEnd, false);
  events.accept(start('second'));
  events.accept({ type: 'assistant', message: { id: 'second', content: [{ type: 'tool_use', id: 'real', name: 'mcp__omp__Read', input: { path: 'local.txt' } }] } });
  events.accept(end);
  assert.equal(events.toolEnd, true); assert.equal(events.calls.size, 1);
  assert.equal(events.calls.get('real').function.name, 'Read'); assert.equal(events.usage().usage.completion_tokens, 10);
});

test('反复搜索有明确次数上限，重复快照不占额外次数', () => {
  const events = new CliEvents([], undefined, [], { allowToolSearch: true, maxToolSearchCalls: 1 });
  events.accept(start('first')); events.accept(search('s1')); events.accept(search('s1'));
  assert.throws(() => events.accept(search('s2')), { code: 'TOOL_SEARCH_LIMIT', status: 422, retryable: false });
});

// 只模拟官方事件形状；不执行官方 CLI，不声称验证实际上游 schema 已减少。
const fake = `import readline from 'node:readline';
const send=x=>console.log(JSON.stringify(x));
readline.createInterface({input:process.stdin}).once('line',()=>{
send({type:'stream_event',event:{type:'message_start',message:{id:'discovery',usage:{input_tokens:10,output_tokens:0}}}});
send({type:'assistant',message:{id:'discovery',content:[{type:'tool_use',id:'search',name:'ToolSearch',input:{query:'select:mcp__omp__Read'}}]}});
send({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:5}}});
send({type:'stream_event',event:{type:'message_start',message:{id:'answer',usage:{input_tokens:20,output_tokens:0}}}});
send({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'READY'}}});
send({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:7}}});
send({type:'result',result:'READY',usage:{input_tokens:30,output_tokens:12}});
});`;

for (const native of [false, true]) test(`${native ? '原生会话' : '独立进程'}：搜索留在 CLI 内部，保留真实用量，启动参数不开放其他内置工具`, async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'discovery-test-')); let launch;
  const options = { cli: 'synthetic', home, model: 'claude-code-sonnet', maxOutputTokens: 1024, timeoutMs: 5000, toolSearch: true,
    spawnProcess(_cli, args, o) { launch = { args, env: o.env }; return spawn(process.execPath, ['--input-type=module', '-e', fake], o); } };
  const request = { model: options.model, max_tokens: 1024, messages: [{ role: 'user', content: '合成搜索任务' }] };
  const original = JSON.stringify(request), visible = [];
  const relay = native ? sessionRelay(options) : undefined;
  try {
    const result = native ? await relay.infer(request, { onText: text => visible.push(text) }) : await infer(request, { ...options, onText: text => visible.push(text) });
    assert.equal(result.content, 'READY'); assert.equal(result.tool_calls, undefined); assert.equal(result.usage.completion_tokens, 12);
    assert.equal(visible.join(''), 'READY'); assert.equal(JSON.stringify(request), original);
    assert.equal(launch.env.ENABLE_TOOL_SEARCH, 'true');
    assert.equal(launch.args[launch.args.indexOf('--tools') + 1], 'ToolSearch');
    assert.equal(launch.env.ANTHROPIC_BASE_URL, undefined); assert.equal(launch.env.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(launch.args[launch.args.indexOf('--allowedTools') + 1], 'ToolSearch');
    assert.equal(launch.args[launch.args.indexOf('--allowedTools') + 2], 'mcp__omp__*');
  } finally { await relay?.close({discardFrozen:true}); await fs.rm(home, { recursive: true, force: true }); }
});

test('内部搜索后的真实 MCP 调用只交给 Desktop，原样交回结果后复用会话', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'discovery-handoff-')); let spawns = 0;
  const fixture = `import fs from 'node:fs';import readline from 'node:readline';
const config=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).mcpServers.omp;
const send=x=>console.log(JSON.stringify(x));
const start=id=>send({type:'stream_event',event:{type:'message_start',message:{id,usage:{input_tokens:10,output_tokens:0}}}});
const stop=()=>send({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:2}}});
const rpc=(id,method,params)=>fetch(config.url,{method:'POST',headers:{...config.headers,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})}).then(r=>r.json());
readline.createInterface({input:process.stdin}).once('line',async()=>{
 start('search');send({type:'assistant',message:{id:'search',content:[{type:'tool_use',id:'discovery',name:'ToolSearch',input:{query:'select:mcp__omp__Read'}}]}});stop();
 const found=await rpc('list','tools/list');if(found.result.tools[0].name!=='Read')throw Error('wrong mapping');
 start('read');send({type:'assistant',message:{id:'read',content:[{type:'tool_use',id:'real-read',name:'mcp__omp__Read',input:{path:'desktop-only.txt'}}]}});stop();
 const reply=await rpc('call','tools/call',{name:'Read',arguments:{path:'desktop-only.txt'},_meta:{'claudecode/toolUseId':'real-read'}});
 if(reply.result.content[0].text!=='REAL_DESKTOP_RESULT')throw Error('result changed');
 start('answer');send({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'DONE'}}});
 send({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:3}}});
 send({type:'result',result:'DONE',usage:{input_tokens:30,output_tokens:7}});
});`;
  const relay = sessionRelay({ cli: 'synthetic', home, model: 'claude-code-sonnet', maxOutputTokens: 1024, toolSearch: true, timeoutMs: 5000,
    spawnProcess(_cli, args, o) { spawns++; return spawn(process.execPath, ['--input-type=module', '-e', fixture, '--', args[args.indexOf('--mcp-config') + 1]], o); } });
  const request = { model: 'claude-code-sonnet', max_tokens: 1024, messages: [{ role: 'user', content: '合成 Desktop 交接' }],
    tools: [{ type: 'function', function: { name: 'Read', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }] };
  try {
    const first = await relay.infer(request);
    assert.equal(first.tool_calls.length, 1); assert.equal(first.tool_calls[0].function.name, 'Read');
    assert.equal(first.tool_calls[0].id, 'real-read'); assert.equal(first.usage.completion_tokens, 4);
    const next = await relay.infer({ ...request, messages: [...request.messages, assistantMessage(first),
      { role: 'tool', tool_call_id: 'real-read', content: 'REAL_DESKTOP_RESULT' }] });
    assert.equal(next.content, 'DONE'); assert.equal(next.usage.completion_tokens, 3); assert.equal(spawns, 1);
  } finally { await relay.close({discardFrozen:true}); await fs.rm(home, { recursive: true, force: true }); }
});
