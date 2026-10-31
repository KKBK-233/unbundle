import test from 'node:test';import assert from 'node:assert/strict';
import {historyKey} from './session-history.mjs';import {fromAnthropic} from './anthropic.mjs';
const image={type:'image',source:{type:'base64',media_type:'image/png',data:'aGVsbG8='}},text={type:'text',text:'original'};
for(const role of ['user','tool'])for(const exact of [false,true])test(`缓存标记不改变内容身份，图片数据和顺序仍严格 role=${role} exact=${exact}`,()=>{
 const message={role,content:[text,image],...(role==='tool'?{tool_call_id:'real'}:{})},options={exact};
 const marked=structuredClone(message);marked.content[1].cache_control={type:'ephemeral',ttl:'1h'};
 assert.equal(historyKey(message,options),historyKey(marked,options));
 marked.content[0].cache_control=marked.content[1].cache_control;delete marked.content[1].cache_control;assert.equal(historyKey(message,options),historyKey(marked,options));
 for(const change of [m=>m.content.reverse(),m=>m.content[1].source.data='d29ybGQ=',m=>m.content[1].source.media_type='image/jpeg',m=>m.content[0].text='changed',m=>m.content[1].source.cache_control='nested-data']){const other=structuredClone(message);change(other);assert.notEqual(historyKey(message,options),historyKey(other,options));}
 assert.equal(message.content[1].cache_control,undefined);
});
test('Anthropic 图片及工具结果统一移除顶层缓存元数据，参数内同名字段保持',()=>{
 const request=fromAnthropic({model:'synthetic',messages:[{role:'user',content:[{...image,cache_control:{type:'ephemeral'}}]},{role:'assistant',content:[{type:'tool_use',id:'call',name:'Read',input:{cache_control:'real argument'}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'call',content:[{...image,cache_control:{type:'ephemeral'}},{...text,cache_control:{type:'ephemeral'}}]}]}]});
 assert.equal(request.messages[0].content[0].cache_control,undefined);assert(request.messages[1].tool_calls[0].function.arguments.includes('real argument'));assert(request.messages[2].content.every(b=>b.cache_control===undefined));
});
