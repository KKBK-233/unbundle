# 会话恢复与交接

从已安装项目目录运行（profile 替换成已有配置名）：

```powershell
node deploy/unbundle.mjs sessions --profile default
node deploy/unbundle.mjs session-recover --profile default --session 会话ID
node deploy/unbundle.mjs session-handoff --profile default --session 会话ID --output ./handoff.md
```

sessions 列出存活/冻结及历史归档，包含进程是否真实存活、是否可审核恢复以及拒绝原因。

session-recover 只核验并准备恢复，不发送 SIGCONT，不调用模型。返回 recoveryArmed=true、processStillPaused=true 后，调用方可以原样重试原失败请求，或在同一对话仅发送“继续”。后一种方式要求原历史、工具结果和配置保持一致，只接受有界的“继续”控制消息，以及已验证格式的 Desktop 退出 Auto Mode 通知；通知必须通过 CLI 控制通道确认后，才交回原工具结果。执行后的 Desktop 历史包含实际控制消息。实际重试仍会核验模型、规则、工具、身份、历史、真实工具结果和暂停状态，通过后才恢复同一 CLI。
恢复时先建立本轮响应和结果接收状态，再回传已有工具结果并继续同一个进程；不会重新执行工具、重新创建 CLI 或导入长历史。仅表示差异可审核通过，真实工具参数变化不允许恢复。
“继续并部署”等新任务、改写过的工具结果或其他历史差异仍然拒绝；不自动解除未经审核的冻结。

原进程已丢失返回 NATIVE_PROCESS_GONE。推理中途冻结、结果不完整、原 MCP 连接断开等也会拒绝；目前不支持任意推理位置恢复。

session-handoff 导出精简任务交接，不导出整段历史，不调用模型。先核验文件、进程和备份现状，再由使用者在新会话继续；不自动重放命令。导出文件含任务信息，请勿当作普通诊断日志公开。

HTTP 接口复用已有回环网关令牌鉴权，不接受浏览器跨域：GET /sessions；POST /sessions/ID/recover（空请求体）；GET /sessions/ID/handoff。恢复操作不接受替换历史或伪造工具结果。

Desktop `/compact` 关联已核验的原生会话后，调用 CLI 自身的 `/compact`。只有收到原生压缩边界并读到对应的落盘摘要才返回成功；不再用普通推理摘要代替原生压缩。下一轮只发送新增输入，不重新发送摘要或旧历史。正常关闭的空闲 CLI 可以凭检查点用 `--resume` 恢复后压缩；失配和冻结会话不会因此自动解除。

等待工具时，先核验 Desktop 的真实结果和旧轮次中断回执，真实结果只保存一次，再执行原生压缩。压缩失败保留原生历史并冻结进程，不自动重建长历史。相同摘要请求在存活会话上重试直接返回已提交摘要，不再次调用模型。

压缩用量取 CLI 累计 `modelUsage` 的前后差额，因为原生压缩的单轮 `usage` 可能为零。压缩仍需要模型读取待总结的上下文；缓存过期或前缀变化时仍可能产生较高用量，此修复不承诺压缩免费或缓存必然命中。
