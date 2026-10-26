import {createHmac,randomBytes} from 'node:crypto';
const key=randomBytes(32),records=new Map();let bytes=0;
const digest=value=>createHmac('sha256',key).update(value).digest('hex');
// 原命令只留在有界内存，异常时进入受限归档；普通日志只有 HMAC 和长度。
export function recordBashPhase(phase,id,name,input) {
 if(name!=='Bash'||typeof input?.command!=='string'||typeof id!=='string')return;
 const command=input.command;let row=records.get(id);
 if(!row){if(phase!=='cli')return;row={id,phases:{},bytes:0};records.set(id,row);}
 const hash=digest(command);if(row.phases[phase]?.hash===hash)return;
 const size=Buffer.byteLength(command),raw=size<=524288?command:null;
 bytes-=row.phases[phase]?.rawBytes||0;row.bytes-=row.phases[phase]?.rawBytes||0;
 row.phases[phase]={hash,bytes:size,command:raw,rawBytes:raw===null?0:size};row.bytes+=raw===null?0:size;bytes+=raw===null?0:size;
 try {console.error(JSON.stringify({type:'bash_command_boundary',phase,toolKey:digest(id),commandBytes:size,commandDigest:hash,
  unchangedFromCli:row.phases.cli?.hash===hash}));}catch{}
 while(records.size>128||bytes>4*1024*1024){const first=records.keys().next().value;bytes-=records.get(first).bytes;records.delete(first);}
}
export function toolBoundarySnapshot(ids) {
 return [...ids].map(id=>records.get(id)).filter(Boolean).map(row=>({id:row.id,phases:structuredClone(row.phases)}));
}
