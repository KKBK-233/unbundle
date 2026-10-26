import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { CliEvents } from './cli-events.mjs';
import { compileContext } from './context.mjs';
import { infer } from './engine.mjs';
import { gateway } from './server.mjs';

const tool = name => ({ type: 'function', function: { name, parameters: { type: 'object', properties: { path: { type: 'string' } } } } });
const request = { messages: [{ role: 'user', content: '请读文件' }], tools: [tool('read')] };
const stream = event => ({ type: 'stream_event', event });
const assistant = (id, name = 'mcp__omp__read') => ({ type: 'assistant', message: { id: 'msg_1', content: [{ type: 'tool_use', id, name, input: { path: id } }] } });

// 用进程模拟 CLI 达到输出上限后的续写，验证立即停止及两种 HTTP 响应的结束原因。
test('文本截断返回 length，停止续写且不暴露 CLI 错误消息', async () => {
 const home = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-limit-'));
 const fake = `for await (const c of process.stdin) {};
  const emit = x => console.log(JSON.stringify(x));
  emit({type:'stream_event',event:{type:'message_start',message:{id:'limit',usage:{input_tokens:1,output_tokens:0}}}});
  emit({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'X'}}});
  emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'max_tokens'},usage:{output_tokens:1}}});
  emit({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'continued output must not leak'}}});
  emit({type:'assistant',is_api_error_message:true,message:{content:[{type:'text',text:'API error must not leak'}]}});
  setInterval(()=>{},1000);`;
 const app = await gateway({ token: 'limit-test', port: 0, execute: (body, signal, onText) => infer(body, {
  cli: 'fake', home, model: 'mock', signal, onText, timeoutMs: 2000,
  spawnProcess: (_cli, _args, options) => spawn(process.execPath, ['--input-type=module', '-e', fake], options),
 }) });
 try {
  for (const stream of [false, true]) {
   const res = await fetch(`http://127.0.0.1:${app.port}/v1/chat/completions`, { method: 'POST',
    headers: { Authorization: 'Bearer limit-test', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-code-sonnet', messages: [{role:'user',content:'probe'}], max_tokens: 1, stream }),
   });
   assert.equal(res.status, 200);
   if (stream) { const text = await res.text(); assert(text.includes('"finish_reason":"length"')); assert(!text.includes('must not leak')); }
   else { const body = await res.json(); assert.equal(body.choices[0].finish_reason, 'length'); assert.equal(body.choices[0].message.content, 'X'); assert.equal(body.usage.completion_tokens, 1); }
  }
  const broken = new CliEvents([{name:'read',original:'read'}]); broken.accept(assistant('first'));
  assert.throws(()=>broken.accept({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'max_tokens'}}}), /工具消息不完整/);
  assert.deepEqual(await fs.readdir(home), ['workspace']);
 } finally { await app.close({discardFrozen:true}); await fs.rm(home, {recursive:true,force:true}); }
});

test('追加历史保留旧消息块，工具重排不会改变工具定义', () => {
  const base = { ...request, tools: [tool('write'), tool('read')] };
  const before = compileContext(base, {cacheBreakpoint:'5m'});
  const after = compileContext({ ...base, tools: [...base.tools].reverse(), messages: [...base.messages, { role: 'assistant', content: '已读' }] }, {cacheBreakpoint:'5m'});
  const blocks = input => JSON.parse(input).message.content;
  assert.equal(blocks(before.input)[0].text, blocks(after.input)[0].text);
  assert.deepEqual(before.exposedTools, after.exposedTools);
  assert.deepEqual(blocks(after.input).map(b => !!b.cache_control), [false, true]);
  assert.equal(blocks(compileContext(base, { cacheBreakpoint: 'off' }).input)[0].cache_control, undefined);
  assert.throws(() => compileContext({ ...request, tools: [tool('read'), tool('read')] }), /重复/);
  const long = tool('中文'.repeat(100));
  assert.equal(compileContext({ ...request, tools: [long] }).available[0].original, long.function.name);
});

test('并行工具等待消息结束；重复事件去重，流式用量不重复相加', () => {
  const output = [];
  const events = new CliEvents([{ name: 'read', original: 'read' }], value => output.push(value));
  events.accept(stream({ type: 'message_start', message: { id: 'msg_1', usage: { input_tokens: 100, output_tokens: 1, cache_read_input_tokens: 200, cache_creation_input_tokens: 50 } } }));
  events.accept(stream({ type: 'content_block_delta', delta: { type: 'text_delta', text: '读取中' } }));
  events.accept({ type: 'assistant', message: { content: [{ type: 'text', text: '读取中' }] } });
  events.accept(assistant('first')); events.accept(assistant('first'));
  assert.equal(events.toolEnd, false);
  events.accept(assistant('second'));
  events.accept(stream({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } }));
  assert.equal(events.toolEnd, true);
  assert.deepEqual([...events.calls.keys()], ['first', 'second']);
  assert.deepEqual(output, ['读取中']);
  assert.equal(events.usage().usage.prompt_tokens, 350);
  assert.equal(events.usage().usage.total_tokens, 370);
  assert.throws(() => events.accept(assistant('third', 'Bash')), /无效/);
  const missing = new CliEvents([]);
  missing.accept(stream({ type: 'message_start', message: { id: 'msg_missing', usage: { input_tokens: 10 } } }));
  assert.equal(missing.usage().usage_complete, false);
  assert.equal(missing.usage().usage, undefined);
});

