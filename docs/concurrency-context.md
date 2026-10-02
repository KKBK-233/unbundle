# 并发与上下文预算

## 并发请求

每个请求使用独立的 Claude CLI 进程、临时 MCP 服务、取消信号和输出事件状态。网关不会执行本地工具，也不会在不同请求之间共享对话内容。

生产默认同时运行三个推理进程，其他请求按到达顺序排队。等待项断线后移除；只有队列满才返回 429。鉴权、服务状态、模型列表不等待推理队列。

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `GATEWAY_MAX_CONCURRENT` | 3 | 实际推理进程数，支持 1..32 |
| `GATEWAY_MAX_QUEUED` | 64 | 等待请求数，支持 0..256 |
| `GATEWAY_QUEUE_TIMEOUT_MS` | 600000 | 最长排队时间，超时返回 503 |
| `GATEWAY_CONTEXT_WINDOW` | 400000 | Sonnet/Opus 模型列表中的上下文声明 |

`/status` 返回 `activeRequests`、`queuedRequests`、`maxConcurrent`、`maxQueued` 和 `contextWindow`。阶段日志新增 `queue_started`、`queue_ready`，两者差值是等待时间；CLI 推理时限从启动进程开始计时。

1G 主机上并发三个 CLI 仍可能产生 Swap；此上限是内存保护，不限制客户端创建多个子智能体。增加实际进程数前应重新检查内存峰值和 OOM 记录。并发请求各自消耗订阅额度。

## 400k 压缩阈值

Claude Code 官方支持 `autoCompactWindow: 400000` 或启动环境变量 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000`。前者可写入当前桌面会话的 `CLAUDE_CONFIG_DIR/settings.json`；后者必须在桌面应用启动前设置。运行中的会话也可用 `/autocompact 400k` 明确应用。

该配置让调用方在约 400k 的预算边界前后整理历史，而不是继续积累到原生 1M。界面仍可能显示模型原生 1M 容量；400k 是使用预算与压缩阈值，不是上游模型规格的变化。模板、系统规则、工具定义以及压缩过程本身都会占用 tokens，降低窗口也不会自动降低尚未达到阈值的单轮输入。

网关在 `/v1/models` 声明 Sonnet/Opus 400000、Haiku 至多 200000；实际客户端必须支持并使用该字段。CC Switch 桌面映射仅提供 `supports1m` 开关，因此不把它当作任意数值的窗口设置。保持前端压缩能力；网关不会删除中间消息或用近似 token 数偷偷截断上下文。OMP 原有更低的 64000 阈值继续有效。

参考：[官方上下文与自动压缩说明](https://code.claude.com/docs/en/model-config#context-window-and-auto-compaction)。

## 分类器停止串

原生 `/v1/messages` 的 `stop_sequences` 和 OpenAI 的 `stop` 支持最多四个非空字符串。网关对文本片段进行跨片段匹配，停止串及后续内容不会进入 SSE；命中后终止本次 CLI，原生响应返回 `stop_reason: stop_sequence` 与实际匹配值。停止串不会检查工具 JSON 或隐藏思考内容。

这属于网关本地停止：官方 CLI 没有停止串启动参数，不能承诺上游生成恰好停在该字符。已生成或传输途中的 tokens 仍可能计入额度；提前停止时用量可能不完整。分类器的其他特殊参数仍需按错误证据补齐，不能用伪造批准结果替代分类模型判断。
