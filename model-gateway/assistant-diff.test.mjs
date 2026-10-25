import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantFingerprint,assistantDifference} from './assistant-diff.mjs';
import {historyKey,continuationDelta} from './session-history.mjs';
const original={role:'assistant',content:'PRIVATE_TEXT',tool_calls:[{id:'PRIVATE_ID',type:'function',function:{name:'PRIVATE_TOOL',arguments:'{"a":1,"b":2}'}}]};
const compare=message=>assistantDifference(assistantFingerprint(original),message);

test('诊断区分文本值变化与文本分块表示差异',()=>{
 const segmented={...original,content:[{type:'text',text:'PRIVATE_'},{type:'text',text:'TEXT'}]};
 assert.deepEqual(compare(segmented).differences,['text_representation']);
 assert.equal(compare(segmented).classification,'representation_candidate');
 assert(compare({...original,content:'CHANGED'}).differences.includes('text_content'));
});
test('参数键顺序与值变化分开记录，新增字段单独提示',()=>{
 const message=structuredClone(original);message.tool_calls[0].function.arguments='{"b":2,"a":1}';
 assert.deepEqual(compare(message).differences,['argument_representation']);
 assert.equal(historyKey(original),historyKey(message));
 message.tool_calls[0].function.arguments='{"b":3,"a":1}';
 assert(compare(message).differences.includes('tool_arguments'));
 message.tool_calls[0].function.arguments='{"b":2,"a":1,"default_flag":false}';
 assert(compare(message).differences.includes('argument_key_count'));
});
test('工具 ID、名称与顺序分别诊断',()=>{
 for(const [field,category]of [['id','tool_ids_or_duplicates'],['name','tool_name']]){
  const message=structuredClone(original);
  if(field==='id')message.tool_calls[0].id='OTHER';else message.tool_calls[0].function.name='OTHER';
  assert(compare(message).differences.includes(category));
 }
 const first={...original,tool_calls:[...original.tool_calls,{...original.tool_calls[0],id:'second'}]};
 const diff=assistantDifference(assistantFingerprint(first),{...first,tool_calls:[...first.tool_calls].reverse()});
 assert.deepEqual(diff.differences,['tool_order']);assert.equal(diff.classification,'representation_candidate');
});
test('诊断只输出类别与计数，不泄漏正文、参数、工具名或 ID',()=>{
 const diff=compare({...original,content:'CHANGED_SECRET'}),serialized=JSON.stringify(diff);
 for(const secret of ['PRIVATE_TEXT','CHANGED_SECRET','PRIVATE_ID','PRIVATE_TOOL','"a":1'])assert(!serialized.includes(secret));
 assert(diff.differences.includes('text_content'));
});
test('字段诊断不放宽续接，表示候选仍被原有匹配器拒绝',()=>{
 const user={role:'user',content:'任务'},details=[];
 const session={history:[historyKey(user)],expected:historyKey(original),expectedFingerprint:assistantFingerprint(original),pendingIds:new Set(['PRIVATE_ID'])};
 const shaped={...original,content:[{type:'text',text:'PRIVATE_TEXT'}]};
 assert.equal(continuationDelta(session,{messages:[user,shaped,{role:'tool',tool_call_id:'PRIVATE_ID',content:'结果'}]},
  {onAssistantMismatch:detail=>details.push(detail)}),undefined);
 assert.equal(details[0].classification,'representation_candidate');
});
test('没有旧字段摘要时明确未知，不推断为历史分叉',()=>{
 assert.equal(assistantDifference(undefined,original).classification,'undetermined');
});
