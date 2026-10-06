# 中继错误处理

明确的账户会话额度耗尽沿用 0.11.12 的终止提示和冷却，详见[额度止损](session-quota-guard.md)。0.11.13 修正其余 HTTP/SSE 分类差异。

| 情况 | HTTP 状态 | 错误类型 | 诊断码 |
| --- | --- | --- | --- |
| 中继访问令牌无效 | 401 | authentication_error | INVALID_GATEWAY_TOKEN |
| 云端已确认未登录 | 401 | authentication_error | AUTH_REQUIRED |
| 云端认证检查失败，尚不能确认登录状态 | 503 | api_error | AUTH_CHECK_FAILED |
| 无效 JSON / 未知模型 / 不支持的参数 | 400 | invalid_request_error | INVALID_JSON / UNKNOWN_MODEL / UNSUPPORTED_PARAMETER |
| 浏览器跨域请求 | 403 | permission_error | ORIGIN_REJECTED |
| 请求体超限 | 413 | request_too_large | REQUEST_TOO_LARGE |
| 队列或容量超额 | 429 | rate_limit_error | QUEUE_FULL / INFLIGHT_BYTES_EXCEEDED |
| 未分类的执行故障 | 502 | api_error | GATEWAY_ERROR |

云端未登录需要重新登录，不能用 503 诱导客户端按临时故障重试。认证检查失败仍需与明确未登录区分，不能把未知状态当作未登录。

Anthropic JSON 错误使用原生 `type: error` 外层；OpenAI 入口保留 `error` 对象。两者均包含错误类型、中文可读提示或原有故障提示、稳定诊断码。

SSE 已开始时无法改写 HTTP 状态，错误事件仍返回相同分类与诊断码，保留已经发送的部分正文，不补成功结束标志。普通网络和服务故障仍保留原错误处理；本次没有新增时间、预算或思考熔断，也没有扩大额度措辞匹配范围。
