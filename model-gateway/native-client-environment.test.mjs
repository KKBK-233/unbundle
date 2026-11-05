import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateNativeClientEnvironment, NATIVE_ENV_PATCH_ID, NATIVE_ENV_PATCH_SHA256} from './native-client-environment.mjs';

const accepted = () => ({enabled:true,cliVersion:'2.1.316',release:{modified:true,patchId:NATIVE_ENV_PATCH_ID,sha256:NATIVE_ENV_PATCH_SHA256,sourceSha256:'fd13c70000fec3f2116dfbcbb6121210b4a29328bf0e46210a59dd594a67d824',scope:'fresh-cli-full-environment-renderer'}});

test('官方 CLI 默认配置保持可用，本地补丁必须显式启用',async()=>{
 await validateNativeClientEnvironment({release:{version:'2.1.316'}});
 await assert.rejects(validateNativeClientEnvironment({...accepted(),enabled:false}),/显式启用/);
 await validateNativeClientEnvironment(accepted());
});

test('本地 CLI 补丁拒绝版本、哈希、来源及作用范围不匹配',async()=>{
 for(const field of ['modified','patchId','sha256','sourceSha256','scope']){
  const value=accepted();value.release[field]='invalid';
  await assert.rejects(validateNativeClientEnvironment(value),/未验收/);
 }
 await assert.rejects(validateNativeClientEnvironment({...accepted(),cliVersion:'2.1.317'}),/未验收/);
 await assert.rejects(validateNativeClientEnvironment({...accepted(),release:null}),/未验收/);
});

test('禁止将环境源码补丁用于未验收的会话和认证组合',async()=>{
 for(const field of ['externalUpstream','clientEnvironment','sessionRelay']){
  await assert.rejects(validateNativeClientEnvironment({...accepted(),[field]:true}),/逐轮 Claude/);
 }
});

test('原生环境补丁拒绝云端 Git 工作区，包括 worktree 的 .git 文件',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'native-env-'));
 try{
  await validateNativeClientEnvironment({...accepted(),home});
  await fs.mkdir(path.join(home,'workspace'));
  await fs.writeFile(path.join(home,'workspace','.git'),'gitdir: /synthetic/worktree');
  await assert.rejects(validateNativeClientEnvironment({...accepted(),home}),/Git 仓库/);
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
