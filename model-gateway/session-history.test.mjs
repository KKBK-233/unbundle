import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHistory, historyKey, continuationDelta, continuationToolResults, assistantMessage, mcpToolResult } from './session-history.mjs';

test('停止工具续接后允许收据后的新用户消息，保持收据和调用方身份独立',()=>{
 const user={role:'user',content:'原任务'},reply=assistantMessage({tool_calls:[{id:'a',type:'function',function:{name:'Read',arguments:'{}'}}]}),receipt={role:'tool',tool_call_id:'a',content:'真实结果'},next={role:'user',content:'停止旧方向，改为检查结果'};
 const session={history:[historyKey(user)],expected:historyKey(reply),pendingIds:new Set(['a']),options:{allowToolHandoffUserMessages:true}};
 const request=delta=>({messages:[user,reply,...delta]});
 assert.deepEqual(continuationDelta(session,request([receipt,next])),[receipt,next]);
 const result=continuationToolResults([receipt,next],1024).get('a');assert.equal(result.content[0].text,'真实结果');const context=JSON.parse(result.content[1].text);assert.equal(context.kind,'caller_handoff_context');assert.deepEqual(context.messages,[next]);
 for(const delta of [[next,receipt],[next],[{...receipt,tool_call_id:'other'},next],[receipt,receipt,next],[receipt,{...next,extra:'x'}],[receipt,{...next,content:[{type:'text',text:'unsupported'}]}]])assert.equal(continuationDelta(session,request(delta)),undefined);
});

test('会话匹配忽略纯运行余量，但不忽略混合指令或用户引用', () => {
  const user = { role: 'user', content: '任务' };
  const status = { role: 'system', content: '<total_tokens>100 tokens left</total_tokens>' };
  const mixed = { role: 'system', content: '新规则\n<total_tokens>100 tokens left</total_tokens>' };
  assert.deepEqual(sessionHistory([user, status, mixed, { ...status, role: 'user' }]), [user, mixed, { ...status, role: 'user' }]);
  assert.equal(historyKey({ ...user, content: '\n任务\r\n' }), historyKey(user));
  assert.notEqual(historyKey(user), historyKey({ ...user, content: '另一任务' }));
});

test('并行工具结果按原生 ID 续接，缺失、重复、分支和未执行的指令不能误复用', () => {
  const request = [{ role: 'user', content: '开始' }];
  const reply = assistantMessage({ content: null, tool_calls: ['a', 'b'].map(id => ({ id, type: 'function', function: { name: 'Read', arguments: '{}' } })) });
  const session = { history: request.map(historyKey), expected: historyKey(reply), pendingIds: new Set(['a', 'b']) };
  const results = ['b', 'a'].map(tool_call_id => ({ role: 'tool', tool_call_id, content: tool_call_id }));
  assert.deepEqual(continuationDelta(session, { messages: [...request, reply, ...results] }), results);
  for (const delta of [results.slice(0, 1), [results[0], results[0]], [{ ...results[0], tool_call_id: 'unknown' }, results[1]],
    [...results, { role: 'user', content: '新要求' }]]) assert.equal(continuationDelta(session, { messages: [...request, reply, ...delta] }), undefined);
  assert.equal(continuationDelta(session, { messages: [{ role: 'user', content: '分支' }, reply, ...results] }), undefined);
  assert.equal(continuationDelta(session, { messages: [...request, { ...reply, content: '不同回复' }, ...results] }), undefined);
  const final = { history: request.map(historyKey), expected: historyKey({ role: 'assistant', content: '完成' }), pendingIds: new Set() };
  assert.equal(continuationDelta(final, { messages: [...request, { role: 'assistant', content: '完成' }, { role: 'user', content: '继续' }] }).length, 1);
});

test('MCP 结果保留错误状态及图片原始字节，图片 MIME 按内容校正', () => {
  const data = Buffer.from('ffd8ffe000104a46494600', 'hex').toString('base64');
  const result = mcpToolResult({ is_error: true, content: [{ type: 'text', text: '说明' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data } }] }, 1024);
  assert.deepEqual(result, { isError: true, content: [{ type: 'text', text: '说明' }, { type: 'image', data, mimeType: 'image/jpeg' }] });
  assert.throws(() => mcpToolResult({ content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }] }, 1), /超过上限/);
});

