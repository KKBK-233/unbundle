import { stableJson } from './context.mjs';

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
    this.outputLimitReached = false;
    this.blocks = new Map();
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

  // 流式块与聚合事件共用校验，避免重复调用或同 ID 覆盖。
  addCall(block) {
    const name = this.tools.get(block.name);
    if (!name || typeof block.id !== 'string' || !block.id || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) throw new Error('CLI 返回了无效的工具调用');
    const call = { id: block.id, type: 'function', function: { name, arguments: stableJson(block.input) } };
    if (this.calls.has(block.id) && stableJson(this.calls.get(block.id)) !== stableJson(call)) throw new Error('CLI 工具调用 ID 冲突');
    this.calls.set(block.id, call);
  }

  accept(event) {
    // 首次截断即封存本轮输出；进程停止前排队的续写事件不能再追加文本或用量。
    if (this.outputLimitReached) return;
    if (event.type === 'result') this.result = event;
    if (event.type === 'assistant') {
      // CLI 自己生成的 API 错误消息不属于模型回复，不能混入文本或历史。
      if (event.is_api_error_message) return;
      const message = event.message || {};
      this.count(message.id, message.usage);
      for (const block of message.content || []) {
        if (block.type === 'text' && !this.sawDelta) this.emit(block.text);
        if (block.type !== 'tool_use') continue;
        this.addCall(block);
      }
    }
    if (event.type !== 'stream_event') return;
    const inner = event.event || {};
    if (inner.type === 'message_start') {
      if (this.blocks.size) throw new Error('CLI 工具消息不完整');
      this.currentId = inner.message?.id;
      this.count(this.currentId, inner.message?.usage);
    }
    if (inner.type === 'content_block_start' && inner.content_block?.type === 'tool_use') {
      if (!Number.isInteger(inner.index) || this.blocks.has(inner.index)) throw new Error('CLI 工具块索引无效');
      this.blocks.set(inner.index, { ...inner.content_block, fragments: '' });
    }
    if (inner.type === 'content_block_delta' && inner.delta?.type === 'input_json_delta') {
      const block = this.blocks.get(inner.index);
      if (!block || typeof inner.delta.partial_json !== 'string') throw new Error('CLI 工具参数片段无效');
      block.fragments += inner.delta.partial_json;
    }
    if (inner.type === 'content_block_stop' && this.blocks.has(inner.index)) {
      const block = this.blocks.get(inner.index);
      this.addCall({ ...block, input: block.fragments ? JSON.parse(block.fragments) : block.input });
      this.blocks.delete(inner.index);
    }
    if (inner.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
      this.sawDelta = true;
      this.emit(inner.delta.text);
    }
    if (inner.type === 'message_delta') {
      this.count(this.currentId, inner.usage);
      if (inner.delta?.stop_reason === 'max_tokens') {
        if (this.blocks.size || this.calls.size) throw new Error('输出截断时工具消息不完整');
        this.outputLimitReached = true;
      }
      if (inner.delta?.stop_reason === 'tool_use') {
        if (this.blocks.size || !this.calls.size) throw new Error('CLI 工具消息不完整');
        this.toolEnd = true;
      }
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
      prompt_tokens_details: { cached_tokens: upstream.cache_read_input_tokens || 0, cache_write_tokens: upstream.cache_creation_input_tokens || 0 },
    } } : {}) };
  }
}
