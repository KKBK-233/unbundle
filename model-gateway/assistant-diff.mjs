import { createHmac, randomBytes } from 'node:crypto';
import { stableJson } from './context.mjs';

const key=randomBytes(32);
const without=(object,keys)=>Object.fromEntries(Object.entries(object||{}).filter(([name])=>!keys.includes(name)));
// 仅在内存保存带密钥的字段摘要；日志只写固定差异类别与计数，不写摘要、正文或参数。
export function assistantFingerprint(message,{hashKey=key}={}) {
  const digest=value=>createHmac('sha256',hashKey).update(stableJson(value)??'undefined').digest('hex');
  const content=message?.content;
  const texts=typeof content==='string'?[content]:Array.isArray(content)&&content.every(b=>b?.type==='text'&&typeof b.text==='string')
    ?content.map(b=>b.text):content==null?['']:undefined;
  const normalize=text=>text.replace(/\r\n/g,'\n').trim();
  const calls=Array.isArray(message?.tool_calls)?message.tool_calls:[];
  return {role:digest(message?.role),content:digest(typeof content==='string'?normalize(content)||null:content||null),
    textForms:texts?[...new Set([texts.join(''),texts.join('\n')].map(value=>digest(normalize(value)||null)))]:[],
    textBytes:texts?Buffer.byteLength(texts.join('')):null,
    extra:digest(without(message,['role','content','tool_calls'])),count:calls.length,truncated:calls.length>256,
    calls:calls.slice(0,256).map(call=>{
      const raw=call?.function?.arguments;let args,valid=false;
      try {args=JSON.parse(raw);valid=true;} catch {args=raw;}
      return {id:digest(call?.id),name:digest(call?.function?.name),args:digest(args),raw:digest(raw),valid,
        argKeyCount:valid&&args&&typeof args==='object'&&!Array.isArray(args)?Object.keys(args).length:null,
        extra:digest({call:without(call,['id','function']),function:without(call?.function,['name','arguments'])})};
    })};
}

export function assistantDifference(expected,message,options) {
  if(!expected)return {differences:['detail_unavailable'],classification:'undetermined'};
  const actual=assistantFingerprint(message,options),differences=[];
  if(expected.truncated||actual.truncated)return {differences:['diagnostic_truncated'],classification:'undetermined'};
  if(expected.role!==actual.role)differences.push('role');
  if(expected.content!==actual.content) differences.push(expected.textForms.some(value=>actual.textForms.includes(value))?'text_representation':'text_content');
  if(expected.extra!==actual.extra)differences.push('assistant_metadata');
  if(expected.count!==actual.count)differences.push('tool_count');
  const left=new Map(expected.calls.map(call=>[call.id,call])),right=new Map(actual.calls.map(call=>[call.id,call]));
  const sameIds=left.size===expected.count&&right.size===actual.count&&left.size===right.size&&[...left.keys()].every(id=>right.has(id));
  if(!sameIds)differences.push('tool_ids_or_duplicates');
  else {
    if(expected.calls.some((call,index)=>call.id!==actual.calls[index].id))differences.push('tool_order');
    for(const [id,a]of left){const b=right.get(id);
      if(a.name!==b.name)differences.push('tool_name');
      if(a.args!==b.args){differences.push('tool_arguments');if(a.argKeyCount!==b.argKeyCount)differences.push('argument_key_count');}
      else if(a.raw!==b.raw)differences.push('argument_representation');
      if(!a.valid||!b.valid)differences.push('invalid_arguments');
      if(a.extra!==b.extra)differences.push('tool_metadata');
    }
  }
  const unique=[...new Set(differences)];
  const representation=new Set(['text_representation','tool_order','argument_representation']);
  return {differences:unique.length?unique:['unclassified'],classification:unique.length&&unique.every(value=>representation.has(value))
    ?'representation_candidate':'requires_review',expectedToolCount:expected.count,actualToolCount:actual.count,
    expectedTextBytes:expected.textBytes,actualTextBytes:actual.textBytes};
}
