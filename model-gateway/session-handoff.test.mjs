import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {exportHandoff}from './session-recovery.mjs';
test('交接导出包含最近任务和结果状态，省略原始命令，不修改封存归档',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'handoff-export-')),folder=path.join(home,'quarantined-sessions/session-test'),id='b'.repeat(24);await fs.mkdir(folder,{recursive:true});
 const metadata=JSON.stringify({sessionId:id,nativeSessionId:'a'.repeat(36),reason:'ASSISTANT_MESSAGE_MISMATCH'});
 await fs.writeFile(path.join(folder,'metadata.json'),metadata);
 await fs.writeFile(path.join(folder,'handoff-state.json'),JSON.stringify({assistant:{tool_calls:[{id:'call',function:{name:'Bash',arguments:JSON.stringify({command:'DO_NOT_EXPORT_PRIVATE_COMMAND',description:'发布 EXE'})}}]}}));
 await fs.writeFile(path.join(folder,'desktop-request.json'),JSON.stringify({messages:[{role:'user',content:'请发布此项目的单文件 EXE，覆盖前备份旧文件并记录数据库哈希。'},{role:'tool',tool_call_id:'call',content:'完成'}]}));
 try{const result=await exportHandoff(home,id);assert(result.markdown.includes('记录数据库哈希'));assert(result.markdown.includes('已收到结果'));assert(!result.markdown.includes('DO_NOT_EXPORT_PRIVATE_COMMAND'));assert.equal(result.modelRequests,0);assert.equal(await fs.readFile(path.join(folder,'metadata.json'),'utf8'),metadata);}
 finally{await fs.rm(home,{recursive:true,force:true});}
});
