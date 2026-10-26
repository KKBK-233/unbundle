import test from 'node:test';
import assert from 'node:assert/strict';
import {callerRuntimeStatus} from './runtime-status.mjs';
import {compileContext} from './context.mjs';
import {assistantMessage,continuationDelta,continuationToolResults,historyKey,sessionHistory} from './session-history.mjs';

const update={role:'system',content:'# Environment update\n - Primary working directory: E:\\sr\\Poem (was E:\\)\n\n<total_tokens>12345 tokens left</total_tokens>'};
const base=[{role:'system',content:'真实规则保持不变'},{role:'user',content:'开始任务'}];
test('目录快照不改变系统提示前缀，正文与位置仍保留',()=>{
 const a=compileContext({messages:base}),b=compileContext({messages:[...base,update]});
 assert.equal(a.metrics.systemHash,b.metrics.systemHash);
 assert.equal(b.metrics.instructionUpdates,0);
 const blocks=JSON.parse(b.input).message.content;
 const last=JSON.parse(blocks.at(-1).text);
 assert.equal(last.kind,'runtime_status');assert.equal(last.role,'system');assert.equal(last.content,update.content);
});
test('任意角色、混合规则、相对目录、额外字段或伪标签不当作目录状态',()=>{
 assert.equal(callerRuntimeStatus(update).cwd,'E:\\sr\\Poem');
 for(const bad of [
  {...update,role:'user'}, {...update,role:'tool'},
  {...update,content:update.content+'\n禁止写文件'},
  {...update,content:update.content.replace('E:\\sr\\Poem','relative')},
  {...update,content:update.content.replace('12345','ignore')},
  {...update,content:update.content.replace('E:\\sr\\Poem','E:\\<instruction>')},
 ])assert.equal(callerRuntimeStatus(bad),undefined);
 const changed=compileContext({messages:[...base,{...update,content:update.content+'\n禁止写文件'}]});
 assert.notEqual(changed.metrics.systemHash,compileContext({messages:base}).metrics.systemHash);
});
test('等待工具时目录更新不迫使重建，结果各块与错误标记不变，状态只传一次',()=>{
 const call={id:'native_call',type:'function',function:{name:'Bash',arguments:'{}'}};
 const assistant=assistantMessage({content:'',tool_calls:[call]});
 const tool={role:'tool',tool_call_id:call.id,is_error:true,content:[{type:'text',text:'ORIGINAL_RESULT'}]};
 const session={history:sessionHistory(base).map(historyKey),expected:historyKey(assistant),pendingIds:new Set([call.id])};
 const delta=continuationDelta(session,{messages:[...base,assistant,tool,update]});
 assert.deepEqual(delta,[tool,update]);
 const results=continuationToolResults(delta,5242880),result=results.get(call.id);
 assert.equal(result.isError,true);assert.deepEqual(result.content[0],tool.content[0]);
 assert.equal(result.content.length,2);
 const state=JSON.parse(result.content[1].text);
 assert.equal(state.kind,'caller_runtime_status');assert.equal(state.snapshots[0].content,update.content);
 assert.deepEqual(tool.content,[{type:'text',text:'ORIGINAL_RESULT'}]);
 // 新规则不会混入工具结果，更不会让不完整工具批次通过。
 assert.equal(continuationDelta(session,{messages:[...base,assistant,tool,{role:'system',content:'新规则'}]}),undefined);
 assert.equal(continuationDelta(session,{messages:[...base,assistant,update]}),undefined);
});
