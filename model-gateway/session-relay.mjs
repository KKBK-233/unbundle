import {automaticRecoveryRequest,automaticRecoveryIdentity} from './automatic-recovery.mjs';
import {settleFrozenTools,recoveryInputMessages} from './native-recovery.mjs';
import {SessionLifecycle} from './session-lifecycle.mjs';
import {compactionIntent,compactionBoundary,compactionRecord,compactedDelta} from './compaction-boundary.mjs';
import {hydrateCompactionSource} from './native-compaction.mjs';
import {recoveryDelta,retryIdentity,recoveryError,archivedSessions,exportHandoff} from './session-recovery.mjs';
import {continueRecoveryRequest} from './continue-recovery.mjs';
import { sessionEntry } from './session-entry.mjs';
import { toolSearchConfig } from './tool-search-config.mjs';
import { createHmac, randomBytes } from 'node:crypto';
import { compileContext, stableJson } from './context.mjs';
import { validateRequest } from './request.mjs';
import { NativeCliSession } from './native-cli-session.mjs';
import { continuationDelta, historyKey, sessionHistory } from './session-history.mjs';
import path from 'node:path';
import { NativeSessionStore } from './native-session-store.mjs';
import { archiveSession } from './session-quarantine.mjs';

async function awaitCancellation(promise, signal) {
  signal?.throwIfAborted(); let abort;
  try {
    await Promise.race([promise, new Promise((_, reject) => {
      abort = () => reject(Object.assign(new Error('请求已取消'), { code: 'REQUEST_CANCELLED' }));
      signal?.addEventListener('abort', abort, { once: true });
    })]);
  } finally { if (abort) signal?.removeEventListener('abort', abort); }
}

