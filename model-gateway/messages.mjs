// 内部直接使用 Anthropic 内容块；这些只读视图不创建第二份协议表示。
export const contentBlocks = content => Array.isArray(content) ? content : typeof content === 'string' ? [{type:'text',text:content}] : [];
export const toolUses = message => contentBlocks(message?.content).filter(block=>block.type==='tool_use');
export const toolReceipt = message => message?.role==='user' && Array.isArray(message.content) && message.content.length===1 && message.content[0]?.type==='tool_result' ? message.content[0] : undefined;
export const isToolReceipt = message => Boolean(toolReceipt(message));
export const isUserInput = message => message?.role==='user' && !contentBlocks(message.content).some(block=>block?.type==='tool_result');
export const messageText = message => contentBlocks(message?.content).filter(block=>block.type==='text').map(block=>block.text).join('');

// 控制提示只接受完整纯文本；图片、工具或未知块不能被投影掉后伪装成控制指令。
export function pureText(message) {
  if(typeof message?.content==='string')return message.content;
  if(!Array.isArray(message?.content)||message.content.some(block=>block?.type!=='text'||typeof block.text!=='string'))return undefined;
  return message.content.map(block=>block.text).join('\n');
}

// 将工具结果按顺序分成独立的原生 user 消息，供会话按真实工具 ID 核验收据。
export function splitToolResults(messages) {
  return messages.flatMap(message=>{
    if(message.role!=='user'||!Array.isArray(message.content)||!message.content.some(b=>b.type==='tool_result'))return [message];
    const result=[];let pending=[];
    const flush=()=>{if(pending.length){result.push({...message,content:pending});pending=[];}};
    for(const block of message.content){if(block.type==='tool_result'){flush();result.push({...message,content:[block]});}else pending.push(block);}
    flush();return result;
  });
}
