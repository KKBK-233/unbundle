import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createWireProbe, takeWireProbe } from './wire-probe.mjs';
import { infer } from './engine.mjs';

const stream = (probe, event) => probe.accept({ type: 'stream_event', event });
const start = (probe, index, type) => stream(probe, { type: 'content_block_start', index, content_block: { type } });
const delta = (probe, index, type, value) => stream(probe, { type: 'content_block_delta', index,
  delta: { type, [type === 'text_delta' ? 'text' : type === 'thinking_delta' ? 'thinking' : 'signature']: value } });
const setup = () => { const records = []; return { records, probe: createWireProbe({ requestId: 'synthetic', sink: value => records.push(value) }) }; };

// 使用合成秘密验证分片解析、每轮指纹比较以及日志不包含任何正文或签名。
test('跨片段标签与 Unicode 保持指纹一致，日志不含正文和签名', () => {
  const { records, probe } = setup();
  const secret = 'SYNTHETIC_PRIVATE_REASONING_中文😀';
  stream(probe, { type: 'message_start', message: { id: 'SECRET_MESSAGE_ID' } });
  start(probe, 0, 'thinking'); delta(probe, 0, 'thinking_delta', secret);
  delta(probe, 0, 'signature_delta', 'SYNTHETIC_ENCRYPTED_SIGNATURE');
  stream(probe, { type: 'content_block_stop', index: 0 });
  start(probe, 1, 'text');
  for (const value of ['<thin', 'king>\n', secret.slice(0, -1), secret.slice(-1), '</think', 'ing>']) delta(probe, 1, 'text_delta', value);
  probe.output('<thinking>\n' + secret + '</thinking>');
  probe.finish('cancelled'); probe.finish('completed');
  assert.equal(records.length, 2);
  assert.equal(records[0].event, 'thinking_tag_in_text');
  const result = records[1];
  assert.equal(result.outcome, 'cancelled'); assert.equal(result.signatureDeltas, 1);
  assert.equal(result.channels.streamText.openTags, 1); assert.equal(result.channels.streamText.closeTags, 1);
  assert.equal(result.channels.streamText.firstTagCharOffset, 0);
  assert.equal(result.channels.streamText.bytes, Buffer.byteLength('<thinking>\n' + secret + '</thinking>'));
  assert.equal(result.channels.streamText.hmacSha256, result.channels.downstreamText.hmacSha256);
  assert(result.downstreamMatchesStreamText); assert(result.downstreamMatchesStreamThinking);
  assert.equal(result.typeMismatches, 0); assert.equal(result.orphanDeltas, 0);
  const log = JSON.stringify(records);
  for (const value of [secret, 'SYNTHETIC_ENCRYPTED_SIGNATURE', 'SECRET_MESSAGE_ID']) assert(!log.includes(value));
});

test('正常 thinking 和正文分开，相同正文在不同请求中不可关联', () => {
  const hashes = [];
  for (let i = 0; i < 2; i++) {
    const { records, probe } = setup();
    start(probe, 0, 'thinking'); delta(probe, 0, 'thinking_delta', 'HIDDEN_PLAN');
    start(probe, 1, 'text'); delta(probe, 1, 'text_delta', 'VISIBLE_ANSWER'); probe.output('VISIBLE_ANSWER');
    probe.finish('completed');
    const result = records.at(-1);
    assert(result.downstreamMatchesStreamText); assert(!result.downstreamMatchesStreamThinking);
    hashes.push(result.channels.streamText.hmacSha256);
  }
  assert.notEqual(hashes[0], hashes[1]);
});

test('记录块与 delta 类型冲突，超过块上限时不累积正文', () => {
  const { records, probe } = setup();
  start(probe, 0, 'thinking'); delta(probe, 0, 'text_delta', 'SYNTHETIC_MISROUTED');
  for (let i = 1; i < 100; i++) start(probe, i, 'UNTRUSTED_TYPE_SECRET');
  probe.accept({ type: 'assistant', message: { content: [{ type: 'text', text: 'AGGREGATE_SECRET' }, { type: 'thinking', thinking: 'THINKING_SECRET' }] } });
  probe.finish('error');
  const result = records.at(-1);
  assert.equal(result.typeMismatches, 1); assert.equal(result.blocks.length, 64); assert.equal(result.droppedBlocks, 36);
  assert.equal(result.assistantTextBlocks, 1); assert.equal(result.assistantThinkingBlocks, 1);
  for (const value of ['SYNTHETIC_MISROUTED', 'UNTRUSTED_TYPE_SECRET', 'AGGREGATE_SECRET', 'THINKING_SECRET']) assert(!JSON.stringify(records).includes(value));
});

