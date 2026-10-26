import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {NativeSessionStore} from './native-session-store.mjs';
import {historyKey} from './session-history.mjs';

async function fixture(){
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'verified-tool-resume-')),config=path.join(home,'.claude'),id=randomUUID(),folder=path.join(config,'projects','synthetic');
 await fs.mkdir(folder,{recursive:true});const file=path.join(folder,id+'.jsonl');await fs.writeFile(file,'SYNTHETIC_NATIVE_COMPLETE_RESULTS\n');
 const store=new NativeSessionStore(home,config);await store.ready;
 const prefix={role:'user',content:'task'},assistant={role:'assistant',content:null,tool_calls:[{id:'real-tool',type:'function',function:{name:'Read',arguments:'{}'}}]},receipt={role:'tool',tool_call_id:'real-tool',content:'REAL_RESULT'};
 const stat=await fs.stat(file),signature='a'.repeat(64),row={id,signature,history:[historyKey(prefix,{hashKey:store.key,exact:true})],expected:historyKey(assistant,{hashKey:store.key}),snapshot:{size:stat.size,mtimeMs:stat.mtimeMs},savedAt:Date.now(),verifiedToolResults:[{id:'real-tool',hash:historyKey(receipt,{hashKey:store.key,exact:true})}]};
 store.records.set(id,row);await store.persist();
 return {home,config,id,store,signature,prefix,assistant,receipt,row,close:()=>fs.rm(home,{recursive:true,force:true})};
}
test('人工核验的原生工具结果检查点只恢复新用户增量，不重复发送已持久化结果',async()=>{
 const f=await fixture();try{
  const request={messages:[f.prefix,f.assistant,f.receipt,{role:'user',content:'继续'}]};
  const loaded=new NativeSessionStore(f.home,f.config);await loaded.ready;assert.deepEqual(loaded.records.get(f.id).verifiedToolResults,f.row.verifiedToolResults);
  const result=await loaded.take(request,f.signature,true,undefined,{consume:false});
  assert.equal(result.id,f.id);assert.deepEqual(result.delta,[{role:'user',content:'继续'}]);assert(loaded.records.has(f.id));
 }finally{await f.close();}
});
test('真实工具结果被改写或替换 ID 时不能采用人工检查点',async()=>{
 for(const change of [m=>({...m,content:'CHANGED'}),m=>({...m,tool_call_id:'wrong'})]){
  const f=await fixture();try{
   const result=await f.store.take({messages:[f.prefix,f.assistant,change(f.receipt),{role:'user',content:'继续'}]},f.signature,true);
   assert(!result?.id);
  }finally{await f.close();}
 }
});
test('普通检查点不会自动接受工具尾部，人工检查点没有新用户输入也不消费',async()=>{
 const f=await fixture();try{
  const request={messages:[f.prefix,f.assistant,f.receipt]};
  assert.equal((await f.store.take(request,f.signature,true))?.id,undefined);assert(f.store.records.has(f.id));
  delete f.row.verifiedToolResults;
  assert.equal((await f.store.take({...request,messages:[...request.messages,{role:'user',content:'继续'}]},f.signature,true))?.id,undefined);
 }finally{await f.close();}
});

test('持久检查点按已保存的较小输出上限恢复，其他配置签名仍严格校验',async()=>{
 const f=await fixture();try{
  f.row.compactSource={outputTokens:64000};await f.store.persist();
  const request={messages:[f.prefix,f.assistant,f.receipt,{role:'user',content:'继续'}]},signature='b'.repeat(64);
  const result=await f.store.take(request,signature,true,undefined,{consume:false,outputTokens:128000,signatureForOutput:cap=>cap===64000?f.signature:signature});
  assert.equal(result.id,f.id);assert.equal(result.outputTokens,64000);assert.equal(result.signature,f.signature);
  assert.equal(await f.store.take(request,signature,true,undefined,{consume:false,outputTokens:32000,signatureForOutput:()=>f.signature}),undefined);
  assert.equal(await f.store.take(request,signature,true,undefined,{consume:false,outputTokens:128000,signatureForOutput:()=>signature}),undefined);
  assert(f.store.records.has(f.id));
 }finally{await f.close();}
});
