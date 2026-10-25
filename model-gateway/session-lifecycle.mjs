import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform,Writable} from 'node:stream';
import {createGzip,createGunzip} from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {archivedSessions} from './session-recovery.mjs';

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const fail=(code,message)=>Object.assign(new Error(message),{code,status:409,retryable:false});
async function regular(file){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink())throw fail('LIFECYCLE_UNSAFE_PATH','生命周期文件类型无效');return s;}
async function directory(folder){await fs.mkdir(folder,{recursive:true,mode:0o700});const s=await fs.lstat(folder);if(!s.isDirectory()||s.isSymbolicLink())throw fail('LIFECYCLE_UNSAFE_PATH','生命周期目录不能是符号链接');}
async function readJson(file){const s=await regular(file);if(s.size>64*1024*1024)throw fail('LIFECYCLE_METADATA_LIMIT','生命周期元数据过大');return JSON.parse(await fs.readFile(file,'utf8'));}
async function atomic(file,value){const temp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(value),{flag:'wx',mode:0o600});await fs.rename(temp,file);}finally{await fs.rm(temp,{force:true});}}
async function digest(file){await regular(file);const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}

// 仅管理网关已验证的完成检查点。归档、退役与删除分别进行，不扫描删除未知 CLI 历史。
export class SessionLifecycle {
 constructor(store,{protectedIds=()=>new Set(),retentionMs=30*86400000,now=Date.now}={}){
  if(!Number.isSafeInteger(retentionMs)||retentionMs<86400000)throw new Error('归档保留期至少一天');
  this.store=store;this.root=path.join(store.home,'session-lifecycle');this.protectedIds=protectedIds;this.retentionMs=retentionMs;this.now=now;
 }
 async load(){
  await this.store.ready;await this.store.writes;await directory(this.root);
  try{this.catalog=await readJson(path.join(this.root,'catalog.json'));}catch(e){if(e.code!=='ENOENT')throw e;this.catalog={version:1,sessions:{}};}
  if(this.catalog.version!==1||!this.catalog.sessions||typeof this.catalog.sessions!=='object'||Array.isArray(this.catalog.sessions))throw fail('LIFECYCLE_CATALOG_INVALID','生命周期目录索引无效');
 }
 save(){return atomic(path.join(this.root,'catalog.json'),this.catalog);}
 guard(id,{retained=true,blocked=true}={}){
  if(!uuid.test(id))throw fail('LIFECYCLE_INVALID_ID','需要完整原生会话 UUID');
  if(this.protectedIds().has(id))throw fail('LIFECYCLE_SESSION_LIVE','存活、等待工具或冻结会话不可清理');
  if(retained&&this.catalog.sessions[id]?.pinned)throw fail('LIFECYCLE_SESSION_RETAINED','此会话已明确保留');
  if(blocked&&this.store.blocked.some(r=>r.nativeSessionId===id&&r.origin!=='lifecycle_retired'))throw fail('LIFECYCLE_SESSION_QUARANTINED','未解决的封存现场不可清理');
 }
 async transcript(id){
  const root=path.join(this.store.configDir,'projects');const rootStat=await fs.lstat(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw fail('LIFECYCLE_UNSAFE_PATH','原生项目根目录类型无效');const found=[];
  for(const entry of await fs.readdir(root,{withFileTypes:true})){
   if(!entry.isDirectory()||entry.isSymbolicLink())continue;
   const file=path.join(root,entry.name,id+'.jsonl');
   try{const stat=await regular(file);found.push({file,project:entry.name,stat});}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  if(found.length!==1)throw fail('LIFECYCLE_TRANSCRIPT_AMBIGUOUS','原生文件缺失或不唯一');return found[0];
 }
 async list(){
  await this.load();const diagnostics=await archivedSessions(this.store.home);
  const ids=new Set([...this.store.records.keys(),...Object.keys(this.catalog.sessions),...this.protectedIds(),...this.store.blocked.map(r=>r.nativeSessionId),...diagnostics.map(r=>r.metadata.nativeSessionId)].filter(id=>uuid.test(id)));
  return {retentionMs:this.retentionMs,automaticDeletion:false,sessions:[...ids].map(id=>{
   const quarantined=this.store.blocked.some(r=>r.nativeSessionId===id&&r.origin!=='lifecycle_retired');
   return {nativeSessionId:id,...(this.catalog.sessions[id]||{state:quarantined?'quarantined':this.store.records.has(id)?'recoverable':'protected'}),live:this.protectedIds().has(id),quarantined,diagnosticArchives:diagnostics.filter(r=>r.metadata.nativeSessionId===id).length};
  })};
 }
 async pin(id,pinned){await this.load();if(pinned&&['purging','purged'].includes(this.catalog.sessions[id]?.state))throw fail('LIFECYCLE_PURGE_STARTED','归档已开始清理，不能标记为完整保留');if(!uuid.test(id)||!this.store.records.has(id)&&!this.catalog.sessions[id]&&!this.protectedIds().has(id)&&!this.store.blocked.some(r=>r.nativeSessionId===id))throw fail('LIFECYCLE_SESSION_UNKNOWN','没有此网关会话');this.catalog.sessions[id]={...(this.catalog.sessions[id]||{state:'recoverable'}),pinned};await this.save();return {nativeSessionId:id,pinned};}
 async retire(id){
  await this.load();this.guard(id);const row=this.store.records.get(id);
  if(!row||this.catalog.sessions[id]?.state==='retiring')throw fail('LIFECYCLE_CHECKPOINT_REQUIRED','仅能退役完整检查点；未完成的退役应先恢复');
  const source=await this.transcript(id);
  if(source.stat.size!==row.snapshot.size||source.stat.mtimeMs!==row.snapshot.mtimeMs)throw fail('LIFECYCLE_CHECKPOINT_CHANGED','原生文件与检查点不一致');
  const folder=path.join(this.root,id);
  try{await fs.mkdir(folder,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;throw fail('LIFECYCLE_ARCHIVE_EXISTS','已有归档或未完成的归档，原件保留，请先检查');}
  const hash=await digest(source.file),archive=path.join(folder,'native.jsonl.gz');
  await pipeline(createReadStream(source.file),createGzip(),createWriteStream(archive,{flags:'wx',mode:0o600}));
  const evidence=[];await directory(path.join(this.store.home,'quarantined-sessions'));
  for(const entry of await archivedSessions(this.store.home)){
   if(entry.metadata.nativeSessionId!==id)continue;
   const name=path.basename(entry.folder),target=path.join(folder,name);await directory(target);const files=[];
   for(const item of await fs.readdir(entry.folder,{withFileTypes:true})){
    if(!item.isFile()||item.isSymbolicLink())throw fail('LIFECYCLE_UNSAFE_PATH','现场包含非普通文件');
    const from=path.join(entry.folder,item.name);await regular(from);await fs.copyFile(from,path.join(target,item.name));await fs.chmod(path.join(target,item.name),0o600);const sha256=await digest(from);if(await digest(path.join(target,item.name))!==sha256)throw fail('LIFECYCLE_SOURCE_CHANGED','现场归档校验失败');files.push({name:item.name,sha256});
   }
   evidence.push({name,files});
  }
  // 原件未改变且压缩包可完整还原后，才写入退役状态和不可自动重建的墓碑。
  const verify=createHash('sha256');await pipeline(createReadStream(archive),createGunzip(),new Writable({write(b,_,cb){verify.update(b);cb();}}));
  if(verify.digest('hex')!==hash||await digest(source.file)!==hash)throw fail('LIFECYCLE_ARCHIVE_VERIFY_FAILED','归档校验失败，原件未删除');
  const manifest={version:1,id,row,project:source.project,sha256:hash,archiveSha256:await digest(archive),bytes:source.stat.size,evidence};
  await atomic(path.join(folder,'manifest.json'),manifest);
  this.catalog.sessions[id]={state:'retiring',retiredAt:this.now(),pinned:false};await this.save();
  await this.store.quarantineHistory(row.signature,row.history,row.affinityHash,row.historyNormalization,id,'lifecycle_retired',row.expected);
  await this.store.forget(id);
  // 第二次核验防止复制后原件或诊断被修改；失败时保持 retiring，禁止清理归档。
  const latest=await regular(source.file);if(latest.size!==source.stat.size||latest.mtimeMs!==source.stat.mtimeMs||await digest(source.file)!==hash)throw fail('LIFECYCLE_SOURCE_CHANGED','原件改变，保留归档与原件等待恢复');
  for(const item of evidence){const original=path.join(this.store.home,'quarantined-sessions',item.name);await directory(original);for(const file of item.files)if(await digest(path.join(original,file.name))!==file.sha256)throw fail('LIFECYCLE_SOURCE_CHANGED','现场改变，未清理原件');}
  await fs.unlink(source.file);
  for(const item of evidence){const original=path.join(this.store.home,'quarantined-sessions',item.name);for(const file of item.files)await fs.unlink(path.join(original,file.name));await fs.rmdir(original);}
  this.catalog.sessions[id].state='retired';await this.save();return {nativeSessionId:id,state:'retired',restorable:true,purgeAfter:this.catalog.sessions[id].retiredAt+this.retentionMs};
 }
 async restore(id){
  await this.load();this.guard(id,{retained:false});const entry=this.catalog.sessions[id];
  if(!['retired','retiring'].includes(entry?.state))throw fail('LIFECYCLE_NOT_RETIRED','会话没有可恢复的退役归档');
  const folder=path.join(this.root,id);await directory(folder);const m=await readJson(path.join(folder,'manifest.json'));
  if(m.id!==id||m.row?.id!==id||path.basename(m.project)!==m.project||['.','..'].includes(m.project)||!m.project||/[\\/:]/.test(m.project))throw fail('LIFECYCLE_MANIFEST_INVALID','归档路径或身份无效');
  const archive=path.join(folder,'native.jsonl.gz');if(await digest(archive)!==m.archiveSha256)throw fail('LIFECYCLE_ARCHIVE_CHANGED','归档校验失败');
  const project=path.join(this.store.configDir,'projects',m.project);await directory(project);const target=path.join(project,id+'.jsonl'),temp=target+'.'+randomUUID()+'.tmp';
  let bytes=0;const hash=createHash('sha256');
  try{
   await pipeline(createReadStream(archive),createGunzip(),new Transform({transform(b,_,cb){bytes+=b.length;if(bytes>m.bytes)return cb(Error('归档解压超过原始大小'));hash.update(b);cb(null,b);}}),createWriteStream(temp,{flags:'wx',mode:0o600}));
   if(bytes!==m.bytes||hash.digest('hex')!==m.sha256)throw fail('LIFECYCLE_ARCHIVE_CHANGED','归档正文校验失败');
   try{if(await digest(target)!==m.sha256)throw fail('LIFECYCLE_TARGET_CHANGED','目标文件已改变，禁止覆盖');}catch(e){if(e.code!=='ENOENT')throw e;await fs.copyFile(temp,target,1);}
  }finally{await fs.rm(temp,{force:true});}
  // 恢复已归档的诊断副本，不覆盖后来新增或改变的现场。
  await directory(path.join(this.store.home,'quarantined-sessions'));
  for(const item of m.evidence||[]){
   if(path.basename(item.name)!==item.name||!item.name.startsWith('session-'))throw fail('LIFECYCLE_MANIFEST_INVALID','现场目录名无效');
   const original=path.join(this.store.home,'quarantined-sessions',item.name),copy=path.join(folder,item.name);await directory(original);await directory(copy);
   for(const file of item.files){
    if(path.basename(file.name)!==file.name||await digest(path.join(copy,file.name))!==file.sha256)throw fail('LIFECYCLE_ARCHIVE_CHANGED','现场归档校验失败');
    const to=path.join(original,file.name);
    try{if(await digest(to)!==file.sha256)throw fail('LIFECYCLE_TARGET_CHANGED','现场原件已改变');}catch(e){if(e.code!=='ENOENT')throw e;await fs.copyFile(path.join(copy,file.name),to,1);await fs.chmod(to,0o600);}
   }
  }
  const stat=await regular(target);this.store.records.set(id,{...m.row,snapshot:{size:stat.size,mtimeMs:stat.mtimeMs}});await this.store.persist();
  const tombstones=this.store.blocked.filter(r=>r.nativeSessionId===id&&r.origin==='lifecycle_retired');
  for(const row of tombstones)await this.store.releaseQuarantine(row);
  this.catalog.sessions[id]={...entry,state:'recoverable'};await this.save();
  // 恢复后删除的只是已验证归档副本；原生文件与检查点均已提交。
  await this.removeArchive(folder,m);return {nativeSessionId:id,state:'recoverable',modelRequests:0};
 }
 async removeArchive(folder,m){
  try{const stat=await fs.lstat(folder);if(!stat.isDirectory()||stat.isSymbolicLink())throw fail('LIFECYCLE_UNSAFE_PATH','归档目录类型无效');}catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const item of m.evidence||[]){if(path.basename(item.name)!==item.name||!item.name.startsWith('session-'))throw fail('LIFECYCLE_MANIFEST_INVALID','现场目录名无效');const child=path.join(folder,item.name);try{await fs.lstat(child);}catch(e){if(e.code==='ENOENT')continue;throw e;}await directory(child);for(const file of item.files){if(path.basename(file.name)!==file.name)throw fail('LIFECYCLE_MANIFEST_INVALID','现场文件名无效');try{await regular(path.join(child,file.name));await fs.unlink(path.join(child,file.name));}catch(e){if(e.code!=='ENOENT')throw e;}}await fs.rmdir(child);}
  for(const name of ['native.jsonl.gz','manifest.json']){try{await regular(path.join(folder,name));await fs.unlink(path.join(folder,name));}catch(e){if(e.code!=='ENOENT')throw e;}}await fs.rmdir(folder);
 }
 async sweep(){
  await this.load();const removed=[],skipped=[];
  for(const [id,item] of Object.entries(this.catalog.sessions)){
   if(!['retired','purging'].includes(item.state)||!Number.isFinite(item.retiredAt)||this.now()-item.retiredAt<this.retentionMs)continue;
   try{this.guard(id);}catch(e){skipped.push({nativeSessionId:id,code:e.code});continue;}
   if(this.store.records.has(id)){skipped.push({nativeSessionId:id,code:'LIFECYCLE_CHECKPOINT_PRESENT'});continue;}
   const folder=path.join(this.root,id),trash=path.join(this.root,'purging-'+id);
   if(item.state==='retired'){
    await directory(folder);const m=await readJson(path.join(folder,'manifest.json'));
    if(m.id!==id||m.row?.id!==id||await digest(path.join(folder,'native.jsonl.gz'))!==m.archiveSha256)throw fail('LIFECYCLE_ARCHIVE_CHANGED','归档校验失败，停止清理');
    // 先持久化清理计划。中断后仅继续删除已明确退役的同一归档，不重试模型。
    item.state='purging';item.cleanup={evidence:m.evidence};await this.save();
   }
   try{await fs.lstat(trash);}catch(e){if(e.code!=='ENOENT')throw e;try{await fs.rename(folder,trash);}catch(rename){if(rename.code!=='ENOENT')throw rename;}}
   await this.removeArchive(trash,item.cleanup);this.catalog.sessions[id]={...item,state:'purged',purgedAt:this.now()};delete this.catalog.sessions[id].cleanup;await this.save();removed.push(id);
  }
  return {removed,skipped,modelRequests:0};
 }
}