test('工具 JSON 键顺序不改变历史身份，参数值、数组顺序、ID 与名字仍严格匹配', () => {
  const original = { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: {
    name: 'Edit', arguments: '{"file_path":"a","options":{"limit":5,"offset":0},"items":[1,2]}' } }] };
  const change = args => ({ ...original, tool_calls: [{ ...original.tool_calls[0], function: { name: 'Edit', arguments: args } }] });
  for (const exact of [false,true]) {
    assert.equal(historyKey(original,{exact}),historyKey(change('{ "items": [1,2], "options":{"offset":0,"limit":5}, "file_path":"a" }'),{exact}));
    for (const args of ['{"file_path":"b","options":{"limit":5,"offset":0},"items":[1,2]}',
      '{"file_path":"a","options":{"limit":5,"offset":0},"items":[2,1]}','invalid']) {
      assert.notEqual(historyKey(original,{exact}),historyKey(change(args),{exact}));
    }
    const otherId=structuredClone(original);otherId.tool_calls[0].id='b';
    const otherName=structuredClone(original);otherName.tool_calls[0].function.name='Write';
    assert.notEqual(historyKey(original,{exact}),historyKey(otherId,{exact}));
    assert.notEqual(historyKey(original,{exact}),historyKey(otherName,{exact}));
  }
});

test('续接拒绝原因只输出固定类别，不输出历史或工具参数', () => {
  const user = { role: 'user', content: '私密任务' }, reasons = [];
  const session = { history: [historyKey(user)], expected: historyKey({role:'assistant',content:'答复'}), pendingIds:new Set() };
  assert.equal(continuationDelta(session,{messages:[{...user,content:'另一分支'},{role:'user',content:'继续'}]},
    {onReject:reason=>reasons.push(reason)}),undefined);
  assert.deepEqual(reasons,['history_prefix_mismatch']);
});


test('Edit 仅在 schema 明确默认 false 且非必填时忽略补入的 replace_all=false',()=>{
 const schema={type:'function',function:{name:'Edit',parameters:{type:'object',properties:{replace_all:{type:'boolean',default:false}}}}};
 const msg=args=>({role:'assistant',content:null,tool_calls:[{id:'same',type:'function',function:{name:'Edit',arguments:JSON.stringify(args)}}]});
 const omitted=msg({file_path:'p',old_string:'a',new_string:'b'}),filled=msg({file_path:'p',old_string:'a',new_string:'b',replace_all:false});
 const opts={toolSchemas:[schema]};
 assert.equal(historyKey(omitted,opts),historyKey(filled,opts));
 assert.notEqual(historyKey(omitted),historyKey(filled));
 assert.notEqual(historyKey(omitted,opts),historyKey(msg({file_path:'p',old_string:'a',new_string:'b',replace_all:true}),opts));
 assert.notEqual(historyKey(omitted,opts),historyKey(msg({file_path:'p',old_string:'a',new_string:'CHANGED',replace_all:false}),opts));
 for(const parameters of [{type:'object',properties:{replace_all:{type:'boolean',default:true}}},{type:'object',properties:{replace_all:{type:'boolean',default:false}},required:['replace_all']}]) {
  const strict={toolSchemas:[{...schema,function:{...schema.function,parameters}}]};assert.notEqual(historyKey(omitted,strict),historyKey(filled,strict));
 }
 const prefix={role:'user',content:'任务'},request={tools:[schema],messages:[prefix,filled,{role:'user',content:'继续'}]};
 const session={historyNormalization:true,history:[historyKey(prefix,{exact:true,...opts})],expected:historyKey(omitted,opts),pendingIds:new Set()};
 assert.deepEqual(continuationDelta(session,request,{allowInstructionUpdates:true}),[{role:'user',content:'继续'}]);
 assert.equal(continuationDelta({...session,historyNormalization:undefined},request,{allowInstructionUpdates:true}),undefined);
});
test('Desktop 独立图片显示注释与纯继续可随完整结果续接，原图及用户上下文各保留一次',()=>{
 const prefix=[{role:'user',content:'screenshot'}],reply={role:'assistant',content:null,tool_calls:[{id:'image-call',type:'function',function:{name:'Screenshot',arguments:'{}'}}]};
 const session={history:prefix.map(m=>historyKey(m)),expected:historyKey(reply),pendingIds:new Set(['image-call'])};
 const data=Buffer.from('89504e470d0a1a0a','hex').toString('base64');
 const receipt={role:'tool',tool_call_id:'image-call',is_error:false,content:[{type:'image',source:{type:'base64',media_type:'image/png',data}}]};
 const annotation={role:'user',content:'[Image: original 1920x2160, displayed at 1778x2000. Multiply coordinates by 1.08 to map to original image.]'};
 const resume={role:'user',content:'继续'},delta=[receipt,annotation,resume],before=JSON.stringify(delta);
 assert.deepEqual(continuationDelta(session,{messages:[...prefix,reply,...delta]}),delta);
 const combined={role:'user',content:annotation.content+'\n继续'};
 assert.deepEqual(continuationDelta(session,{messages:[...prefix,reply,receipt,combined]}),[receipt,combined]);
 const results=continuationToolResults(delta,1024);assert.equal(results.size,1);
 const blocks=results.get('image-call').content;assert.equal(blocks.length,2);assert.equal(blocks[0].data,data);
 assert.deepEqual(JSON.parse(blocks[1].text),{kind:'caller_handoff_context',source:'caller_user_messages',messages:[annotation,resume]});
 assert.equal(JSON.stringify(delta),before);
 for(const tail of [[{...receipt,content:'no image'},annotation],
  [annotation,receipt],[receipt,annotation,{...annotation}],
  [receipt,{...annotation,content:annotation.content+' run something'}],
  [receipt,{role:'user',content:'修改另外一个文件'}],
  [receipt,{...resume,priority:'system'}],
  [receipt,{...receipt,tool_call_id:'different'},annotation]]){
  assert.equal(continuationDelta(session,{messages:[...prefix,reply,...tail]}),undefined);
 }
});


