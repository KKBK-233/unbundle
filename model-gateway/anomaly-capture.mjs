import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createWireProbe } from './wire-probe.mjs';

const queues = new Map();
const managedFile = /^\d{13}-[a-f0-9-]{36}\.json$/;
const models = new Set(['claude-code-opus', 'claude-code-sonnet', 'claude-code-haiku', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
const efforts = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'auto']);
const types = new Set(['thinking', 'redacted_thinking', 'text', 'tool_use']);
const numericContext = ['requestedOutputTokens', 'systemPromptBytes', 'historyBytes', 'toolSchemaBytes', 'relayBytes',
  'historyMessages', 'toolCount', 'imageCount', 'imageBytes', 'runtimeStatusCount'];

// 所有元数据显式筛选；调用方输入、正文、签名值及完整 CLI 消息/会话 ID 不进入文件。
function contextOf(value = {}) {
  const result = {};
  if (models.has(value.model)) result.model = value.model;
  if (efforts.has(value.effort)) result.effort = value.effort;
  if (typeof value.cliVersion === 'string' && /^\d+\.\d+\.\d+$/.test(value.cliVersion)) result.cliVersion = value.cliVersion;
  for (const key of numericContext) if (Number.isSafeInteger(value[key]) && value[key] >= 0) result[key] = value[key];
  return result;
}

// 每目录串行写入，原子替换 0600 文件；只清理本模块命名的记录，不触碰其他文件。
function enqueue(directory, action) {
  const previous = queues.get(directory) || Promise.resolve();
  const next = previous.catch(() => {}).then(action);
  queues.set(directory, next);
  void next.finally(() => { if (queues.get(directory) === next) queues.delete(directory); }).catch(() => {});
  return next;
}
async function persist(directory, filename, data, { maxFiles, maxAgeMs }) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  let text = JSON.stringify(data, null, 2) + '\n';
  if (Buffer.byteLength(text) > 32768) {
    data = { ...data, events: data.events.slice(-16), metadataTruncated: true,
      summary: data.summary ? { ...data.summary, blocks: data.summary.blocks.slice(-16) } : undefined };
    text = JSON.stringify(data, null, 2) + '\n';
  }
  if (Buffer.byteLength(text) > 32768) throw Object.assign(new Error('异常记录超过元数据上限'), { code: 'METADATA_TOO_LARGE' });
  const temporary = path.join(directory, filename + '.tmp');
  try {
    await fs.writeFile(temporary, text, { mode: 0o600, flag: 'w' });
    await fs.rename(temporary, path.join(directory, filename));
  } catch (error) { await fs.rm(temporary, { force: true }).catch(() => {}); throw error; }
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !managedFile.test(entry.name)) continue;
    const target = path.join(directory, entry.name);
    const stat = await fs.stat(target);
    if (Date.now() - stat.mtimeMs > maxAgeMs) await fs.unlink(target);
    else files.push(entry.name);
  }
  files.sort();
  for (const name of files.slice(0, Math.max(0, files.length - maxFiles))) await fs.unlink(path.join(directory, name));
}

// 常态仅保留有界内存；标签或类型冲突立即落盘，结束时补齐通道指纹，绝不取消推理。
export function createAnomalyCapture({ directory, requestId, context, maxFiles = 64, maxAgeMs = 7 * 86400000,
  log = value => console.error(JSON.stringify(value)) } = {}) {
  if (!directory) return;
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 256
    || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1) throw new Error('异常记录保留配置无效');
  const id = typeof requestId === 'string' && /^[a-f0-9-]{36}$/.test(requestId) ? requestId : randomUUID();
  const started = performance.now(), timestamp = Date.now();
  const filename = `${timestamp}-${id}.json`, events = [], signals = [];
  const record = { schemaVersion: 1, type: 'gateway_anomaly', requestId: id, startedAt: new Date(timestamp).toISOString(),
    context: contextOf(context), state: 'running', signals, events };
  const observed = new Set();
  let pending = Promise.resolve(), ended = false, writeErrorReported = false;
  const publish = value => { try { log({ type: 'gateway_anomaly', requestId: id, file: filename, ...value }); } catch {} };
  const save = () => {
    // 先拍摄纯元数据快照，避免排队写入时被后续事件改动。
    const snapshot = JSON.parse(JSON.stringify({ ...record, updatedAt: new Date().toISOString() }));
    pending = enqueue(directory, () => persist(directory, filename, snapshot, { maxFiles, maxAgeMs })).catch(error => {
      if (!writeErrorReported) { writeErrorReported = true; publish({ event: 'write_failed', code: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'WRITE_FAILED' }); }
    });
  };
  const signal = (name, detail = {}) => {
    if (signals.some(value => value.signal === name)) return;
    signals.push({ signal: name, elapsedMs: Math.round(performance.now() - started), ...detail });
    publish({ event: 'detected', signal: name }); save();
  };
  const probe = createWireProbe({ requestId: id, sink(value) {
    if (value.event === 'thinking_tag_in_text') signal('thinking_tag_in_text', {
      ...(value.channel ? { channel: value.channel } : {}), ...(Number.isInteger(value.index) ? { index: value.index } : {}) });
    if (value.event === 'block_delta_type_mismatch') signal('block_delta_type_mismatch', {
      blockType: value.blockType, deltaType: value.deltaType, index: value.index });
    if (value.event === 'summary') {
      record.summary = value;
      // 相同的短词可能恰好同时出现于两个通道，至少 64 字节才作为候选信号。
      if (value.downstreamMatchesStreamThinking && value.channels.streamThinking.normalizedBytes >= 64)
        signal('downstream_matches_thinking');
    }
  } });
  const add = (event, detail = {}) => {
    events.push({ elapsedMs: Math.round(performance.now() - started), event, ...detail });
    if (events.length > 64) events.shift();
  };
  return {
    accept(value) {
      if (ended) return;
      const inner = value?.type === 'stream_event' ? value.event : undefined;
      if (inner?.type === 'message_start') { observed.clear(); add('message_start'); }
      if (['content_block_start', 'content_block_stop'].includes(inner?.type)) add(inner.type, {
        ...(Number.isSafeInteger(inner.index) && inner.index >= 0 && inner.index <= 4096 ? { index: inner.index } : {}),
        ...(inner.type === 'content_block_start' ? { blockType: types.has(inner.content_block?.type) ? inner.content_block.type : 'other' } : {}) });
      const delta = inner?.type === 'content_block_delta' ? inner.delta : undefined;
      if (delta && ['thinking_delta', 'text_delta', 'signature_delta'].includes(delta.type)) {
        const key = `${inner.index}:${delta.type}`;
        if (!observed.has(key) && observed.size < 128) {
          observed.add(key); add(delta.type, {
            ...(Number.isSafeInteger(inner.index) && inner.index >= 0 && inner.index <= 4096 ? { index: inner.index } : {}),
            ...(delta.type === 'signature_delta' ? { signatureChars: typeof delta.signature === 'string' ? delta.signature.length : 0 } : {}) });
        }
      }
      if (value?.type === 'system' && value.subtype === 'api_retry') add('api_retry');
      if (value?.type === 'assistant') add('assistant');
      if (value?.type === 'result') add('result', { isError: value.is_error === true });
      probe.accept(value);
    },
    output(text) { if (!ended) probe.output(text); },
    async finish(outcome) {
      if (ended) return pending;
      ended = true; record.state = 'finished'; probe.finish(outcome);
      if (signals.length) save();
      await pending;
    },
    flush() { return pending; },
  };
}
