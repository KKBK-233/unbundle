import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CliEvents, completeAssistant } from './cli-events.mjs';
import { infer } from './engine.mjs';
import { sessionRelay } from './session-relay.mjs';
import { gateway } from './server.mjs';
import { createTiming } from './timing.mjs';

const stream = event => ({ type: 'stream_event', event });
const refusal = { type: 'assistant', message: { id: 'refused', content: [{ type: 'text', text: 'DECLINED' }], stop_reason: 'refusal', usage: { input_tokens: 10, output_tokens: 2 } } };
const tool = { type: 'function', function: { name: 'read', parameters: { type: 'object', properties: {} } } };

// 覆盖拒绝终止、错误占位、空正文与已收集工具，禁止将拒绝后的续写混入回复。
test('拒绝封存文本和用量、取消未交付工具；正文拒绝不冒充协议拒绝', () => {
  const stops = [], events = new CliEvents([{ name: 'read', original: 'read' }], undefined, [], { onStopReason: reason => stops.push(reason) });
  assert(completeAssistant(refusal));
  assert(!completeAssistant({ ...refusal, is_api_error_message: true }));
  events.accept({ ...refusal, is_api_error_message: true });
  assert.equal(events.refused, false);
  events.accept(stream({ type: 'message_start', message: { id: 'refused', usage: { input_tokens: 10, output_tokens: 0 } } }));
  events.accept(stream({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'DECLINED' } }));
  events.accept(stream({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'call', name: 'mcp__omp__read', input: {} } }));
  events.accept(stream({ type: 'content_block_stop', index: 1 }));
  events.accept(stream({ type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'partial', name: 'mcp__omp__read' } }));
  events.accept(stream({ type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 2 } }));
  events.accept(refusal);
  events.accept(stream({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'LEAK' } }));
  events.accept(stream({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 99 } }));
  assert.equal(events.refused, true);
  assert.equal(events.text, 'DECLINED');
  assert.equal(events.calls.size, 0); assert.equal(events.blocks.size, 0); assert.equal(events.toolEnd, false);
  assert.equal(events.usage().usage.completion_tokens, 2);
  assert.deepEqual(stops, ['refusal']);
  const plain = new CliEvents([]);
  plain.accept({ ...refusal, message: { ...refusal.message, stop_reason: 'end_turn' } });
  assert.equal(plain.refused, false);
  const empty = new CliEvents([]);
  empty.accept({ ...refusal, message: { ...refusal.message, content: [] } });
  assert.equal(empty.refused, true); assert.equal(empty.text, '');
});

test('拒绝诊断立即输出并保留到完成记录，未知字段不进入日志', () => {
  const rows = [], timing = createTiming(row => rows.push(row));
  timing.upstreamStop('refusal'); timing.upstreamStop('PRIVATE_REASON'); timing.finish('success');
  assert.equal(rows[0].stage, 'upstream_stop'); assert.equal(rows[0].stopReason, 'refusal');
  assert.equal(rows[1].stopReason, 'unknown');
  assert.equal(rows[2].upstreamRefusal, true); assert.equal(rows[2].outcome, 'success');
  assert(!JSON.stringify(rows).includes('PRIVATE'));
  timing.upstreamStop('refusal'); assert.equal(rows.length, 3);
});

