import fs from 'node:fs/promises';
import { createPromptContent } from './prompt-content.mjs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const queues = new Map(), pendingWrites = new Map();
const managed = /^prompt-\d{13}-[a-f0-9-]{36}\.json$/;
const tokenKeys = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
const metricKeys = ['instructionBytes', 'systemPromptBytes', 'historyBytes', 'toolSchemaBytes', 'relayBytes', 'instructionCount', 'instructionUpdates', 'runtimeStatusCount', 'imageCount', 'imageBytes', 'toolCount', 'historyMessages', 'blockCount'];
const stops = new Set(['end_turn', 'tool_use', 'max_tokens', 'refusal', 'stop_sequence', 'pause_turn', 'model_context_window_exceeded']);
const terms = ['gateway', 'relay', 'vps', 'windows', 'linux', '网关', '中继', '服务器'];

// 只计数公开事件中的关键词，不落正文、思考文本、签名、工具参数或认证数据。
function mentionCounter() {
  let tail = '', bytes = 0;
  const mentions = Object.fromEntries(terms.map(term => [term, 0]));
  return {
    add(text) {
      if (typeof text !== 'string') return;
      bytes += Buffer.byteLength(text);
      const value = tail + text.toLowerCase();
      for (const term of terms) {
        let i = 0;
        while ((i = value.indexOf(term, i)) !== -1) { if (i + term.length > tail.length) mentions[term]++; i += term.length; }
      }
      tail = value.slice(-16);
    },
    boundary() { tail = ''; },
    summary() { return { bytes, mentions }; },
  };
}

// 只清理由本模块创建的常规文件；按数量、总大小及年龄限制磁盘占用。
async function persist(directory, record, { maxFiles, maxTotalBytes, maxAgeMs }) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (!(await fs.lstat(directory)).isDirectory()) throw new Error('实验日志目录不是普通目录');
  const text = JSON.stringify(record, null, 2) + '\n';
  if (Buffer.byteLength(text) > (record.detail ? 2 * 1024 * 1024 : 65536)) throw new Error('实验日志超过单文件上限');
  const target = path.join(directory, `prompt-${record.startedMs}-${record.requestId}.json`);
  const temporary = target + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, text, {mode:0o600,flag:'wx'}); await fs.rename(temporary,target); } finally { await fs.rm(temporary,{force:true}); }
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !managed.test(entry.name)) continue;
    const file = path.join(directory, entry.name), stat = await fs.lstat(file);
    if (!stat.isFile()) continue;
    if (Date.now() - stat.mtimeMs > maxAgeMs) await fs.unlink(file);
    else files.push({ file, name: entry.name, bytes: stat.size });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  let bytes = files.reduce((sum, f) => sum + f.bytes, 0);
  while (files.length > maxFiles || bytes > maxTotalBytes) { const file = files.shift(); bytes -= file.bytes; await fs.unlink(file.file); }
}

