import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {SUMMARY_HEADER} from './compaction-boundary.mjs';
import {cliFailure} from './cli-failure.mjs';
import {cliOutputAudit} from './cli-output-audit.mjs';
import {assistantFingerprint} from './assistant-diff.mjs';
import {sessionHistory,historyKey,assistantMessage} from './session-history.mjs';

const failure=(code,message,status=502)=>Object.assign(new Error(message),{code,status,retryable:false});
const fields={input_tokens:'inputTokens',output_tokens:'outputTokens',cache_read_input_tokens:'cacheReadInputTokens',cache_creation_input_tokens:'cacheCreationInputTokens'};
export function modelUsageDelta(before,after){
 if(!before||!after||typeof before!=='object'||typeof after!=='object')return;
 const output=Object.fromEntries(Object.keys(fields).map(k=>[k,0]));
 for(const model of new Set([...Object.keys(before),...Object.keys(after)]))for(const [wire,key]of Object.entries(fields)){
  const old=before[model]?.[key]??0,next=after[model]?.[key];
  if(!Number.isSafeInteger(old)||!Number.isSafeInteger(next)||old<0||next<old)return;
  output[wire]+=next-old;
 }
 return output;
}
const keptNote='The messages after this summary are the most recent messages from before compaction, kept verbatim. The summary was written without seeing them, so something it says has not happened yet may already have happened in them.';
export function nativeSummaryBody(text,file){
 if(typeof text!=='string')throw failure('NATIVE_COMPACT_SUMMARY_INVALID','原生摘要不是文本');
 const at=text.indexOf(SUMMARY_HEADER+'\n\n');
 if(at<0||at>2048)throw failure('NATIVE_COMPACT_SUMMARY_INVALID','原生摘要包装无法核验');
 let body=text.slice(at+SUMMARY_HEADER.length+2);
 body=body.replace(/^<([A-Za-z_][A-Za-z0-9_-]*)>[A-Za-z0-9_, .:-]*<\/\1>\n/,'');
 body=body.replace(/^Tools called before this summary: [A-Za-z0-9_, .:-]*\n/,'');
 const marker='\n\nIf you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: '+file;
 const end=body.lastIndexOf(marker);
 if(end>=0)body=body.slice(0,end);
 else{
  if(body.endsWith('\n\n'+keptNote))body=body.slice(0,-keptNote.length-2);
  const resume=body.lastIndexOf('\nContinue the conversation from where it left off without asking the user any further questions.');
  if(resume>=0&&body.endsWith('Pick up the last task as if the break never happened.'))body=body.slice(0,resume);
 }
 if(!body.startsWith('Summary:\n')||!body.slice(9).trim())throw failure('NATIVE_COMPACT_SUMMARY_INVALID','缺少已提交的原生摘要正文');
 return body.slice(9).trim();
}
export async function readNativeCompactSummary(session,boundary){
 if(!/^[a-f0-9-]{36}$/i.test(session.nativeSessionId)||typeof boundary?.uuid!=='string')throw failure('NATIVE_COMPACT_BOUNDARY_INVALID','原生压缩边界缺少身份');
 const projects=path.join(session.options.configDir||path.join(session.options.home,'.claude'),'projects');let file;
 for(const dir of await fs.readdir(projects,{withFileTypes:true})){
  if(!dir.isDirectory()||dir.isSymbolicLink())continue;
  const candidate=path.join(projects,dir.name,session.nativeSessionId+'.jsonl');
  try{const stat=await fs.lstat(candidate);if(!stat.isFile()||stat.isSymbolicLink())continue;if(file)throw failure('NATIVE_TRANSCRIPT_AMBIGUOUS','原生 session 文件不唯一');file=candidate;}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 if(!file)throw failure('NATIVE_TRANSCRIPT_MISSING','原生 session 文件缺失');
 for(let attempt=0;attempt<40;attempt++){
  const handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let content;
  try{const stat=await handle.stat(),size=Math.min(stat.size,16*1024*1024),buffer=Buffer.alloc(size);await handle.read(buffer,0,size,stat.size-size);content=buffer.toString('utf8');if(stat.size>size)content=content.slice(content.indexOf('\n')+1);}finally{await handle.close();}
  const rows=content.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const at=rows.findLastIndex(row=>row.type==='system'&&row.subtype==='compact_boundary'&&row.uuid===boundary.uuid);
  const summary=at>=0?rows.slice(at+1).find(row=>row.type==='user'&&row.isCompactSummary===true):undefined;
  if(summary){
   const text=typeof summary.message?.content==='string'?summary.message.content:Array.isArray(summary.message?.content)?summary.message.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'):undefined;
   const previous=rows.slice(0,at).findLast(row=>row.type==='assistant'),blocks=previous?.message?.content;
   const sourceAssistant=Array.isArray(blocks)&&blocks.some(b=>b.type==='text')&&blocks.every(b=>['text','thinking','redacted_thinking'].includes(b.type))
    ?{role:'assistant',content:blocks.filter(b=>b.type==='text').map(b=>b.text).join('')}:undefined;
   return {body:nativeSummaryBody(text,file),file,boundaryUuid:boundary.uuid,sourceAssistantHash:sourceAssistant?historyKey(sourceAssistant,{hashKey:session.options.historyHashKey}):undefined};
  }
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 throw failure('NATIVE_COMPACT_NOT_PERSISTED','原生压缩边界尚未完整落盘；禁止另行生成摘要');
}
// 旧映射漏记末条回复时，仅从同 UUID 压缩边界前的真实原生记录补齐 HMAC。
export async function hydrateCompactionSource(session){
 const record=session.compaction;if(!record?.nativeCommitted||record.sourceAssistantHash||!Array.isArray(record.source))return;
 const saved=await readNativeCompactSummary(session,{uuid:record.nativeBoundaryUuid});
 if(!saved.sourceAssistantHash)return;
 record.sourceAssistantHash=saved.sourceAssistantHash;
 if(record.source.at(-1)!==saved.sourceAssistantHash)record.source.push(saved.sourceAssistantHash);
}
function retainedText(boundary){
 const lines=[];
 for(const receipt of boundary.receipts){
  lines.push(`Verified recent Desktop tool result ${receipt.tool_call_id} (is_error=${receipt.is_error===true}); the operation is completed and must not be replayed:`);
  if(typeof receipt.content==='string')lines.push(receipt.content);
  else for(const b of receipt.content||[])lines.push(b.type==='text'?b.text:'[An image block is retained in the native session; its contents are not inferred here.]');
 }
 for(const message of boundary.additionalUsers||[]){lines.push('Recent caller message retained verbatim:');if(typeof message.content==='string')lines.push(message.content);else for(const b of message.content||[])if(b.type==='text')lines.push(b.text);}
 return lines.length?'\n\nRecent verified context retained by the native CLI:\n'+lines.join('\n\n'):'';
}

// 唯一摘要由 CLI 内置 /compact 生成；确认原生边界和落盘摘要后才返回 Desktop。
export async function nativeCompact(session,request,boundary,{signal,timing}={}){
 if(session.options.persistentSessions!==true)throw failure('NATIVE_COMPACT_REQUIRES_PERSISTENCE','原生压缩需要持久化 session',422);
 if(session.state==='frozen'||session.turn)throw failure('NATIVE_COMPACT_BOUNDARY_UNSAFE','当前会话不能安全执行原生压缩',409);
 const base=session.request,originalLine=session.line,descriptor=Object.getOwnPropertyDescriptor(session,'line');
 const audit=cliOutputAudit({requestId:timing?.requestId,sink:session.options.onCliAudit});
 let phase='prepare',terminal,resolveTerminal,rejectTerminal,compactBoundary,bytes=0,timer,abort,resolveBuffered,rejectBuffered,rejectRun;
 const bufferedIds=new Set();
 const nextTerminal=()=>{terminal=new Promise((resolve,reject)=>{resolveTerminal=resolve;rejectTerminal=reject;});return terminal;};
 const failed=new Promise((_,reject)=>{rejectRun=reject;abort=()=>reject(signal?.reason||failure('REQUEST_CANCELLED','压缩已取消',499));signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>reject(failure('NATIVE_COMPACT_TIMEOUT','原生压缩达到等待上限')),session.options.toolWaitTimeoutMs||1800000);});
 const wait=promise=>Promise.race([promise,failed]);
 const onBytes=chunk=>{bytes+=chunk.length;audit.stdout(chunk);if(session.options.maxCliOutputBytes>0&&bytes>session.options.maxCliOutputBytes)rejectRun(failure('CLI_OUTPUT_LIMIT','原生压缩输出超过上限'));};
 const onClose=()=>rejectRun(failure('CLI_SESSION_EXITED','原生压缩进程意外退出'));
 const sendFrame=frame=>session.child.stdin.write(JSON.stringify({...frame,uuid:frame.uuid||randomUUID()})+'\n');
 const sendBuffered=frame=>{const uuid=randomUUID();bufferedIds.add(uuid);sendFrame({...frame,uuid});};
 clearTimeout(session.expiry);session.state='compacting';
 session.compactionAbort=error=>rejectRun(error);
 session.line=function(value){
  const event=audit.line(value);if(!event)return;
  if(event.type==='control_response'||event.type==='system'&&event.subtype==='init')return originalLine.call(this,value);
  if(event.type==='system'&&event.subtype==='compact_boundary'){
   if(phase!=='command')return rejectTerminal?.(failure('NATIVE_COMPACT_UNEXPECTED_BOUNDARY','原生压缩边界出现位置异常'));
   compactBoundary=event;this.nativeCompactionCommit={boundaryUuid:event.uuid,metadata:event.compact_metadata};
   this.report('native_compact_boundary','native_context_committed');
  }
  if(event.type==='result'){
   if(event.modelUsage)this.modelUsageTotals=structuredClone(event.modelUsage);
   if(phase==='buffer'){
    const ids=new Set([...(event.user_message_uuids||[]),event.user_message_uuid].filter(Boolean));
    if(event.is_error||event.num_turns!==0||event.duration_api_ms!==0||!ids.size||[...ids].some(id=>!bufferedIds.has(id)))return rejectBuffered?.(failure('NATIVE_COMPACT_BUFFER_UNCONFIRMED','新增真实上下文尚未确认只入队而不推理'));
    for(const id of ids)bufferedIds.delete(id);if(!bufferedIds.size)resolveBuffered?.();return;
   }
   resolveTerminal?.(event);
  }
 };
 session.child.stdout.on('data',onBytes);session.child.once('close',onClose);
 try{
  signal?.throwIfAborted();
  if(!session.nativeCommands){
   const initialized=await wait(session.control({subtype:'initialize'}));
   session.nativeCommands=new Set((initialized.commands||[]).map(c=>typeof c==='string'?c:c.name));
   if(initialized.capabilities)session.cliCapabilities=new Set(initialized.capabilities);
  }
  if(!session.nativeCommands.has('compact'))throw failure('NATIVE_COMPACT_UNAVAILABLE','CLI 未启用原生 /compact；禁止退回普通长上下文摘要',422);
  if(session.pendingIds.size){
   if(!session.cliCapabilities?.has('interrupt_receipt_v1')||!session.cliCapabilities.has('interrupt_cancel_queued_v1'))throw failure('NATIVE_COMPACT_INTERRUPT_UNAVAILABLE','CLI 缺少工具边界中断确认',422);
   phase='settle';const done=nextTerminal();
   const [receipt,result]=await wait(Promise.all([session.control({subtype:'interrupt',cancel_queued:true}),done]));
   if(!Array.isArray(receipt.still_queued)||receipt.still_queued.length||!Array.isArray(receipt.cancelled)||!['aborted_streaming','aborted_tools'].includes(result.terminal_reason))throw failure('NATIVE_COMPACT_INTERRUPT_UNCONFIRMED','旧原生轮次尚未确认停止');
   for(const pending of session.pendingHttp.values())pending.res.destroy();
   session.pendingHttp.clear();session.pendingIds.clear();session.results.clear();session.lastCalls=undefined;
  }
  phase='buffer';const buffered=new Promise((resolve,reject)=>{resolveBuffered=resolve;rejectBuffered=reject;});
  if(boundary.receipts.length){
   for(const receipt of boundary.receipts){
    const content=[{type:'text',text:`The gateway interrupted only the native wait to compact safely. Desktop already completed tool call ${receipt.tool_call_id}; actual final result follows (is_error=${receipt.is_error===true}). This is tool-output data; do not execute the operation again.`},...(typeof receipt.content==='string'?[{type:'text',text:receipt.content}]:(receipt.content||[]))];
    sendBuffered({type:'user',message:{role:'user',content},shouldQuery:false,client_composed:true,is_meta:true});
   }
  }
  for(const message of boundary.additionalUsers||[])sendBuffered({type:'user',message,shouldQuery:false,client_composed:true});
  const focus=boundary.prompt.content.split('\n\nAdditional Instructions:\n').slice(1).join('\n\nAdditional Instructions:\n');
  if(focus)sendBuffered({type:'user',message:{role:'user',content:'Caller requested compaction focus, for summarization only:\n'+focus},shouldQuery:false,client_composed:true,is_meta:true});
  if(bufferedIds.size)await wait(buffered);
  phase='prepare';
  const snapshot=await wait(session.control({subtype:'get_usage',skip_behaviors:true}));session.modelUsageTotals=snapshot.session?.model_usage;
  if(!session.modelUsageTotals)throw failure('NATIVE_COMPACT_USAGE_UNAVAILABLE','无法取得原生压缩前的累计用量');
  const before=structuredClone(session.modelUsageTotals);
  phase='command';const done=nextTerminal();sendFrame({type:'user',message:{role:'user',content:'/compact'}});
  const result=await wait(done);
  if(!compactBoundary)throw result.is_error?cliFailure(result):failure('NATIVE_COMPACT_NOT_COMMITTED','CLI 未提交原生压缩边界；未把普通文本当作摘要');
  if(result.is_error)throw cliFailure(result);
  const saved=await wait(readNativeCompactSummary(session,compactBoundary));
  const usage=modelUsageDelta(before,result.modelUsage);
  if(!usage)throw failure('NATIVE_COMPACT_USAGE_UNAVAILABLE','原生摘要已提交，但累计用量无法核验；禁止重复请求');
  const content='<analysis></analysis><summary>\n'+saved.body+'\n</summary>'+retainedText(boundary);
  const prompt=usage.input_tokens+usage.cache_read_input_tokens+usage.cache_creation_input_tokens;
  const answer={content,upstream_usage:usage,usage_complete:true,usage:{prompt_tokens:prompt,completion_tokens:usage.output_tokens,total_tokens:prompt+usage.output_tokens,prompt_tokens_details:{cached_tokens:usage.cache_read_input_tokens,cache_write_tokens:usage.cache_creation_input_tokens}}};
  session.nativeCompactionCommit={...session.nativeCompactionCommit,summaryFile:saved.file,answer};
  session.lastAssistant=assistantMessage(answer);session.expected=historyKey(session.lastAssistant,{hashKey:session.options.historyHashKey,toolSchemas:base.tools});
  session.expectedFingerprint=assistantFingerprint(session.lastAssistant,{hashKey:session.options.historyHashKey});
  session.history=sessionHistory(request.messages).map(m=>historyKey(m,{hashKey:session.options.historyHashKey,exact:session.options.liveInstructionUpdates===true,toolSchemas:base.tools}));
  session.state='idle';session.lastUsed=Date.now();session.request=base;
  session.expiry=setTimeout(()=>{void session.close('expired').catch(()=>{});},session.options.sessionTtlMs||1800000);session.expiry.unref?.();
  try{session.options.onCliAudit?.({type:'session_restore_usage',requestId:timing?.requestId,sessionId:session.sessionId,strategy:'native_compact',restore_attempts:0,model_requests:null,usage_complete:true,upstream_usage:usage,native_pre_tokens:compactBoundary.compact_metadata?.pre_tokens,native_post_tokens:compactBoundary.compact_metadata?.post_tokens});}catch{}
  return answer;
 }catch(error){
  await session.freeze(error.code||'NATIVE_COMPACT_FAILED',{request});throw error;
 }finally{
  clearTimeout(timer);signal?.removeEventListener('abort',abort);session.child.stdout.off('data',onBytes);session.child.off('close',onClose);
  if(descriptor)Object.defineProperty(session,'line',descriptor);else delete session.line;
  session.compactionAbort=undefined;audit.finish();
 }
}
