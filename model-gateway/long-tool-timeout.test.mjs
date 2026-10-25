import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {NativeCliSession} from './native-cli-session.mjs';
import {compileContext} from './context.mjs';

test('真实启动路径向模拟CLI传递半小时总等待、空闲等待和MCP服务阈值',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'long-tool-timeout-'));let captured;
 const request={model:'claude-opus-5-5',max_tokens:1024,messages:[{role:'user',content:'synthetic'}],tools:[{type:'function',function:{name:'Bash',parameters:{type:'object'}}}]};
 const options={home,model:request.model,outputTokens:1024,spawnProcess:(_cli,args,opts)=>{captured={args,env:opts.env};return spawn(process.execPath,['-e','setInterval(()=>{},1000)'],opts);}};
 const session=new NativeCliSession(request,compileContext(request,options),options);
 try{
  await session.start();assert.equal(captured.env.MCP_TOOL_TIMEOUT,'1800000');assert.equal(captured.env.CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT,'1800000');
  const config=JSON.parse(await fs.readFile(captured.args[captured.args.indexOf('--mcp-config')+1],'utf8'));assert.equal(config.mcpServers.omp.timeout,1800000);
 }finally{await session.close('test-cleanup',{discardFrozen:true});await fs.rm(home,{recursive:true,force:true});}
});
test('闲置回收不结束正在等待工具的会话，容量挤占明确拒绝',async()=>{
 const session={state:'waiting-tool',pendingIds:new Set(['running']),options:{sessionTtlMs:1000},report(){}};
 try{
  assert.equal(await NativeCliSession.prototype.close.call(session,'expired'),false);
  await assert.rejects(NativeCliSession.prototype.close.call(session,'capacity'),{code:'SESSION_CAPACITY'});
  assert.equal(session.state,'waiting-tool');
 }finally{clearTimeout(session.expiry);}
});
