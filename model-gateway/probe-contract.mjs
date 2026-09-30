import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileContext, stableJson } from './context.mjs';

const hash = value => createHash('sha256').update(stableJson(value)).digest('hex');
// 精确比较工具集合；前缀比较忽略可合法移动的缓存断点，元数据不计入提示词。
export function inspectUpstream(body, request, previous) {
  const compiled = compileContext(request);
  const expected = compiled.available.map(tool => `mcp__omp__${tool.name}`).sort();
  assert.deepEqual((body.tools || []).map(tool => tool.name).sort(), expected, '上游工具集合必须与调用方完全相等');
  const blocks = body.messages?.flatMap(message => Array.isArray(message.content) ? message.content : []) || [];
  const history = JSON.parse(compiled.input).message.content;
  const texts = blocks.filter(block => block.type === 'text').map(block => block.text);
  let position = -1;
  for (const block of history) {
    position = texts.indexOf(block.text, position + 1);
    assert(position >= 0, '上游必须按顺序保留完整调用方消息块');
  }
  const breakpoint = blocks.find(block => block.text === history.at(-1).text)?.cache_control;
  const actual = body.messages.flatMap(message => (Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content }]).map(({ cache_control, ...block }) => ({ role: message.role, ...block })));
  const lastCaller = actual.findLastIndex(block => block.type === 'text' && block.text === history.at(-1).text);
  // CLI 可在断点之后追加环境消息；它不是上一轮已缓存的前缀，单独报告。
  const snapshot = { tools: body.tools, system: body.system, history: actual.slice(0, lastCaller + 1) };
  if (previous) {
    assert(stableJson(snapshot.tools) === stableJson(previous.tools), '工具定义跨轮应稳定');
    assert(stableJson(snapshot.system) === stableJson(previous.system), '固定调用方指令下，系统前缀跨轮应稳定');
    assert(stableJson(snapshot.history.slice(0, previous.history.length)) === stableJson(previous.history), '追加历史不应改写旧缓存前缀');
  }
  return { snapshot, report: { tools: expected, systemHash: hash(body.system), toolsHash: hash(body.tools), historyBlocks: history.length,
    cacheBreakpoint: breakpoint || null, metadataPresent: !!body.metadata, afterBreakpointBlocks: actual.length - lastCaller - 1, afterBreakpointHash: hash(actual.slice(lastCaller + 1)) } };
}