// 使用本地模拟 CLI 验证整个链路；不访问账号或真实模型，且 CLI 不发送 result。
for (const native of [false, true]) for (const full of [false, true]) {
  test(`${native ? '原生会话' : '逐轮进程'}通过${full ? '完整消息' : '流式事件'}保留拒绝并结束请求`, async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'refusal-test-'));
    const rows = [];
    const fake = `import readline from 'node:readline';
      const emit = x => console.log(JSON.stringify(x));
      readline.createInterface({input:process.stdin}).on('line', () => {
        ${full ? `emit(${JSON.stringify(refusal)});` : `
        emit({type:'stream_event',event:{type:'message_start',message:{id:'refused',usage:{input_tokens:10,output_tokens:0}}}});
        emit({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'DECLINED'}}});
        emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'refusal'},usage:{output_tokens:2}}});`}
        emit({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text:'LEAK'}}});
        emit({type:'stream_event',event:{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:99}}});
      }); setInterval(()=>{},1000);`;
    const options = { cli: 'synthetic', home, model: 'mock', modelFor: model => model, timeoutMs: 5000,
      spawnProcess: (_cli, _args, opts) => spawn(process.execPath, ['--input-type=module', '-e', fake], opts) };
    const relay = native ? sessionRelay(options) : undefined;
    const app = await gateway({ token: 'refusal-test', port: 0, models: [{ id: 'claude-opus-5-5' }], onTiming: row => rows.push(row),
      execute: (body, signal, onText, timing) => native ? relay.infer(body, { signal, onText, timing }) : infer(body, { ...options, signal, onText, timing }) });
    try {
      for (const anthropic of [true, false]) for (const streaming of [false, true]) {
        const body = { model: 'claude-opus-5-5', max_tokens: 1024, messages: [{ role: 'user', content: 'synthetic' }], stream: streaming,
          ...(!anthropic ? { tools: [tool], tool_choice: 'required' } : {}) };
        const response = await fetch(`http://127.0.0.1:${app.port}/${anthropic ? 'v1/messages' : 'v1/chat/completions'}`, {
          method: 'POST', headers: { authorization: 'Bearer refusal-test', 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const wire = await response.text();
        assert.equal(response.status, 200, wire);
        assert(wire.includes('DECLINED')); assert(!wire.includes('LEAK')); assert(!wire.includes('TOOL_CHOICE_UNSATISFIED'));
        if (streaming) {
          assert(wire.includes(anthropic ? '"stop_reason":"refusal"' : '"finish_reason":"content_filter"'));
          assert(wire.includes(anthropic ? 'event: message_stop' : 'data: [DONE]'));
        } else {
          const value = JSON.parse(wire);
          assert.equal(anthropic ? value.stop_reason : value.choices[0].finish_reason, anthropic ? 'refusal' : 'content_filter');
          assert.equal(anthropic ? value.usage.output_tokens : value.usage.completion_tokens, 2);
          if (!anthropic) assert.equal(value.choices[0].message.stop_reason, undefined);
        }
      }
      const finished = rows.filter(row => row.stage === 'finished');
      assert.equal(finished.length, 4);
      for (const row of finished) { assert.equal(row.outcome, 'success'); assert.equal(row.upstreamStopReason, 'refusal'); assert.equal(row.upstreamRefusal, true); }
      assert.equal(rows.filter(row => row.stage === 'response_refusal').length, 4);
      assert.equal(rows.filter(row => row.stage === 'upstream_stop' && row.stopReason === 'refusal').length, 4);
      assert(!JSON.stringify(rows).includes('DECLINED'));
    } finally { await app.close(); await relay?.close({ discardFrozen: true }); await fs.rm(home, { recursive: true, force: true }); }
  });
}
import fsSync from'node:fs';
test('拒绝结束原CLI后保存原生检查点，下条消息同UUID resume而非重建历史',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'refusal-resume-')),argsSeen=[],inputs=[];let relay;
 const fake=`import fs from'node:fs';import readline from'node:readline';const send=x=>console.log(JSON.stringify(x));send({type:'system',subtype:'init',session_id:process.env.SYNTHETIC_ID});readline.createInterface({input:process.stdin}).on('line',line=>{const frame=JSON.parse(line);if(frame.type!=='user')throw Error('unexpected frame');fs.appendFileSync(process.env.SYNTHETIC_FILE,JSON.stringify({type:'user',message:frame.message})+'\\n');if(process.env.SYNTHETIC_RESUME!=='1'){send({type:'assistant',message:{id:'declined',content:[{type:'text',text:'DECLINED'}],stop_reason:'refusal',usage:{input_tokens:10,output_tokens:1}}});return;}send({type:'stream_event',event:{type:'message_start',message:{id:'after',usage:{input_tokens:10,output_tokens:0}}}});send({type:'result',result:'AFTER_REFUSAL',is_error:false});});`;
 const options={home,cli:'synthetic',model:'synthetic',maxOutputTokens:1024,persistentSessions:true,timeoutMs:4000,spawnProcess(_cli,args,o){argsSeen.push(args);const resumed=args.includes('--resume'),id=args[args.indexOf(resumed?'--resume':'--session-id')+1],file=path.join(home,'.claude','projects','synthetic',id+'.jsonl');fsSync.mkdirSync(path.dirname(file),{recursive:true});if(!resumed)fsSync.writeFileSync(file,'');const child=spawn(process.execPath,['--input-type=module','-e',fake],{...o,env:{...o.env,SYNTHETIC_ID:id,SYNTHETIC_FILE:file,SYNTHETIC_RESUME:resumed?'1':'0'}}),write=child.stdin.write.bind(child.stdin);child.stdin.write=(data,...rest)=>{inputs.push(JSON.parse(data));return write(data,...rest);};return child;}};
 const first={model:'synthetic',max_tokens:1024,messages:[{role:'user',content:'ORIGINAL_PRIVATE_TASK'}]};
 try{relay=sessionRelay(options);const refused=await relay.infer(first);assert.equal(refused.stop_reason,'refusal');const follow=await relay.infer({...first,messages:[...first.messages,{role:'assistant',content:'DECLINED'},{role:'user',content:'NEW_INPUT'}]});assert.equal(follow.content,'AFTER_REFUSAL');assert.equal(argsSeen.length,2);assert.equal(argsSeen[1][argsSeen[1].indexOf('--resume')+1],argsSeen[0][argsSeen[0].indexOf('--session-id')+1]);assert.equal(inputs.length,2);assert(!JSON.stringify(inputs[1]).includes('ORIGINAL_PRIVATE_TASK'));}
 finally{await relay?.close({discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});
