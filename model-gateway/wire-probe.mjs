import { createHmac, randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const tags = ['<thinking>', '</thinking>'];
const blockTypes = new Set(['thinking', 'redacted_thinking', 'text', 'tool_use']);
let armedRequests = 0;

// 每轮密钥只存在内存；固定长度指纹仅用于本轮比较，不能跨请求猜测正文。
function channel(key) {
  const raw = createHmac('sha256', key), normalized = createHmac('sha256', key);
  let pending = '', rawPending = '', chars = 0, bytes = 0, normalizedBytes = 0, fragments = 0;
  let scannedChars = 0, openTags = 0, closeTags = 0, firstTagCharOffset = null;
  const hashRaw = (value, final = false) => {
    let text = rawPending + value;
    rawPending = '';
    if (!final && /[\uD800-\uDBFF]$/.test(text)) { rawPending = text.slice(-1); text = text.slice(0, -1); }
    bytes += Buffer.byteLength(text); raw.update(text);
  };
  // 仅暂存不超过一个标签长度的尾部，支持标签与 Unicode 字符跨 delta 分片。
  const scan = (value, final = false) => {
    const text = pending + value;
    pending = '';
    const clean = [];
    const flush = () => {
      const chunk = clean.join(''); normalizedBytes += Buffer.byteLength(chunk); normalized.update(chunk); clean.length = 0;
    };
    let i = 0;
    while (i < text.length) {
      const candidate = text.slice(i, i + 11).toLowerCase();
      const tag = tags.find(value => candidate.startsWith(value));
      if (tag) {
        if (firstTagCharOffset === null) firstTagCharOffset = scannedChars;
        if (tag === tags[0]) openTags++; else closeTags++;
        i += tag.length; scannedChars += tag.length; continue;
      }
      if (!final && (tags.some(value => value.startsWith(candidate)) || (i === text.length - 1 && /[\uD800-\uDBFF]/.test(text[i])))) {
        pending = text.slice(i); break;
      }
      const point = String.fromCodePoint(text.codePointAt(i));
      if (!/\s/u.test(point)) clean.push(point);
      if (clean.length >= 4096) flush();
      i += point.length; scannedChars += point.length;
    }
    flush();
  };
  return {
    update(value) {
      if (typeof value !== 'string') return false;
      const previous = openTags + closeTags;
      fragments++; chars += value.length; hashRaw(value); scan(value);
      return openTags + closeTags > previous;
    },
    finish() {
      hashRaw('', true); scan('', true);
      return { chars, bytes, fragments, normalizedBytes, openTags, closeTags, firstTagCharOffset,
        hmacSha256: raw.digest('hex'), normalizedHmacSha256: normalized.digest('hex') };
    },
  };
}

// 只接受白名单元数据；不保存全文、签名、消息 ID、工具参数或客户端输入。
export function createWireProbe({ requestId, sink = value => console.error(JSON.stringify(value)) } = {}) {
  const key = randomBytes(32), started = performance.now();
  const channels = Object.fromEntries(['streamText', 'streamThinking', 'downstreamText'].map(name => [name, channel(key)]));
  const blocks = [], current = new Map();
  let messageOrdinal = 0, droppedBlocks = 0, signatureDeltas = 0, assistantTextBlocks = 0, assistantThinkingBlocks = 0;
  let signatureChars = 0, assistantSignatureBlocks = 0, assistantSignatureChars = 0;
  let typeMismatches = 0, orphanDeltas = 0, ended = false, tagReported = false, resultSeen = false;
  const publish = data => { try { sink({ type: 'wire_probe', requestId, ...data }); } catch {} };
  // 同一请求只报告首次正文标签；聚合事件和 result 兜底输出也覆盖，避免只观察流式片段。
  const reportTag = data => {
    if (tagReported) return;
    tagReported = true;
    publish({ event: 'thinking_tag_in_text', elapsedMs: Math.round(performance.now() - started), ...data });
  };
  return {
    accept(event) {
      if (ended) return;
      if (event?.type === 'assistant') {
        for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
          if (block?.type === 'text') {
            assistantTextBlocks++;
            if (typeof block.text === 'string' && /<\/?thinking>/i.test(block.text)) reportTag({ channel: 'assistant_text' });
          }
          if (block?.type === 'thinking') assistantThinkingBlocks++;
          if (block?.type === 'thinking' && typeof block.signature === 'string' && block.signature) {
            assistantSignatureBlocks++; assistantSignatureChars += block.signature.length;
          }
        }
      }
      if (event?.type === 'result') resultSeen = true;
      const inner = event?.type === 'stream_event' ? event.event : undefined;
      if (!inner) return;
      if (inner.type === 'message_start') { messageOrdinal++; current.clear(); }
      const index = Number.isSafeInteger(inner.index) && inner.index >= 0 && inner.index <= 4096 ? inner.index : null;
      if (inner.type === 'content_block_start' && index !== null) {
        const block = { messageOrdinal, index, blockType: blockTypes.has(inner.content_block?.type) ? inner.content_block.type : 'other',
          textDeltas: 0, thinkingDeltas: 0, signatureDeltas: 0, signatureChars: 0, stopped: false };
        if (blocks.length < 64) { blocks.push(block); current.set(index, block); } else droppedBlocks++;
      }
      if (inner.type === 'content_block_stop') { const block = current.get(index); if (block) block.stopped = true; }
      if (inner.type !== 'content_block_delta') return;
      const delta = inner.delta || {}, block = current.get(index);
      const mismatch = expected => {
        if (!block || block.blockType === expected) return;
        typeMismatches++;
        publish({ event: 'block_delta_type_mismatch', elapsedMs: Math.round(performance.now() - started),
          messageOrdinal, index, blockType: block.blockType, deltaType: delta.type });
      };
      if (delta.type === 'signature_delta') {
        const chars = typeof delta.signature === 'string' ? delta.signature.length : 0;
        signatureDeltas++; signatureChars += chars;
        if (block) { block.signatureDeltas++; block.signatureChars += chars; }
        mismatch('thinking'); return;
      }
      if (!['text_delta', 'thinking_delta'].includes(delta.type)) return;
      const thinking = delta.type === 'thinking_delta';
      if (block) {
        block[thinking ? 'thinkingDeltas' : 'textDeltas']++;
      } else orphanDeltas++;
      mismatch(thinking ? 'thinking' : 'text');
      const tag = channels[thinking ? 'streamThinking' : 'streamText'].update(thinking ? delta.thinking : delta.text);
      if (tag && !thinking) reportTag({ channel: 'stream_text', messageOrdinal, index, blockType: block?.blockType || 'unknown', deltaType: 'text_delta' });
    },
    output(text) { if (!ended && channels.downstreamText.update(text)) reportTag({ channel: 'downstream_text' }); },
    finish(outcome) {
      if (ended) return;
      ended = true;
      const summaries = Object.fromEntries(Object.entries(channels).map(([name, value]) => [name, value.finish()]));
      const equal = (a, b) => summaries[a].normalizedBytes > 0 && summaries[b].normalizedBytes > 0
        && summaries[a].normalizedHmacSha256 === summaries[b].normalizedHmacSha256;
      publish({ event: 'summary', outcome: ['completed', 'cancelled', 'timeout', 'error'].includes(outcome) ? outcome : 'error',
        elapsedMs: Math.round(performance.now() - started), fingerprint: 'per-request-hmac-sha256',
        normalization: 'remove-thinking-tags-and-whitespace', channels: summaries, blocks, droppedBlocks,
        signatureDeltas, signatureChars, assistantSignatureBlocks, assistantSignatureChars,
        assistantTextBlocks, assistantThinkingBlocks, typeMismatches, orphanDeltas, resultSeen,
        downstreamMatchesStreamText: equal('downstreamText', 'streamText'),
        downstreamMatchesStreamThinking: equal('downstreamText', 'streamThinking') });
      key.fill(0); current.clear();
    },
  };
}

// 默认关闭；显式绝对截止时间防止服务重启延长采集，最多观察后续十轮自然请求。
export function takeWireProbe(requestId) {
  const until = Number(process.env.GATEWAY_WIRE_PROBE_UNTIL_MS);
  const limit = Number(process.env.GATEWAY_WIRE_PROBE_REQUESTS || 3);
  if (!Number.isSafeInteger(until) || Date.now() >= until || until - Date.now() > 3600000
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 10 || armedRequests >= limit) return;
  armedRequests++;
  return createWireProbe({ requestId });
}
