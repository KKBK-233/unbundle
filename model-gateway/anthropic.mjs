import {contentBlocks, toolUses, splitToolResults} from './messages.mjs';
import {recordBashPhase} from './tool-boundary-trace.mjs';
import { gatewayError } from './gateway-error.mjs';
import { refusalDetails } from './refusal-details.mjs';
const fail = message => { throw Object.assign(new Error(message), { status: 400, code: 'UNSUPPORTED_PARAMETER' }); };

// 只校验并整理 Messages 输入，不再转为 Chat Completions 或字符串化工具参数。
export function parseMessagesRequest(body, {defaultMaxTokens=128000}={}) {
  if(!body||typeof body!=='object'||Array.isArray(body))fail('请求必须是 JSON 对象');
  const allowed=new Set(['model','system','messages','tools','tool_choice','max_tokens','stream','thinking','output_config','metadata','stop_sequences']);
  for(const key of Object.keys(body))if(body[key]!=null&&!allowed.has(key))fail(`暂不支持 Anthropic 参数 ${key}`);
  if(!Array.isArray(body.messages))fail('messages 必须是数组');
  const max_tokens=body.max_tokens===undefined?defaultMaxTokens:body.max_tokens;
  if(!Number.isInteger(max_tokens))fail('max_tokens 必须是整数');
  if(body.thinking!=null&&(body.thinking.type!=='adaptive'||Object.keys(body.thinking).some(k=>k!=='type')))fail('仅支持 adaptive thinking；CLI 不提供精确思考预算或关闭语义');
  if(body.output_config!=null&&(!body.output_config||typeof body.output_config!=='object'||Array.isArray(body.output_config)||Object.keys(body.output_config).some(k=>k!=='effort')))fail('output_config 仅支持 effort');
  const validateBlock=(block,role)=>{
    if(block?.type==='text'&&typeof block.text==='string')return;
    if(block?.type==='image'&&role==='user')return;
    if(block?.type==='tool_use'&&role==='assistant'&&typeof block.id==='string'&&typeof block.name==='string'&&block.input&&typeof block.input==='object'&&!Array.isArray(block.input)){
      recordBashPhase('desktop',block.id,block.name,block.input);return;
    }
    if(block?.type==='tool_result'&&role==='user'&&typeof block.tool_use_id==='string'){
      if(block.is_error!=null&&typeof block.is_error!=='boolean')fail('tool_result.is_error 必须是布尔值');
      if(block.content!=null&&typeof block.content!=='string'&&!Array.isArray(block.content))fail('tool_result.content 无效');
      for(const part of contentBlocks(block.content))if(!['text','image'].includes(part?.type))fail('工具结果仅支持文本和图片');
      return;
    }
    fail(`暂不支持 Anthropic 内容块 ${block?.type||'unknown'}`);
  };
  for(const message of body.messages){
    if(!message||!['system','developer','user','assistant'].includes(message.role))fail('Anthropic 消息角色无效');
    if(typeof message.content!=='string'&&!Array.isArray(message.content))fail('Anthropic 消息内容无效');
    for(const block of contentBlocks(message.content))validateBlock(block,message.role);
    if(Object.keys(message).some(k=>!['role','content'].includes(k)))fail('消息只接受 role 和 content');
  }
  if(body.tools!=null){
    if(!Array.isArray(body.tools))fail('tools 必须是数组');
    for(const tool of body.tools){
      if(!tool||typeof tool!=='object'||Array.isArray(tool))fail('工具定义无效');
      if(tool.type&&tool.type!=='custom')fail('暂不支持服务器内置工具');
      if(Object.keys(tool).some(k=>!['type','name','description','input_schema','cache_control'].includes(k)))fail('暂不支持工具属性');
    }
  }
  let system=body.system;
  if(system!=null){
    if(typeof system!=='string'&&!Array.isArray(system))fail('system 必须为文本或文本块');
    const blocks=contentBlocks(system).map(block=>{
      if(block.type!=='text'||typeof block.text!=='string')fail('system 仅支持文本');
      return {...block,text:block.text.replace(/^x-anthropic-billing-header:[^\r\n]*(?:\r?\n|$)/,'')};
    });
    system=typeof system==='string'?(blocks[0]?.text??''):blocks;
  }
  return {...body,...(system==null?{}:{system}),messages:splitToolResults(body.messages),max_tokens};
}

// 用量直接沿用 CLI 的 Anthropic 统计字段，不再生成第二套 OpenAI token 统计。
export function anthropicUsage(execution) {
  const usage=execution.usage||{};
  return {input_tokens:usage.input_tokens||0,output_tokens:usage.output_tokens||0,
    cache_read_input_tokens:usage.cache_read_input_tokens||0,cache_creation_input_tokens:usage.cache_creation_input_tokens||0};
}
export function anthropicContent(execution) {
  for(const call of toolUses(execution))recordBashPhase('wire',call.id,call.name,call.input);
  return execution.content===''?[]:contentBlocks(execution.content);
}

// 流式文本即时发送，完整工具在网关确认整条工具消息后返回，保留本地执行边界。
export function anthropicWriter(res, id, model) {
  let index = 0, openText = false, streamed = 0, started = false;
  const send = (type, value) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  const stopText = () => { if (openText) { send('content_block_stop', { index }); index++; openText = false; } };
  // 优先用真实用量起始；正文或首个心跳先到时立即开始，最终 delta 校正完整用量。
  const begin = (execution = {}) => {
    if (started) return;
    started = true;
    send('message_start', { message: { id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { ...anthropicUsage(execution), output_tokens: 0 } } });
  };
  return {
    start() {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.flushHeaders?.();
    },
    usage(execution) {
      if(started||!execution?.usage||!Number.isFinite(execution.usage.input_tokens)||execution.usage.input_tokens<0)return;
      begin(execution);
    },
    // SDK 会过滤 ping；补一个不含文字的合法内容片段，让解析后的空闲检测也收到事件。
    // 保活不增加正文、工具调用或用量，后续真实文本继续使用同一块。
    ping() {
      begin();
      send('ping', {});
      if (!openText) { send('content_block_start', { index, content_block: { type: 'text', text: '' } }); openText = true; }
      send('content_block_delta', { index, delta: { type: 'text_delta', text: '' } });
    },
    text(value) {
      if (!value) return;
      begin();
      if (!openText) { send('content_block_start', { index, content_block: { type: 'text', text: '' } }); openText = true; }
      streamed += value.length;
      send('content_block_delta', { index, delta: { type: 'text_delta', text: value } });
    },
    finish(execution, reason) {
      this.usage({usage:anthropicUsage(execution)});
      let remaining=streamed;
      for(const block of anthropicContent(execution)){
        if(block.type==='text'){
          const skip=Math.min(remaining,block.text.length);remaining-=skip;
          this.text(block.text.slice(skip));stopText();
        }else if(block.type==='tool_use'){
          stopText();
          send('content_block_start',{index,content_block:{...block,input:{}}});
          send('content_block_delta',{index,delta:{type:'input_json_delta',partial_json:JSON.stringify(block.input)}});
          send('content_block_stop',{index});index++;
        }
      }
      stopText();
      send('message_delta', { delta: { stop_reason: reason, stop_sequence: execution.stop_sequence ?? null,
        ...(reason === 'refusal' && execution.stop_details !== undefined ? { stop_details: refusalDetails(execution.stop_details) } : {}) }, usage: anthropicUsage(execution) });
      send('message_stop', {}); res.end();
    },
    error(error) {
      send('error', { error: gatewayError(error).error }); res.end();
    },
  };
}
