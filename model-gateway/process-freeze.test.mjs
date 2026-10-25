import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn}from 'node:child_process';
import {NativeCliSession}from './native-cli-session.mjs';
test('真实模拟进程暂停后仍存活，心跳停止，过期关闭不杀进程，管道与工具等待仍保留',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'retain-process-')),heartbeat=path.join(home,'heartbeat');
 const child=spawn(process.execPath,['--input-type=module','-e',`import fs from 'node:fs';setInterval(()=>fs.appendFileSync(process.argv[1],'x'),10);`,heartbeat],{detached:process.platform!=='win32',windowsHide:true,stdio:['pipe','pipe','pipe']});
 const session=new NativeCliSession({messages:[]},{},{home});session.child=child;session.pendingIds.add('real-pending');session.pendingHttp.set('real-pending',{marker:'live HTTP waiter'});
 try {
  for(let i=0;i<200;i++){try{if((await fs.stat(heartbeat)).size)break;}catch{}await new Promise(r=>setTimeout(r,10));}
  const result=await session.freeze('TEST_HOLD');assert.equal(result.processPreserved,true);const pid=child.pid;
  const before=(await fs.stat(heartbeat)).size;await new Promise(r=>setTimeout(r,150));
  assert.equal((await fs.stat(heartbeat)).size,before);assert.equal(child.exitCode,null);assert.equal(child.signalCode,null);assert.equal(child.pid,pid);assert.equal(child.stdin.destroyed,false);
  assert.equal(await session.close('expired'),false);assert.equal(await session.close('capacity'),false);
  assert.equal(session.pendingIds.size,1);assert.equal(session.pendingHttp.get('real-pending').marker,'live HTTP waiter');
 }finally{await session.close('test-cleanup',{discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});
