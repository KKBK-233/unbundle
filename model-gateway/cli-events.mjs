import {recordBashPhase} from './tool-boundary-trace.mjs';
import { stableJson } from './context.mjs';

// 汇总官方 CLI 的事件：工具等待整条消息结束，用量按 message.id 去重。
export class CliEvents {
  constructor(available, onText, stops = [], { allowToolSearch = false, maxToolSearchCalls = 8 } = {}) {
    this.tools = new Map(available.map(tool => [`mcp__omp__${tool.name}`, tool.original]));
    this.onText = onText;
    this.calls = new Map();
    this.counts = new Map();
    this.text = '';
    this.sawDelta = false;
    this.toolEnd = false;
    this.outputLimitReached = false;
    this.blocks = new Map();
    this.recoveredToolStops = 0;
    this.stops = stops;
    this.pendingText = '';
    this.receivedText = false;
    this.stopSequence = undefined;
    // 只允许官方元数据搜索在 CLI 内部完成；其余内置工具仍不允许执行。
    this.allowToolSearch = allowToolSearch;
    this.maxToolSearchCalls = maxToolSearchCalls;
    this.searchCalls = new Map();
    this.messageSearchCalls = new Set();
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
    if (typeof text !== 'string' || !text || this.stopSequence !== undefined) return;
    this.receivedText = true;
    this.pendingText += text;
    // 跨片段匹配停止串，保留可能的前缀，避免停止串先泄露到 SSE。
    let first = -1, matched;
    for (const stop of this.stops) {
      const index = this.pendingText.indexOf(stop);
      if (index >= 0 && (first < 0 || index < first)) { first = index; matched = stop; }
    }
    if (first >= 0) {
      this.publishText(this.pendingText.slice(0, first));
      this.pendingText = '';
      this.stopSequence = matched;
      this.calls.clear();
      this.blocks.clear();
      return;
    }
    let keep = 0;
    for (const stop of this.stops) for (let n = 1; n < stop.length && n <= this.pendingText.length; n++) {
      if (this.pendingText.endsWith(stop.slice(0, n))) keep = Math.max(keep, n);
    }
    this.publishText(this.pendingText.slice(0, this.pendingText.length - keep));
    this.pendingText = this.pendingText.slice(this.pendingText.length - keep);
  }

  publishText(text) {
    if (!text) return;
    this.text += text;
    this.onText?.(text);
  }

  flushText() {
    if (this.stopSequence === undefined) this.publishText(this.pendingText);
    this.pendingText = '';
  }

  // 流式块与聚合事件共用校验，避免重复调用或同 ID 覆盖。
  addCall(block) {
    if (this.allowToolSearch && block.name === 'ToolSearch') {
      if (typeof block.id !== 'string' || !block.id || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) throw new Error('CLI 返回了无效的工具搜索');
      const input = stableJson(block.input);
      if (this.searchCalls.has(block.id) && this.searchCalls.get(block.id) !== input) throw new Error('CLI 工具搜索 ID 冲突');
      this.searchCalls.set(block.id, input); this.messageSearchCalls.add(block.id);
      if (this.searchCalls.size > this.maxToolSearchCalls) throw Object.assign(new Error('本轮内部工具搜索次数达到配置上限，已停止以避免重复消耗。请缩小任务后手动继续。'), {
        code: 'TOOL_SEARCH_LIMIT', status: 422, retryable: false, statistics: { ...this.usage(), usage_complete: false },
      });
      return;
    }
    const name = this.tools.get(block.name);
    if (!name || typeof block.id !== 'string' || !block.id || !block.input || typeof block.input !== 'object' || Array.isArray(block.input)) throw new Error('CLI 返回了无效的工具调用');
    recordBashPhase('cli',block.id,name,block.input);
    const call = { id: block.id, type: 'function', function: { name, arguments: stableJson(block.input) } };
    if (this.calls.has(block.id) && stableJson(this.calls.get(block.id)) !== stableJson(call)) throw new Error('CLI 工具调用 ID 冲突');
    this.calls.set(block.id, call);
  }

  // 消息结束也是工具参数的边界；兼容 CLI 未透出逐块 stop，但不猜补残缺 JSON。
  finishToolMessage() {
    const pending = [...this.blocks.values()].map(block => {
      if (!block.fragments.trim()) throw new Error('CLI 工具消息不完整：缺少完整参数');
      let input;
      try { input = JSON.parse(block.fragments); }
      catch { throw new Error('CLI 工具消息不完整：参数 JSON 未完整结束'); }
      return { ...block, input };
    });
    // 复用正常收尾的工具白名单、对象参数及同 ID 冲突校验，失败不交付部分调用。
    for (const block of pending) this.addCall(block);
    if (!this.calls.size && !this.messageSearchCalls.size) throw new Error('CLI 工具消息不完整');
    this.recoveredToolStops += pending.length;
    this.blocks.clear();
    this.toolEnd = this.calls.size > 0;
  }

  accept(event) {
    // 首次截断即封存本轮输出；进程停止前排队的续写事件不能再追加文本或用量。
    if (this.outputLimitReached || this.stopSequence !== undefined) return;
    if (event.type === 'result') this.result = event;
    if (event.type === 'assistant') {
      // CLI 自己生成的 API 错误消息不属于模型回复，不能混入文本或历史。
      if (event.is_api_error_message) return;
      const message = event.message || {};
      this.count(message.id, message.usage);
      for (const block of message.content || []) {
        if (block.type === 'text' && !this.sawDelta) this.emit(block.text);
        if (this.stopSequence !== undefined) return;
        if (block.type !== 'tool_use') continue;
        this.addCall(block);
      }
      if(message.stop_reason==='tool_use')this.finishToolMessage();
    }
    if (event.type !== 'stream_event') return;
    const inner = event.event || {};
    if (inner.type === 'message_start') {
      if (this.blocks.size) throw new Error('CLI 工具消息不完整');
      this.currentId = inner.message?.id;
      this.messageSearchCalls.clear();
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
      this.flushText();
      this.count(this.currentId, inner.usage);
      if (inner.delta?.stop_reason === 'max_tokens') {
        if (this.blocks.size || this.calls.size) throw new Error('输出截断时工具消息不完整');
        this.outputLimitReached = true;
      }
      if (inner.delta?.stop_reason === 'tool_use') this.finishToolMessage();
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
