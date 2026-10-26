import {takeWireProbe} from './wire-probe.mjs';
import {createAnomalyCapture} from './anomaly-capture.mjs';

// 三种执行路线共用每轮取证边界；只保存白名单元数据，失败不影响请求且最多等待 250 毫秒。
export function requestProbes({requestId,anomalyDir,context,log}={}) {
  const probes=[takeWireProbe(requestId),createAnomalyCapture({directory:anomalyDir,requestId,context,...(log?{log}:{})})].filter(Boolean);
  let finished;
  const call=(method,...args)=>{
    const pending=[];
    for(const probe of probes)try{
      const result=probe[method](...args);
      if(result?.then)pending.push(Promise.resolve(result).catch(()=>{}));
    }catch { /* 取证失败不改变推理及清理结果。 */ }
    return pending.length?Promise.all(pending):undefined;
  };
  return {
    accept(event){if(!finished)call('accept',event);},
    output(text){if(!finished)call('output',text);},
    finish(outcome){
      if(finished)return finished;
      const pending=call('finish',outcome);
      finished=(async()=>{
        if(!pending)return;
        let timer;
        try{await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(resolve,250);})]);}
        finally{clearTimeout(timer);}
      })();
      return finished;
    },
  };
}
