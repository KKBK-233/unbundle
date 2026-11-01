import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMessagesRequest} from './anthropic.mjs';
import {CliEvents} from './cli-events.mjs';
import {gateway} from './server.mjs';
import {compileContext} from './context.mjs';
import {historyKey} from './session-history.mjs';

const call = {type:'tool_use',id:'edit-1',name:'Edit',input:{file_path:'probe.txt',old_string:'0',new_string:'1'}};
const content = [{type:'text',text:'读取完毕。'}, call, {type:'text',text:'随后说明。'}];
const tools = [{name:'Edit',description:'编辑本机文件',input_schema:{type:'object',properties:{file_path:{type:'string'},old_string:{type:'string'},new_string:{type:'string'}}}}];
const base = {model:'synthetic',max_tokens:1024,messages:[{role:'user',content:'合成测试'}],tools};

// 入站协议保留块的相对顺序与原生参数，不再经另一种工具消息表示。
test('原生输入保留混合内容、系统及缓存元数据，工具收据按原顺序拆分', () => {
  const cache_control={type:'ephemeral',ttl:'1h'};
  const body={...base,system:[{type:'text',text:'固定规则',cache_control}],metadata:{user_id:'synthetic'},output_config:{effort:'high'},
    tools:[{...tools[0],cache_control}],messages:[...base.messages,{role:'assistant',content},
      {role:'user',content:[{type:'tool_result',tool_use_id:call.id,content:'完成',cache_control},{type:'text',text:'下一步'}]}]};
  const before=structuredClone(body),parsed=parseMessagesRequest(body);
  assert.deepEqual(body,before);
  assert.deepEqual(parsed.messages[1].content,content);
  assert.equal(typeof parsed.messages[1].content[1].input,'object');
  for(const field of ['system','tools','metadata','output_config'])assert.deepEqual(parsed[field],body[field]);
  assert.deepEqual(parsed.messages.slice(2).map(m=>m.content[0].type),['tool_result','text']);
  const history=JSON.parse(compileContext(parsed).input).message.content.map(b=>JSON.parse(b.text));
  assert.deepEqual(history[1].content.map(b=>b.type),['text','tool_use','text']);
  assert.equal(history[1].content[1].name,'mcp__caller__Edit');
  assert.notEqual(historyKey({role:'assistant',content}),historyKey({role:'assistant',content:[content[0],content[2],call]}));
});

function collect(onText,aggregate) {
  const events=new CliEvents([{name:'Edit',original:'Edit'}],onText);
  if(aggregate)events.accept({type:'assistant',message:{id:'msg',content:content.map(b=>b.type==='tool_use'?{...b,name:'mcp__caller__Edit'}:b),stop_reason:'tool_use'}});
  else {
    const emit=event=>events.accept({type:'stream_event',event});
    emit({type:'message_start',message:{id:'msg',usage:{input_tokens:7,output_tokens:0}}});
    content.forEach((block,index)=>{
      emit({type:'content_block_start',index,content_block:block.type==='tool_use'?{...block,name:'mcp__caller__Edit',input:{}}:{type:'text',text:''}});
      emit({type:'content_block_delta',index,delta:block.type==='tool_use'?{type:'input_json_delta',partial_json:JSON.stringify(block.input)}:{type:'text_delta',text:block.text}});
      emit({type:'content_block_stop',index});
    });
    emit({type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:9}});
  }
  return {role:'assistant',content:events.content(),...events.usage()};
}

for(const aggregate of [false,true])test(`CLI${aggregate?'聚合':'流式'}工具之后的文本等待核验，HTTP JSON/SSE顺序一致`,async()=>{
  const published=[];
  assert.deepEqual(collect(text=>published.push(text),aggregate).content,content);
  assert.deepEqual(published,[content[0].text]);
  const app=await gateway({token:'order-test',port:0,models:[{id:base.model}],execute:async(_body,_signal,onText)=>collect(onText,aggregate)});
  try {
    for(const stream of [false,true]){
      const res=await fetch(`http://127.0.0.1:${app.port}/v1/messages`,{method:'POST',headers:{authorization:'Bearer order-test','content-type':'application/json'},body:JSON.stringify({...base,stream})});
      assert.equal(res.status,200);
      if(!stream){assert.deepEqual((await res.json()).content,content);continue;}
      const frames=(await res.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
      const blocks=[];
      for(const frame of frames){
        if(frame.type==='content_block_start')blocks[frame.index]=structuredClone(frame.content_block);
        if(frame.type==='content_block_delta'){
          const block=blocks[frame.index];
          if(frame.delta.type==='text_delta')block.text+=frame.delta.text;
          else block.input=JSON.parse(frame.delta.partial_json);
        }
      }
      assert.deepEqual(blocks,content);
      assert.equal(frames.at(-1).type,'message_stop');
      assert.equal(frames.find(f=>f.type==='message_delta').delta.stop_reason,'tool_use');
    }
  } finally {await app.close();}
});

test('旧接口与旧请求字段明确拒绝，不启动执行器',async()=>{
  let calls=0;
  const app=await gateway({token:'contract',port:0,execute:async()=>{calls++;return {role:'assistant',content:'unexpected'};}});
  const headers={authorization:'Bearer contract','content-type':'application/json'};
  try{
    const old=await fetch(`http://127.0.0.1:${app.port}/v1/chat/completions`,{method:'POST',headers,body:JSON.stringify(base)});
    assert.equal(old.status,404);await old.text();
    for(const extra of [{max_completion_tokens:100},{stream_options:{include_usage:true}},{tools:[{type:'function',function:{name:'Edit',parameters:{type:'object'}}}]},{max_tokens:null}]){
      const res=await fetch(`http://127.0.0.1:${app.port}/v1/messages`,{method:'POST',headers,body:JSON.stringify({...base,...extra})});
      assert.equal(res.status,400,await res.text());
    }
    assert.equal(calls,0);
  }finally{await app.close();}
});

// 停止串在工具边界终止匹配；不能将待定字符移到工具之后。
test('聚合与流式事件的停止串待定前缀都留在工具之前',()=>{
 for(const aggregate of [false,true]){
  const events=new CliEvents([{name:'Edit',original:'Edit'}],undefined,['XYZ']);
  const blocks=[{type:'text',text:'prefix X'},{...call,name:'mcp__caller__Edit'},{type:'text',text:'YZ after'}];
  if(aggregate)events.accept({type:'assistant',message:{id:'stops',content:blocks,stop_reason:'tool_use'}});
  else{
   const emit=event=>events.accept({type:'stream_event',event});
   emit({type:'message_start',message:{id:'stops'}});
   blocks.forEach((block,index)=>{
    emit({type:'content_block_start',index,content_block:block.type==='tool_use'?{...block,input:{}}:{type:'text',text:''}});
    emit({type:'content_block_delta',index,delta:block.type==='tool_use'?{type:'input_json_delta',partial_json:JSON.stringify(block.input)}:{type:'text_delta',text:block.text}});
    emit({type:'content_block_stop',index});
   });
   emit({type:'message_delta',delta:{stop_reason:'tool_use'}});
  }
  assert.deepEqual(events.content(),[blocks[0],call,blocks[2]]);assert.equal(events.stopSequence,undefined);
 }
});