// 在真实子进程中拉开两个工具事件的时间，确保网关不会在第一个调用后提前退出。
test('进程桥保留延迟到达的第二个工具，拒绝不完整消息并清理失败进程', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gateway-state-'));
  const fake = `
    let input='';for await(const c of process.stdin)input+=c;
    const text=JSON.parse(JSON.parse(input).message.content[0].text).content;
    if(text==='hang'){setInterval(()=>{},1000);} else {
      const emit=v=>console.log(JSON.stringify(v));
      emit(${JSON.stringify(assistant('first'))});
      await new Promise(r=>setTimeout(r,100));
      emit(${JSON.stringify(assistant('second'))});
      if(text!=='incomplete')emit(${JSON.stringify(stream({ type:'message_delta', delta:{stop_reason:'tool_use'} }))});
    }
  `;
  const options = { cli: 'fake', home, model: 'mock', timeoutMs: 5000,
    spawnProcess: (_cli, args, opts) => spawn(process.execPath, ['--input-type=module', '-e', fake], opts) };
  try {
    assert.equal((await infer(request, options)).tool_calls.length, 2);
    await assert.rejects(infer({ ...request, messages: [{ role:'user',content:'incomplete' }] }, options), /不完整/);
    await assert.rejects(infer(request, { ...options, spawnProcess: () => { throw new Error('spawn failed'); } }), /spawn failed/);
    await assert.rejects(infer(request, { ...options, maxCliOutputBytes: 32 }), /字节上限/);
    const abort = new AbortController();
    const pending = infer({ ...request, messages: [{ role:'user',content:'hang' }] }, { ...options, signal: abort.signal });
    const rejection = assert.rejects(pending, /取消|abort/i);
    setTimeout(() => abort.abort(), 150); await rejection;
    assert.deepEqual(await fs.readdir(home), ['workspace']);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

// 大型协议开销不是正文长度；验证旧 16 MiB 累计限制与 4 MiB MCP 限制已解耦。
test('默认允许超过旧 CLI 输出和 MCP 请求预算，显式 MCP 限额仍有效', async () => {
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'gateway-wide-protocol-'));
 const spawnProcess=(_cli,args,options)=>spawn(process.execPath,['--input-type=module','-e',`
  import fs from 'node:fs/promises';
  for await (const chunk of process.stdin) {}
  const config=JSON.parse(await fs.readFile(process.argv[1],'utf8'));
  const mcp=config.mcpServers.omp;
  const response=await fetch(mcp.url,{method:'POST',headers:{...mcp.headers,'content-type':'application/json'},
   body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized',padding:'x'.repeat(5*1024*1024)})});
  if(response.status!==Number(process.argv[2]))throw new Error('合成 MCP 请求状态不符');
  await response.text();
  for(let i=0;i<17;i++)console.log(JSON.stringify({type:'system',subtype:'synthetic-padding',padding:'x'.repeat(1024*1024)}));
  console.log(JSON.stringify({type:'result',is_error:false,result:'SYNTHETIC_DONE'}));
 `,args[args.indexOf('--mcp-config')+1],options.env.SYNTHETIC_EXPECTED_STATUS||'202'],options);
 const availableRequest={model:'claude-code-sonnet',messages:[{role:'user',content:'合成大协议开销'}],
  tools:[{type:'function',function:{name:'synthetic',parameters:{type:'object'}}}]};
 try {
  const common={home,cli:'mock',model:'mock',timeoutMs:15000,spawnProcess};
  assert.equal((await infer(availableRequest,common)).content,'SYNTHETIC_DONE');
  const limitedSpawn=(cli,args,options)=>spawnProcess(cli,args,{...options,env:{...options.env,SYNTHETIC_EXPECTED_STATUS:'413'}});
  assert.equal((await infer(availableRequest,{...common,maxMcpRequestBytes:1024,spawnProcess:limitedSpawn})).content,'SYNTHETIC_DONE');
  assert.deepEqual(await fs.readdir(home),['workspace']);
 } finally {await fs.rm(home,{recursive:true,force:true});}
});

test('UTF-8 字符跨 HTTP 分块仍完整，用量位于响应顶层且支持 SSE usage', async () => {
  const statistics = { usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }, upstream_usage: { input_tokens: 5, output_tokens: 2 }, usage_complete: true };
  const app = await gateway({ token: 'test', port: 0, execute: async body => ({ role: 'assistant', content: body.messages[0].content, ...statistics }) });
  try {
    const bytes = Buffer.from(JSON.stringify({ model: 'claude-code-sonnet', messages: [{ role:'user',content:'中文' }] }));
    const split = bytes.indexOf(Buffer.from('中')) + 1;
    const response = await new Promise((resolve,reject) => {
      const req = http.request({ host:'127.0.0.1',port:app.port,path:'/v1/chat/completions',method:'POST',headers:{Authorization:'Bearer test','content-type':'application/json'} }, res => {
        let data='';res.setEncoding('utf8');res.on('data',c=>data+=c);res.on('end',()=>resolve(JSON.parse(data)));
      });
      req.on('error',reject);req.write(bytes.subarray(0,split));setTimeout(()=>req.end(bytes.subarray(split)),25);
    });
    assert.equal(response.choices[0].message.content,'中文');
    assert.equal(response.choices[0].message.usage,undefined);
    assert.equal(response.usage.total_tokens,7);
    const res = await fetch(`http://127.0.0.1:${app.port}/v1/chat/completions`, { method:'POST', headers:{Authorization:'Bearer test','content-type':'application/json'}, body:JSON.stringify({model:'claude-code-sonnet',messages:request.messages,stream:true,stream_options:{include_usage:true}}) });
    const chunks=(await res.text()).split('\n').filter(line=>line.startsWith('data: {')).map(line=>JSON.parse(line.slice(6)));
    assert.equal(chunks.filter(c=>c.usage).length,1);
    assert.deepEqual(chunks.at(-1).choices,[]);
  } finally { await app.close({discardFrozen:true}); }
});
