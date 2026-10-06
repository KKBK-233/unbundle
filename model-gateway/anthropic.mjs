import { gatewayError } from './gateway-error.mjs';

const fail = message => { throw Object.assign(new Error(message), { status: 400, code: 'UNSUPPORTED_PARAMETER' }); };

// Anthropic 文本与工具协议转换，指令角色保持原位，工具执行仍归调用方。
export function fromAnthropic(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('请求必须是 JSON 对象');
  const allowed = new Set(['model', 'system', 'messages', 'tools', 'tool_choice', 'max_tokens', 'stream', 'thinking', 'output_config', 'metadata', 'stop_sequences']);
  for (const key of Object.keys(body)) if (body[key] != null && !allowed.has(key)) fail(`暂不支持 Anthropic 参数 ${key}`);
  if (!Array.isArray(body.messages)) fail('messages 必须是数组');
  if (!Number.isInteger(body.max_tokens)) fail('max_tokens 必须是整数');
  const messages = [];
  if (body.system != null) {
    // 对齐原有转换路径：前端生成的 billing 提示行属于传输元数据，不是调用方规则。
    // 仅移除每个系统文本块开头的该行，普通正文内引用的相同文字原样保留。
    const blocks = typeof body.system === 'string' ? [body.system] : Array.isArray(body.system) ? body.system.map(block => text([block])) : [text(body.system)];
    const instruction = blocks.map(value => value.replace(/^x-anthropic-billing-header:[^\r\n]*(?:\r?\n|$)/, '')).filter(value => value.length).join('\n');
    if (instruction) messages.push({ role: 'system', content: instruction });
  }
  for (const message of body.messages) {
    if (!message || !['system', 'developer', 'user', 'assistant'].includes(message.role)) fail('Anthropic 消息角色无效');
    if (typeof message.content === 'string') { messages.push({ role: message.role, content: message.content }); continue; }
    if (!Array.isArray(message.content)) fail('Anthropic 消息内容无效');
    if (['system', 'developer'].includes(message.role)) { messages.push({ role: message.role, content: text(message.content) }); continue; }
    // 无图片时仍输出合并后的纯文本，保持既有缓存前缀；含图片才改用块数组。
    let pendingText = [], pendingBlocks = [], calls = [], hasImage = false;
    const flush = () => {
      if (pendingBlocks.length || calls.length) messages.push({ role: message.role,
        content: hasImage ? pendingBlocks : (pendingText.join('\n') || null),
        ...(calls.length ? { tool_calls: calls } : {}) });
      pendingText = []; pendingBlocks = []; calls = []; hasImage = false;
    };
    for (const block of message.content) {
      if (block?.type === 'text' && typeof block.text === 'string') { pendingText.push(block.text); pendingBlocks.push({ type: 'text', text: block.text }); }
      // 图片原样透传，由 compileContext 统一校验来源、类型、体积与角色。
      else if (block?.type === 'image') { hasImage = true; pendingBlocks.push(block); }
      else if (block?.type === 'tool_use' && message.role === 'assistant') {
        if (typeof block.id !== 'string' || typeof block.name !== 'string' || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) fail('tool_use 无效');
        calls.push({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input) } });
      } else if (block?.type === 'tool_result' && message.role === 'user') {
        if (typeof block.tool_use_id !== 'string') fail('tool_result 缺少 tool_use_id');
        flush();
        // 工具截图与读图结果保留图片块及调用 ID，图片不能被序列化进普通文本。
        const hasImages = Array.isArray(block.content) && block.content.some(item => item?.type === 'image');
        const content = hasImages ? block.content : text(block.content ?? '');
        messages.push({ role: 'tool', tool_call_id: block.tool_use_id,
          content: block.is_error && !hasImages ? JSON.stringify({ is_error: true, content }) : content,
          ...(hasImages && block.is_error ? { is_error: true } : {}) });
      } else fail(`暂不支持 Anthropic 内容块 ${block?.type || 'unknown'}`);
    }
    flush();
  }
  const request = { model: body.model, messages, max_tokens: body.max_tokens, stream: body.stream };
  if (body.stop_sequences != null) request.stop = body.stop_sequences;
  if (body.tools != null) {
    if (!Array.isArray(body.tools)) fail('tools 必须是数组');
    request.tools = body.tools.map(tool => {
      if (!tool || typeof tool !== 'object' || Array.isArray(tool)) fail('工具定义无效');
      if (tool.type && tool.type !== 'custom') fail('暂不支持服务器内置工具');
      for (const key of Object.keys(tool)) if (!['name', 'description', 'input_schema', 'type', 'cache_control'].includes(key)) fail(`暂不支持工具属性 ${key}`);
      return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } };
    });
  }
  if (body.tool_choice != null) {
    if (!['auto', 'none'].includes(body.tool_choice.type) || body.tool_choice.disable_parallel_tool_use) fail('仅支持自动或禁用工具选择');
    request.tool_choice = body.tool_choice.type;
  }
  if (body.output_config != null) {
    if (typeof body.output_config !== 'object' || Array.isArray(body.output_config)) fail('output_config 无效');
    for (const key of Object.keys(body.output_config)) if (key !== 'effort') fail(`暂不支持 output_config.${key}`);
    if (body.output_config.effort != null) request.reasoning_effort = body.output_config.effort;
  }
  if (body.thinking != null) {
    // CLI 可接收 effort，但无法兑现精确思考预算或强制关闭；不能悄悄换成 low。
    if (body.thinking.type !== 'adaptive') fail('仅支持 adaptive thinking；CLI 不提供精确思考预算或关闭语义');
    for (const key of Object.keys(body.thinking)) if (key !== 'type') fail(`暂不支持 thinking.${key}`);
  }
  return request;
}