// 无有效截止时间时不采集；有效期和请求预算都限制启用范围。
test('默认关闭，过期关闭，并限制自然请求数', () => {
  const keys = ['GATEWAY_WIRE_PROBE_UNTIL_MS', 'GATEWAY_WIRE_PROBE_REQUESTS'];
  const previous = keys.map(key => process.env[key]);
  try {
    delete process.env.GATEWAY_WIRE_PROBE_UNTIL_MS;
    assert.equal(takeWireProbe('synthetic'), undefined);
    process.env.GATEWAY_WIRE_PROBE_UNTIL_MS = String(Date.now() - 1);
    assert.equal(takeWireProbe('synthetic'), undefined);
    process.env.GATEWAY_WIRE_PROBE_UNTIL_MS = String(Date.now() + 7200000);
    assert.equal(takeWireProbe('synthetic'), undefined);
    process.env.GATEWAY_WIRE_PROBE_UNTIL_MS = String(Date.now() + 60000);
    process.env.GATEWAY_WIRE_PROBE_REQUESTS = '1';
    assert(takeWireProbe('synthetic')); assert.equal(takeWireProbe('synthetic'), undefined);
  } finally { keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }); }
});

// 模拟真实 CLI 的取消路径，确保探针不把 hidden thinking 转发，也不妨碍清理。
test('infer 取消时记录通道摘要并清理；不修改 CLI 参数或输入', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-wire-probe-'));
  const records = [], output = [], controller = new AbortController();
  const previous = { until: process.env.GATEWAY_WIRE_PROBE_UNTIL_MS, count: process.env.GATEWAY_WIRE_PROBE_REQUESTS, error: console.error };
  process.env.GATEWAY_WIRE_PROBE_UNTIL_MS = String(Date.now() + 60000);
  process.env.GATEWAY_WIRE_PROBE_REQUESTS = '10';
  console.error = value => records.push(JSON.parse(value));
  const spawnProcess = (_cli, args, options) => {
    assert(!args.some(value => value.startsWith('--') && /probe/i.test(value)));
    return spawn(process.execPath, ['--input-type=module', '-e', `
      let input = ''; for await (const chunk of process.stdin) input += chunk;
      if (input.includes('wire_probe') || input.includes('GATEWAY_WIRE_PROBE')) throw new Error('probe changed input');
      const stream = event => console.log(JSON.stringify({type:'stream_event',event}));
      stream({type:'message_start',message:{id:'synthetic'}});
      stream({type:'content_block_start',index:0,content_block:{type:'thinking'}});
      stream({type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'PRIVATE_SYNTHETIC_THINKING'}});
      stream({type:'content_block_stop',index:0});
      stream({type:'content_block_start',index:1,content_block:{type:'text'}});
      stream({type:'content_block_delta',index:1,delta:{type:'text_delta',text:'PUBLIC_SYNTHETIC_ANSWER'}});
      setInterval(() => {},1000);
    `], options);
  };
  try {
    await assert.rejects(infer({ model: 'claude-code-opus', messages: [{ role: 'user', content: 'synthetic' }] },
      { home, cli: 'mock', model: 'mock', spawnProcess, signal: controller.signal, timeoutMs: 3000, killGraceMs: 20,
        onText: value => { output.push(value); controller.abort(); }, timing: { requestId: 'synthetic', mark() {} } }), /取消/);
    assert.deepEqual(output, ['PUBLIC_SYNTHETIC_ANSWER']);
    const summary = records.find(value => value.event === 'summary');
    assert.equal(summary.outcome, 'cancelled'); assert(summary.downstreamMatchesStreamText);
    assert(!summary.downstreamMatchesStreamThinking);
    assert(!JSON.stringify(records).includes('PRIVATE_SYNTHETIC_THINKING'));
    assert.deepEqual(await fs.readdir(home), ['workspace']);
  } finally {
    console.error = previous.error;
    for (const [key, value] of [['GATEWAY_WIRE_PROBE_UNTIL_MS', previous.until], ['GATEWAY_WIRE_PROBE_REQUESTS', previous.count]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await fs.rm(home, { recursive: true, force: true });
  }
});
