import {toolBoundarySnapshot} from './tool-boundary-trace.mjs';
import {callerRuntimeStatus} from './runtime-status.mjs';

// 仅使用调用前已收到的目录更新与同 ID 的三点采样，不推测执行目录。
export function mappedBashAssistant(message, precedingMessages, snapshot=toolBoundarySnapshot) {
 let cwd;
 for(const entry of precedingMessages){const status=callerRuntimeStatus(entry);if(status?.type==='environment')cwd=status.cwd;}
 if(!cwd||!Array.isArray(message?.tool_calls))return message;
 const pathKey=value=>{
  const win=/^([A-Za-z]):[\\/](.*)$/.exec(value);
  const bash=/^\/([A-Za-z])\/(.*)$/.exec(value);
  if(!win&&!bash)return undefined;
  const [,drive,tail]=win||bash;
  // 拒绝 shell 表达式、相对跳转与路径别名；不假设 Windows 路径大小写等价。
  if(!/^[A-Za-z0-9_./\\ -]+$/.test(tail)||tail.split(/[\\/]/).some(p=>p==='.'||p==='..'))return undefined;
  return drive.toLowerCase()+':/'+tail.replace(/\\/g,'/').replace(/\/$/,'');
 };
 const cwdKey=pathKey(cwd);if(!cwdKey)return message;
 let changed=false;
 const calls=message.tool_calls.map(call=>{
  if(call.function?.name!=='Bash')return call;
  let input;try{input=JSON.parse(call.function.arguments);}catch{return call;}
  const row=snapshot([call.id])[0],phases=row?.phases;
  const original=phases?.cli?.command;
  if(typeof original!=='string'||original!==phases?.wire?.command||input.command!==phases?.desktop?.command)return call;
  // 仅匹配一个无引号、无展开、无其他 shell 操作符的绝对 cd 前缀。
  const match=/^cd (\/[A-Za-z]\/[A-Za-z0-9_./-]+) && ([\s\S]+)$/.exec(original);
  if(!match||pathKey(match[1])!==cwdKey||match[2]!==input.command)return call;
  changed=true;
  return {...call,function:{...call.function,arguments:JSON.stringify({...input,command:original})}};
 });
 return changed?{...message,tool_calls:calls}:message;
}
