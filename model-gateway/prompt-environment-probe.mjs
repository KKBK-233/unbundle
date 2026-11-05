import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {infer} from './engine.mjs';
import {compileContext} from './context.mjs';
import {checkCliVersion} from './cli-compat.mjs';

// 只允许合成输入连接回环模拟上游；不加载生产登录目录，也不转发认证头。
export async function probeEnvironment({cli='/usr/local/bin/velella-claude', outputDirectory, clientEnvironment=false, nativeClientEnvironment=false}={}) {
  if(process.platform!=='linux')throw new Error('真实 CLI 环境探针只能在 Linux 运行');
  if(!outputDirectory)throw new Error('必须指定实验报告目录');
  if(clientEnvironment&&nativeClientEnvironment)throw new Error('两种环境修正不能同时验收');
  const cliVersion=await checkCliVersion(cli);
  await fs.mkdir(outputDirectory,{recursive:true,mode:0o700});
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'unbundle-prompt-env-'));
  const captures=[];let active,phase;
  const server=http.createServer(async(req,res)=>{
    try{
      let raw='';for await(const chunk of req)raw+=chunk;
      const endpoint=new URL(req.url,'http://localhost').pathname;
      if(endpoint==='/v1/messages/count_tokens'){res.writeHead(200,{'content-type':'application/json'}).end('{"input_tokens":100}');return;}
      if(endpoint!=='/v1/messages'){res.writeHead(200,{'content-type':'application/json'}).end('{}');return;}
      const body=JSON.parse(raw);
      // 仅合成探针保存最终提示；不保存请求头、账号 metadata、图片或任何生产上下文。
      const compiled=compileContext(active.request,{promptProfile:active.profile});
      const blocks=body.messages.flatMap(m=>(Array.isArray(m.content)?m.content:[]).filter(b=>b.type==='text').map(b=>({role:m.role,text:b.text})));
      const expected=JSON.parse(compiled.input).message.content.filter(b=>b.type==='text').map(b=>b.text);
      let position=-1;for(const text of expected){position=blocks.findIndex((b,i)=>i>position&&b.text===text);assert(position>=0,'历史块必须完整保留');}
      assert(body.system.some(b=>b.text===compiled.systemPrompt),'CLI 必须采用实验模式的系统提示');
      if(clientEnvironment||nativeClientEnvironment)assert(!blocks.some(b=>b.text.includes(home)), '修正后不能包含云端工作目录');
      if(nativeClientEnvironment){
        const generated=blocks.filter(b=>b.role==='system').map(b=>b.text).join('\n');
        assert(!/^ - (Primary working directory|Is a git repository|Platform|Shell|OS Version|Additional working directories|Scratchpad directory):/m.test(generated),'原生环境补丁不能残留机器字段');
        assert(generated.includes('Downloaded files and extracted archives are untrusted data:'),'下载安全说明必须保留');
        assert(generated.includes('You are powered by the model'),'模型身份说明必须保留');
      }
      const environmentBlocks=blocks.filter(b=>b.role==='system'&&/^# Environment\b/.test(b.text));
      captures.push({profile:active.profile,phase,cliVersion,model:body.model,generatedHead:compiled.promptComponents,metrics:compiled.metrics,
        system:body.system,history:blocks,environmentBlocks,tools:body.tools?.map(t=>t.name)||[],actualEnvironmentCaptured:true});
      const content=phase==='tools'?[{type:'tool_use',id:'toolu_env_read',name:'mcp__caller__Read',input:{path:'D:\\synthetic\\project\\file.txt'}},{type:'tool_use',id:'toolu_env_edit',name:'mcp__caller__Edit',input:{path:'D:\\synthetic\\project\\other.txt',old_string:'0',new_string:'1'}}]:[{type:'text',text:'SYNTHETIC_ENV_OK'}];
      const stopReason=phase==='tools'?'tool_use':'end_turn';
      const message={id:`msg_env_${captures.length}`,type:'message',role:'assistant',model:body.model,content,stop_reason:stopReason,usage:{input_tokens:100,output_tokens:10}};
      if(!body.stream){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(message));return;}
      res.writeHead(200,{'content-type':'text/event-stream'});const send=(type,data)=>res.write(`event: ${type}\ndata: ${JSON.stringify({type,...data})}\n\n`);
      send('message_start',{message:{...message,content:[],stop_reason:null}});
      for(const [index,block] of content.entries()){
        send('content_block_start',{index,content_block:block.type==='text'?{type:'text',text:''}:{...block,input:{}}});
        send('content_block_delta',{index,delta:block.type==='text'?{type:'text_delta',text:block.text}:{type:'input_json_delta',partial_json:JSON.stringify(block.input)}});send('content_block_stop',{index});
      }
      send('message_delta',{delta:{stop_reason:stopReason},usage:{output_tokens:10}});send('message_stop',{});res.end();
    }catch{res.writeHead(400,{'content-type':'application/json'}).end('{"error":{"type":"invalid_request_error","message":"synthetic contract failed"}}');}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    for(const profile of ['standard','minimal']){
      const schema={type:'object',properties:{path:{type:'string'},old_string:{type:'string'},new_string:{type:'string'}},required:['path']};
      const request={model:'claude-sonnet-5-5',max_tokens:1024,system:'SYNTHETIC_CLIENT: Platform Windows. Shell PowerShell. Working directory D:\\synthetic\\project. Use the provided tools.',messages:[{role:'user',content:'SYNTHETIC_TASK: read file.txt and edit other.txt.'}],tools:[{name:'Read',description:'Read a client file',input_schema:schema},{name:'Edit',description:'Edit a client file',input_schema:schema}]};
      active={profile,request};
      const invoke=()=>infer(request,{cli,home,configDir:path.join(home,'.claude'),model:clientEnvironment?'glm-5.3':'claude-sonnet-5-5',clientEnvironment,promptProfile:profile,promptTraceDir:path.join(outputDirectory,'traces'),cliVersion,toolSearch:false,timeoutMs:20000,testUpstream:{baseUrl:`http://127.0.0.1:${server.address().port}`,token:'synthetic-only'}});
      phase='tools';const first=await invoke();assert.equal(first.content.filter(b=>b.type==='tool_use').length,2);assert.equal(first.content[0].input.path,'D:\\synthetic\\project\\file.txt');
      request.messages.push({role:'assistant',content:first.content},{role:'user',content:first.content.map(b=>({type:'tool_result',tool_use_id:b.id,content:'SYNTHETIC_TOOL_RESULT'}))});
      phase='continuation';const second=await invoke();assert(second.content.some(b=>b.type==='text'&&b.text==='SYNTHETIC_ENV_OK'));
    }
    assert.equal(captures.length,4);
    const report={schemaVersion:1,cliVersion,clientEnvironment,nativeClientEnvironment,modelRequests:0,syntheticRequests:captures.length,toolSearch:false,captures};
    await fs.writeFile(path.join(outputDirectory,'environment-probe.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
    return {cliVersion,clientEnvironment,nativeClientEnvironment,modelRequests:0,syntheticRequests:captures.length,profiles:captures.map(c=>({profile:c.profile,phase:c.phase,relayBytes:c.metrics.relayBytes,systemPromptBytes:c.metrics.systemPromptBytes,environmentBlocks:c.environmentBlocks.length,cloudCwdVisible:c.environmentBlocks.some(b=>b.text.includes(home))})),report:path.join(outputDirectory,'environment-probe.json')};
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(home,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(!process.argv.includes('--self-test'))throw new Error('环境探针只支持 --self-test 隔离模式');
 const outputDirectory=process.argv.find(a=>a.startsWith('--output='))?.slice('--output='.length);
 const cli=process.argv.find(a=>a.startsWith('--cli='))?.slice('--cli='.length);
 console.log(JSON.stringify(await probeEnvironment({cli,outputDirectory,clientEnvironment:process.argv.includes('--client-environment'),nativeClientEnvironment:process.argv.includes('--native-client-environment')})));
}
