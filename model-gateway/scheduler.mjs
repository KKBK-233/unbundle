// 限制实际推理进程数，额外请求先进先出排队；断线和关停会移除等待项。
export function scheduler({ maxConcurrent = 3, maxQueued = 64, queueTimeoutMs = 600000 } = {}) {
  for (const [value, min, max] of [[maxConcurrent, 1, 32], [maxQueued, 0, 256], [queueTimeoutMs, 1, 1800000]]) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('并发或队列配置无效');
  }
  let running = 0, closed = false;
  const waiting = [];
  const error = (message, code, status) => Object.assign(new Error(message), { code, status });
  function grant() {
    running++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      running--;
      if (!closed && waiting.length) {
        const next = waiting.shift();
        next.cleanup();
        next.resolve(grant());
      }
    };
  }
  return {
    get running() { return running; },
    get queued() { return waiting.length; },
    maxConcurrent, maxQueued,
    async acquire(signal) {
      signal?.throwIfAborted();
      if (closed) throw error('网关正在关闭', 'GATEWAY_CLOSING', 503);
      if (running < maxConcurrent) return grant();
      if (waiting.length >= maxQueued) throw error('请求队列已满，请稍后重试', 'QUEUE_FULL', 429);
      return new Promise((resolve, reject) => {
        const entry = { resolve, reject };
        const remove = failure => {
          const index = waiting.indexOf(entry);
          if (index < 0) return;
          waiting.splice(index, 1);
          entry.cleanup();
          reject(failure);
        };
        const abort = () => remove(signal.reason || error('请求已取消', 'REQUEST_CANCELLED', 499));
        const timer = setTimeout(() => remove(error('等待推理队列超时', 'QUEUE_TIMEOUT', 503)), queueTimeoutMs);
        entry.cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
        waiting.push(entry);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    },
    close() {
      closed = true;
      for (const entry of waiting.splice(0)) {
        entry.cleanup();
        entry.reject(error('网关正在关闭', 'GATEWAY_CLOSING', 503));
      }
    },
  };
}
