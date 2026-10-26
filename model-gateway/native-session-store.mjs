import {compactedDelta,compactionIntent} from './compaction-boundary.mjs';
import {hydrateCompactionSource} from './native-compaction.mjs';
import {compactMemoryAliases,compactMemoryContext} from './compact-memory-alias.mjs';
import { archiveSession } from './session-quarantine.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { continuationDelta,historyKey,sessionHistory } from './session-history.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hash = /^[0-9a-f]{64}$/;
// 索引仅存 HMAC 和原生 ID；正文由官方 CLI 自己持久化，不合成或改写 transcript。
export class NativeSessionStore {
  constructor(home, configDir) {
    this.home = home; this.folder = path.join(home, 'native-session-index'); this.configDir = configDir;
    this.records = new Map(); this.blocked = []; this.writes = Promise.resolve(); this.ready = this.initialize();
  }
  async initialize() {
    await fs.mkdir(this.folder, { recursive: true, mode: 0o700 });
    const keyFile = path.join(this.folder, 'match-key');
    try { await fs.writeFile(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    try { this.blocked = JSON.parse(await fs.readFile(path.join(this.folder,'quarantined-history.json'),'utf8')); }
    catch(error) {if(error.code!=='ENOENT')throw error;}
    if(!Array.isArray(this.blocked))throw new Error('封存历史索引无效');
    this.key = await fs.readFile(keyFile);
    if (this.key.length !== 32) throw new Error('原生会话索引密钥无效');
    try {
      const raw = await fs.readFile(path.join(this.folder, 'index.json'), 'utf8');
      if (Buffer.byteLength(raw) > 64 * 1024 * 1024) throw new Error('原生会话索引超过上限');
      const rows = JSON.parse(raw);
      if (!Array.isArray(rows)) throw new Error('原生会话索引格式无效');
      for (const row of rows) if ((row.affinityHash===undefined || hash.test(row.affinityHash)) && uuid.test(row.id) && hash.test(row.signature) && hash.test(row.expected)
        && Array.isArray(row.history) && row.history.every(value => hash.test(value))
        && (row.verifiedToolResults===undefined || Array.isArray(row.verifiedToolResults)&&row.verifiedToolResults.length>0&&row.verifiedToolResults.length<=32
          &&row.verifiedToolResults.every(v=>v&&typeof v.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v.id)&&hash.test(v.hash))
          &&new Set(row.verifiedToolResults.map(v=>v.id)).size===row.verifiedToolResults.length)
        && Number.isFinite(row.snapshot?.size) && Number.isFinite(row.snapshot?.mtimeMs)
        && Number.isFinite(row.savedAt)) this.records.set(row.id, row);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  persist() {
    const content = JSON.stringify([...this.records.values()].sort((a,b) => b.savedAt-a.savedAt));
    if (Buffer.byteLength(content) > 64 * 1024 * 1024) throw new Error('原生会话索引超过上限，请显式退役已完成会话；未丢弃任何旧记录');
    this.writes = this.writes.catch(() => {}).then(async () => {
      const temp = path.join(this.folder, `index-${randomUUID()}.tmp`);
      try { await fs.writeFile(temp, content, { mode: 0o600 }); await fs.rename(temp, path.join(this.folder,'index.json')); }
      finally { await fs.rm(temp, { force: true }); }
    });
    return this.writes;
  }
  async bindAffinity(id, nativeId) {
    await this.ready;
    if(id)await fs.writeFile(path.join(this.folder,'binding-'+id),nativeId,{mode:0o600});
  }
  async quarantineHistory(signature, history, affinityHash, historyNormalization, nativeSessionId, origin, expected) {
    await this.ready;
    this.writes=this.writes.catch(()=>{}).then(async()=>{
      const row={signature,history,affinityHash,historyNormalization,nativeSessionId,...(origin?{origin,expected}:{})};
      if(origin==='lifecycle_retired'){row.historyLength=history.length;row.historyDigest=createHmac('sha256',this.key).update(JSON.stringify(history)).digest('hex');row.history=[];}
      const content=JSON.stringify([...this.blocked,row]);
      const temp=path.join(this.folder,'quarantine-'+randomUUID()+'.tmp');
      try {
        await fs.writeFile(temp,content,{mode:0o600});
        await fs.rename(temp,path.join(this.folder,'quarantined-history.json'));
        this.blocked.push(row);
      }finally{await fs.rm(temp,{force:true});}
    });
    return this.writes;
  }
  async releaseQuarantine(target) {
    await this.ready;
    const same=row=>row.origin===target.origin&&row.expected===target.expected&&row.historyDigest===target.historyDigest&&row.historyLength===target.historyLength&&row.nativeSessionId===target.nativeSessionId&&row.signature===target.signature&&row.affinityHash===target.affinityHash
      &&row.historyNormalization===target.historyNormalization&&JSON.stringify(row.history)===JSON.stringify(target.history);
    this.writes=this.writes.catch(()=>{}).then(async()=>{
      const rows=this.blocked.filter(row=>!same(row)),temp=path.join(this.folder,'review-'+randomUUID()+'.tmp');
      try{await fs.writeFile(temp,JSON.stringify(rows),{mode:0o600});await fs.rename(temp,path.join(this.folder,'quarantined-history.json'));this.blocked=rows;}
      finally{await fs.rm(temp,{force:true});}
      if(target.affinityHash&&!rows.some(row=>row.affinityHash===target.affinityHash))await fs.rm(path.join(this.folder,'blocked-'+target.affinityHash),{force:true});
    });
    return this.writes;
  }
  async checkAffinity(id) {
    await this.ready;
    if (!id) return;
    try { await fs.access(path.join(this.folder, 'blocked-'+id)); }
    catch(error) { if(error.code==='ENOENT')return; throw error; }
    throw Object.assign(new Error('固定会话已封存；禁止自动恢复或重建'), {code:'SESSION_QUARANTINED',status:409,retryable:false});
  }
  async quarantineAffinity(id) {
    await this.ready;
    if(id) await fs.writeFile(path.join(this.folder,'blocked-'+id), 'quarantined', {mode:0o600});
  }
  async forget(id) { await this.ready; if (this.records.delete(id)) await this.persist(); }
  async checkpoint(session) {
    await this.ready;
    if (session.state !== 'idle' || session.pendingIds.size || !session.nativeConfirmed || !uuid.test(session.nativeSessionId)
      || !session.expected || session.interrupted) return;
    const snapshot = await this.transcriptSnapshot(session.nativeSessionId);
    if (!snapshot) return;
    const messages=session.request?.messages||[],first=messages.findIndex(m=>!['system','developer'].includes(m.role));
    const compactSource=session.lastAssistant?{model:session.request.model,outputTokens:session.options.outputTokens,toolsHash:session.compiled.metrics.toolsHash,
      systems:messages.slice(0,first<0?messages.length:first).map(m=>historyKey(m,{hashKey:this.key,exact:true})),
      instructions:sessionHistory(messages).filter(m=>['system','developer'].includes(m.role)).map(m=>historyKey(m,{hashKey:this.key,exact:true})),
      memoryAliases:compactMemoryAliases(messages,{hashKey:this.key,toolSchemas:session.request.tools}).map(({index,hash})=>({index,hash})),
      conversation:[...sessionHistory(messages).filter(m=>!['system','developer'].includes(m.role)),session.lastAssistant].map(m=>historyKey(m,{hashKey:this.key,toolSchemas:session.request.tools}))}:undefined;
    this.records.set(session.nativeSessionId, { id: session.nativeSessionId, signature: session.signature,compactSource,
      historyNormalization: session.historyNormalization, affinityHash: session.affinityHash, history: session.history, expected: session.expected, compaction:session.compaction, snapshot, savedAt: Date.now() });
    await this.persist();
  }
  async refreshClosed(session) {
    await this.ready;
    const row=this.records.get(session.nativeSessionId);
    if(!row||row.signature!==session.signature||row.expected!==session.expected
      ||JSON.stringify(row.history)!==JSON.stringify(session.history))return;
    const snapshot=await this.transcriptSnapshot(row.id);
    if(!snapshot)return;
    // 正常空闲退出会冲刷 CLI 延迟写入；只刷新已经核验过的同一检查点。
    this.records.set(row.id,{...row,snapshot,savedAt:Date.now()});await this.persist();
  }
  async takeForCompaction(request,compiled,affinityHash,{consume=true}={}) {
    await this.ready;const intent=compactionIntent(request);if(!intent?.ordinary)return;
    const promptIndex=request.messages.findLastIndex(m=>m.role==='user'),sourceMessages=request.messages.slice(0,promptIndex);
    const instructions=sessionHistory(sourceMessages).filter(m=>['system','developer'].includes(m.role));
    const matches=[...this.records.values()].flatMap(row=>{
      const source=row.compactSource;
      if(row.affinityHash!==affinityHash||!source||source.model!==request.model||source.toolsHash!==compiled.metrics.toolsHash
        ||!Array.isArray(source.systems)||!Array.isArray(source.conversation)||!Number.isSafeInteger(source.outputTokens))return [];
      if(source.systems.length!==intent.rules.length||!source.systems.every((h,i)=>h===historyKey(intent.rules[i],{hashKey:this.key,exact:true})))return [];
      if(!Array.isArray(source.instructions)||source.instructions.length!==instructions.length||!source.instructions.every((h,i)=>h===historyKey(instructions[i],{hashKey:this.key,exact:true})))return [];
      for(const length of [source.conversation.length,source.conversation.length-1]){
       let alias;
       if(length<1||intent.messages.length<length||!source.conversation.slice(0,length).every((h,i)=>{
        const value=historyKey(intent.messages[i],{hashKey:this.key,toolSchemas:request.tools});
        return h===value||(alias=(source.memoryAliases||[]).find(a=>a.index===i&&a.hash===value));
       }))continue;
       if(intent.messages.slice(length).some(m=>m.role!=='user'||typeof m.content!=='string'))continue;
       const extra=alias?compactMemoryContext(intent.messages[alias.index]):undefined;if(alias&&!extra)continue;
       return [{row,length,extra}];
      }
      return [];
    });
    if(matches.length!==1)return;
    const {row,length,extra}=matches[0],snapshot=await this.transcriptSnapshot(row.id);
    if(!snapshot||snapshot.size!==row.snapshot.size||snapshot.mtimeMs!==row.snapshot.mtimeMs)return;
    await this.checkAffinity(affinityHash);if(consume)await this.forget(row.id);
    return {row,boundary:{prompt:intent.prompt,receipts:[],sourceAssistantHash:row.expected,additionalUsers:[...intent.messages.slice(length),...(extra?[extra]:[])]},
      sourceRequest:{...request,max_tokens:row.compactSource.outputTokens,messages:sourceMessages}};
  }
  async transcriptSnapshot(id) {
    // 不信任索引中的路径；只在官方项目目录下查找固定 UUID 文件，拒绝符号链接。
    const projects = path.join(this.configDir, 'projects');
    try {
      for (const dir of await fs.readdir(projects, { withFileTypes: true })) {
        if (!dir.isDirectory() || dir.isSymbolicLink()) continue;
        const file = path.join(projects,dir.name,`${id}.jsonl`);
        try { const stat = await fs.lstat(file); if (stat.isFile() && !stat.isSymbolicLink() && stat.size > 0) return { size: stat.size, mtimeMs: stat.mtimeMs }; }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return undefined;
  }
  async rejectRestore(row, request, result, reason) {
    await this.quarantineHistory(row.signature,row.history,row.affinityHash,row.historyNormalization,row.id);
    await this.quarantineAffinity(row.affinityHash);
    await this.forget(row.id);
    try {
      await archiveSession({options:{home:this.home,configDir:this.configDir},sessionId:'checkpoint-'+randomUUID(),
        nativeSessionId:row.id,request:{messages:[],historyHashes:row.history,note:'检查点未保存原始正文；真实原生历史见 transcript'},
        pendingIds:new Set(),pendingHttp:new Map(),results:new Map()}, {request,reason});
    }catch { /* 已封存索引；磁盘错误不允许恢复推理。 */ }
    return result;
  }
  async take(request, signature, allowInstructionUpdates, affinityHash, {consume=true,outputTokens,signatureForOutput}={}) {
    await this.ready;
    for (const row of this.records.values()) {
      if (row.affinityHash !== affinityHash) continue;
      const cap=row.compactSource?.outputTokens;
      const compatibleCap=Number.isSafeInteger(cap)&&cap>0&&Number.isSafeInteger(outputTokens)&&outputTokens>=cap
        &&typeof signatureForOutput==='function'&&row.signature===signatureForOutput(cap);
      if (row.signature !== signature&&!compatibleCap) { if (affinityHash) return this.rejectRestore(row,request,{mismatch:true},'CHECKPOINT_HISTORY_MISMATCH'); continue; }
      if(row.compaction?.nativeCommitted)await hydrateCompactionSource({nativeSessionId:row.id,compaction:row.compaction,options:{home:this.home,configDir:this.configDir,historyHashKey:this.key}});
      let delta = compactedDelta({...row,pendingIds:new Set()},request,{hashKey:this.key}) || continuationDelta({ ...row, pendingIds: new Set(row.verifiedToolResults?.map(v=>v.id)||[]) }, request,
        { allowInstructionUpdates, hashKey: this.key });
      if (!delta) { if (affinityHash) return this.rejectRestore(row,request,{mismatch:true},'CHECKPOINT_HISTORY_MISMATCH'); continue; }
      if(row.verifiedToolResults){
        // 仅管理员在原生副本离线核验、真实结果已写入后建立此检查点；普通请求不创建它。
        // 已持久化的结果只核对 HMAC，不再交给 CLI，也不自动重跑对应工具。
        const results=delta.filter(m=>m.role==='tool');
        if(row.verifiedToolResults.some(v=>!results.some(m=>m.tool_call_id===v.id&&historyKey(m,{hashKey:this.key,exact:true})===v.hash)))
          return this.rejectRestore(row,request,{unsafe:true},'VERIFIED_TOOL_RESULT_CHANGED');
        delta=delta.filter(m=>m.role!=='tool');
        if(!delta.some(m=>m.role==='user'))return {unsafe:true};
      }
      const snapshot = await this.transcriptSnapshot(row.id);
      if (!snapshot) return this.rejectRestore(row,request,{missing:true},'NATIVE_TRANSCRIPT_MISSING');
      if (snapshot.size !== row.snapshot.size || snapshot.mtimeMs !== row.snapshot.mtimeMs) return this.rejectRestore(row,request,{unsafe:true},'NATIVE_TRANSCRIPT_UNCERTAIN');
      // 池分配时只读核验，容量与进程准备成功后由执行入口消费；直接调用仍默认消费。
      if(consume)await this.forget(row.id);
      return { id: row.id, delta, ...(compatibleCap?{signature:row.signature,outputTokens:cap}:{}) };
    }
    if(affinityHash) {
      try {await fs.access(path.join(this.folder,'binding-'+affinityHash)); return {unsafe:true};}
      catch(error) {if(error.code!=='ENOENT')throw error;}
    }
  }
}