function text(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content) || content.some(block => block?.type !== 'text' || typeof block.text !== 'string')) fail('第一版只支持文本内容');
  return content.map(block => block.text).join('\n');
}

// 优先使用 CLI 原始三桶用量，避免将缓存写入或读取重复计入普通输入。
export function anthropicUsage(execution) {
  const usage = execution.upstream_usage;
  if (usage) return { input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0,
    cache_read_input_tokens: usage.cache_read_input_tokens || 0, cache_creation_input_tokens: usage.cache_creation_input_tokens || 0 };
  const cached = execution.usage?.prompt_tokens_details?.cached_tokens || 0;
  const written = execution.usage?.prompt_tokens_details?.cache_write_tokens || 0;
  return { input_tokens: Math.max(0, (execution.usage?.prompt_tokens || 0) - cached - written), output_tokens: execution.usage?.completion_tokens || 0,
    cache_read_input_tokens: cached, cache_creation_input_tokens: written };
}

export function anthropicContent(execution) {
  return [...(execution.content ? [{ type: 'text', text: execution.content }] : []),
    ...(execution.tool_calls || []).map(call => ({ type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) }))];
}

// 流式文本即时发送，完整工具在网关确认整条工具消息后返回，保留本地执行边界。
export function anthropicWriter(res, id, model) {
  let index = 0, openText = false, streamed = false;
  const send = (type, value) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  const stopText = () => { if (openText) { send('content_block_stop', { index }); index++; openText = false; } };
  return {
    start() {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      send('message_start', { message: { id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
    },
    // SDK 会过滤 ping；补一个不含文字的合法内容片段，让解析后的空闲检测也收到事件。
    // 保活不增加正文、工具调用或用量，后续真实文本继续使用同一块。
    ping() {
      send('ping', {});
      if (!openText) { send('content_block_start', { index, content_block: { type: 'text', text: '' } }); openText = true; }
      send('content_block_delta', { index, delta: { type: 'text_delta', text: '' } });
    },
    text(value) {
      if (!value) return;
      if (!openText) { send('content_block_start', { index, content_block: { type: 'text', text: '' } }); openText = true; }
      streamed = true;
      send('content_block_delta', { index, delta: { type: 'text_delta', text: value } });
    },
    finish(execution, reason) {
      if (!streamed && execution.content) this.text(execution.content);
      stopText();
      for (const block of anthropicContent({ tool_calls: execution.tool_calls })) {
        send('content_block_start', { index, content_block: { ...block, input: {} } });
        send('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
        send('content_block_stop', { index }); index++;
      }
      send('message_delta', { delta: { stop_reason: reason, stop_sequence: execution.stop_sequence ?? null }, usage: anthropicUsage(execution) });
      send('message_stop', {}); res.end();
    },
    error(error) { send('error', { error: gatewayError(error).error }); res.end(); },
  };
}
