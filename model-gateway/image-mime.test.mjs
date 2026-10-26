import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContext } from './context.mjs';
import { fromAnthropic } from './anthropic.mjs';

test('工具按 .png 声明的 JPEG 按文件头校正，像素数据与工具归属不变', () => {
  const data = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex').toString('base64');
  const body = { model: 'claude-opus-5-5', max_tokens: 1024, messages: [
    { role: 'assistant', content: [{ type: 'tool_use', id: 'read_1', name: 'Read', input: { path: 'screenshot.png' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'read_1', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data } }] }] },
  ] };
  const original = structuredClone(body);
  const compiled = compileContext(fromAnthropic(body));
  const blocks = JSON.parse(compiled.input).message.content;
  const native = blocks.find(block => block.type === 'image');
  assert.equal(native.source.media_type, 'image/jpeg');
  assert.equal(native.source.data, data);
  assert.equal(JSON.parse(blocks[1].text).tool_call_id, 'read_1');
  assert.deepEqual(body, original);
});

test('受支持的文件头可校正两种入口的类型，未知文件头不猜测格式', () => {
  const formats = [['89504e470d0a1a0a0000', 'image/png'], ['47494638396101000100', 'image/gif'],
    ['524946460c000000574542505650384c', 'image/webp'], ['ffd8ffdb0000', 'image/jpeg']];
  for (const [hex, mime] of formats) {
    const data = Buffer.from(hex, 'hex').toString('base64');
    for (const block of [{ type: 'image_url', image_url: { url: `data:image/png;base64,${data}` } },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data } }]) {
      const compiled = compileContext({ messages: [{ role: 'user', content: [block] }] });
      const image = JSON.parse(compiled.input).message.content.find(value => value.type === 'image');
      assert.equal(image.source.media_type, mime);
      assert.equal(image.source.data, data);
    }
  }
  const input = compileContext({ messages: [{ role: 'user', content: [{ type: 'image', source: {
    type: 'base64', media_type: 'image/png', data: Buffer.from('unknown').toString('base64') } }] }] }).input;
  assert.equal(JSON.parse(input).message.content[1].source.media_type, 'image/png');
});
