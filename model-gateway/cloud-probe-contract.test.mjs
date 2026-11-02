import test from 'node:test';
import assert from 'node:assert/strict';
import {createProbeRequest, assertInstructionProbe} from './cloud-probe.mjs';
import {compileContext} from './context.mjs';
import {inspectUpstream} from './probe-contract.mjs';

// 使用真实探针请求和编译器构造合成上游；测试不运行 CLI、不读取账号或连接网络。
const upstream = request => {
  const compiled = compileContext(request);
  return {system: [{type: 'text', text: compiled.systemPrompt}],
    tools: compiled.available.map(tool => ({name: `mcp__caller__${tool.name}`})),
    messages: [JSON.parse(compiled.input).message]};
};

for (const images of [false, true]) for (const maxTokens of [1, 64000]) test(`固定CLI探针验收动态指令和第二轮运行状态，图片=${images}，输出=${maxTokens}`, () => {
  const request = createProbeRequest(maxTokens);
  assert.equal(request.max_tokens, maxTokens);
  const image = {type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='}};
  if (images) request.messages[0].content = [{type: 'text', text: '读取 proof.txt'}, image];
  const body = upstream(request);
  assertInstructionProbe(body, 1);
  const first = inspectUpstream(body, request);
  request.messages.push({role: 'assistant', content: [{type: 'tool_use', id: 'toolu_probe', name: 'read', input: {path: 'proof.txt'}}]},
    {role: 'user', content: [{type: 'tool_result', tool_use_id: 'toolu_probe', content: images ? [{type: 'text', text: 'UNBUNDLE_PROOF'}, image] : 'UNBUNDLE_PROOF'}]},
    {role: 'system', content: '<total_tokens>800 tokens left</total_tokens>'});
  const next = upstream(request);
  assertInstructionProbe(next, 2);
  inspectUpstream(next, request, first.snapshot);
  assert.throws(() => assertInstructionProbe(body, 2), /第二轮运行状态/);
});

test('固定CLI探针拒绝丢失、错位或泄入历史的动态指令', () => {
  const body = upstream(createProbeRequest(8192));
  const missing = structuredClone(body);
  missing.system[0].text = missing.system[0].text.replaceAll('SYNTHETIC_MID_SYSTEM', 'MISSING');
  assert.throws(() => assertInstructionProbe(missing, 1), /动态指令正文/);
  const misplaced = structuredClone(body);
  misplaced.messages[0].content[1].text = JSON.stringify({instruction_ref: 'message_99', role: 'system'});
  assert.throws(() => assertInstructionProbe(misplaced, 1), /原位引用/);
  const duplicated = structuredClone(body);
  duplicated.messages[0].content.push({type: 'text', text: 'SYNTHETIC_MID_DEVELOPER'});
  assert.throws(() => assertInstructionProbe(duplicated, 1), /历史不能重复/);
});
