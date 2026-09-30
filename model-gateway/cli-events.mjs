// 汇总官方 CLI 的事件：工具等待整条消息结束，用量按 message.id 去重。
export class CliEvents {
  constructor(available, onText) {
    this.tools = new Map(available.map(tool => [`mcp__omp__${tool.name}`, tool.original]));
    this.onText = onText;
    this.calls = new Map();
    this.counts = new Map();
    this.text = '';
    this.sawDelta = false;
    this.toolEnd = false;
  }

  count(id, usage) {
    if (!id || !usage) return;
    const previous = this.counts.get(id) || {};
    for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
      const value = usage[key];
      if (Number.isFinite(value) && value >= 0) previous[key] = Math.max(previous[key] || 0, value);
    }
    this.counts.set(id, previous);
  }

  emit(text) {
    if (typeof text !== 'string' || !text) return;
    this.text += text;
    this.onText?.(text);
  }

  accept(event) {
    if (event.type === 'result') this.result = event;
    if (event.type === 'assistant') {
      const message = event.message || {};
      this.count(message.id, message.usage);
      for (const block of message.content || []) {
        if (block.type === 'text' && !this.sawDelta) this.emit(block.text);
        if (block.type !== 'tool_use') continue;
        const name = this.tools.get(block.name);
        if (!name || !block.id || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) throw new Error('CLI 返回了无效的工具调用');
        const call = { id: block.id, type: 'function', function: { name, arguments: JSON.stringify(block.input) } };
        if (this.calls.has(block.id) && JSON.stringify(this.calls.get(block.id)) !== JSON.stringify(call)) throw new Error('CLI 工具调用 ID 冲突');
        this.calls.set(block.id, call);
      }
    }
    if (event.type !== 'stream_event') return;
    const inner = event.event || {};
    if (inner.type === 'message_start') {
      this.currentId = inner.message?.id;
      this.count(this.currentId, inner.message?.usage);
    }
    if (inner.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
      this.sawDelta = true;
      this.emit(inner.delta.text);
    }
    if (inner.type === 'message_delta') {
      this.count(this.currentId, inner.usage);
      if (inner.delta?.stop_reason === 'tool_use') this.toolEnd = true;
    }
  }

  // result 是整次运行统计；工具提前结束时改用流式用量，缺字段时不伪造零值。
  usage() {
    const source = this.result?.usage ? [this.result.usage] : [...this.counts.values()];
    const upstream = {};
    for (const usage of source) for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
      if (Number.isFinite(usage[key]) && usage[key] >= 0) upstream[key] = (upstream[key] || 0) + usage[key];
    }
    if (!Object.keys(upstream).length) return {};
    const complete = source.every(value => Number.isFinite(value.input_tokens) && Number.isFinite(value.output_tokens));
    const prompt = (upstream.input_tokens || 0) + (upstream.cache_read_input_tokens || 0) + (upstream.cache_creation_input_tokens || 0);
    return { upstream_usage: upstream, usage_complete: complete, ...(complete ? { usage: {
      prompt_tokens: prompt, completion_tokens: upstream.output_tokens, total_tokens: prompt + upstream.output_tokens,
      prompt_tokens_details: { cached_tokens: upstream.cache_read_input_tokens || 0 },
    } } : {}) };
  }
}
