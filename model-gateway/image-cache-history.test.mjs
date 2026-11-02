import test from 'node:test';import assert from 'node:assert/strict';
import {historyKey} from './session-history.mjs';import {parseMessagesRequest} from './anthropic.mjs';
const image={type:'image',source:{type:'base64',media_type:'image/png',data:'aGVsbG8='}},text={type:'text',text:'original'};
for(const receipt of [false,true])for(const exact of [false,true])test(`缓存标记不改变内容身份，图片数据和顺序仍严格 receipt=${receipt} exact=${exact}`,()=>{
 const message={role:'user',content:receipt?[{type:'tool_result',tool_use_id:'real',content:[text,image]}]:[text,image]},options={exact};
 const parts=m=>receipt?m.content[0].content:m.content;
 const marked=structuredClone(message);parts(marked)[1].cache_control={type:'ephemeral',ttl:'1h'};
 assert.equal(historyKey(message,options),historyKey(marked,options));
 for(const change of [p=>p.reverse(),p=>p[1].source.data='d29ybGQ=',p=>p[0].text='changed',p=>p[1].source.cache_control='nested']){const other=structuredClone(message);change(parts(other));assert.notEqual(historyKey(message,options),historyKey(other,options));}
 assert.equal(parts(message)[1].cache_control,undefined);
});
test('Messages 入口保留缓存元数据与工具参数，不重建另一套协议',()=>{
 const blocks=[{...image,cache_control:{type:'ephemeral'}},text];
 const request=parseMessagesRequest({model:'synthetic',messages:[{role:'user',content:blocks}]});
 assert.deepEqual(request.messages[0].content,blocks);
});
