import fs from 'node:fs/promises'; import path from 'node:path'; import http from 'node:http'; import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto'; import {fileURLToPath} from 'node:url';
import {infer} from './engine.mjs';
import {stateDir, claudeCli} from './config.mjs';
// 回环服务负责认证和请求调度，不执行客户端工具。
export async function gateway({token,port=18795,execute}={}){
  if(!token)throw new Error('Missing gateway token');let busy=false;const active=new Set();
  const server=http.createServer(async(req,res)=>{
    if(process.env.GATEWAY_DIAGNOSTICS==='1') { console.log(req.method,req.url); res.on('finish',()=>console.log('HTTP',res.statusCode)); }
    const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from(`Bearer ${token}`);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(401).end();return;}
    if(req.headers.origin){res.writeHead(403).end();return;}
    const json=(status,value)=>{if(!res.headersSent)res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    if(req.method==='GET'&&req.url==='/v1/models'){json(200,{object:'list',data:[{id:'claude-code-deepseek',object:'model',owned_by:'local-gateway'}]});return;}
    if(req.method!=='POST'||req.url!=='/v1/chat/completions'){json(404,{error:{message:'Not found'}});return;}
    if(busy){json(429,{error:{message:'模型入口当前只允许一个请求，请等待上一轮结束。'}});return;}
    busy=true;const controller=new AbortController();active.add(controller);let heartbeat;
    res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    try{
      let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>4*1024*1024){json(413,{error:{message:'Request too large'}});return;}}
      let body;try{body=JSON.parse(raw);}catch{json(400,{error:{message:'Invalid JSON'}});return;}
      if(body.model!=='claude-code-deepseek'){json(400,{error:{message:'Unknown model'}});return;}
      if(!Array.isArray(body.messages)){json(400,{error:{message:'messages must be an array'}});return;}
      const id=`chatcmpl-${randomUUID()}`,created=Math.floor(Date.now()/1000);
      const chunk=(delta,finish=null)=>res.write(`data: ${JSON.stringify({id,object:'chat.completion.chunk',created,model:body.model,choices:[{index:0,delta,finish_reason:finish}]})}\n\n`);
      if(body.stream){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});res.write(': waiting for Claude Code\n\n');heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),10000);}
      const message=await execute(body,controller.signal);
      if(controller.signal.aborted)return;
      const finish=message.tool_calls?.length?'tool_calls':'stop';
      if(body.stream){chunk({role:'assistant'});if(message.content)chunk({content:message.content});if(message.tool_calls)chunk({tool_calls:message.tool_calls.map((call,index)=>({index,...call}))});chunk({},finish);res.end('data: [DONE]\n\n');}
      else json(200,{id,object:'chat.completion',created,model:body.model,choices:[{index:0,message,finish_reason:finish}]});
    }catch(error){if(!controller.signal.aborted){if(res.headersSent){res.write(`data: ${JSON.stringify({error:{message:error.message,type:'gateway_error'}})}\n\n`);res.end();}else json(502,{error:{message:error.message,type:'gateway_error'}});}}
    finally{clearInterval(heartbeat);active.delete(controller);busy=false;}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {port:server.address().port,async close(){for(const c of active)c.abort();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const folder=stateDir;await fs.mkdir(folder,{recursive:true,mode:0o700});
  const token=(await fs.readFile(path.join(folder,'token'),'utf8')).trim();
  const key=process.env.DEEPSEEK_API_KEY?.trim();delete process.env.DEEPSEEK_API_KEY;
  if(!key)throw new Error('请通过 model-gateway/start.ps1 输入 DeepSeek Key');
  const server=await gateway({token,execute:(request,signal)=>infer(request,{cli:claudeCli(),home:folder,key,baseUrl:'https://api.deepseek.com/anthropic',model:'deepseek-flash',signal})});
  console.log(`OMP 模型入口已就绪：http://127.0.0.1:${server.port}/v1（工具由 OMP 执行）`);
  for(const event of ['SIGINT','SIGTERM'])process.once(event,async()=>{await server.close();process.exit(0);});
}
