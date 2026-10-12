import { terminalNotice } from './empty-output-guard.mjs';

// 仅从 CLI 的失败结果识别账户会话额度；正文引用和普通 429/网络错误不进入此分支。
export function sessionQuotaFailure(message, statistics = {}, now = Date.now()) {
  if (typeof message !== 'string' || !/^You've hit your session limit\b/.test(message)) return undefined;
  const reset = message.match(/\bresets\s+(\d{1,2}):(\d{2})(am|pm)\s+\(([A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)\)/i);
  let expiresAt = now + 60000, resetLabel;
  if (reset) {
    const [, hour, minute, period, zone] = reset;
    if (+hour >= 1 && +hour <= 12 && +minute < 60) {
      try {
        const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        const target = `${String(+hour % 12 + (period.toLowerCase() === 'pm' ? 12 : 0)).padStart(2, '0')}:${minute}`;
        // 最多接受未来五小时的会话重置，按 IANA 时区逐分钟匹配，跨午夜和夏令时均不依赖宿主时区。
        for (let time = Math.ceil((now + 1) / 60000) * 60000; time <= now + 5 * 3600000; time += 60000) {
          if (formatter.format(time) === target) {
            expiresAt = time; resetLabel = `${target}（${zone}）`; break;
          }
        }
      } catch { /* 未知时区只短暂冷却，不猜测重置日期。 */ }
    }
  }
  const content = '[claude-code-relay:SESSION_LIMIT] 云端账户的会话额度已耗尽，网关已停止本轮及自动重试。'
    + (resetLabel ? `上游提示重置时间：${resetLabel}。重置后请手动再试。`
      : '上游未提供可确认的重置时间，网关暂时拦截新请求一分钟；请等待额度恢复后手动再试。');
  return Object.assign(new Error(content), { code: 'SESSION_LIMIT', expiresAt, statistics });
}

// 同一网关只使用一个订阅账户；冷却在认证和 CLI 启动前检查，且只保存合成提示与期限。
export function sessionQuotaGuard({ now = Date.now } = {}) {
  let blocked;
  return {
    check() {
      if (blocked?.expiresAt <= now()) blocked = undefined;
      return blocked?.content;
    },
    record(error) {
      if (error?.code !== 'SESSION_LIMIT' || !Number.isFinite(error.expiresAt)) return undefined;
      blocked = { content: error.message, expiresAt: error.expiresAt };
      return terminalNotice(error.message, error.statistics);
    },
  };
}
