import test from 'node:test';
import assert from 'node:assert/strict';
import {CliEvents} from './cli-events.mjs';
import {anthropicWriter} from './anthropic.mjs';

// 参考 Sub2API #3338/#4114/#4193 的协议不变量，全部使用本地合成事件。
const tools=['Read','Write'].map(name=>({name,original:name}));
const stream=event=>({type:'stream_event',event});
test('工具结束原因不能在没有结构化工具块时成立（#3338）',()=>{
 const events=new CliEvents(tools);
 events.accept(stream({type:'message_start',message:{id:'test'}}));
 events.accept(stream({type:'content_block_delta',index:0,delta:{type:'text_delta',text:'仅文字'}}));
 assert.throws(()=>events.accept(stream({type:'message_delta',delta:{stop_reason:'tool_use'}})),/CLI 工具消息不完整/);
});

test('Read 参数在缺逐块 stop 时仍由消息边界完整收尾（#4114）',()=>{
 const events=new CliEvents(tools);
 events.accept(stream({type:'message_start',message:{id:'test'}}));
 events.accept(stream({type:'content_block_start',index:4,content_block:{type:'tool_use',id:'read_1',name:'mcp__omp__Read',input:{}}}));
 const args=JSON.stringify({file_path:'E:\\项目\\qa\\截图.png',offset:10});
 for(const piece of [args.slice(0,17),args.slice(17)])events.accept(stream({type:'content_block_delta',index:4,delta:{type:'input_json_delta',partial_json:piece}}));
 events.accept(stream({type:'message_delta',delta:{stop_reason:'tool_use'}}));
 assert.deepEqual(JSON.parse(events.calls.get('read_1').function.arguments),JSON.parse(args));
 assert.equal(events.blocks.size,0);
});

test('并行工具重建 SSE 时每个 delta 均有未关闭的 start，参数不会串块（#4193）',()=>{
 const calls=[{id:'r',type:'function',function:{name:'Read',arguments:JSON.stringify({file_path:'read.txt'})}},
  {id:'w',type:'function',function:{name:'Write',arguments:JSON.stringify({file_path:'write.txt',content:'内容'})}}];
 for(const keepalive of [false,true]){
  let raw='';const writer=anthropicWriter({writeHead(){},write(s){raw+=s;},end(){}},'test','claude-opus-5-5');
  writer.start();if(keepalive)writer.ping();writer.text('准备执行');writer.finish({tool_calls:calls},'tool_use');
  const events=raw.split('\n\n').flatMap(frame=>{const line=frame.split('\n').find(l=>l.startsWith('data: '));return line?[JSON.parse(line.slice(6))]:[];});
  const active=new Map(),complete=[];let terminal=0;
  for(const e of events){
   if(e.type==='content_block_start'){assert(!active.has(e.index));active.set(e.index,{...e.content_block,json:''});}
   if(e.type==='content_block_delta'){assert(active.has(e.index),'delta 不得指向未开启/已关闭的块');if(e.delta.type==='input_json_delta')active.get(e.index).json+=e.delta.partial_json;}
   if(e.type==='content_block_stop'){assert(active.has(e.index));complete.push(active.get(e.index));active.delete(e.index);}
   if(e.type==='message_stop')terminal++;
  }
  assert.equal(active.size,0);assert.equal(terminal,1);
  assert.deepEqual(complete.filter(b=>b.type==='tool_use').map(b=>({id:b.id,name:b.name,input:JSON.parse(b.json)})),calls.map(c=>({id:c.id,name:c.function.name,input:JSON.parse(c.function.arguments)})));
  assert.equal(events.find(e=>e.type==='message_delta').delta.stop_reason,'tool_use');
 }
});
