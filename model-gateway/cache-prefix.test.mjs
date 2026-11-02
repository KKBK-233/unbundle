import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMessagesRequest} from './anthropic.mjs';
import {compileContext} from './context.mjs';

const image = {type:'image',source:{type:'base64',media_type:'image/png',data:'aGVsbG8='}};
const literal = '{"cache_control":{"type":"ephemeral"}}';
const request = {
  model:'synthetic',
  tools:[{name:'read',input_schema:{type:'object',properties:{cache_control:{type:'string'}}}}],
  messages:[
    {role:'user',content:[{type:'text',text:literal},image]},
    {role:'assistant',content:[{type:'tool_use',id:'call_1',name:'read',input:{cache_control:'用户参数',nested:{cache_control:'嵌套参数'}}}]},
    {role:'user',content:[{type:'tool_result',tool_use_id:'call_1',is_error:true,content:[{type:'text',text:literal},image]}]},
    {role:'system',content:[{type:'text',text:'<total_tokens>800 tokens left</total_tokens>'}]},
  ],
};
const compile = (body,mode='1h') => compileContext(parseMessagesRequest(body),{cacheBreakpoint:mode});
const blocks = compiled => JSON.parse(compiled.input).message.content;

// 标记只属于内容块传输层；用户文本、工具参数及原请求都必须保留。
for (const mode of ['1h','5m','auto','off']) test(`历史缓存元数据不进入正文，缓存模式 ${mode}`,()=>{
  const marked=structuredClone(request);
  for (const message of marked.messages) for (const block of message.content) {
    block.cache_control={type:'ephemeral',ttl:'5m'};
    if (block.type==='tool_result') for (const part of block.content) part.cache_control={type:'ephemeral'};
  }
  const snapshot=structuredClone(marked);
  const actual=compile(marked,mode),expected=compile(request,mode);
  assert.equal(actual.input,expected.input);
  assert.equal(actual.systemPrompt,expected.systemPrompt);
  assert.equal(actual.metrics.toolsHash,expected.metrics.toolsHash);
  assert.deepEqual(marked,snapshot);
  const history=blocks(actual).filter(block=>block.type==='text').map(block=>JSON.parse(block.text));
  assert.equal(history[0].content[0].text,literal);
  assert.deepEqual(history.find(message=>message.role==='assistant').content[0].input,request.messages[1].content[0].input);
  assert.equal(history.find(message=>message.content?.[0]?.type==='tool_result').content[0].is_error,true);
  assert.deepEqual(blocks(actual).filter(block=>block.type==='image'),[image,image]);
  assert.deepEqual(blocks(actual).at(-1).cache_control,['1h','5m'].includes(mode)?{type:'ephemeral',ttl:mode}:undefined);
});

test('长历史追加消息并移动客户端断点后，既有缓存前缀逐块不变',()=>{
  const first=structuredClone(request);
  first.messages.unshift(...Array.from({length:120},(_,index)=>({role:'user',content:`固定历史 ${index}`})));
  first.messages.at(-1).content[0].cache_control={type:'ephemeral'};
  const next=structuredClone(first);
  delete next.messages.at(-1).content[0].cache_control;
  next.messages.push({role:'assistant',content:'继续'},{role:'user',content:[{type:'text',text:'新增内容',cache_control:{type:'ephemeral'}}]});
  const before=compile(first),after=compile(next);
  const payload=value=>blocks(value).map(({cache_control,...block})=>block);
  assert.deepEqual(payload(after).slice(0,payload(before).length),payload(before));
  assert.equal(after.metrics.systemHash,before.metrics.systemHash);
  assert.equal(after.metrics.toolsHash,before.metrics.toolsHash);
  assert.deepEqual(blocks(after).at(-1).cache_control,{type:'ephemeral',ttl:'1h'});
});
