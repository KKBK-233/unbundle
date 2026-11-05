import {isServerSearch,searchProjection} from './server-search.mjs';
import {compileContext} from './context.mjs';
import {resolveEffort} from './effort.mjs';
// 在流式响应和 CLI 启动前完成预算、停止序列与上下文验证。
export function validateRequest(body,{maxOutputTokens=8192,maxImageBytes,maxTools=0}={}) {
 const fail=message=>{throw Object.assign(new Error(message),{status:400,code:'UNSUPPORTED_PARAMETER'});};
 if(!body||typeof body!=='object'||Array.isArray(body))fail('请求必须是 JSON 对象');
 const supported=new Set(['model','system','messages','tools','tool_choice','stream','max_tokens','thinking','output_config','metadata','stop_sequences']);
 for(const key of Object.keys(body))if(body[key]!=null&&!supported.has(key))fail(`暂不支持参数 ${key}`);
 resolveEffort(body);
 const stops=body.stop_sequences;
 if(stops!=null&&(!Array.isArray(stops)||stops.length>4||stops.some(s=>typeof s!=='string'||!s||s.length>4096)))fail('stop_sequences 必须是最多四个非空字符串');
 if(body.stream!=null&&typeof body.stream!=='boolean')fail('stream 必须是布尔值');
 const limit=body.max_tokens===undefined?Math.min(128000,maxOutputTokens):body.max_tokens;
 if(!Number.isInteger(limit)||limit<1||limit>maxOutputTokens)fail(`输出 token 上限必须是 1..${maxOutputTokens} 的整数，收到 ${limit}`);
 try{compileContext(isServerSearch(body)?searchProjection(body):body,{...(maxImageBytes==null?{}:{maxImageBytes}),maxTools});}catch(error){error.status=400;error.code||='INVALID_REQUEST';throw error;}
 return limit;
}
