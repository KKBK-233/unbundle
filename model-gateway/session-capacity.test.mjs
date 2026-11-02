import test from 'node:test';
import assert from 'node:assert/strict';
import {reclaimSessionCapacity} from './session-capacity.mjs';
const blocked=()=>Object.assign(new Error('取消会话的恢复检查点尚未保存'),{code:'SESSION_CAPACITY',status:429,retryable:false});
test('旧取消检查点不可回收时仍可回收后面的空闲会话',async()=>{
  const old={state:'idle',lastUsed:1,async close(){throw blocked();}},next={state:'idle',lastUsed:2,async close(reason){assert.equal(reason,'capacity');this.state='closed';}},frozen={state:'frozen',close(){throw Error('不能关闭冻结现场');}};
  const sessions=new Set([old,next,frozen]);await reclaimSessionCapacity(sessions,3);assert.deepEqual([...sessions],[old,frozen]);
});
test('没有可回收会话时保留原错误及全部现场',async()=>{
  const error=blocked(),old={state:'idle',async close(){throw error;}},sessions=new Set([old]);await assert.rejects(reclaimSessionCapacity(sessions,1),e=>e===error);assert(sessions.has(old));assert.equal(old.state,'idle');
});
test('运行、创建、压缩、恢复和待工具会话不被关闭',async()=>{
  const close=()=>{throw Error('不能关闭');},rows=[{state:'running',close},{state:'waiting-tool',close},{state:'idle',creationReserved:true,close},{state:'idle',compacting:true,close},{state:'idle',recoveryInProgress:true,close}];
  const sessions=new Set(rows);await reclaimSessionCapacity(sessions,6);await assert.rejects(reclaimSessionCapacity(sessions,5),{code:'SESSION_CAPACITY'});assert.equal(sessions.size,5);
});
test('非容量错误仍抛出，不隐藏存储或进程故障',async()=>{
  const error=Error('磁盘失败'),old={state:'idle',async close(){throw error;}};await assert.rejects(reclaimSessionCapacity(new Set([old]),1),e=>e===error);
});
