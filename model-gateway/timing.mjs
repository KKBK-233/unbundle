import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';

// 耗时仅记录固定阶段、请求关联号和数值；禁止正文、工具参数及认证信息进入日志。
export function createTiming(sink) {
  const requestId = randomUUID();
  const start = performance.now();
  const stages = {};
  let ended = false;
  const publish = record => { try { sink?.({ type: 'gateway_timing', requestId, ...record }); } catch {} };
  return {
    requestId,
    mark(stage) {
      if (ended || stage in stages) return;
      stages[stage] = Math.round(performance.now() - start);
      publish({ stage, elapsedMs: stages[stage] });
    },
    finish(outcome) {
      if (ended) return;
      ended = true;
      publish({ stage: 'finished', outcome, elapsedMs: Math.round(performance.now() - start), stages });
    },
  };
}
