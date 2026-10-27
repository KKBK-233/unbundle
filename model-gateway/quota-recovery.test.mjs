import test from 'node:test';import assert from 'node:assert/strict';
import{quotaRecoveryDelta}from'./quota-recovery.mjs';import{historyKey}from'./session-history.mjs';import{sessionQuotaFailure}from'./session-quota-guard.mjs';
test('额度终止后只接受严格原历史之后的新用户消息',()=>{
 const user={role:'user',content:'原任务'},next={role:'user',content:'继续'},notice=sessionQuotaFailure("You've hit your session limit").message;
 const make=()=>({state:'frozen',freezeReason:'SESSION_LIMIT',history:[historyKey(user)],pendingIds:new Set(),pendingHttp:new Map(),results:new Map(),pendingControls:new Map(),frozenTurn:{events:{result:{is_error:true,terminal_reason:'api_error',result:"You've hit your session limit"},text:'',calls:new Map(),blocks:new Map()}}});
 assert.deepEqual(quotaRecoveryDelta(make(),{messages:[user,next]}),[next]);
 assert.deepEqual(quotaRecoveryDelta(make(),{messages:[user,{role:'assistant',content:notice},next]}),[next]);
 for(const messages of [[user],[{...user,content:'changed'},next],[user,{role:'assistant',content:notice+'extra'},next],[user,{role:'tool',tool_call_id:'x',content:'receipt'},next]])assert.equal(quotaRecoveryDelta(make(),{messages}),undefined);
 for(const change of [s=>s.freezeReason='REQUEST_CANCELLED',s=>s.pendingIds.add('x'),s=>s.pendingHttp.set('x',{}),s=>s.pendingControls.set('x',{}),s=>s.results.set('x',{}),s=>s.frozenTurn.events.text='visible',s=>s.frozenTurn.events.calls.set('x',{}),s=>s.frozenTurn.events.blocks.set('x',{}),s=>s.frozenTurn.events.result.terminal_reason='aborted_streaming',s=>s.frozenTurn.events.result.result='ordinary failure']){const s=make();change(s);assert.equal(quotaRecoveryDelta(s,{messages:[user,next]}),undefined);}
});
