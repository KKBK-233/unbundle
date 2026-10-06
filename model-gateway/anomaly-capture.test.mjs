import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createAnomalyCapture } from './anomaly-capture.mjs';
import { infer } from './engine.mjs';

const stream = (probe, event) => probe.accept({ type: 'stream_event', event });
const start = (probe, index, type) => stream(probe, { type: 'content_block_start', index, content_block: { type } });
const delta = (probe, index, type, value) => stream(probe, { type: 'content_block_delta', index,
  delta: { type, [type === 'text_delta' ? 'text' : type === 'thinking_delta' ? 'thinking' : 'signature']: value } });
async function setup(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'relay-anomaly-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'records'), logs = [];
  const probe = createAnomalyCapture({ directory, log: value => logs.push(value), ...options });
  const read = async () => {
    const files = (await fs.readdir(directory)).filter(name => name.endsWith('.json'));
    return Promise.all(files.map(async file => ({ file, record: JSON.parse(await fs.readFile(path.join(directory, file), 'utf8')) })));
  };
  return { root, directory, probe, logs, read };
}

// 正常 thinking、普通正文和签名前取消都不落盘，避免把缺签名误判为加密失败。
test('正常请求和签名前取消不创建记录目录', async t => {
  const { directory, probe } = await setup(t);
  start(probe, 0, 'thinking'); delta(probe, 0, 'thinking_delta', 'SYNTHETIC_HIDDEN');
  await probe.finish('cancelled');
  await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
  const normal = createAnomalyCapture({ directory, log() {} });
  start(normal, 0, 'thinking'); delta(normal, 0, 'thinking_delta', 'SYNTHETIC_HIDDEN');
  delta(normal, 0, 'signature_delta', 'SYNTHETIC_SIGNATURE');
  start(normal, 1, 'text'); delta(normal, 1, 'text_delta', '正常合成正文'); normal.output('正常合成正文');
  await normal.finish('completed'); await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
});

test('跨片段正文标签立即落盘，取消后补摘要，文件不含正文、签名或非白名单上下文', async t => {
  const secret = 'PRIVATE_SYNTHETIC_REASONING', signature = 'PRIVATE_SYNTHETIC_SIGNATURE';
  const { directory, probe, logs, read } = await setup(t, {
    requestId: 'UNTRUSTED_SECRET_REQUEST_ID', context: { model: 'claude-code-opus', effort: 'max', cliVersion: '2.1.291',
      requestedOutputTokens: 64000, historyMessages: 214, secret, prompt: secret, token: secret } });
  stream(probe, { type: 'message_start', message: { id: 'PRIVATE_MESSAGE_ID' } });
  start(probe, 0, 'thinking'); delta(probe, 0, 'thinking_delta', secret);
  delta(probe, 0, 'signature_delta', signature);
  start(probe, 1, 'text');
  for (const text of ['<thin', 'king>', secret, '</thinking>']) delta(probe, 1, 'text_delta', text);
  await probe.flush();
  assert.equal((await read())[0].record.state, 'running');
  probe.output(`<thinking>${secret}</thinking>`);
  await probe.finish('cancelled'); await probe.finish('completed');
  const [{ file, record }] = await read();
  assert.equal(record.state, 'finished'); assert.equal(record.summary.outcome, 'cancelled');
  assert.equal(record.signals.length, 1); assert.equal(record.signals[0].channel, 'stream_text');
  assert.equal(record.summary.signatureChars, signature.length);
  assert.equal(record.context.historyMessages, 214); assert(record.summary.downstreamMatchesStreamText);
  const serialized = JSON.stringify({ record, logs });
  for (const value of [secret, signature, 'PRIVATE_MESSAGE_ID', 'UNTRUSTED_SECRET_REQUEST_ID']) assert(!serialized.includes(value));
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(directory, file))).mode & 0o777, 0o600);
});

test('块类型冲突与签名错误通道被记录，环形时间线最多 64 项', async t => {
  const { probe, read } = await setup(t);
  start(probe, 0, 'thinking'); delta(probe, 0, 'text_delta', 'SYNTHETIC');
  start(probe, 1, 'text'); delta(probe, 1, 'signature_delta', 'SYNTHETIC_SIGNATURE');
  for (let i = 2; i < 100; i++) start(probe, i, 'text');
  await probe.finish('completed');
  const record = (await read())[0].record;
  assert.equal(record.summary.typeMismatches, 2);
  assert.equal(record.signals[0].signal, 'block_delta_type_mismatch');
  assert.equal(record.events.length, 64);
});

