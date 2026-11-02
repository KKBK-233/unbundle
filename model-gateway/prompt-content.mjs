// 详细记录只用于显式开启的 GLM 实验；保留模型实际返回的片段，不推断未返回的思考。
export function createPromptContent({request, secrets=[], maxBytes=256*1024, maxEntries=256}={}) {
  const keys=secrets.filter(s=>typeof s==='string'&&s.length>=8);
  const records=[], blocks=new Map(), streamed=new Set();
  let bytes=0,droppedEntries=0,truncatedBytes=0,ordinal=0,currentId,aggregateSeen=false;
  const redact=value=>{
    let text=String(value);
    for(const key of keys){
      text=text.replaceAll(key,'[REDACTED]');
      // 日志快照或容量截断恰好落在密钥中间时，也遮住已出现的前缀。
      for(let n=Math.min(key.length-1,text.length);n>=8;n--)if(text.endsWith(key.slice(0,n))){text=text.slice(0,-n)+'[REDACTED_PARTIAL]';break;}
    }
    return text.replace(/(\bBearer\s+)[A-Za-z0-9._~+\/-]+/gi,'$1[REDACTED]')
      .replace(/("(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)"\s*:\s*")[^"]*(")/gi,'$1[REDACTED]$2')
      .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED]');
  };
  const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value)?value:undefined;
  const add=(kind,fields={})=>{
    if(records.length>=maxEntries){droppedEntries++;return undefined;}
    const item={kind,ordinal,...fields,content:''};records.push(item);return item;
  };
  const append=(item,value)=>{
    if(!item||typeof value!=='string')return;
    const raw=Buffer.from(value),remaining=Math.max(0,maxBytes-bytes),part=raw.subarray(0,remaining);
    item.content+=part.toString('utf8');bytes+=part.length;
    if(part.length<raw.length){item.truncated=true;truncatedBytes+=raw.length-part.length;}
  };
  const encode=value=>typeof value==='string'?value:JSON.stringify(value)??'';
  // 只记录本次收到的工具回执，不重复落盘整段对话历史；图片数据仅记类型。
  const messages=request?.messages||[];let lastAssistant=-1;
  for(let i=messages.length-1;i>=0;i--)if(messages[i]?.role==='assistant'){lastAssistant=i;break;}
  for(const message of messages.slice(lastAssistant+1))for(const block of Array.isArray(message?.content)?message.content:[]){
    if(block?.type!=='tool_result')continue;
    const item=add('tool_result',{toolId:safeId(block.tool_use_id),isError:block.is_error===true});
    const content=Array.isArray(block.content)?block.content.map(b=>b?.type==='text'?{type:'text',text:b.text}:{type:b?.type||'unknown',omitted:true}):block.content;
    append(item,encode(content));
  }
  return {
    accept(e){
      const inner=e?.type==='stream_event'?e.event:undefined;
      if(inner?.type==='message_start') {ordinal++;currentId=inner.message?.id;blocks.clear();if(currentId&&streamed.size<128)streamed.add(currentId);}
      else if(inner?.type==='content_block_start'){
        if(!Number.isSafeInteger(inner.index)||inner.index<0||inner.index>4096)return;
        const b=inner.content_block;let item;
        if(b?.type==='text'||b?.type==='thinking') {item=add(b.type,{source:'stream',index:inner.index});append(item,b.text??b.thinking??'');}
        if(b?.type==='tool_use'){item=add('tool_arguments',{source:'stream',index:inner.index,toolId:safeId(b.id),name:safeId(b.name)});if(b.input&&Object.keys(b.input).length)append(item,encode(b.input));}
        if(item)blocks.set(inner.index,item);
      }else if(inner?.type==='content_block_delta'){
        const d=inner.delta;
        if(d?.type==='text_delta')append(blocks.get(inner.index),d.text);
        if(d?.type==='thinking_delta')append(blocks.get(inner.index),d.thinking);
        if(d?.type==='input_json_delta')append(blocks.get(inner.index),d.partial_json);
      }else if(e?.type==='assistant'&&!streamed.has(e.message?.id)){
        aggregateSeen=true;
        for(const b of Array.isArray(e.message?.content)?e.message.content:[]){
          if(b.type==='text'||b.type==='thinking')append(add(b.type,{source:'assistant'}),b.text??b.thinking??'');
          if(b.type==='tool_use')append(add('tool_arguments',{source:'assistant',toolId:safeId(b.id),name:safeId(b.name)}),encode(b.input));
        }
        if(e.message?.id&&streamed.size<128)streamed.add(e.message.id);
      }else if(e?.type==='result'&&(e.is_error===true||!ordinal&&!aggregateSeen))append(add('cli_result',{isError:e.is_error===true}),e.result);
    },
    handoff(calls){for(const call of calls)append(add('tool_handoff',{toolId:safeId(call.id),name:safeId(call.name)}),encode(call.input));},
    snapshot(){return {maxBytes,capturedBytes:bytes,truncatedBytes,droppedEntries,records:records.map(r=>({...r,content:redact(r.content),...(r.name?{name:redact(r.name)}:{}),...(r.toolId?{toolId:redact(r.toolId)}:{})}))};},
  };
}
