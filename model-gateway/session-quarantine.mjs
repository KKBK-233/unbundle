import {toolBoundarySnapshot} from './tool-boundary-trace.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

// 错误现场仅保存到受限目录；不记录到日志，不包含 MCP bearer、环境变量或认证文件。
export async function archiveSession(session,{request,reason,partialTurn}) {
  const root=path.join(session.options.home,'quarantined-sessions');
  await fs.mkdir(root,{recursive:true,mode:0o700});
  const folder=await fs.mkdtemp(path.join(root,'session-'));await fs.chmod(folder,0o700);
  const write=(name,value)=>fs.writeFile(path.join(folder,name),JSON.stringify(value,null,2),{mode:0o600});
  const metadata={version:1,reason,sessionId:session.sessionId,nativeSessionId:session.nativeSessionId,
    savedAt:new Date().toISOString(),processPreserved:session.frozenProcess?.verified===true,processPid:session.frozenProcess?.pid||null,pendingToolIds:[...session.pendingIds],resumable:false,
    note:'错误现场，不是完成检查点；未落盘的原生内存状态不保证完整保存。',nativeTranscriptCopied:false};
  await write('gateway-last-request.json',session.request);
  if(request)await write('desktop-request.json',request);
  if(partialTurn)await write('partial-turn.json',partialTurn);
  await write('tool-boundary-trace.json',toolBoundarySnapshot(session.pendingIds));
  await write('handoff-state.json',{assistant:session.lastAssistant||null,calls:[...(session.lastCalls?.values()||[])],
    receivedResults:[...session.results],pendingMcpIds:[...session.pendingHttp.keys()]});
  const config=session.options.configDir||path.join(session.options.home,'.claude');
  if(/^[0-9a-f-]{36}$/i.test(session.nativeSessionId)) {
    try {
      for(const project of await fs.readdir(path.join(config,'projects'),{withFileTypes:true})) {
        if(!project.isDirectory()||project.isSymbolicLink())continue;
        const file=path.join(config,'projects',project.name,`${session.nativeSessionId}.jsonl`);
        try {
          const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())continue;
          await fs.copyFile(file,path.join(folder,'native-transcript.jsonl'));
          await fs.chmod(path.join(folder,'native-transcript.jsonl'),0o600);
          metadata.nativeTranscriptCopied=true;break;
        }catch(error){if(error.code!=='ENOENT')throw error;}
      }
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  // 导入模式下原生 CLI 可能尚未落盘；另外保存引导历史，不把它冒称为完整原生 transcript。
  metadata.bootstrapHistoryCopied=false;
  if(session.resumeFile && session.work && path.resolve(session.resumeFile)===path.join(path.resolve(session.work),'resume.jsonl')) {
    try {
      const stat=await fs.lstat(session.resumeFile);
      if(stat.isFile()&&!stat.isSymbolicLink()) {
        await fs.copyFile(session.resumeFile,path.join(folder,'bootstrap-history.jsonl'));
        await fs.chmod(path.join(folder,'bootstrap-history.jsonl'),0o600);metadata.bootstrapHistoryCopied=true;
      }
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  await write('metadata.json',metadata);
  return {folder,nativeTranscriptCopied:metadata.nativeTranscriptCopied};
}
