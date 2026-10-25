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
  let closed = false;
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
      const signature = createHmac('sha256', matchKey).update(stableJson({ model, outputTokens,
        // 候选仅允许追加指令；旧前缀须逐字节匹配，旧规则修改仍不能复用。
        system: options.liveInstructionUpdates === true ? null : compiled.metrics.systemHash,
        tools: compiled.metrics.toolsHash, policy: compiled.policy, effort: request.reasoning_effort || 'auto', stop: request.stop,
        cliVersion: store ? options.cliVersion || null : null })).digest('hex');
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
          const restored=await store.takeForCompaction(request,compiled,affinityHash);
          if(restored){
            const {row,sourceRequest,boundary}=restored;
            if(sessions.size>=maxSessions){const oldest=[...sessions].filter(s=>s.state==='idle').sort((a,b)=>(a.lastUsed||0)-(b.lastUsed||0))[0];if(!oldest)throw Object.assign(new Error('原生会话容量已满'),{code:'SESSION_CAPACITY',status:429});await oldest.close('capacity');sessions.delete(oldest);}
            const session=new NativeCliSession(sourceRequest,compileContext(sourceRequest,options),{...options,model,outputTokens:row.compactSource.outputTokens,historyHashKey:store.key,resumeNativeId:row.id,resumeDelta:[],resumeForCompaction:true,
              onIdleSessionClosed:s=>store.refreshClosed(s),onInvalidateCheckpoint:async()=>{await store.forget(row.id);await store.quarantineHistory(row.signature,row.history,row.affinityHash,row.historyNormalization,row.id);await store.quarantineAffinity(row.affinityHash);}});
            session.signature=row.signature;session.affinityHash=affinityHash;sessions.add(session);
            try{await session.start();candidates.push({session,boundary});}catch(error){await session.close();sessions.delete(session);throw error;}
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
        } finally {session.compacting=false;}
      }
      const armed=[...sessions].filter(session=>session.state==='frozen'&&session.recoveryArmed);
      let recoveryRequest=request;
      const recovering=armed.find(session=>{
        if(session.recoveryIdentity===retryIdentity(request))return true;
        const continuation=continueRecoveryRequest(session,request);
        if(continuation&&session.recoveryIdentity===retryIdentity(continuation)){recoveryRequest=continuation;return true;}
        return false;
      });
      if(recovering){
        if(recovering.recoveryInProgress)throw recoveryError('SESSION_BUSY','正在恢复原会话');
        recovering.recoveryInProgress=true;
        try {
        if(recovering.signature!==signature||recovering.affinityHash!==affinityHash)throw recoveryError('RECOVERY_CONFIG_MISMATCH','模型、工具、规则或会话身份已经变化');
        if(!await recovering.verifySuspended())throw recoveryError('NATIVE_PROCESS_GONE','原 CLI 进程已丢失或不在暂停状态');
        const delta=recoveryDelta(recovering,recoveryRequest,{hashKey:store?.key,allowInstructionUpdates:options.liveInstructionUpdates===true});
        await store?.releaseQuarantine(recovering.quarantineRecord);
        for(let i=quarantined.length-1;i>=0;i--)if(quarantined[i]===recovering.quarantineRecord)quarantined.splice(i,1);
        recovering.recoveryArmed=false;
        const updates=recoveryRequest===request?[]:sessionHistory(request.messages).slice(sessionHistory(recovering.frozenRequest.messages).length).filter(m=>m.role==='system');
        const result=await recovering.run(request,[...delta,...updates],{signal,onText,timing,resumeFrozen:true});
        try{await store?.checkpoint(recovering);}catch{try{options.onSessionEvent?.({type:'native_checkpoint_failed',code:'CHECKPOINT_WRITE_FAILED'});}catch{}}
        return result;
        }finally{recovering.recoveryInProgress=false;}
      }
      if(armed.some(session=>session.affinityHash===affinityHash&&(affinityHash||session.history.length<=sessionHistory(request.messages).length&&session.history.every((h,i)=>h===historyKey(sessionHistory(request.messages)[i],{hashKey:store?.key,exact:options.liveInstructionUpdates===true,toolSchemas:session.historyNormalization?request.tools:undefined})))))throw recoveryError('RECOVERY_RETRY_REQUIRED','请重试原失败请求；不能追加新消息或重建会话');
      await store?.checkAffinity(affinityHash);
      const incomingHistory = sessionHistory(request.messages).map(message=>historyKey(message,{hashKey:store?.key,exact:options.liveInstructionUpdates===true}));
      if ([...quarantined,...(store?.blocked||[])].some(row=>row.affinityHash===affinityHash && (affinityHash || row.history.length && row.history.length<=incomingHistory.length && row.history.every((value,index)=>value=== (row.historyNormalization ? historyKey(sessionHistory(request.messages)[index],{hashKey:store?.key,exact:options.liveInstructionUpdates===true,toolSchemas:request.tools}) : incomingHistory[index]))))) {
        throw Object.assign(new Error('此对话已因异常封存；禁止自动重建长历史'),{code:'SESSION_QUARANTINED',status:409,retryable:false});
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
        if(session.state==='idle'&&session.compaction?.nativeCommitted)await hydrateCompactionSource(session);
        if (session.state === 'closed' && !session.freezing) { sessions.delete(session); continue; }
        if (affinityHash && session.freezing) {
          await session.freezing;
          throw Object.assign(new Error('固定会话已因异常封存；禁止自动重建'), {code:'SESSION_QUARANTINED',status:409,retryable:false});
        }
        if (affinityHash && !['idle','waiting-tool'].includes(session.state)) throw Object.assign(new Error('固定会话仍在处理上一轮'), {code:'SESSION_BUSY',status:409,retryable:false});
        if (session.signature !== signature || !['idle', 'waiting-tool'].includes(session.state)) continue;
        signatureMatches++;
        const compacted=compactedDelta(session,request,{hashKey:store?.key});
        const candidate = compacted || continuationDelta(session, request, { allowInstructionUpdates: options.liveInstructionUpdates === true,
          hashKey: store?.key,
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
        const restored = await store?.take(request, signature, options.liveInstructionUpdates === true, affinityHash);
        if (restored?.mismatch) throw Object.assign(new Error('固定会话的持久检查点不匹配'), {code:'SESSION_HISTORY_MISMATCH',status:409,retryable:false});
        if (restored?.missing) throw Object.assign(new Error('已绑定的原生历史文件缺失；禁止自动重建长历史'), {code:'NATIVE_TRANSCRIPT_MISSING',status:409,retryable:false});
        if (restored?.unsafe) throw Object.assign(new Error('原生会话文件在完成检查点后发生变化；不自动恢复或重新提交历史'),
          { code: 'NATIVE_TRANSCRIPT_UNCERTAIN', status: 409, retryable: false });
        if (!restored?.id) sessionEntry(request, compiled, options);
        if (sessions.size >= maxSessions) {
          const oldest = [...sessions].filter(s => s.state==='idle').sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0))[0];
          if (!oldest) throw Object.assign(new Error('原生会话容量已满'), { status: 429, code: 'SESSION_CAPACITY' });
          await oldest.close('capacity'); sessions.delete(oldest);
        }
        selected = new NativeCliSession(request, compiled, { ...options, model, outputTokens, historyHashKey: store?.key,
          onIdleSessionClosed:session=>store?.refreshClosed(session),
          onInvalidateCheckpoint: async id=>{ await store?.forget(id); await store?.quarantineAffinity(affinityHash);
            const row={signature,history:[...selected.history],affinityHash,historyNormalization:selected.historyNormalization,nativeSessionId:selected.nativeSessionId};quarantined.push(row);selected.quarantineRecord=row;
            await store?.quarantineHistory(signature,row.history,affinityHash,row.historyNormalization,row.nativeSessionId); },
          resumeNativeId: restored?.id, resumeDelta: restored?.delta });
        selected.signature = signature; selected.affinityHash = affinityHash;
        await store?.bindAffinity(affinityHash, selected.nativeSessionId);
        sessions.add(selected);
        try { await selected.start(); } catch (error) { await selected.close(); sessions.delete(selected); throw error; }
        try { options.onSessionEvent?.({ type: 'session_restore', requestId: timing?.requestId,
          reason: restored?.id ? 'cli_process_closed' : restored?.missing ? 'native_transcript_missing' : 'no_safe_native_checkpoint',
          strategy: selected.entryMode || 'native_new', restore_attempts: selected.entryMode === 'native_new' ? 0 : 1,
          history_bytes: compiled.metrics.historyBytes, history_tokens: null }); } catch {}
        timing?.mark('cli_session_created');
      } else timing?.mark('cli_session_reused');
      try { options.onSessionEvent?.({ type: 'native_session_selection', requestId: timing?.requestId,
        reused: delta !== undefined, sessionId: selected.sessionId, sessions: sessions.size, signatureMatches, historyRejected, rejectionReasons }); } catch {}
      timing?.mark('context_ready');
      // 先撤销旧检查点再启动下一轮；崩溃或工具执行中断不能留下可重放的旧边界。
      await store?.forget(selected.nativeSessionId);
      if(compactedDelta(selected,request,{hashKey:store?.key}))selected.compaction=undefined;
      try {
        const result = await selected.run(request, delta, { signal, onText, timing });
        try { await store?.checkpoint(selected); }
        catch { try { options.onSessionEvent?.({ type: 'native_checkpoint_failed', code: 'CHECKPOINT_WRITE_FAILED' }); } catch {} }
        return result;
      } catch (error) {
        if (delta === undefined && compiled.metrics.historyMessages > 1) {
          failedRestores.set(restoreKey, Date.now()+60000);
          if (failedRestores.size > 128) failedRestores.delete(failedRestores.keys().next().value);
          error.retryable = false;
        }
        throw error;
      }
  }
  return {
    async infer(request, context={}) {
      const lock=context.affinity?.key;
      if(lock && locks.has(lock))throw Object.assign(new Error('固定会话仍在处理上一轮'),{code:'SESSION_BUSY',status:409,retryable:false});
      if(lock)locks.add(lock);
      try{return await inferTurn(request,context);}finally{if(lock)locks.delete(lock);}
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
    async recover(id){
      const session=[...sessions].find(s=>s.sessionId===id||s.nativeSessionId===id);
      if(!session||session.state==='closed')throw recoveryError('NATIVE_PROCESS_GONE','原 CLI 已丢失；只能导出精简交接，禁止重建历史');
      if(session.state!=='frozen')throw recoveryError('SESSION_NOT_FROZEN','会话不处于冻结状态');
      await session.freezing;
      if(!session.frozenProcess?.verified||!await session.verifySuspended())throw recoveryError('NATIVE_PROCESS_GONE','无法确认原进程仍在暂停状态');
      if(session.recoveryInProgress)throw recoveryError('SESSION_BUSY','正在恢复原会话');
      if(!session.quarantineRecord)throw recoveryError('RECOVERY_BOUNDARY_UNSAFE','缺少冻结索引，不能自动解除');
      if(!session.frozenRequest)throw recoveryError('RECOVERY_BOUNDARY_UNSAFE','没有可核验的原失败请求');
      recoveryDelta(session,session.frozenRequest,{hashKey:store?.key,allowInstructionUpdates:options.liveInstructionUpdates===true});
      session.recoveryIdentity=retryIdentity(session.frozenRequest);session.recoveryArmed=true;
      return {sessionId:session.sessionId,pid:session.child.pid,state:'frozen',recoveryArmed:true,processStillPaused:true,
        nextAction:'retry_original_failed_request',modelRequests:0};
    },
    exportHandoff(id){return exportHandoff(options.home,id);},
    get size() { return [...sessions].filter(s => !['closed','frozen'].includes(s.state)).length; },
    get frozenSize() {return [...sessions].filter(s=>s.state==='frozen').length;},
    async close({discardFrozen=false}={}) { if(!discardFrozen&&[...sessions].some(s=>s.state==='frozen'))return false; closed = true; await Promise.all([...sessions].map(async session => {if(session.freezing)await session.freezing;await session.close('shutdown',{discardFrozen});})); sessions.clear(); await store?.writes; key.fill(0); },
  };
}