// 显式开启才记录；这里只观察网关构造及 CLI 返回，不能冒充最终上游请求抓包。
export function createPromptTrace({ directory, requestId, compiled, model, cliVersion, effort = 'auto', sink = value => console.error(JSON.stringify(value)), maxFiles = 64, maxTotalBytes = 4 * 1024 * 1024, maxAgeMs = 86400000, captureContent = false, request, secrets = [] } = {}) {
  if (!directory) return undefined;
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 256 || !Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 65536 || maxTotalBytes > 64 * 1024 * 1024 || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 7 * 86400000) throw new Error('实验日志保留范围无效');
  const content = captureContent ? createPromptContent({request,secrets}) : undefined;
  const startedMs = Date.now();
  const started = performance.now(), text = mentionCounter(), thinking = mentionCounter();
  const id = /^[a-f0-9-]{36}$/.test(requestId || '') ? requestId : randomUUID();
  const metrics = Object.fromEntries(metricKeys.filter(k => Number.isSafeInteger(compiled?.metrics?.[k])).map(k => [k, compiled.metrics[k]]));
  for (const k of ['systemHash', 'toolsHash']) if (/^[a-f0-9]{64}$/.test(compiled?.metrics?.[k] || '')) metrics[k] = compiled.metrics[k];
  const profile = compiled?.promptComponents?.profile === 'minimal' ? 'minimal' : 'standard';
  const record = { schemaVersion: 1, type: 'prompt_experiment', requestId: id, startedMs, startedAt: new Date().toISOString(), profile, observation: 'compiled_input_and_cli_events',
    model: /^(?:claude|glm)-[a-zA-Z0-9.[\]-]{1,100}$/.test(model || '') ? model : 'unknown', cliVersion: /^\d+\.\d+\.\d+$/.test(cliVersion || '') ? cliVersion : 'unknown',
    effort: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : 'unknown', metrics,
    generatedHead: Object.fromEntries(['relay', 'runtime', 'updates'].map(k => [k, (compiled?.promptComponents?.[k] || '').slice(0, 4000)])),
    toolPolicy: { required: compiled?.policy?.required === true, single: compiled?.policy?.single === true }, events: [] };
  const usage = new Map(); let current, ordinal = 0, droppedEvents = 0, finished;
  const publish = value => { try { sink({ type: 'prompt_experiment', requestId: id, profile, ...value }); } catch {} };
  const event = fields => { if (record.events.length < 128) record.events.push({ elapsedMs: Math.round(performance.now() - started), ...fields }); else droppedEvents++; };
  const count = (key, value) => {
    if (!key || !value || !usage.has(key) && usage.size >= 128) return;
    const previous = usage.get(key) || {};
    for (const k of tokenKeys) if (Number.isSafeInteger(value[k]) && value[k] >= 0) previous[k] = Math.max(previous[k] || 0, value[k]);
    usage.set(key, previous);
  };
  const save = state => {
    const pending = pendingWrites.get(directory) || 0;
    if (pending >= 8) { publish({event:'write_skipped',reason:'queue_full'}); return Promise.resolve(); }
    // 队列保存独立快照，后续事件不能改写已排队的内容。
    const snapshot = {...record,state,events:record.events.map(e=>({...e})),...(content?{detail:content.snapshot()}: {})};
    pendingWrites.set(directory,pending+1);
    const previous=queues.get(directory)||Promise.resolve();
    const task=previous.catch(()=>{}).then(()=>persist(directory,snapshot,{maxFiles,maxTotalBytes,maxAgeMs})).catch(()=>publish({event:'write_failed'}));
    queues.set(directory,task);
    void task.then(()=>{const remaining=(pendingWrites.get(directory)||1)-1;if(remaining)pendingWrites.set(directory,remaining);else pendingWrites.delete(directory);if(queues.get(directory)===task)queues.delete(directory);});
    return task;
  };
  // 详细日志每十五秒形成磁盘快照，异常中断仍能复盘已收到的内容。
  const checkpoint = content ? setInterval(()=>{if(!finished)void save('running');},15000) : undefined;
  checkpoint?.unref();
  if(content)void save('running');
  publish({ event: 'begin', metrics, cliVersion: record.cliVersion, effort: record.effort, captureContent });
  return {
    accept(e) {
      if (finished) return;
      content?.accept(e);
      const inner = e?.type === 'stream_event' ? e.event : undefined;
      if (inner?.type === 'message_start') { current = inner.message?.id || `anonymous-${++ordinal}`; if (inner.message?.id) ordinal++; text.boundary(); thinking.boundary(); count(current, inner.message?.usage); event({ event: 'message_start', ordinal }); }
      else if (inner?.type === 'content_block_start') {
        text.boundary(); thinking.boundary();
        const block = inner.content_block;
        if (block?.type === 'text') text.add(block.text);
        if (block?.type === 'thinking') thinking.add(block.thinking);
        if (block?.type === 'tool_use') event({ event: 'tool_start', ordinal, tool: block.name === 'ToolSearch' ? 'ToolSearch' : (typeof block.name === 'string' && block.name.startsWith('mcp__caller__')) ? 'caller_mcp' : 'other' });
      } else if (inner?.type === 'content_block_delta') {
        if (inner.delta?.type === 'text_delta') text.add(inner.delta.text);
        if (inner.delta?.type === 'thinking_delta') thinking.add(inner.delta.thinking);
      } else if (inner?.type === 'message_delta') { count(current, inner.usage); event({ event: 'message_delta', ordinal, stopReason: stops.has(inner.delta?.stop_reason) ? inner.delta.stop_reason : 'unknown' }); }
      else if (e?.type === 'assistant') count(e.message?.id, e.message?.usage);
      else if (e?.type === 'system' && e.subtype === 'api_retry') event({ event: 'api_retry' });
      else if (e?.type === 'result') event({ event: 'result', isError: e.is_error === true });
    },
    environment(fields) {
      if(finished)return;
      const safe={event:'cli_environment_adjusted'};
      for(const key of ['removedMachineFields','removedModelStatements','beforeBytes','afterBytes'])if(Number.isSafeInteger(fields[key]))safe[key]=fields[key];
      for(const key of ['beforeHash','afterHash'])if(/^[a-f0-9]{64}$/.test(fields[key]||''))safe[key]=fields[key];
      event(safe);publish(safe);
    },
    handoff(calls) { if(!finished)content?.handoff(calls); },
    finish(outcome) {
      if (finished) return finished;
      const totals = {};
      for (const value of usage.values()) for (const k of tokenKeys) if (value[k] !== undefined) totals[k] = (totals[k] || 0) + value[k];
      record.summary = { outcome: ['completed', 'error', 'timeout', 'cancelled'].includes(outcome) ? outcome : 'unknown', elapsedMs: Math.round(performance.now() - started), upstreamMessages: ordinal, observedUsage: totals, usageSource: 'deduplicated_cli_message_events', mentionCoverage: 'stream_text_and_thinking_only', text: text.summary(), thinking: thinking.summary(), droppedEvents };
      publish({ event: 'summary', ...record.summary });
      clearInterval(checkpoint);
      finished = save('finished');
      return finished;
    },
  };
}