// 有界原生会话池；固定身份不能代替历史验证，不安全的工具交接和身份冲突必须封存。
export function sessionRelay(options, retained) {
  toolSearchConfig(options);
  for (const name of ['timeoutMs', 'idleTimeoutMs', 'sessionTtlMs', 'toolWaitTimeoutMs', 'handoffTimeoutMs', 'instructionUpdateTimeoutMs', 'cancelAckTimeoutMs']) {
    const value = options[name];
    if (value != null && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647)) throw new Error(`${name} 必须为 0..2147483647 毫秒`);
  }
  if (options.maxCliOutputBytes != null && (!Number.isSafeInteger(options.maxCliOutputBytes) || options.maxCliOutputBytes < 0)) throw new Error('CLI 输出字节上限无效');
  const sessions = retained?.sessions || new Set(), key = retained?.key || randomBytes(32);
  const store = retained?.store || (options.persistentSessions === true ? new NativeSessionStore(options.home, options.configDir || path.join(options.home,'.claude')) : undefined);
  const failedRestores = retained?.failedRestores || new Map(), quarantined = retained?.quarantined || [], locks = retained?.locks || new Set();
  const maxSessions = options.maxSessions || 2;
  if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 8) throw new Error('原生会话数量必须为 1..8');
  let closed = false, maintenance = false, activeTurns = 0;
  let allocations = Promise.resolve();
  // 池级串行分配：检查容量、回收和登记必须是同一次预留，不能依靠会话键锁。
  async function allocate(create) {
    const previous = allocations; let release;
    allocations = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      if (closed) throw new Error('原生会话池已关闭');
      return await create();
    } finally { release(); }
  }
  async function makeRoom() {
    if (sessions.size < maxSessions) return;
    const oldest = [...sessions].filter(s => s.state === 'idle' && !s.creationReserved && !s.compacting && !s.recoveryInProgress)
      .sort((a,b) => (a.lastUsed || 0) - (b.lastUsed || 0))[0];
    if (!oldest) throw Object.assign(new Error('原生会话容量已满'), {code:'SESSION_CAPACITY',status:429,retryable:false});
    await oldest.close('capacity'); sessions.delete(oldest);
  }
  const lifecycle = store ? new SessionLifecycle(store,{protectedIds:()=>new Set([...sessions].filter(s=>s.state!=='closed').map(s=>s.nativeSessionId)),retentionMs:options.archiveRetentionMs}) : undefined;
  async function inferTurn(request, { signal, onText, timing, affinity } = {}) {
      if (closed) throw new Error('原生会话池已关闭');
      await store?.ready;
      // 同时抵达的后续请求不能绕过旧轮次的取消确认或进程退出。
      for (const session of sessions) if (session.cancelBarrier) await awaitCancellation(session.cancelBarrier, signal);
      if (closed) throw new Error('原生会话池已关闭');
      for(const session of sessions) {if(session.freezing)await session.freezing;if(session.state==='closed'){await session.closing;sessions.delete(session);}}
      const outputTokens = validateRequest(request, options);
      const compiled = compileContext(request, options);
      const model = typeof options.modelFor === 'function' ? options.modelFor(request.model) : options.model;
      const matchKey = store?.key || key;
      const signatureForOutput = cap => createHmac('sha256', matchKey).update(stableJson({ model, outputTokens: cap,
        // 候选仅允许追加指令；旧前缀须逐字节匹配，旧规则修改仍不能复用。
        system: options.liveInstructionUpdates === true ? null : compiled.metrics.systemHash,
        tools: compiled.metrics.toolsHash, policy: compiled.policy, effort: request.reasoning_effort || 'auto', stop: request.stop,
        cliVersion: store ? options.cliVersion || null : null })).digest('hex');
      const signature = signatureForOutput(outputTokens);
      // 输出参数是上限；保留现有较小 CLI 上限，其他配置必须完全一致。
      const matchesSession = session => session.signature === signature || Number.isSafeInteger(session.options.outputTokens)
        && outputTokens >= session.options.outputTokens && session.signature === signatureForOutput(session.options.outputTokens);
      const affinityHash = affinity ? createHmac('sha256', matchKey).update('sticky:'+affinity.key).digest('hex') : undefined;
      if(compactionIntent(request)) {
        const replayKey=createHmac('sha256',matchKey).update(retryIdentity(request)).digest('hex');
        const replay=[...sessions].find(s=>s.affinityHash===affinityHash&&s.state==='idle'&&s.nativeCompactionCommit?.requestKey===replayKey&&s.nativeCompactionCommit.answer);
        if(replay){
          try{options.onSessionEvent?.({type:'native_compaction',event:'summary_replayed',sessionId:replay.sessionId,requestId:timing?.requestId,model_requests:0});}catch{}
          return {...replay.nativeCompactionCommit.answer,usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0},upstream_usage:{input_tokens:0,output_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0}};
        }
        const rejected=[];
        const candidates=[...sessions].filter(s=>s.affinityHash===affinityHash).map(session=>{
          const diagnostic={sessionId:session.sessionId,state:session.state};
          const matchOptions={hashKey:store?.key,onReject:reason=>{diagnostic.reason=reason;}};
          const boundary=compactionBoundary(session,request,matchOptions);
          if(!boundary)rejected.push(diagnostic);return {session,boundary};
        }).filter(row=>row.boundary);
        if(!candidates.length&&store){
          const restored=await allocate(async()=>{
            const saved=await store.takeForCompaction(request,compiled,affinityHash,{consume:false});
            if(!saved)return;
            await makeRoom();
            const {row,sourceRequest,boundary}=saved;
            const session=new NativeCliSession(sourceRequest,compileContext(sourceRequest,options),{...options,model,outputTokens:row.compactSource.outputTokens,historyHashKey:store.key,resumeNativeId:row.id,resumeDelta:[],resumeForCompaction:true,
              onIdleSessionClosed:s=>store.refreshClosed(s),onInvalidateCheckpoint:async()=>{await store.forget(row.id);await store.quarantineHistory(row.signature,row.history,row.affinityHash,row.historyNormalization,row.id);await store.quarantineAffinity(row.affinityHash);}});
            session.signature=row.signature;session.affinityHash=affinityHash;session.creationReserved=true;sessions.add(session);
            try{await session.start();await store.forget(row.id);return {session,boundary};}catch(error){await session.close();sessions.delete(session);throw error;}
          });
          if(restored){
            candidates.push(restored);
            try{options.onSessionEvent?.({type:'session_restore',reason:'cli_process_closed',strategy:'native_resume_for_compaction',restore_attempts:1});}catch{}
          }
        }
        if(candidates.length!==1){
          try{options.onSessionEvent?.({type:'native_compaction_rejected',requestId:timing?.requestId,code:'COMPACTION_SESSION_UNVERIFIED',matches:candidates.length,rejected});}catch{}
          throw Object.assign(new Error('摘要无法唯一关联原生会话：'+rejected.map(row=>row.reason||row.state).join(',')+'；未启动历史重建'),{code:'COMPACTION_SESSION_UNVERIFIED',status:409,retryable:false});
        }
        const {session,boundary}=candidates[0];
        if(session.compacting)throw Object.assign(new Error('原生会话正在压缩'),{code:'SESSION_BUSY',status:409,retryable:false});
        session.compacting=true;
        try {
          const sourceAssistantHash=boundary.sourceAssistantHash||(session.state==='idle'&&!session.pendingIds.size&&session.lastAssistant&&!session.lastAssistant.tool_calls?.length
            ?historyKey(session.lastAssistant,{hashKey:store?.key,toolSchemas:session.request.tools}):undefined);
          await store?.checkAffinity(affinityHash);
          await store?.forget(session.nativeSessionId);
          timing?.mark('cli_session_reused');
          const result=await session.summarize(request,boundary,{signal,onText,timing});
          session.nativeCompactionCommit.requestKey=replayKey;
          session.compaction=compactionRecord(session,request,result,{hashKey:store?.key,sourceAssistantHash});
          if(!session.compaction)throw Object.assign(new Error('摘要为空或包含工具调用，未建立压缩映射'),{code:'COMPACTION_RESULT_INVALID',status:502,retryable:false});
          await store?.checkpoint(session);
          try{options.onSessionEvent?.({type:'native_compaction',sessionId:session.sessionId,requestId:timing?.requestId,event:'summary_complete',code:'native_context_compacted',pre_tokens:session.nativeCompactionCommit.metadata?.pre_tokens,post_tokens:session.nativeCompactionCommit.metadata?.post_tokens});}catch{}
          return result;
        } catch(error){
          throw error;
        } finally {session.compacting=false;session.creationReserved=false;}
      }
      const replay=[...sessions].find(s=>['idle','waiting-tool'].includes(s.state)&&s.signature===signature&&s.affinityHash===affinityHash
        &&s.automaticRecoveryResult?.identity===automaticRecoveryIdentity(request)&&s.automaticRecoveryResult.history===s.history&&s.automaticRecoveryResult.expected===s.expected);
      if(replay){
        try{options.onSessionEvent?.({type:'native_automatic_recovery',sessionId:replay.sessionId,event:'replayed',model_requests:0});}catch{}
        return {...structuredClone(replay.automaticRecoveryResult.result),usage_complete:true,upstream_usage:{input_tokens:0,output_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0},usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}};
      }
      if([...sessions].some(s=>s.recoveryInProgress&&s.affinityHash===affinityHash&&(s.recoveryIdentity===retryIdentity(request)||automaticRecoveryRequest({state:'frozen',frozenRequest:s.frozenRequest},request))))throw recoveryError('SESSION_BUSY','同一会话的恢复仍在进行');
      const armed=[...sessions].filter(session=>session.state==='frozen'&&session.recoveryArmed);
      const candidates=[...sessions].filter(s=>s.state==='frozen').flatMap(session=>{
        if(session.affinityHash!==affinityHash)return [];
        const automatic=automaticRecoveryRequest(session,request);
        if(automatic){
          const control=continueRecoveryRequest({state:'frozen',recoveryArmed:true,frozenRequest:session.frozenRequest},request);
          const tail=control?automatic.tail.filter(m=>m.role!=='user'):automatic.tail;
          return [{session,recoveryRequest:automatic.request,tail,attemptIdentity:automatic.identity,automatic:true}];
        }
        if(session.recoveryArmed&&session.recoveryIdentity===retryIdentity(request))return [{session,recoveryRequest:request,tail:[],automatic:false}];
        return [];
      });
      if(candidates.length>1)throw recoveryError('RECOVERY_SESSION_AMBIGUOUS','新消息不能唯一关联冻结会话，未恢复进程');
      if(candidates.length){
        const {session:recovering,recoveryRequest,tail,attemptIdentity,automatic}=candidates[0];
        if(recovering.recoveryInProgress)throw recoveryError('SESSION_BUSY','正在恢复原会话');
        if(automatic&&recovering.automaticRecoveryAttempt?.identity===attemptIdentity){
          const previous=recovering.automaticRecoveryAttempt;
          throw recoveryError(previous.code||'RECOVERY_ALREADY_ATTEMPTED',previous.message||'同一新消息已经尝试恢复，不自动重复执行');
        }
        recovering.recoveryInProgress=true;
        if(automatic)recovering.automaticRecoveryAttempt={identity:attemptIdentity};
        const quarantine=recovering.quarantineRecord;
        try {
          if(!matchesSession(recovering)||recovering.affinityHash!==affinityHash)throw recoveryError('RECOVERY_CONFIG_MISMATCH','模型、工具、规则或会话身份已经变化');
          if(!quarantine)throw recoveryError('RECOVERY_BOUNDARY_UNSAFE','缺少已保存的封存记录');
          if(!await recovering.verifySuspended())throw recoveryError('NATIVE_PROCESS_GONE','原 CLI 已退出或暂停状态不可确认，未重建历史');
          const delta=recoveryDelta(recovering,recoveryRequest,{hashKey:store?.key,allowInstructionUpdates:options.liveInstructionUpdates===true});
          let forward=[...delta,...tail],resumeFrozen=true;
          if(tail.some(m=>m.role==='user')&&recovering.pendingIds.size){await settleFrozenTools(recovering,delta,{signal});forward=recoveryInputMessages(forward);resumeFrozen=false;}
          recovering.recoveryArmed=false;
          const result=await recovering.run(request,forward,{signal,onText,timing,resumeFrozen});
          // 成功交接后才清除原封存记录；失败不能留下已解封却未恢复的状态。
          await store?.releaseQuarantine(quarantine);
          for(let i=quarantined.length-1;i>=0;i--)if(quarantined[i]===quarantine)quarantined.splice(i,1);
          if(recovering.quarantineRecord===quarantine)recovering.quarantineRecord=undefined;
          try{await store?.checkpoint(recovering);}catch{try{options.onSessionEvent?.({type:'native_checkpoint_failed',code:'CHECKPOINT_WRITE_FAILED'});}catch{}}
          if(automatic)recovering.automaticRecoveryResult={identity:attemptIdentity,result:structuredClone(result),history:recovering.history,expected:recovering.expected};
          recovering.freezeReason=undefined;recovering.frozenRequest=undefined;
          try{options.onSessionEvent?.({type:'native_automatic_recovery',sessionId:recovering.sessionId,event:'completed',automatic,historyRebuilt:false,toolsReplayed:false,newUserMessages:tail.filter(m=>m.role==='user').length});}catch{}
          return result;
        }catch(error){
          if(recovering.state!=='frozen')await recovering.freeze(error.code||'RECOVERY_FAILED',{request});
          if(automatic)recovering.automaticRecoveryAttempt={identity:attemptIdentity,code:error.code||'RECOVERY_FAILED',message:error.message};
          throw error;
        }finally{recovering.recoveryInProgress=false;}
      }
      if(armed.some(session=>session.affinityHash===affinityHash&&(affinityHash||session.history.length<=sessionHistory(request.messages).length&&session.history.every((h,i)=>h===historyKey(sessionHistory(request.messages)[i],{hashKey:store?.key,exact:options.liveInstructionUpdates===true,toolSchemas:session.historyNormalization?request.tools:undefined})))))throw recoveryError('RECOVERY_RETRY_REQUIRED','请重试原失败请求；不能追加新消息或重建会话');
      await store?.checkAffinity(affinityHash);
      const incomingHistory = sessionHistory(request.messages).map(message=>historyKey(message,{hashKey:store?.key,exact:options.liveInstructionUpdates===true}));
      const blockedRow=[...quarantined,...(store?.blocked||[])].find(row=>{
        if(row.affinityHash!==affinityHash)return false;
        if(affinityHash)return true;
        const messages=sessionHistory(request.messages);
        if(row.origin==='lifecycle_retired'){
          if(!Number.isSafeInteger(row.historyLength)||row.historyLength<1||messages.length<=row.historyLength)return false;
          const prefix=messages.slice(0,row.historyLength).map(m=>historyKey(m,{hashKey:store?.key,exact:options.liveInstructionUpdates===true,toolSchemas:row.historyNormalization?request.tools:undefined}));
          return createHmac('sha256',store.key).update(JSON.stringify(prefix)).digest('hex')===row.historyDigest
            &&historyKey(messages[row.historyLength],{hashKey:store.key,toolSchemas:row.historyNormalization?request.tools:undefined})===row.expected;
        }
        if(!row.history.length||row.history.length>incomingHistory.length||!row.history.every((value,index)=>value===(row.historyNormalization?historyKey(messages[index],{hashKey:store?.key,exact:options.liveInstructionUpdates===true,toolSchemas:request.tools}):incomingHistory[index])))return false;
        return true;
      });
      if(blockedRow){
        const retired=blockedRow.origin==='lifecycle_retired';
        throw Object.assign(new Error(retired?'此会话已明确退役，请先恢复归档；禁止重建历史':'此对话已因异常封存；禁止自动重建长历史'),{code:retired?'SESSION_RETIRED':'SESSION_QUARANTINED',status:409,retryable:false});
      }
      const restoreKey = createHmac('sha256', matchKey).update(signature + stableJson(sessionHistory(request.messages)
        .map(message => historyKey(message, { exact: true, hashKey: matchKey })))).digest('hex');
      for (const [id, until] of failedRestores) if (until <= Date.now()) failedRestores.delete(id);
      if (failedRestores.has(restoreKey)) throw Object.assign(new Error('同一恢复请求刚刚失败；不自动重复提交长历史'),
        { code: 'RESTORE_RETRY_BLOCKED', status: 409, retryable: false });
      let selected, delta, signatureMatches = 0, historyRejected = 0;
      const rejectionReasons = {};
      const rejectedBoundarySessions=new Set(), mismatchedSessions=new Set();
      for (const session of sessions) {
        if (session.affinityHash !== affinityHash) continue;
        if (session.creationReserved) continue;
        if(session.state==='idle'&&session.compaction?.nativeCommitted)await hydrateCompactionSource(session);
        if (session.state === 'closed' && !session.freezing) { sessions.delete(session); continue; }
        if (affinityHash && session.freezing) {
          await session.freezing;
          throw Object.assign(new Error('固定会话已因异常封存；禁止自动重建'), {code:'SESSION_QUARANTINED',status:409,retryable:false});
        }
        if (affinityHash && !['idle','waiting-tool'].includes(session.state)) throw Object.assign(new Error('固定会话仍在处理上一轮'), {code:'SESSION_BUSY',status:409,retryable:false});
        if (!matchesSession(session) || !['idle', 'waiting-tool'].includes(session.state)) continue;
        signatureMatches++;
        const compacted=compactedDelta(session,request,{hashKey:store?.key});
        const candidate = compacted || continuationDelta(session, request, { allowInstructionUpdates: options.liveInstructionUpdates === true,
          hashKey: store?.key,
          onCancelledTailProjection: detail => { try { options.onSessionEvent?.({type:'native_cancelled_completed_tail',requestId:timing?.requestId,sessionId:session.sessionId,...detail}); } catch {} },
          onReceiptAlias: detail => { try { options.onSessionEvent?.({type:'native_cancelled_receipt_alias',requestId:timing?.requestId,sessionId:session.sessionId,...detail}); } catch {} },
          onAssistantMismatch: detail => { try { options.onSessionEvent?.({type:'native_assistant_mismatch',
            requestId:timing?.requestId,sessionId:session.sessionId,...detail}); } catch {} },
          onReject: reason => {
            if(reason==='assistant_message_mismatch') mismatchedSessions.add(session);
            rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
            if(session.pendingIds.size&&reason!=='history_prefix_mismatch'&&reason!=='messages_not_appended')rejectedBoundarySessions.add(session);
          } });
        if (candidate !== undefined) { selected = session; delta = candidate; break; }
        historyRejected++;
      }
      if (!selected) {
        if(mismatchedSessions.size) {
          await Promise.all([...mismatchedSessions].map(session=>session.freeze('ASSISTANT_MESSAGE_MISMATCH',{request})));
          throw Object.assign(new Error('助手历史不匹配；已封存原生 CLI，禁止自动重建'),{code:'ASSISTANT_MESSAGE_MISMATCH',status:409,retryable:false});
        }
        const bound = affinityHash && [...sessions].find(session => session.affinityHash === affinityHash && session.state !== 'closed');
        if (bound) {
          await bound.freeze('SESSION_HISTORY_MISMATCH', {request});
          throw Object.assign(new Error('固定会话的配置或历史不匹配；已封存 CLI，禁止自动重建'), {code:'SESSION_HISTORY_MISMATCH',status:409,retryable:false});
        }
        // 没有可验证的原生等待者时，不把已执行的工具结果交给重建会话猜测续跑。
        const tail = request.messages.filter(message => !['system', 'developer'].includes(message.role));
        if (options.requireLiveToolContinuation === true && tail.at(-1)?.role === 'tool') {
          const incomingIds=new Set();
          for(let index=tail.length-1;index>=0&&tail[index].role==='tool';index--)incomingIds.add(tail[index].tool_call_id);
          const unsafe=[...sessions].filter(session=>session.state==='waiting-tool'&&
            (rejectedBoundarySessions.has(session)||[...session.pendingIds].some(id=>incomingIds.has(id))));
          const archived=await Promise.all(unsafe.map(session=>session.freeze('TOOL_CONTINUATION_UNCERTAIN',{request})));
          try { options.onSessionEvent?.({ type: 'native_continuation_rejected', code: 'TOOL_CONTINUATION_UNCERTAIN',
            signatureMatches, historyRejected, frozenSessions:unsafe.length, archivedSessions:archived.filter(value=>value.historySaved).length }); } catch {}
          throw Object.assign(new Error('工具结果缺少可验证的原生等待会话；执行状态不确定，禁止自动重建或重试'),
            { code: 'TOOL_CONTINUATION_UNCERTAIN', status: 409, retryable: false });
        }
        selected = await allocate(async () => {
        const restored = await store?.take(request, signature, options.liveInstructionUpdates === true, affinityHash, {consume:false,outputTokens,signatureForOutput});
        if (restored?.mismatch) throw Object.assign(new Error('固定会话的持久检查点不匹配'), {code:'SESSION_HISTORY_MISMATCH',status:409,retryable:false});
        if (restored?.missing) throw Object.assign(new Error('已绑定的原生历史文件缺失；禁止自动重建长历史'), {code:'NATIVE_TRANSCRIPT_MISSING',status:409,retryable:false});
        if (restored?.unsafe) throw Object.assign(new Error('原生会话文件在完成检查点后发生变化；不自动恢复或重新提交历史'),
          { code: 'NATIVE_TRANSCRIPT_UNCERTAIN', status: 409, retryable: false });
        if (!restored?.id) sessionEntry(request, compiled, options);
        await makeRoom();
        const created = new NativeCliSession(request, compiled, { ...options, model, outputTokens: restored?.outputTokens ?? outputTokens, historyHashKey: store?.key,
          onIdleSessionClosed:session=>store?.refreshClosed(session),
          onInvalidateCheckpoint: async id=>{ await store?.forget(id); await store?.quarantineAffinity(affinityHash);
            const row={signature:created.signature,history:[...created.history],affinityHash,historyNormalization:created.historyNormalization,nativeSessionId:created.nativeSessionId};quarantined.push(row);created.quarantineRecord=row;
            await store?.quarantineHistory(row.signature,row.history,affinityHash,row.historyNormalization,row.nativeSessionId); },
          resumeNativeId: restored?.id, resumeDelta: restored?.delta });
        created.signature = restored?.signature ?? signature; created.affinityHash = affinityHash; created.creationReserved = true;
        sessions.add(created);
        try {
          await created.start();
          await store?.bindAffinity(affinityHash, created.nativeSessionId);
          // 消费仍处于池级分配锁内，避免并发恢复同一 UUID 启动两个进程。
          if(restored?.id)await store.forget(restored.id);
        } catch (error) { await created.close(); sessions.delete(created); throw error; }
        try { options.onSessionEvent?.({ type: 'session_restore', requestId: timing?.requestId,
          reason: restored?.id ? 'cli_process_closed' : restored?.missing ? 'native_transcript_missing' : 'no_safe_native_checkpoint',
          strategy: created.entryMode || 'native_new', restore_attempts: created.entryMode === 'native_new' ? 0 : 1,
          history_bytes: compiled.metrics.historyBytes, history_tokens: null }); } catch {}
        timing?.mark('cli_session_created');
        return created;
        });
      } else timing?.mark('cli_session_reused');
      try { options.onSessionEvent?.({ type: 'native_session_selection', requestId: timing?.requestId,
        reused: delta !== undefined, sessionId: selected.sessionId, sessions: sessions.size, signatureMatches, historyRejected, rejectionReasons }); } catch {}
      timing?.mark('context_ready');
      // 先撤销旧检查点再启动下一轮；崩溃或工具执行中断不能留下可重放的旧边界。
      try {
        await store?.forget(selected.nativeSessionId);
        if(compactedDelta(selected,request,{hashKey:store?.key}))selected.compaction=undefined;
        const running = selected.run(request, delta, { signal, onText, timing });
        selected.creationReserved = false;
        const result = await running;
        try { await store?.checkpoint(selected); }
        catch { try { options.onSessionEvent?.({ type: 'native_checkpoint_failed', code: 'CHECKPOINT_WRITE_FAILED' }); } catch {} }
        return result;
      } catch (error) {
        if(selected.creationReserved){await selected.close();sessions.delete(selected);}
        if (delta === undefined && compiled.metrics.historyMessages > 1) {
          failedRestores.set(restoreKey, Date.now()+60000);
          if (failedRestores.size > 128) failedRestores.delete(failedRestores.keys().next().value);
          error.retryable = false;
        }
        throw error;
      } finally { selected.creationReserved = false; }
  }
  return {
    async infer(request, context={}) {
      if(maintenance)throw recoveryError('SESSION_MAINTENANCE','会话维护中，请稍后重试');
      const lock=context.affinity?.key;
      if(lock && locks.has(lock))throw Object.assign(new Error('固定会话仍在处理上一轮'),{code:'SESSION_BUSY',status:409,retryable:false});
      if(lock)locks.add(lock);
      activeTurns++;
      try{return await inferTurn(request,context);}finally{activeTurns--;if(lock)locks.delete(lock);}
    },
    async listSessions(){
      const live=await Promise.all([...sessions].map(async session=>{
        const preserved=session.state==='frozen'&&session.frozenProcess?.verified===true&&await session.verifySuspended();
        let code=session.state!=='frozen'?'SESSION_NOT_FROZEN':preserved?'RECOVERY_BOUNDARY_UNSAFE':'NATIVE_PROCESS_GONE';
        if(preserved&&session.frozenRequest&&session.quarantineRecord)try{
          recoveryDelta(session,session.frozenRequest,{hashKey:store?.key,allowInstructionUpdates:options.liveInstructionUpdates===true});code='READY_FOR_REVIEW';
        }catch(error){code=error.code;}
        return {sessionId:session.sessionId,nativeSessionId:session.nativeSessionId,state:session.state,pid:session.child?.pid||null,
          reason:session.freezeReason||null,pendingTools:session.pendingIds.size,recoveryArmed:session.recoveryArmed===true,
          processPreserved:preserved,recoverable:code==='READY_FOR_REVIEW',recoveryCode:code};
      }));
      const known=new Set(live.map(row=>row.sessionId));
      const archived=(await archivedSessions(options.home)).filter(row=>!known.has(row.metadata.sessionId)).map(({metadata:m})=>({sessionId:m.sessionId,nativeSessionId:m.nativeSessionId,state:'archived',reason:m.reason,processPreserved:false,recoverable:false,recoveryCode:'NATIVE_PROCESS_GONE'}));
      return {sessions:[...live,...archived]};
    },
    async lifecycle(action,id){
      if(!lifecycle)throw recoveryError('LIFECYCLE_DISABLED','需要启用原生持久化');
      if(closed||maintenance||activeTurns||[...sessions].some(s=>s.recoveryInProgress||s.compacting))throw recoveryError('SESSION_BUSY','会话仍在执行，暂不能维护');
      maintenance=true;
      try{
        for(const s of sessions){if(s.freezing)await s.freezing;if(s.state==='closed'){await s.closing;sessions.delete(s);}}
        if(action==='list')return await lifecycle.list();
        if(action==='retain'||action==='release-retention')return await lifecycle.pin(id,action==='retain');
        if(action==='retire')return await lifecycle.retire(id);
        if(action==='restore')return await lifecycle.restore(id);
        if(action==='sweep')return await lifecycle.sweep();
        throw recoveryError('LIFECYCLE_ACTION_INVALID','不支持的生命周期操作');
      }finally{maintenance=false;}
    },
    async dispose(id){
      if(closed||maintenance||activeTurns)throw recoveryError('SESSION_BUSY','会话仍在执行，暂不能释放');
      maintenance=true;
      try{
        const session=[...sessions].find(s=>s.sessionId===id||s.nativeSessionId===id);
        if(!session||session.state!=='frozen')throw recoveryError('SESSION_NOT_FROZEN','只能释放原进程已经退出的冻结会话');
        await session.freezing;
        if(session.processAlive())throw recoveryError('NATIVE_PROCESS_ALIVE','原进程仍存活，不能释放冻结现场');
        // 再保存一次死亡现场并补齐防重放记录；任何落盘失败均不释放运行槽位。
        session.frozenProcess={...session.frozenProcess,verified:false};
        await archiveSession(session,{request:session.frozenRequest,reason:session.freezeReason||'NATIVE_PROCESS_GONE'});
        const row=session.quarantineRecord||{signature:session.signature,history:[...session.history],affinityHash:session.affinityHash,
          historyNormalization:session.historyNormalization,nativeSessionId:session.nativeSessionId};
        await store?.forget(session.nativeSessionId);
        if(store&&!store.blocked.some(r=>r.nativeSessionId===session.nativeSessionId))
          await store.quarantineHistory(row.signature,row.history,row.affinityHash,row.historyNormalization,row.nativeSessionId);
        await store?.quarantineAffinity(row.affinityHash);
        if(!quarantined.includes(row))quarantined.push(row);
        await session.close('disposed',{discardFrozen:true});sessions.delete(session);
        return {sessionId:session.sessionId,nativeSessionId:session.nativeSessionId,state:'archived',modelRequests:0};
      }finally{maintenance=false;}
    },
    async recover(id){
      if(maintenance)throw recoveryError('SESSION_MAINTENANCE','会话维护中');
      const session=[...sessions].find(s=>s.sessionId===id||s.nativeSessionId===id);
      if(!session||session.state==='closed')throw recoveryError('NATIVE_PROCESS_GONE','原 CLI 已丢失；只能导出精简交接，禁止重建历史');
      if(session.state!=='frozen')throw recoveryError('SESSION_NOT_FROZEN','会话不处于冻结状态');
      await session.freezing;
      if(!session.frozenProcess?.verified||!await session.verifySuspended())throw recoveryError('NATIVE_PROCESS_GONE','无法确认原进程仍在暂停状态');
      if(session.recoveryInProgress)throw recoveryError('SESSION_BUSY','正在恢复原会话');
      if(!session.quarantineRecord)throw recoveryError('RECOVERY_BOUNDARY_UNSAFE','缺少冻结索引，不能自动解除');
      if(!session.frozenRequest)throw recoveryError('RECOVERY_BOUNDARY_UNSAFE','没有可核验的原失败请求');
      recoveryDelta(session,session.frozenRequest,{hashKey:store?.key,allowInstructionUpdates:options.liveInstructionUpdates===true});
      session.automaticRecoveryAttempt=undefined;session.recoveryIdentity=retryIdentity(session.frozenRequest);session.recoveryArmed=true;
      return {sessionId:session.sessionId,pid:session.child.pid,state:'frozen',recoveryArmed:true,processStillPaused:true,
        nextAction:'retry_original_failed_request',modelRequests:0};
    },
    exportHandoff(id){return exportHandoff(options.home,id);},
    get size() { return [...sessions].filter(s => !['closed','frozen'].includes(s.state)).length; },
    get maintenance() {return maintenance;},
    get frozenSize() {return [...sessions].filter(s=>s.state==='frozen').length;},
    async close({discardFrozen=false}={}) { if(maintenance)return false; if(!discardFrozen&&[...sessions].some(s=>s.state==='frozen'))return false; closed = true; await Promise.all([...sessions].map(async session => {if(session.freezing)await session.freezing;await session.close('shutdown',{discardFrozen});})); sessions.clear(); await store?.writes; key.fill(0); },
  };
}
