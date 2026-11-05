// 只开放桌面已观察到的服务端搜索协议；其他内置工具和混合调用仍显式拒绝。
const fail = message => { throw Object.assign(new Error(message), {status:400,code:'UNSUPPORTED_PARAMETER',retryable:false}); };
export const isServerSearch = body => Array.isArray(body?.tools) && body.tools.some(t=>t?.type==='web_search_20250305');
export function validateSearchTools(body) {
 if(body.tools.length!==1)fail('服务端搜索必须单独调用，不能混合客户端工具');
 const tool=body.tools[0];
 if(tool.name!=='web_search'||Object.keys(tool).some(k=>!['type','name','max_uses','allowed_domains','blocked_domains','user_location','search_profile'].includes(k)))fail('服务端搜索定义包含不支持的属性');
 if(tool.max_uses!=null&&(!Number.isInteger(tool.max_uses)||tool.max_uses<1||tool.max_uses>100))fail('搜索 max_uses 必须为 1..100');
 if(tool.allowed_domains!=null&&tool.blocked_domains!=null)fail('搜索域名白名单与黑名单不能同时设置');
 for(const key of ['allowed_domains','blocked_domains'])if(tool[key]!=null&&(!Array.isArray(tool[key])||tool[key].length>100||tool[key].some(d=>typeof d!=='string'||!d||d.length>253||/[\s\x00-\x1f]/.test(d))))fail('搜索域名过滤格式无效');
 if(tool.search_profile!=null&&(typeof tool.search_profile!=='string'||!/^[a-z][a-z0-9_]{0,63}$/.test(tool.search_profile)))fail('搜索 profile 无效');
 if(tool.user_location!=null){const l=tool.user_location;if(!l||l.type!=='approximate'||Object.keys(l).some(k=>!['type','city','region','country','timezone'].includes(k))||Object.values(l).some(v=>typeof v!=='string'||v.length>256))fail('搜索位置格式无效');}
 const choice=body.tool_choice;
 if(choice!=null&&(!['auto','any','tool'].includes(choice.type)||(choice.type==='tool'?choice.name!=='web_search':choice.name!=null)||Object.keys(choice).some(k=>!['type','name','disable_parallel_tool_use'].includes(k))||choice.disable_parallel_tool_use!=null&&typeof choice.disable_parallel_tool_use!=='boolean'))fail('搜索工具选择无效');
 if(!Array.isArray(body.messages)||body.messages.some(m=>!['user','assistant'].includes(m?.role)))fail('搜索辅助请求只接受 user/assistant 历史');
 if(body.stop_sequences?.length)fail('搜索辅助请求暂不支持 stop_sequences');
}
export function validateSearchBlock(b) {
 if(b?.type==='server_tool_use')return typeof b.id==='string'&&b.name==='web_search'&&b.input&&typeof b.input.query==='string';
 if(b?.type==='web_search_tool_result')return typeof b.tool_use_id==='string'&&(Array.isArray(b.content)?b.content.every(r=>r?.type==='web_search_result'&&typeof r.url==='string'&&typeof r.title==='string'&&typeof r.encrypted_content==='string'):b.content?.type==='web_search_tool_result_error'&&typeof b.content.error_code==='string');
 return false;
}
// 仅供提示词编译和通用参数验证；真实搜索历史单独原样交给 CLI 请求入口。
export function searchProjection(body) {
 return {...body,tools:[],tool_choice:{type:'auto'},thinking:{type:'adaptive'},messages:[{role:'user',content:'Perform the caller web search using the supplied server-side web_search tool. Return the search results and a brief answer.'}]};
}

// 搜索事件保留引用密文和来源；不从自然语言摘要重新构造结果。
export class ServerSearchEvents {
 constructor(request={}){this.historyIds=new Set((request.messages||[]).flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(b=>b.type==='server_tool_use').map(b=>b.id));this.maxUses=request.tools?.[0]?.max_uses;this.blocks=new Map();this.content=[];this.usage={};this.complete=false;this.stopped=false;}
 accept(event){
  if(this.complete)return;
  if(event.type==='result'){this.result=event;return;}
  if(event.type!=='stream_event')return;
  const e=event.event;
  if(e.type==='message_start'){
   if(this.id)throw new Error('搜索请求出现额外上游消息，未合并响应');
   this.id=e.message?.id;this.usage={...e.message?.usage};
  }else if(e.type==='content_block_start'){
   if(!Number.isInteger(e.index)||e.index<0||this.blocks.has(e.index))throw new Error('搜索块索引无效');
   this.blocks.set(e.index,{block:structuredClone(e.content_block),fragments:'',closed:false});
  }else if(e.type==='content_block_delta'){
   const b=this.blocks.get(e.index);if(!b||b.closed)throw new Error('搜索事件缺少开始块');
   if(e.delta?.type==='text_delta')b.block.text=(b.block.text||'')+e.delta.text;
   else if(e.delta?.type==='input_json_delta')b.fragments+=e.delta.partial_json;
   else if(e.delta?.type==='citations_delta')(b.block.citations??=[]).push(e.delta.citation);
  }else if(e.type==='content_block_stop'){
   const b=this.blocks.get(e.index);if(!b||b.closed)throw new Error('搜索事件重复结束');
   if(b.fragments)b.block.input=JSON.parse(b.fragments);
   if(['server_tool_use','web_search_tool_result'].includes(b.block.type)&&!validateSearchBlock(b.block))throw new Error('服务端搜索结果结构无效');
   if(!['text','thinking','redacted_thinking','server_tool_use','web_search_tool_result'].includes(b.block.type))throw new Error('搜索返回了未声明的工具或内容块');
   b.closed=true;
  }else if(e.type==='message_delta'){
   this.stopReason=e.delta?.stop_reason;this.stopDetails=e.delta?.stop_details;this.usage={...this.usage,...e.usage};this.stopped=true;
  }else if(e.type==='message_stop'){
   if(!this.id||!this.stopped||[...this.blocks.values()].some(b=>!b.closed)||!['end_turn','pause_turn','max_tokens','refusal'].includes(this.stopReason))throw new Error('搜索响应未完整结束');
   this.content=[...this.blocks.entries()].sort((a,b)=>a[0]-b[0]).map(([,b])=>b.block).filter(b=>!['thinking','redacted_thinking'].includes(b.type));
   const calls=this.content.filter(b=>b.type==='server_tool_use');
   const ids=new Set(this.historyIds);
   for(const call of calls){if(ids.has(call.id))throw new Error('搜索调用 ID 重复');ids.add(call.id);}
   if(this.maxUses!=null&&calls.length>this.maxUses)throw new Error('搜索调用超过 max_uses');
   const results=this.content.filter(b=>b.type==='web_search_tool_result');
   if(new Set(results.map(b=>b.tool_use_id)).size!==results.length)throw new Error('搜索结果 ID 重复');
   if(this.content.some(b=>b.type==='web_search_tool_result'&&!ids.has(b.tool_use_id)))throw new Error('搜索结果缺少对应调用');
   this.complete=true;
  }
 }
 execution(){return {role:'assistant',content:this.content,usage:this.usage,stop_reason:this.stopReason,...this.stopDetails&&{stop_details:this.stopDetails}};}
}
