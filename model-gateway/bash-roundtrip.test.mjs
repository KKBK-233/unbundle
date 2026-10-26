import test from 'node:test';
import assert from 'node:assert/strict';
import {recordBashPhase} from './tool-boundary-trace.mjs';
import {mappedBashAssistant} from './bash-roundtrip.mjs';
import {continuationDelta,historyKey} from './session-history.mjs';
import {recoveryDelta} from './session-recovery.mjs';
const env=cwd=>({role:'system',content:`# Environment update\n - Primary working directory: ${cwd} (was E:\\)\n`});
function fixture(id,original='cd /e/sr/Poem && python promo/build.py',returned='python promo/build.py',wire=original){
 for(const [phase,command] of [['cli',original],['wire',wire],['desktop',returned]])recordBashPhase(phase,id,'Bash',{command});
 const make=command=>({role:'assistant',content:null,tool_calls:[{id,type:'function',function:{name:'Bash',arguments:JSON.stringify({command,description:'build'})}}]});
 return {expected:make(original),actual:make(returned)};
}
test('仅三点证据与调用前目录均一致时接受；原历史和结果不被改写',()=>{
 const {expected,actual}=fixture('verified');const prefix=[env('E:\\sr\\Poem')];
 assert.equal(historyKey(mappedBashAssistant(actual,prefix)),historyKey(expected));
 const result={role:'tool',tool_call_id:'verified',content:'failed',is_error:true};
 const delta=continuationDelta({request:{messages:prefix},history:prefix.map(m=>historyKey(m)),expected:historyKey(expected),pendingIds:new Set(['verified'])},{messages:[...prefix,actual,result]});
 assert.deepEqual(delta,[result]);assert.equal(JSON.parse(actual.tool_calls[0].function.arguments).command,'python promo/build.py');
});
test('执行后 cwd 不能证明调用前目录；结果 ID 不匹配仍拒绝',()=>{
 const {expected,actual}=fixture('timing');const prefix=[env('E:\\other')];
 const session={request:{messages:prefix},history:prefix.map(m=>historyKey(m)),expected:historyKey(expected),pendingIds:new Set(['timing'])};
 assert.equal(continuationDelta(session,{messages:[...prefix,actual,{role:'tool',tool_call_id:'timing',content:'ok'},env('E:\\sr\\Poem')]}),undefined);
 const correct=[env('E:\\sr\\Poem')];session.request={messages:correct};session.history=correct.map(m=>historyKey(m));
 assert.equal(continuationDelta(session,{messages:[...correct,actual,{role:'tool',tool_call_id:'different',content:'ok'}]}),undefined);
});
test('调用前带数值前缀的新目录优先于更早目录，不能沿用旧cwd误判等价',()=>{
 const {actual}=fixture('directory-prefix');
 const prefix=[env('E:\\sr\\Poem'),{role:'system',content:'<total_tokens>123 tokens left</total_tokens>\n\n# Environment update\n - Primary working directory: E:\\ (was E:\\sr\\Poem)\n\n<total_tokens>456 tokens left</total_tokens>'}];
 assert.strictEqual(mappedBashAssistant(actual,prefix),actual);
});
test('冻结恢复使用相同的受限映射，并保留错误工具结果',()=>{
 const {expected,actual}=fixture('recover');const prefix=[env('E:\\sr\\Poem')];
 const receipt={role:'tool',tool_call_id:'recover',content:'original error',is_error:true};
 const session={request:{messages:prefix},freezePreviousState:'waiting-tool',pendingControls:new Map(),pendingHttp:new Map(),history:prefix.map(m=>historyKey(m)),expected:historyKey(expected),pendingIds:new Set(['recover'])};
 assert.deepEqual(recoveryDelta(session,{messages:[...prefix,actual,receipt]}),[receipt]);
});
test('目录不符、缺少目录、出站不同、主体变化、shell展开均拒绝映射',()=>{
 for(const [id,original,returned,wire,prefix] of [
  ['wrong','cd /e/other && python promo/build.py','python promo/build.py',undefined,[env('E:\\sr\\Poem')]],
  ['missing','cd /e/sr/Poem && python promo/build.py','python promo/build.py',undefined,[]],
  ['wire','cd /e/sr/Poem && python promo/build.py','python promo/build.py','echo changed',[env('E:\\sr\\Poem')]],
  ['body','cd /e/sr/Poem && python promo/build.py','python other.py',undefined,[env('E:\\sr\\Poem')]],
  ['expand','cd /e/$(pwd) && python promo/build.py','python promo/build.py',undefined,[env('E:\\sr\\Poem')]],
 ]){const {actual}=fixture(id,original,returned,wire);assert.strictEqual(mappedBashAssistant(actual,prefix),actual);}
});
