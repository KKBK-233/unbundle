import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {modelUsageDelta,nativeSummaryBody,readNativeCompactSummary} from './native-compaction.mjs';
import {SUMMARY_HEADER} from './compaction-boundary.mjs';
test('原生摘要用累计差额计账，包括缓存和多模型；计数回退拒绝',()=>{
 const before={a:{inputTokens:100,outputTokens:10,cacheReadInputTokens:20,cacheCreationInputTokens:30}};
 const after={a:{inputTokens:103,outputTokens:15,cacheReadInputTokens:27,cacheCreationInputTokens:41},b:{inputTokens:1,outputTokens:2,cacheReadInputTokens:3,cacheCreationInputTokens:4}};
 assert.deepEqual(modelUsageDelta(before,after),{input_tokens:4,output_tokens:7,cache_read_input_tokens:10,cache_creation_input_tokens:15});
 assert.equal(modelUsageDelta(after,before),undefined);assert.equal(modelUsageDelta(undefined,after),undefined);
});
test('原生包装仅去掉官方附录，摘要中的标签和原始数据保留',()=>{
 const file='/isolated/native.jsonl',body='Actual <analysis>data</analysis> and <summary>data</summary>';
 const wrapper=SUMMARY_HEADER+'\n\n<tools-used-before-summary>Bash</tools-used-before-summary>\nSummary:\n'+body+'\n\nIf you need specific details from before compaction (like exact code snippets, error messages, or content you generated), read the full transcript at: '+file+'\nContinue the conversation.';
 assert.equal(nativeSummaryBody(wrapper,file),body);assert.throws(()=>nativeSummaryBody('ordinary summary',file),{code:'NATIVE_COMPACT_SUMMARY_INVALID'});
});
test('只读取本次落盘边界后的原生摘要，不能误用上次摘要',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'native-compact-')),id=randomUUID(),boundary=randomUUID(),folder=path.join(home,'.claude','projects','synthetic');
 try{await fs.mkdir(folder,{recursive:true});const file=path.join(folder,id+'.jsonl');const wrap=x=>({type:'user',isCompactSummary:true,message:{content:SUMMARY_HEADER+'\n\nSummary:\n'+x}});
 await fs.writeFile(file,[{type:'system',subtype:'compact_boundary',uuid:randomUUID()},wrap('OLD'),{type:'system',subtype:'compact_boundary',uuid:boundary},wrap('CURRENT')].map(JSON.stringify).join('\n'));
 const result=await readNativeCompactSummary({nativeSessionId:id,options:{home}},{uuid:boundary});assert.equal(result.body,'CURRENT');
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
