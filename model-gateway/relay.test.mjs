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

test('追加历史保留旧消息块，工具重排不会改变工具定义', () => {
  const base = { ...request, tools: [tool('write'), tool('read')] };
  const before = compileContext(base);
  const after = compileContext({ ...base, tools: [...base.tools].reverse(), messages: [...base.messages, { role: 'assistant', content: '已读' }] });
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
  } finally { await app.close(); }
});
