import http from 'node:http';
import {randomBytes, createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {once} from 'node:events';

const header = '# Environment\nYou have been invoked in the following environment: \n';
const digest = value => createHash('sha256').update(value).digest('hex');
const failure = code => Object.assign(new Error(code), {code});

// 仅处理逐轮 CLI 自行追加的独立 system 环境块；客户端历史已编码为 JSON 文本，不在此改写。
export function removeCliMachineFacts(body, {cwd, model, required = true} = {}) {
  if (!Array.isArray(body?.messages)) throw failure('CLI_ENVIRONMENT_SHAPE_CHANGED');
  let replacements = 0, observation;
  const messages = body.messages.map(message => {
    if (message.role !== 'system' || !Array.isArray(message.content)) return message;
    const content = message.content.map(block => {
      if (block.type !== 'text' || typeof block.text !== 'string' || !block.text.startsWith(header)) return block;
      const text = block.text;
      const expected = [
        ` - Primary working directory: ${cwd}`,
        ' - Is a git repository: false',
        ' - Platform: linux',
      ];
      const lines = text.slice(header.length).split('\n');
      if (expected.some(line => lines.filter(value => value === line).length !== 1)) throw failure('CLI_ENVIRONMENT_SHAPE_CHANGED');
      const machine = new Set(expected);
      let shell = 0, os = 0, identity = 0;
      const kept = lines.filter(line => {
        if (machine.has(line)) return false;
        if (/^ - Shell: [^\r\n]+$/.test(line)) {shell++; return false;}
        if (/^ - OS Version: Linux [^\r\n]+$/.test(line)) {os++; return false;}
        if (line === `You are powered by the model ${model}.`) {identity++; return false;}
        return true;
      });
      // 固定版本契约不匹配时拒绝请求，避免升级后静默失效或扩大删改范围。
      if (shell !== 1 || os !== 1 || identity !== 1 || ++replacements > 1) throw failure('CLI_ENVIRONMENT_SHAPE_CHANGED');
      const replacement = kept.join('\n').trim();
      if (!replacement) throw failure('CLI_ENVIRONMENT_EMPTY');
      observation = {event:'cli_environment_adjusted', removedMachineFields:5, removedModelStatements:1,
        beforeBytes:Buffer.byteLength(text), afterBytes:Buffer.byteLength(replacement), beforeHash:digest(text), afterHash:digest(replacement)};
      return {...block, text:replacement};
    });
    return {...message, content};
  });
  if (required && replacements !== 1) throw failure('CLI_ENVIRONMENT_NOT_FOUND');
  return {body:{...body, messages}, observation};
}

// GLM 专用回环适配器：只改请求中的机器元数据，响应字节流原样转发，不接触订阅认证。
export async function createGlmEnvironmentAdapter({upstream, cwd, model, signal, onAdjustment, maxBodyBytes = 64 * 1024 * 1024, testOnly = false} = {}) {
  const target = new URL(upstream.baseUrl);
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > 256 * 1024 * 1024) throw failure('INVALID_ADAPTER_BODY_LIMIT');
  const synthetic = testOnly && target.protocol === 'http:' && target.hostname === '127.0.0.1';
  if (!synthetic && (upstream.provider !== 'glm' || target.href !== 'https://open.bigmodel.cn/api/anthropic')) throw failure('GLM_ADAPTER_UPSTREAM_INVALID');
  const token = randomBytes(32).toString('hex');
  const controllers = new Set();
  let closed = false;
  const server = http.createServer(async (req, res) => {
    const controller = new AbortController();controllers.add(controller);
    const abort = () => controller.abort();
    const disconnected = () => {if (!res.writableFinished) abort();};
    res.once('close', disconnected);
    try {
      const route = new URL(req.url, 'http://127.0.0.1');
      if (req.method !== 'POST' || !['/v1/messages', '/v1/messages/count_tokens'].includes(route.pathname)) {res.writeHead(404).end(); return;}
      if (req.headers.authorization !== `Bearer ${token}` || closed) {res.writeHead(401).end(); return;}
      if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw failure('ADAPTER_ENCODING_UNSUPPORTED');
      const chunks = [];let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > maxBodyBytes) {res.writeHead(413).end(); return;}
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const adjusted = removeCliMachineFacts(input, {cwd, model, required:route.pathname === '/v1/messages'});
      if (adjusted.observation) {try {onAdjustment?.(adjusted.observation);} catch {}}
      const headers = {'content-type':'application/json', authorization:`Bearer ${upstream.token}`};
      for (const name of ['anthropic-version', 'anthropic-beta', 'accept']) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
      const response = await fetch(target.href.replace(/\/$/, '') + route.pathname + route.search,
        {method:'POST', headers, body:JSON.stringify(adjusted.body), signal:controller.signal, redirect:'error'});
      // 不透传 hop-by-hop 或压缩长度头；fetch 已经解压响应，SSE 内容保持原样。
      const responseHeaders = {};
      for (const name of ['content-type','retry-after','request-id','x-request-id','anthropic-ratelimit-requests-remaining','anthropic-ratelimit-tokens-remaining']) {
        const value = response.headers.get(name);if (value !== null) responseHeaders[name] = value;
      }
      res.writeHead(response.status, responseHeaders);
      if (response.body) await pipeline(Readable.fromWeb(response.body), res);else res.end();
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        const code = /^CLI_ENVIRONMENT_|^ADAPTER_/.test(error.code || '') ? error.code : 'GLM_ADAPTER_FAILED';
        const contractFailure = code !== 'GLM_ADAPTER_FAILED';
        res.writeHead(contractFailure ? 400 : 502, {'content-type':'application/json'}).end(JSON.stringify({type:'error',error:{type:contractFailure ? 'invalid_request_error' : 'api_error',message:code}}));
      } else if (!res.destroyed) res.destroy();
    } finally {controllers.delete(controller);res.off('close',disconnected);}
  });
  server.requestTimeout = 60000;server.headersTimeout = 10000;server.maxConnections = 8;
  server.listen(0, '127.0.0.1');await once(server, 'listening');
  const close = async () => {
    if (closed) return;
    closed = true;signal?.removeEventListener('abort', onAbort);
    for (const controller of controllers) controller.abort();
    const done = new Promise(resolve => server.close(resolve));server.closeAllConnections();await done;
  };
  const onAbort = () => {void close();};
  signal?.addEventListener('abort', onAbort, {once:true});
  if (signal?.aborted) {await close();signal.throwIfAborted();}
  return {baseUrl:`http://127.0.0.1:${server.address().port}`,token,close};
}
