import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileContext, stableJson } from './context.mjs';

const hash = value => createHash('sha256').update(stableJson(value)).digest('hex');
// 精确比较工具集合；前缀比较忽略可合法移动的缓存断点，元数据不计入提示词。
export function inspectUpstream(body, request, previous) {
  const compiled = compileContext(request);
  const cacheBlocks = [...(body.tools || []), ...(Array.isArray(body.system) ? body.system : []), ...(body.messages || []).flatMap(message => Array.isArray(message.content) ? message.content : [])];
  let sawShort = false;
  for (const block of cacheBlocks) if (block.cache_control) {
    const ttl = block.cache_control.ttl || '5m';
    assert(!(ttl === '1h' && sawShort), '上游不能在 5m 缓存断点后追加 1h 断点');
    if (ttl === '5m') sawShort = true;
  }
  const expected = compiled.available.map(tool => `mcp__omp__${tool.name}`).sort();
  assert.deepEqual((body.tools || []).map(tool => tool.name).sort(), expected, '上游工具集合必须与调用方完全相等');
  const blocks = body.messages?.flatMap(message => Array.isArray(message.content) ? message.content : []) || [];
  const history = JSON.parse(compiled.input).message.content;
  // 文本与图片共用一个同一性键，图片块同样受顺序与完整性约束，不脱离护栏。
  const key = block => block.type === 'image' ? `image:${hash(block.source)}` : `text:${block.text}`;
  const upstreamKeys = blocks.filter(block => ['text', 'image'].includes(block.type)).map(key);
  let position = -1;
  for (const block of history) {
    position = upstreamKeys.indexOf(key(block), position + 1);
    assert(position >= 0, '上游必须按顺序保留完整调用方消息块');
  }
  // 最后一个调用方块可以是图片，验收该块的缓存断点确实到达最终上游。
  const breakpoint = blocks.findLast(block => ['text', 'image'].includes(block.type) && key(block) === key(history.at(-1)))?.cache_control;
  const actual = body.messages.flatMap(message => (Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }]).map(({ cache_control, ...block }) => ({ role: message.role, ...block })));
  const lastKey = key(history.at(-1));
  const lastCaller = actual.findLastIndex(block => ['text', 'image'].includes(block.type) && key(block) === lastKey);
  // CLI 可在断点之后追加环境消息；它不是上一轮已缓存的前缀，单独报告。
  const snapshot = { tools: body.tools, system: body.system, history: actual.slice(0, lastCaller + 1) };
  if (previous) {
    assert(stableJson(snapshot.tools) === stableJson(previous.tools), '工具定义跨轮应稳定');
    assert(stableJson(snapshot.system) === stableJson(previous.system), '固定调用方指令下，系统前缀跨轮应稳定');
    assert(stableJson(snapshot.history.slice(0, previous.history.length)) === stableJson(previous.history), '追加历史不应改写旧缓存前缀');
  }
  return { snapshot, report: { tools: expected, systemHash: hash(body.system), toolsHash: hash(body.tools), historyBlocks: history.length,
    historyImages: history.filter(block => block.type === 'image').length,
    upstreamImages: blocks.filter(block => block.type === 'image').length,
    cacheBreakpoint: breakpoint || null, metadataPresent: !!body.metadata, afterBreakpointBlocks: actual.length - lastCaller - 1, afterBreakpointHash: hash(actual.slice(lastCaller + 1)) } };
}
