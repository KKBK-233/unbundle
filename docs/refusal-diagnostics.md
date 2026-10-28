# 拒绝响应与日志排查

从 1.0.7 开始，逐轮 CLI 与原生会话均识别流式 `message_delta.delta.stop_reason` 和完整 `assistant.message.stop_reason` 中的 `refusal`。拒绝作为正常终止响应交付，保留正文和已收到的用量；没有正文时也保留拒绝状态。网关不会自行重试拒绝，未交付的工具调用不交付，排队的后续输出不覆盖拒绝。原生会话结束该 CLI 进程，不复用尚未完成结果事件的进程。

- Anthropic `/v1/messages`：HTTP 200，非流式顶层或 SSE `message_delta.delta` 返回 `stop_reason: "refusal"`。
- 兼容 `/v1/chat/completions`：流式和非流式均映射为 `finish_reason: "content_filter"`，不在 assistant 消息内附加内部状态字段。
- 强制工具选择不能把明确拒绝改写成 `TOOL_CHOICE_UNSATISFIED`。
- 正文中的“不能回答”“被安全机制拦截”等措辞不会被推断成协议拒绝。

## 网关日志

默认开启的耗时诊断通过 stderr 进入服务日志；设置 `GATEWAY_TIMING_DIAGNOSTICS=0` 会关闭这些记录。日志不新增正文、工具参数或认证信息。

收到结束原因时立即记录 `gateway_timing`，`stage: "upstream_stop"`，`stopReason: "refusal"`，并带本次网关 `requestId`。结束原因仅接受固定枚举，未知值记为 `unknown`。这些记录表示 CLI 透给网关的事件，不保证包含 CLI 内部未暴露的上游响应。

交付拒绝响应时另记 `stage: "response_refusal"`。最终 `stage: "finished"` 带 `upstreamStopReason` 和 `upstreamRefusal`，例如：

```json
{"type":"gateway_timing","requestId":"示例请求ID","stage":"finished","outcome":"success","upstreamStopReason":"refusal","upstreamRefusal":true}
```

`success` 表示请求处理完成，与拒绝状态分别记录。`upstreamRefusal: false` 仅表示本次记录到的 CLI 结束事件没有 refusal；字段缺失表示没有记录到可用结束原因，不能当成 false。相同消息的流式与完整事件可能重复记录结束原因，不应将日志条数当成模型请求次数。

当前 VPS 的日志位于专用命名空间，可按时间查询并筛选结构化字段：

```sh
journalctl --namespace=claude-relay -u velella-model-gateway.service --since '2026-10-28 00:00:00 UTC' -o cat --no-pager   | jq -R 'fromjson? | select(.type == "gateway_timing" and (.stopReason == "refusal" or .upstreamRefusal == true or .stage == "response_refusal"))'
```

此命令中的单元名与命名空间对应当前部署；其他部署以实际 systemd 配置为准。

## 本地与旧日志的边界

客户端只有保留原始响应结束原因，才能从其日志确认收到 refusal。SSH 隧道连接日志或仅保存正文的聊天记录不能证明这一点。

旧网关没有保留 refusal，并可能将其转换成 end_turn。因此旧本地记录中的 end_turn，以及旧网关记录中的 success，都不能排除上游曾返回 refusal。修改不恢复已经丢失的历史字段。若官方 CLI 本身未向网关透出 refusal，本补丁也不能推断其内部判定。

## 1.0.8 原始事件诊断

`gateway_cli_event` 在转换器过滤之前观察 CLI 原始事件。即使拒绝只出现在 `is_api_error_message` 错误占位里、随后 CLI 继续生成正常回复，仍会记录拒绝。日志只观察，不增加请求、不改变续接和响应内容。

- `context`：实际配置的模型和 CLI 版本。
- `message_start` / `message_end` / `message_stop`：消息 ID、顺序、结束原因、可获得的上游请求 ID、正文的字节数和工具块数量。重复 message_start 会标记 `duplicateStart`，流式与完整消息的结束记录保留各自 source。
- 拒绝的 `category`、`explanation` 来自 stop_details 或 CLI 拒绝事件，原始 null 保留；字段缺失表示 CLI 未提供。说明最多 512 字符，移除常见凭据、URL、控制字符及长编码串，不读取 assistant 正文补猜原因。
- `refusal_notice`：识别官方 CLI 已知的“防护停止后继续一次”通知；`meta_message` 只记录元消息标志及关联消息 ID，不记录内部提示。
- `refusal_continuation`、`model_refusal_fallback`、`query_model_change`、`fallback_block` 等：记录续接阶段、切换模型与拒绝类别，不记录恢复信用令牌、保留正文或完整事件。
- `api_retry`：与拒绝后的内部续接分开记录。
- `summary`：分别统计消息开始事件、不同消息 ID、重复开始、拒绝事件和续接事件。refusalEvents 是事件数量，不是独立拒绝或模型请求的次数。

每个请求最多保留 256 条普通事件和 64 条高优先级事件，最后摘要仍会写出，并记录丢弃数量。消息 ID 跟踪最多 256 个，溢出后通过 messageTrackingOverflow 明示，不能将此时计数当作完整数量。正文、思考内容、工具参数、OAuth、fallback_credit_token 和 creditCode 均不写入这些诊断。

`gateway_timing` 的 `response_binding` 阶段记录最终响应 ID、协议与 requestId。本地会话中的 assistant.message.id 可以与此直接对照；请求响应头仍提供 x-relay-request-id。

按请求关联号查看全部结构化诊断（把示例 ID 换成实际值）：

```sh
journalctl --namespace=claude-relay -u velella-model-gateway.service -o cat --no-pager | jq -R 'fromjson? | select(.requestId == "实际网关请求ID")'
```

无需主动发送容易拒绝的内容来验收。使用模拟 CLI 回放拒绝、通知和后续正常回复，即可确认日志不遗漏且响应行为不变。以后自然出现拒绝时，先检查 message_end 的 category/explanation，再检查后续的消息、续接和切换事件；如 CLI 没透出原因，日志会保留缺失状态，不生成猜测。

诊断沿用现有 GATEWAY_TIMING_DIAGNOSTICS 开关和服务日志保留策略，不额外建立会话正文归档。
