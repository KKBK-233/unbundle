// 会话预算来自已启动 CLI 或持久检查点；不使用后续请求覆盖实际进程上限。
export function sessionOutputTokens(session) {
  const value = session.options?.outputTokens ?? session.outputTokens ?? session.compactSource?.outputTokens;
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function outputBudgetError(code, message) {
  return Object.assign(new Error(message), { code, status: 409, retryable: false });
}

export function assertOutputBudget(actual, requested) {
  if (!Number.isSafeInteger(actual) || actual < 1) throw outputBudgetError('SESSION_OUTPUT_BUDGET_UNKNOWN', '无法确认原 CLI 输出上限；保留原会话和检查点');
  if (requested < actual) throw outputBudgetError('SESSION_OUTPUT_BUDGET_TOO_SMALL', '请求输出上限低于原 CLI 实际上限；请使用至少 ' + actual + '，原会话未封存');
}

// 只用于恢复候选匹配；调用方仍须独立核验签名、实际预算与全部历史。
export function withoutOutputBudget(request) {
  const { max_tokens, max_completion_tokens, ...rest } = request;
  return rest;
}
