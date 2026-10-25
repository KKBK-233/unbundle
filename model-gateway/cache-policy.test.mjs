import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheEnvironment} from './cache-policy.mjs';
import {compileContext} from './context.mjs';

test('默认由官方 CLI 选择缓存，显式 TTL 和关闭缓存各自生效', () => {
  assert.deepEqual(cacheEnvironment(), {});
  assert.deepEqual(cacheEnvironment('auto'), {});
  assert.deepEqual(cacheEnvironment('5m'), {FORCE_PROMPT_CACHING_5M:'1'});
  assert.deepEqual(cacheEnvironment('1h'), {CLAUDE_CODE_PROMPT_CACHE_TTL:'1h'});
  assert.deepEqual(cacheEnvironment('off'), {DISABLE_PROMPT_CACHING:'1'});
  assert.throws(()=>cacheEnvironment('invalid'));
  const request={messages:[{role:'user',content:'synthetic'}]};
  const last=mode=>JSON.parse(compileContext(request,{cacheBreakpoint:mode}).input).message.content.at(-1);
  for(const mode of [undefined,'auto','off'])assert.equal(last(mode).cache_control,undefined);
  for(const mode of ['5m','1h'])assert.deepEqual(last(mode).cache_control,{type:'ephemeral',ttl:mode});
});
