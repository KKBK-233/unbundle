import test from 'node:test';
import assert from 'node:assert/strict';
import {compactionRecord,compactedDelta,SUMMARY_HEADER} from './compaction-boundary.mjs';
const rules={role:'system',content:'original rules'},user={role:'user',content:'old task'},reply={role:'assistant',content:'old reply'};
const prefix='<system-reminder>\nCodebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.\n\nContents of C:\\Users\\caller\\.claude\\projects\\E--\\memory\\MEMORY.md (user\'s auto-memory, persists across conversations):\n\nCALLER_MEMORY\n</system-reminder>';
const summary=SUMMARY_HEADER+'\n\n<tools-used-before-summary>Read</tools-used-before-summary>\nSummary:\nVERIFIED_SUMMARY\nContinue now.';
function setup(){const session={request:{messages:[rules,user]},pendingIds:new Set(),nativeCompactionCommit:{boundaryUuid:'saved'}};session.compaction=compactionRecord(session,{messages:[user,reply,{role:'user',content:'summary request'}]},{content:'<summary>VERIFIED_SUMMARY</summary>'});return session;}
function request(value=prefix+'\n\n'+summary){return{messages:[rules,{role:'user',content:value},reply,{role:'user',content:'continue'}]};}
test('摘要前自动记忆独立保留为用户消息，真实保留回复仍核验，不重放旧历史',()=>{
 const delta=compactedDelta(setup(),request());assert(delta);assert.equal(delta[0].role,'user');assert(delta[0].content.endsWith(prefix));assert.equal(delta.at(-1).content,'continue');assert(!JSON.stringify(delta).includes('old reply'));assert(!JSON.stringify(delta).includes('old task'));
});
test('附加记忆不能绕过摘要、系统规则、保留回复和包装校验',()=>{
 for(const value of [prefix+'\n\n'+summary.replace('VERIFIED_SUMMARY','FORGED'),prefix.replace('MEMORY.md','other.txt')+'\n\n'+summary,'arbitrary prefix\n\n'+summary,prefix+'\nextra\n'+summary])assert.equal(compactedDelta(setup(),request(value)),undefined);
 assert.equal(compactedDelta(setup(),{messages:[{...rules,content:'changed'},...request().messages.slice(1)]}),undefined);
 const changed=request();changed.messages[2]={...reply,content:'changed'};assert.equal(compactedDelta(setup(),changed),undefined);
});
