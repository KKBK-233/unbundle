import {messageText, toolUses, pureText} from './messages.mjs';
import { createHmac, randomBytes } from 'node:crypto';
import { stableJson } from './context.mjs';

export const AUTO_RESUME_PROMPT = 'Output token limit hit. Resume directly — no apology, no recap of what you were doing. Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.';
export const EMPTY_OUTPUT_NOTICE = '[claude-code-relay:EMPTY_OUTPUT_LIMIT] 网关已停止本轮：上游耗尽输出预算，但没有返回有效正文或工具调用。自动续接无法恢复被截断的思考，重复发送可能再次消耗额度。请手动缩小任务或降低思考强度后再试。';
export const AUTO_RESUME_NOTICE = '[claude-code-relay:AUTO_RESUME_BLOCKED] 网关已拦截空回复后的自动续接，未启动上游推理。请手动缩小任务或降低思考强度后再试。';

// Desktop 3.1623 的连接检测固定为单个句点、1 token、无历史或工具。
// 该请求只探测HTTP可达性，真实max_tokens空响应应原样返回，不能改成任务失败。
export function minimalConnectionProbe(body) {
  return body?.max_tokens === 1 && body.stream !== true
    && body.system == null && body.thinking == null && !body.tools?.length && body.tool_choice == null && body.output_config?.effort == null && body.stop_sequences == null
    && body.messages?.length === 1 && body.messages[0]?.role === 'user'
    && pureText(body.messages[0]) === '.';
}

// 仅认完整的已观察到的自动提示及紧邻空回复；引用、真实正文和工具调用不触发。
export function emptyAutoResume(messages) {
  const last = messages.at(-1), previous = messages.at(-2);
  if (last?.role !== 'user' || pureText(last)?.trim() !== AUTO_RESUME_PROMPT || !previous) return false;
  // 重复的固定自动提示仍需止损；普通用户前文不能冒充空助手回复。
  if (previous.role === 'user') return pureText(previous)?.trim() === AUTO_RESUME_PROMPT;
  if (previous.role !== 'assistant' || toolUses(previous)?.length) return false;
  const text = pureText(previous);
  return text !== undefined && (!text.trim() || [EMPTY_OUTPUT_NOTICE, AUTO_RESUME_NOTICE].includes(text.trim()));
}

export function terminalNotice(content, execution = {}) {
  // 保留首次失败的真实用量；拦截重发的响应不带上次用量，避免重复记账。
  return { ...execution, role: 'assistant', content, stop_reason: 'end_turn' };
}

// 只保存进程内随机密钥的指纹和期限，不保存历史、正文或可用于离线猜测的普通哈希。
export function emptyOutputGuard({ ttlMs = 3600000, capacity = 256, now = Date.now } = {}) {
  const key = randomBytes(32), failures = new Map();
  const prune = () => { for (const [id, expiry] of failures) if (expiry <= now()) failures.delete(id); };
  return {
    fingerprint(body, outputTokens) {
      const { stream, max_tokens, ...inference } = body;
      const relevant = Object.fromEntries(Object.entries(inference).filter(([, value]) => value != null));
      return createHmac('sha256', key).update(stableJson({ ...relevant, outputTokens })).digest('hex');
    },
    check(body, id) {
      prune();
      if (emptyAutoResume(body.messages)) return AUTO_RESUME_NOTICE;
      if (minimalConnectionProbe(body)) return undefined;
      return failures.has(id) ? EMPTY_OUTPUT_NOTICE : undefined;
    },
    finish(id, execution, visibleText, body) {
      if (execution.stop_reason !== 'max_tokens' || visibleText || messageText(execution).trim() || toolUses(execution)?.length) return execution;
      if (minimalConnectionProbe(body)) return execution;
      prune();
      // 有界保存失败请求；旧指纹被淘汰或重启后，自动续接仍由历史结构检测拦截。
      if (!failures.has(id) && failures.size >= capacity) failures.delete(failures.keys().next().value);
      failures.set(id, now() + ttlMs);
      return terminalNotice(EMPTY_OUTPUT_NOTICE, execution);
    },
  };
}
