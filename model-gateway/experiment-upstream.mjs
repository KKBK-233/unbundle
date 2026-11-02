import fs from 'node:fs/promises';

// 实验只支持已确认的智谱官方入口；凭据独立存放，禁止回退到 Claude 订阅。
export async function loadExperimentUpstream({provider='claude',keyFile}={}) {
  if(provider==='claude')return undefined;
  if(provider!=='glm')throw new Error('实验上游只支持 claude 或 glm');
  if(!keyFile)throw new Error('GLM 实验必须配置独立的 API Key 文件');
  const stat=await fs.lstat(keyFile);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4096||process.platform!=='win32'&&(stat.mode&0o077))throw new Error('GLM 密钥文件必须为权限 0600 的普通文件');
  const token=(await fs.readFile(keyFile,'utf8')).trim();
  if(token.length<16||token.length>1024||/[\s\x00-\x1f]/.test(token))throw new Error('GLM 密钥格式无效');
  return {provider:'glm',model:'glm-5.3',baseUrl:'https://open.bigmodel.cn/api/anthropic',token};
}
