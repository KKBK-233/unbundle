import test from 'node:test';
import assert from 'node:assert/strict';
import { fromAnthropic } from './anthropic.mjs';
import { compileContext } from './context.mjs';
import { NATIVE_HISTORY_PROMPT } from './native-history.mjs';
import { toolChoice, enforceToolChoice } from './tool-choice.mjs';
import { sessionEntry, nativeIncrement } from './session-entry.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { infer } from './engine.mjs';
const tools = ['Read', 'Write'].map(name => ({ type: 'function', function: { name, parameters: { type: 'object' } } }));
const base = { tools, messages: [{ role: 'system', content: '规则' }, { role: 'user', content: '用户原文' }] };
const call = name => ({ id: name, type: 'function', function: { name, arguments: '{}' } });

test('Anthropic any/指定工具/禁止并行转换并验证真实约束', () => {
  const input = { messages: [{ role: 'user', content: '执行' }], tools: tools.map(tool => ({ name: tool.function.name, input_schema: {} })) };
  for (const [choice, expected] of [[{ type: 'any' }, 'required'], [{ type: 'auto' }, 'auto'], [{ type: 'none' }, 'none']]) {
    assert.equal(fromAnthropic({ ...input, tool_choice: choice }).tool_choice, expected);
  }
  const request = fromAnthropic({ ...input, tool_choice: { type: 'tool', name: 'Read', disable_parallel_tool_use: true } });
  assert.equal(request.parallel_tool_calls, false);
  assert.deepEqual(compileContext(request).available.map(tool => tool.original), ['Read']);
  enforceToolChoice(toolChoice(request), [call('Read')]);
  for (const calls of [[], [call('Write')], [call('Read'), call('Read')]]) {
    assert.throws(() => enforceToolChoice(toolChoice(request), calls), { code: 'TOOL_CHOICE_UNSATISFIED', retryable: false });
  }
});

test('缺失工具、未知指定工具和畸形选择在推理前拒绝', () => {
  for (const request of [{ messages: base.messages, tool_choice: 'required' },
    { ...base, tool_choice: { type: 'function', function: { name: 'Unknown' } } },
    { ...base, tool_choice: { type: 'function', function: { name: 'Read', extra: true } } },
    { ...base, tool_choice: [] }]) assert.throws(() => compileContext(request), { code: 'INVALID_TOOL_CHOICE' });
});

test('新对话和后续原生用户消息不含 JSON 角色包装，图片保留原生块', () => {
  const image = { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } };
  const request = { ...base, messages: [base.messages[0], { role: 'user', content: [{ type: 'text', text: '原始文本' }, image] }] };
  const compiled = compileContext(request), entry = sessionEntry(request, compiled);
  assert.equal(entry.mode, 'native_new');
  assert.deepEqual(JSON.parse(entry.input).message.content, [{ type: 'text', text: '原始文本' }, image]);
  assert(!entry.systemPrompt.includes(NATIVE_HISTORY_PROMPT));
  assert(entry.systemPrompt.includes('规则'));
  assert.equal(nativeIncrement(request, compiled), entry.input);
});

test('完成历史也不能绕过可靠原生检查点要求',()=>{
 const request={...base,messages:[...base.messages,{role:'assistant',content:'旧回答'},{role:'user',content:'继续'}]};
 assert.throws(()=>sessionEntry(request,compileContext(request)),{code:'NATIVE_RESUME_REQUIRED',retryable:false});
});

test('独立进程入口同样验证强制工具，文本失败不流出且没有自动重跑', async () => {
  for (const mode of ['text', 'named', 'parallel']) {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-policy-')); let spawns = 0; const visible = [];
    const fake = `import readline from 'node:readline';const out=x=>console.log(JSON.stringify(x));
      readline.createInterface({input:process.stdin}).on('line',()=>{
      out({type:'stream_event',event:{type:'message_start',message:{id:'one',usage:{input_tokens:2}}}});
      if(${JSON.stringify(mode)}==='text'){
        out({type:'stream_event',event:{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'普通回答'}}});
        out({type:'result',is_error:false,result:'普通回答'});
      }else{
        const content=[{type:'tool_use',id:'a',name:'mcp__omp__Read',input:{}}];
        if(${JSON.stringify(mode)}==='parallel')content.push({type:'tool_use',id:'b',name:'mcp__omp__Read',input:{}});
        out({type:'assistant',message:{content}});
        out({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:3}}});
      }});`;
    try {
      const result = infer({ ...base, max_tokens: 1024, parallel_tool_calls: false,
        tool_choice: { type: 'function', function: { name: 'Read' } } },
      { home, model: 'synthetic', maxOutputTokens: 1024, timeoutMs: 3000, onText: text => visible.push(text),
        spawnProcess: (_cli, _args, options) => { spawns++; return spawn(process.execPath, ['--input-type=module', '-e', fake], options); } });
      if (mode === 'named') assert.equal((await result).tool_calls[0].function.name, 'Read');
      else await assert.rejects(result, { code: 'TOOL_CHOICE_UNSATISFIED', retryable: false });
      assert.equal(spawns, 1); assert.deepEqual(visible, []);
    } finally { await fs.rm(home, { recursive: true, force: true }); }
  }
});