test('聚合正文和 result 兜底正文标签也会触发记录', async t => {
  const { directory, probe, read } = await setup(t);
  probe.accept({ type: 'assistant', message: { content: [{ type: 'text', text: '<thinking>SYNTHETIC_AGGREGATE' },
    { type: 'thinking', thinking: 'PRIVATE_AGGREGATE', signature: 'PRIVATE_AGGREGATE_SIGNATURE' }] } });
  await probe.finish('completed');
  const first = (await read())[0].record;
  assert.equal(first.signals[0].channel, 'assistant_text'); assert.equal(first.summary.assistantSignatureBlocks, 1);
  const fallback = createAnomalyCapture({ directory, log() {} });
  fallback.output('<thinking>SYNTHETIC_RESULT'); await fallback.finish('completed');
  assert((await read()).some(({ record }) => record.signals[0].channel === 'downstream_text'));
});

test('长正文与 thinking 指纹相等时触发候选信号，不保存明文', async t => {
  const { probe, read } = await setup(t);
  const synthetic = 'SYNTHETIC_EQUAL_CHANNEL_'.repeat(5);
  start(probe, 0, 'thinking'); delta(probe, 0, 'thinking_delta', synthetic);
  start(probe, 1, 'text'); delta(probe, 1, 'text_delta', synthetic); probe.output(synthetic);
  await probe.finish('completed');
  const record = (await read())[0].record;
  assert.equal(record.signals[0].signal, 'downstream_matches_thinking');
  assert(!JSON.stringify(record).includes(synthetic));
});

test('保留数量和过期清理只作用于本模块文件', async t => {
  const { directory } = await setup(t);
  await fs.mkdir(directory);
  const old = '1000000000000-00000000-0000-0000-0000-000000000000.json';
  await fs.writeFile(path.join(directory, old), '{}'); await fs.utimes(path.join(directory, old), 1, 1);
  await fs.writeFile(path.join(directory, 'unrelated.json'), 'KEEP');
  for (let i = 0; i < 4; i++) {
    const p = createAnomalyCapture({ directory, maxFiles: 2, log() {} });
    p.output('<thinking>SYNTHETIC'); await p.finish('completed');
  }
  const files = await fs.readdir(directory);
  assert.equal(files.filter(name => /^\d{13}-/.test(name)).length, 2);
  assert(!files.includes(old)); assert.equal(await fs.readFile(path.join(directory, 'unrelated.json'), 'utf8'), 'KEEP');
});

test('落盘失败只报告错误，观察器仍正常结束', async t => {
  const { root } = await setup(t);
  const directory = path.join(root, 'not-a-directory'); await fs.writeFile(directory, 'KEEP');
  const logs = [], probe = createAnomalyCapture({ directory, log: value => logs.push(value) });
  probe.output('<thinking>SYNTHETIC'); await probe.finish('completed');
  assert.equal(logs.filter(value => value.event === 'write_failed').length, 1);
  assert.equal(await fs.readFile(directory, 'utf8'), 'KEEP');
});

// 子进程模拟完整模型输出：自动取证既不改变输入/档位，也不截断疑似异常正文。
test('infer 自动落盘且等待合成异常输出完成，不修改 CLI 参数或输入', async t => {
  const { root, directory } = await setup(t);
  const output = [];
  const result = await infer({ model: 'claude-code-opus', reasoning_effort: 'high', messages: [{ role: 'user', content: 'SYNTHETIC_USER' }] },
    { home: path.join(root, 'home'), cli: 'mock', model: 'mock', anomalyDir: directory, cliVersion: '2.1.291', onText: value => output.push(value),
      spawnProcess(_cli, args, options) {
        assert.equal(args[args.indexOf('--effort') + 1], 'high');
        assert.equal(options.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, '8192');
        assert(!args.some(value => value.startsWith('--') && /anomaly|probe/i.test(value)));
        return spawn(process.execPath, ['--input-type=module', '-e', `
          let input=''; for await(const chunk of process.stdin) input+=chunk;
          if(!input.includes('SYNTHETIC_USER') || /anomaly|wire_probe/.test(input)) throw new Error('input changed');
          const emit=event=>console.log(JSON.stringify(event));
          const stream=event=>emit({type:'stream_event',event});
          stream({type:'content_block_start',index:0,content_block:{type:'text'}});
          stream({type:'content_block_delta',index:0,delta:{type:'text_delta',text:'<thinking>SYNTHETIC'}});
          setTimeout(()=>{
            stream({type:'content_block_delta',index:0,delta:{type:'text_delta',text:'_COMPLETED</thinking>'}});
            stream({type:'message_delta',delta:{stop_reason:'end_turn'}});
            emit({type:'result',is_error:false,result:'unused'});
          },50);
        `], options);
      } });
  assert.equal(result.content, '<thinking>SYNTHETIC_COMPLETED</thinking>');
  assert.equal(output.join(''), result.content);
  const files = await fs.readdir(directory); assert.equal(files.length, 1);
  const record = JSON.parse(await fs.readFile(path.join(directory, files[0]), 'utf8'));
  assert.equal(record.summary.outcome, 'completed'); assert.equal(record.context.effort, 'high');
  assert.equal(record.state, 'finished'); assert(!JSON.stringify(record).includes('SYNTHETIC'));
});
