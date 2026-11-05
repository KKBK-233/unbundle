import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {compileContext} from './context.mjs';
import {resolveEffort} from './effort.mjs';
import {ServerSearchEvents,searchProjection} from './server-search.mjs';
import {sessionQuotaFailure} from './session-quota-guard.mjs';

// 搜索使用独立逐轮 CLI；没有本机文件/命令工具，也不读取或转发认证文件。
export async function inferServerSearch(request,{cli,home,configDir,model,signal,timing,promptProfile='minimal',timeoutMs=180000,idleTimeoutMs=90000,maxCliOutputBytes=16*1024*1024,spawnProcess=spawn,testUpstream}={}){
 signal?.throwIfAborted();
 await fs.mkdir(home,{recursive:true,mode:0o700});
 const work=await fs.mkdtemp(path.join(home,'search-'));
 let child,lines,totalTimer,idleTimer,killTimer,aborted=false,timedOut=false,error,bytes=0,stderr='';
 const events=new ServerSearchEvents(request),group=process.platform!=='win32';
 const kill=s=>{if(!child?.pid)return;try{if(group)process.kill(-child.pid,s);else child.kill(s);}catch{}};
 const stop=()=>{aborted=true;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),1000);};
 const refresh=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>{timedOut=true;kill('SIGKILL');},idleTimeoutMs||90000);};
 try{
  const wire=path.join(work,'search.json'),prompt=path.join(work,'system.txt');
  const projection=searchProjection(request),compiled=compileContext(projection,{promptProfile});
  await fs.writeFile(wire,JSON.stringify({tools:request.tools,messages:request.messages}),{mode:0o600});
  await fs.writeFile(prompt,compiled.systemPrompt,{mode:0o600});
  const env={};for(const k of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','LANG'])if(process.env[k])env[k]=process.env[k];
  Object.assign(env,{HOME:home,USERPROFILE:home,CLAUDE_CONFIG_DIR:configDir,UNBUNDLE_SERVER_SEARCH:wire,DISABLE_AUTOUPDATER:'1',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',CLAUDE_CODE_DISABLE_AUTO_MEMORY:'1',CLAUDE_CODE_MAX_OUTPUT_TOKENS:String(request.max_tokens),ENABLE_TOOL_SEARCH:'false'});
  if(testUpstream)Object.assign(env,{ANTHROPIC_BASE_URL:testUpstream.baseUrl,ANTHROPIC_AUTH_TOKEN:testUpstream.token});
  const args=['-p','--input-format','stream-json','--output-format','stream-json','--verbose','--include-partial-messages','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--setting-sources','','--disable-slash-commands','--no-chrome','--permission-mode','dontAsk','--no-session-persistence','--max-turns','1','--model',model,'--system-prompt-file',prompt];
  const effort=resolveEffort(request);if(effort)args.push('--effort',effort);
  timing?.cliContext?.({model});
  timing?.mark('server_search_started');
  if(['tool','any'].includes(request.tool_choice?.type))timing?.mark('server_search_forced_choice_mapped_to_auto');
  child=spawnProcess(cli,args,{env,cwd:work,detached:group,windowsHide:true,stdio:['pipe','pipe','pipe']});
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  totalTimer=setTimeout(()=>{timedOut=true;kill('SIGKILL');},timeoutMs||180000);refresh();
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  child.stderr.on('data',c=>stderr=(stderr+c).slice(-2000));
  child.stdout.on('data',c=>{bytes+=c.length;if(bytes>(maxCliOutputBytes||16*1024*1024)){error=new Error('搜索响应超过容量上限');kill('SIGKILL');}});
  lines=createInterface({input:child.stdout,crlfDelay:Infinity});
  lines.on('line',line=>{
   if(error||events.complete)return;
   try{
    const event=JSON.parse(line);refresh();timing?.cliEvent?.(event);events.accept(event);
    if(event.type==='stream_event'&&event.event?.type==='message_delta')timing?.upstreamStop?.(event.event.delta?.stop_reason);
    if(events.complete){timing?.mark('server_search_complete');kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),1000);}
   }catch(e){error=e;kill('SIGKILL');}
  });
  child.stdin.on('error',()=>{});child.stdin.end(compiled.input);
  await exited;
  if(aborted)throw new Error('搜索请求已取消');
  if(timedOut)throw Object.assign(new Error('服务端搜索超时'),{code:'INFERENCE_TIMEOUT'});
  if(error)throw error;
  if(!events.complete){const detail=events.result?.result||stderr||'CLI 未返回完整搜索结果';const quota=events.result?.is_error&&sessionQuotaFailure(detail,{usage:events.usage});if(quota)throw quota;throw new Error(testUpstream?String(detail).replaceAll(testUpstream.token,'[REDACTED]'):detail);}
  if(['tool','any'].includes(request.tool_choice?.type)&&events.stopReason==='end_turn'&&!events.content.some(b=>b.type==='server_tool_use'))throw Object.assign(new Error('上游未执行要求的搜索，未伪造结果'),{code:'TOOL_CHOICE_UNSATISFIED',status:422,retryable:false});
  timing?.serverSearch?.(events.content);
  return events.execution();
 }finally{
  clearTimeout(totalTimer);clearTimeout(idleTimer);clearTimeout(killTimer);signal?.removeEventListener('abort',stop);lines?.close();kill('SIGKILL');
  await fs.rm(work,{recursive:true,force:true});
 }
}
