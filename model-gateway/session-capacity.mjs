// 单个取消检查点不可回收时继续寻找其他空闲会话，不丢弃旧现场。
export async function reclaimSessionCapacity(sessions,maxSessions) {
  if(sessions.size<maxSessions)return;
  const candidates=[...sessions].filter(s=>s.state==='idle'&&!s.creationReserved&&!s.compacting&&!s.recoveryInProgress)
    .sort((a,b)=>(a.lastUsed||0)-(b.lastUsed||0));
  let blocked;
  for(const session of candidates){
    try {
      const closed=await session.close('capacity');
      if(closed===false||session.state!=='closed')continue;
      sessions.delete(session);
      if(sessions.size<maxSessions)return;
    }catch(error){
      if(error.code!=='SESSION_CAPACITY')throw error;
      blocked=error;
    }
  }
  if(blocked)throw blocked;
  throw Object.assign(new Error('原生会话容量已满；没有可安全回收的空闲会话'),{code:'SESSION_CAPACITY',status:429,retryable:false});
}
