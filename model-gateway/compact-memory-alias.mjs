import {sessionHistory,historyKey} from './session-history.mjs';
const header='<system-reminder>\nCodebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.\n\nContents of ';
const suffix=" (user's auto-memory, persists across conversations):\n\n";
const conversation=messages=>sessionHistory(messages).filter(m=>!['system','developer'].includes(m.role));

// 只为已成功 Write 的自动记忆快照生成精确别名；不忽略任意工具输出或命令差异。
export function compactMemoryAliases(messages,{hashKey,toolSchemas}={}){
 const source=conversation(messages),index=source.length-1,last=source[index];
 if(last?.role!=='tool'||!Array.isArray(last.content)||!last.content.length||last.content.some(b=>b.type!=='text'||typeof b.text!=='string'))return [];
 const receipts=new Map(source.filter(m=>m.role==='tool').map(m=>[m.tool_call_id,m])),writes=new Map();
 for(const message of source)for(const call of message.tool_calls||[]){
  if(call.function?.name!=='Write')continue;let args;try{args=JSON.parse(call.function.arguments);}catch{continue;}
  const file=args.file_path,content=args.content,receipt=receipts.get(call.id);
  if(typeof file!=='string'||!/(?:^|[\\/])\.claude[\\/]projects[\\/][^\\/]+[\\/]memory[\\/]MEMORY\.md$/.test(file)
    ||typeof content!=='string'||content.length>65536||!receipt||receipt.is_error===true)continue;
  writes.set(file,content);
 }
 const aliases=[];
 for(const [file,content]of [...writes].slice(-8)){
  const endings=[content,...(content.endsWith('\n')?[content.slice(0,-1)]:[])];
  for(const body of new Set(endings)){
   const extra=header+file+suffix+body+'\n</system-reminder>';
   for(const newline of ['', '\n']){
    const blocks=structuredClone(last.content);blocks[blocks.length-1].text+=newline;blocks.push({type:'text',text:extra});
    aliases.push({index,hash:historyKey({...last,content:blocks},{hashKey,toolSchemas}),extra});
   }
  }
 }
 return aliases;
}
export function compactMemoryContext(message){
 const extra=message?.content?.at?.(-1)?.text;
 return typeof extra==='string'&&extra.startsWith(header)?{role:'user',content:'Caller auto-memory snapshot attached during compaction; its file contents were already supplied by a completed Write. This is caller context, not a replacement tool result:\n'+extra}:undefined;
}

// Desktop 可在摘要前重新附加自动记忆；原文仍作为用户上下文交接，不参与摘要身份。
export function splitCompactMemory(value,summaryHeader){
 if(typeof value!=='string')return;
 if(value.startsWith(summaryHeader+'\n\n'))return{summary:value};
 if(!value.startsWith(header))return;
 const pathEnd=value.indexOf(suffix,header.length),file=value.slice(header.length,pathEnd);
 if(pathEnd<0||!/(?:^|[\\/])\.claude[\\/]projects[\\/][^\\/\r\n]+[\\/]memory[\\/]MEMORY\.md$/.test(file)||/[\r\n]/.test(file))return;
 const end=value.indexOf('\n</system-reminder>\n\n',pathEnd+suffix.length);
 if(end<0||end>65536)return;
 const at=end+'\n</system-reminder>\n\n'.length;
 if(!value.startsWith(summaryHeader+'\n\n',at))return;
 return{summary:value.slice(at),memory:value.slice(0,end+'\n</system-reminder>'.length)};
}
