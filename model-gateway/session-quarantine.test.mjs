import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {NativeCliSession} from './native-cli-session.mjs';

test('异常暂停并保留 CLI，存档后不终止、不清理等待状态',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'freeze-test-')),events=[];
 const request={messages:[{role:'user',content:'真实调用方输入'}]};
 const session=new NativeCliSession(request,{}, {home,onInvalidateCheckpoint:async()=>events.push('invalidate'),onSessionEvent:r=>{if(r.event==='freeze_archived')events.push('archived');}});
 session.work=path.join(home,'session-seed');await fs.mkdir(session.work);session.resumeFile=path.join(session.work,'resume.jsonl');await fs.writeFile(session.resumeFile,'真实导入历史');
 session.bearer='DO_NOT_ARCHIVE';session.pendingIds.add('tool-1');
 session.child={pid:1,exitCode:null,signalCode:null};
 session.suspend=async()=>{events.push('SIGSTOP');return{pid:1,verified:true};};
 session.killGroup=signal=>{events.push(signal);if(signal==='SIGKILL')session.child.signalCode='SIGKILL';};
 const original=path.join(home,'.claude/projects/synthetic');await fs.mkdir(original,{recursive:true});
 const transcript=JSON.stringify({type:'assistant',message:{content:[{type:'thinking',thinking:'保留已落盘状态'}]}});
 await fs.writeFile(path.join(original,session.nativeSessionId+'.jsonl'),transcript);
 try {
  const first=session.freeze('TEST_FAILURE',{request:{messages:[{role:'user',content:'收到的另一份历史'}]}});
  assert.equal(first,session.freeze('REPEATED'));
  assert.equal((await first).nativeTranscriptCopied,true);
  assert.equal(session.state,'frozen');
  assert.deepEqual(events,['SIGSTOP','invalidate','archived']);
  assert.equal(session.pendingIds.size,1);
  await session.close('expired');assert.equal(session.state,'frozen');
  const root=path.join(home,'quarantined-sessions'),folder=path.join(root,(await fs.readdir(root))[0]);
  assert.equal(await fs.readFile(path.join(folder,'native-transcript.jsonl'),'utf8'),transcript);
  const meta=JSON.parse(await fs.readFile(path.join(folder,'metadata.json'),'utf8'));
  assert.equal(meta.bootstrapHistoryCopied,true);assert.equal(await fs.readFile(path.join(folder,'bootstrap-history.jsonl'),'utf8'),'真实导入历史');
  assert.equal(meta.resumable,false);assert.deepEqual(meta.pendingToolIds,['tool-1']);
  for(const name of await fs.readdir(folder))assert(!(await fs.readFile(path.join(folder,name),'utf8')).includes('DO_NOT_ARCHIVE'));
  if(process.platform!=='win32')assert.equal((await fs.stat(folder)).mode&0o777,0o700);
 }finally{await session.close('test-cleanup',{discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});

test('存档失败仍保留暂停的 CLI，不自动终止或恢复运行',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'freeze-failure-'));
 const signals=[],session=new NativeCliSession({messages:[]},{},{home});
 session.child={pid:1,exitCode:null,signalCode:null};
 session.suspend=async()=>{signals.push('SIGSTOP');return{pid:1,verified:true};};
 session.killGroup=signal=>{signals.push(signal);if(signal==='SIGKILL')session.child.signalCode=signal;};
 await fs.writeFile(path.join(home,'quarantined-sessions'),'阻止建立存档目录');
 try {assert.equal((await session.freeze('DISK_FAILURE')).historySaved,false);assert.deepEqual(signals,['SIGSTOP']);assert.equal(session.state,'frozen');}
 finally{await session.close('test-cleanup',{discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});
