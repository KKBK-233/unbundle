// 完整接收请求后才允许启动模型；上传停顿单独超时，避免一直等 Node 默认的五分钟。
export function readRequestBody(req, { idleMs, totalMs, maxBytes, reserve, signal, onProgress }) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0, idleTimer, totalTimer, done = false;
    const cleanup = () => {
      clearTimeout(idleTimer); clearTimeout(totalTimer);
      req.off('data', data); req.off('end', end); req.off('aborted', aborted); req.off('error', fail);
      signal?.removeEventListener('abort', aborted);
    };
    const finish = (error) => {
      if (done) return;
      done = true; cleanup();
      if (error) { chunks.length = 0; req.pause(); reject(error); }
      else { const body = Buffer.concat(chunks); chunks.length = 0; resolve(body); }
    };
    const fail = error => finish(error);
    const aborted = () => fail(Object.assign(new Error('上传期间连接已断开'), { code: 'REQUEST_BODY_ABORTED' }));
    const timeout = code => fail(Object.assign(new Error(code === 'REQUEST_BODY_IDLE_TIMEOUT'
      ? '请求上传停止进展，尚未启动模型；请检查本地代理和隧道连接'
      : '请求上传超过总时限，尚未启动模型'), { status: 408, code }));
    const refresh = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => timeout('REQUEST_BODY_IDLE_TIMEOUT'), idleMs); };
    const data = chunk => {
      try {
        bytes += chunk.length;
        onProgress?.(bytes);
        if (bytes > maxBytes) throw Object.assign(new Error('请求体超过字节上限'), { status: 413, code: 'REQUEST_TOO_LARGE' });
        reserve(chunk.length);
        chunks.push(chunk); refresh();
      } catch (error) { fail(error); }
    };
    const end = () => finish();
    if (signal?.aborted || req.aborted) { aborted(); return; }
    req.on('data', data); req.once('end', end); req.once('aborted', aborted); req.once('error', fail);
    signal?.addEventListener('abort', aborted, { once: true });
    refresh(); totalTimer = setTimeout(() => timeout('REQUEST_BODY_TIMEOUT'), totalMs);
  });
}
