import test from 'node:test';
import assert from 'node:assert/strict';
import {compileContext} from './context.mjs';
import {nativeHistoryBootstrap,nativeResumeSafety,nativeResumeSeed} from './native-history.mjs';
const tools=['Read','Write'].map(name=>({type:'function',function:{name,description:name,parameters:{type:'object',properties:{}}}}));
const call=(id,name)=>({id,type:'function',function:{name,arguments:'{"file_path":"E:\\\\project\\\\a.py"}'}});
const image={type:'image',source:{type:'base64',media_type:'image/png',data:'iVBORw0KGgo='}};
test('原生启动恢复真实角色、图片和工具结果，只把最后输入作为新请求',()=>{
 const request={tools,messages:[{role:'system',content:'固定规则'},{role:'user',content:'任务'},
  {role:'assistant',content:null,tool_calls:[call('read1','Read')]},
  {role:'tool',tool_call_id:'read1',content:[image,{type:'text',text:'图像结果'}]},
  {role:'system',content:'# Environment update\n - Primary working directory: E:\\project (was E:\\)\n\n<total_tokens>100 tokens left</total_tokens>'},
  {role:'assistant',content:'准备编辑'},{role:'user',content:'继续'}]};
 const result=nativeHistoryBootstrap(request,compileContext(request));
 assert.deepEqual(result.history.map(m=>m.role),['user','assistant','user','assistant']);
 assert.equal(result.history[1].content[0].name,'mcp__omp__Read');
 assert.equal(result.history[2].content[0].type,'tool_result');
 assert.equal(result.history[2].content[0].tool_use_id,'read1');
 assert.deepEqual(result.history[2].content[0].content,[image,{type:'text',text:'图像结果'}]);
 assert.equal(JSON.parse(result.history[2].content[1].text).snapshots[0].cwd,'E:\\project');
 assert.deepEqual(JSON.parse(result.input).message,{role:'user',content:[{type:'text',text:'继续'}]});
 assert(result.systemPrompt.includes('固定规则'));
});
test('最后一批工具结果保持调用配对、顺序和错误标记，不伪造中断结果',()=>{
 const request={tools,messages:[{role:'user',content:'任务'},{role:'assistant',content:null,tool_calls:[call('a','Read'),call('b','Read')]},
  {role:'tool',tool_call_id:'a',content:'A'}, {role:'tool',tool_call_id:'b',content:'B',is_error:true}]};
 const result=nativeHistoryBootstrap(request,compileContext(request));
 assert.deepEqual(result.current.content.map(b=>b.tool_use_id),['a','b']);
 assert.equal(result.current.content[1].is_error,true);
 assert.deepEqual(result.current.content[0].content,[{type:'text',text:'A'}]);
});
test('不认识的历史工具和没有新输入的历史明确失败，不静默丢弃消息',()=>{
 const unknown={tools,messages:[{role:'user',content:'任务'},{role:'assistant',content:null,tool_calls:[call('a','Missing')]},{role:'tool',tool_call_id:'a',content:'A'}]};
 assert.throws(()=>nativeHistoryBootstrap(unknown,compileContext(unknown)),/工具不在当前映射/);
 const ended={tools,messages:[{role:'user',content:'任务'},{role:'assistant',content:'结束'}]};
 assert.throws(()=>nativeHistoryBootstrap(ended,compileContext(ended)),/以调用方输入或工具结果结束/);
});


test('已完成工具结果后真实继续消息分开导入，不伪造助手或重发结果',()=>{
 const request={tools,messages:[{role:'user',content:'原任务'},
  {role:'assistant',content:'正在读取',tool_calls:[call('a','Read'),call('b','Read')]},
  {role:'tool',tool_call_id:'a',content:'真实结果A'},
  {role:'tool',tool_call_id:'b',content:'真实错误B',is_error:true},
  {role:'user',content:'继续'}]};
 const native=nativeHistoryBootstrap(request,compileContext(request));
 assert.deepEqual(nativeResumeSafety(native),{safe:true});
 assert.deepEqual(native.history.map(m=>m.role),['user','assistant','user']);
 assert.deepEqual(native.history.at(-1).content.map(b=>b.tool_use_id),['a','b']);
 assert.equal(native.history.at(-1).content[1].is_error,true);
 assert.deepEqual(JSON.parse(native.input).message.content,[{type:'text',text:'继续'}]);
 const seed=nativeResumeSeed(native,{sessionId:'synthetic',cwd:'/synthetic',model:'synthetic'}).trim().split('\n').map(x=>JSON.parse(x));
 assert.equal(seed.filter(r=>r.type==='assistant').length,1);
 assert.equal(seed.at(-1).message.content[0].content[0].text,'真实结果A');
 for(const messages of [request.messages.filter(m=>m.tool_call_id!=='b'),[...request.messages.slice(0,-1),request.messages[2],request.messages.at(-1)]]) {
  assert.equal(nativeResumeSafety(nativeHistoryBootstrap({...request,messages},compileContext({...request,messages}))).safe,false);
 }
 const onlyResults={...request,messages:request.messages.slice(0,-1)};
 assert.equal(nativeResumeSafety(nativeHistoryBootstrap(onlyResults,compileContext(onlyResults))).safe,false);
});
