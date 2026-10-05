# 输出通道取证探针

用途：在不记录正文的条件下，区分官方 CLI 输出通道、内容块类型与网关实际转发的正文。

## 采集边界

- 不修改请求体、提示词、工具定义、模型、思考档位或 CLI 参数。
- 不增加模型请求、重放、重试，也不调用其他模型审核内容。
- 不记录正文前缀、思考文本、加密 signature、工具参数、消息 ID 或凭据。
- 只记录固定类型、索引、数量、长度、标签位置与指纹；每轮最多保留 64 个块的元数据。
- 每轮使用随机内存密钥计算 HMAC-SHA256，不保存密钥；指纹只供该轮比较，不能用于跨轮内容关联。
- 文本仅作增量扫描和哈希，不累计全文；尾部最多保留一个标签的长度，归一化缓冲限制为 4096 个字符。
- 正文首次出现 `<thinking>` 时记录一条元数据告警；请求结束或取消时记录一条汇总。
- 探针异常不能阻断转发或子进程清理。

## 临时启用

默认关闭。为网关进程设置 `GATEWAY_WIRE_PROBE_UNTIL_MS`，取值为当前时间之后至多一小时的绝对 Unix 毫秒时间戳。

`GATEWAY_WIRE_PROBE_REQUESTS` 限制本次进程中采集的后续自然请求数，默认 3，允许 1..10。
绝对截止时间到达后不再启动新采集；已经采集的请求会在结束时封存记录。
服务重启会重置次数，但不会延长截止时间。超过截止时间的配置保持关闭。
临时 systemd drop-in 应放在 `/run/systemd/system`，避免成为长期启用配置。

查询服务实际使用的 journal namespace 后，筛选 `"type":"wire_probe"`。
只需正常使用客户端；不要为取证自动重放历史对话。

## 如何读记录

- `blocks[].blockType`：CLI 声明的内容块类型。
- `textDeltas` / `thinkingDeltas`：实际 delta 类型的计数。
- `typeMismatches`：声明块类型与 delta 类型不一致的次数。
- `streamText` / `streamThinking`：CLI 流式正文与可读思考通道统计。
- `downstreamText`：网关通过正文回调实际交付的内容统计。
- `signatureDeltas`：只表示观察到签名事件，不保存或验证签名。
- `downstreamMatchesStreamText`：转发正文与 CLI 正文在去标签及空白后完全相同且非空。
- `downstreamMatchesStreamThinking`：转发正文与 CLI 可读思考在同样归一化后完全相同且非空。
- `hmacSha256`：原始通道字符串的本轮指纹。
- `normalizedHmacSha256`：移除大小写不敏感的 thinking 标签与空白后的本轮指纹。
- `outcome`：正常完成、取消、超时或错误。取消时只能比较已经观察到的部分。
- `orphanDeltas` / `droppedBlocks`：说明元数据缺失或达到保留上限，解读时不能假设记录完整。

## 证据限制

`<thinking>` 是正文标签，不是通道标识或解密证据。
`thinking_delta` 只能证明 CLI 输出了可读思考通道；可读 thinking 可能是摘要。
指纹相同只能证明归一化文本相同，不能证明它是原始内部 CoT。
完整通道指纹不同不能排除局部重合；探针不累计全文或做无界子串匹配。
CLI 之前的上游环节不能由本探针进一步拆分定位。