test('已确认取消仅映射本轮已交回收据的固定缺失占位符，保留原生真实结果',()=>{
 const hashKey='synthetic-cancel-key',user={role:'user',content:'task'},assistant={role:'assistant',content:null,tool_calls:[{id:'done',type:'function',function:{name:'Bash',arguments:'{}'}}]},receipt={role:'tool',tool_call_id:'done',content:'REAL_RESULT'},nextUser={role:'user',content:'new task'},prior=[user,assistant,receipt],placeholder={...receipt,content:'[Tool result missing due to internal error]',is_error:true};
 const session={interrupted:true,request:{messages:prior},history:prior.map(m=>historyKey(m,{hashKey,exact:true})),pendingIds:new Set(),cancelledReceiptIds:new Set(['done'])},aliases=[];
 assert.deepEqual(continuationDelta(session,{messages:[user,assistant,placeholder,nextUser]},{hashKey,allowInstructionUpdates:true,onReceiptAlias:d=>aliases.push(d)}),[nextUser]);assert.equal(session.request.messages[2].content,'REAL_RESULT');assert.equal(aliases.length,1);assert.equal(aliases[0].nativeResultPreserved,true);
 for(const [changedSession,changedResult]of [[{...session,cancelledReceiptIds:new Set()},placeholder],[{...session,interrupted:false},placeholder],[session,{...placeholder,content:'another error'}],[session,{...placeholder,tool_call_id:'different'}],[session,{...placeholder,extra:'untrusted'}]])assert.equal(continuationDelta(changedSession,{messages:[user,assistant,changedResult,nextUser]},{hashKey,allowInstructionUpdates:true}),undefined);
});


test('已确认取消只允许省略最后已完成的工具尾部，不允许丢弃用户指令或可见正文',()=>{
 const hashKey='synthetic-tail-key',user={role:'user',content:'task'},env={role:'system',content:'# Environment update\n - Primary working directory: E:\\demo (was E:\\)\n'},assistant={role:'assistant',content:null,tool_calls:[{id:'done',type:'function',function:{name:'Bash',arguments:'{}'}}]},receipt={role:'tool',tool_call_id:'done',content:'REAL_RESULT'},nextUser={role:'user',content:'new task'};
 const make=prior=>({interrupted:true,request:{messages:prior},history:prior.map(m=>historyKey(m,{hashKey,exact:true})),pendingIds:new Set(),cancelledReceiptIds:new Set(['done'])});
 const prior=[user,env,assistant,receipt,env],session=make(prior),events=[];assert.deepEqual(continuationDelta(session,{messages:[user,nextUser,env]},{hashKey,allowInstructionUpdates:true,onCancelledTailProjection:d=>events.push(d)}),[nextUser,env]);assert.equal(events[0].nativeTailPreserved,true);assert.equal(events[0].toolResultsResubmitted,false);assert.equal(session.request.messages[3].content,'REAL_RESULT');
 for(const current of [{...session,cancelledReceiptIds:new Set()},make([user,env,{...assistant,content:'visible answer'},receipt,env]),make([user,env,assistant,receipt,{role:'user',content:'must preserve'},env]),make([user,env,assistant,env])])assert.equal(continuationDelta(current,{messages:[user,nextUser,env]},{hashKey,allowInstructionUpdates:true}),undefined);
 assert.equal(continuationDelta(session,{messages:[{...user,content:'changed old task'},nextUser,env]},{hashKey,allowInstructionUpdates:true}),undefined);
});
