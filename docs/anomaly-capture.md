# 异常通道自动取证

云端入口默认观察自然请求，只在检测到候选异常时写入 `/home/harness/model-gateway/anomalies/`。它不启动额外模型请求，不修改输入、模型、思考档位或预算，也不取消当前输出。

历史现场见 [2026-10-04 正文通道 thinking 标签事件](incidents/2026-10-04-thinking-text.md)，其中分别记录已核实事实、对照测试局限和后续复现条件。

触发信号：

- CLI 流式正文、聚合正文或下游兜底正文出现 `<thinking>` / `</thinking>`，支持标签跨片段。
- `text_delta`、`thinking_delta` 或 `signature_delta` 与已知块类型冲突。
- 本轮下游正文与 thinking 通道去除空白和标签后的指纹相同，且至少 64 字节。

这些是调查线索，不代表已经证明思考泄漏或加密失败。模型可能正常讨论这些标签；普通 thinking 块、非空思考摘要、尚未结束的块缺少签名，都不会单独触发保存。

## 文件内容

首次信号立即保存 `state=running` 的元数据，完成、失败或取消时更新为 `state=finished`。文件包含请求关联号、UTC 时间、模型档位、CLI 版本、输出上限、上下文大小、最多 64 项事件时间线、块/delta 类型、签名次数和长度、最终状态及通道指纹。

指纹采用每请求随机密钥的 HMAC；密钥只存在内存，不能跨请求比较相同正文。不保存用户输入、回复正文、隐藏思考、签名值、工具参数、凭据或完整 CLI 会话/消息 ID。

目录新建权限为 `0700`，文件为 `0600`，原子替换。最多保留 64 个本模块记录；下一次写入时清理超过七天的记录。单文件不超过 32 KiB，总元数据规模约 2 MiB。其他文件不参与清理。

正常请求不创建记录目录、不写文件。进程在信号之后异常退出时，可能只留下运行中记录；落盘失败会在 journal 输出 `gateway_anomaly/write_failed`，不记录异常正文。请求结束最多等待文件写入 250 毫秒，写入继续在后台完成，避免存储问题长期占用请求槽。

## 配置与查询

`GATEWAY_ANOMALY_DIR` 可指定服务可写目录；设为 `off` 关闭自动取证。默认路径受 systemd 的 `ReadWritePaths` 保护；自定义目录时需自行提供相应权限。

服务 journal 中的 `gateway_anomaly/detected` 提供请求关联号、信号名和文件名。可将该请求关联号与 `gateway_timing` 阶段记录关联。旧的限时 `GATEWAY_WIRE_PROBE_UNTIL_MS` 仍可单独启用，两者不改变模型协议。

验证使用合成子进程与合成事件，不需要真实模型额度：

```bash
node --test model-gateway/anomaly-capture.test.mjs model-gateway/wire-probe.test.mjs
```
