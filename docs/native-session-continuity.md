# 原生会话续接候选

本候选将新消息和工具结果续接交给持久化 CLI，减少把整段 Desktop 历史包装成 JSON 后重新提交的路径。通过 `GATEWAY_SESSION_RELAY=1` 显式启用；`GATEWAY_NATIVE_SESSION_PERSISTENCE=1` 开启原生文件检查点和 `--resume`。默认安装保留现有逐轮 CLI 路径，不自动修改现有部署或启动这些候选能力。

## 配置

在已有服务的 EnvironmentFile 中按需显式设置，然后在没有活动或冻结会话时重启：

```ini
GATEWAY_SESSION_RELAY=1
GATEWAY_NATIVE_SESSION_PERSISTENCE=1
GATEWAY_LIVE_INSTRUCTION_UPDATES=1
GATEWAY_TOOL_SEARCH=1
GATEWAY_CACHE_BREAKPOINT=1h
GATEWAY_SESSION_TTL_MS=1800000
GATEWAY_TOOL_WAIT_TIMEOUT_MS=1800000
GATEWAY_MAX_SESSIONS=2
```

`ToolSearch` 只负责工具发现；VPS 的 Bash、Read、Write 等内置工具仍未开放。空闲回收与工具等待是不同计时器；正在等待调用方真实工具结果的会话不会因空闲或容量被回收。冻结进程不会自行解封，维护和升级应先检查活动会话。

调用方支持时可使用 `X-Claude-Proxy-Session-Key` 与 `X-Claude-Proxy-Session-Mode: sticky` 固定会话身份。固定身份不绕过历史一致性校验。

## 压缩与恢复

Desktop 摘要请求先与原生会话的历史和工具边界核对，随后发送 CLI 原生 `/compact`。只有收到原生 `compact_boundary` 并读到对应的落盘摘要才返回成功。后续消息匹配已返回摘要后只发送新增输入，避免再把摘要和旧正文一起重放。普通用户消息设置 `client_composed`，防止在 VPS 解释斜杠命令或展开路径。

Desktop 压缩可能使用最后一次 API 输入快照，未包含 CLI 已完成的末条助手回复。只在空闲、无待交接工具且此前输入历史完整一致时接受这种快照，原生会话中的回复仍参与原生压缩。自动记忆提示附加到末条工具结果时，仅接受正文与已成功 `Write` 的 `MEMORY.md` 内容完全吻合的精确别名；原工具 ID、错误状态、正文及其他历史仍需一致。新增提示作为单独调用方上下文保存，不覆盖原工具结果或提升为系统指令。持久检查点只保存这些别名的 HMAC，不保存记忆正文。

Desktop 可在摘要后保留压缩前的最后一条助手回复。压缩映射同时记录这条已完成回复的 HMAC，续接时仅剔除完全匹配的保留消息；内容不同仍拒绝。旧映射缺少该项时，从同一原生 UUID、同一压缩边界前的真实回复补齐，适用于存活 CLI 和检查点 `--resume`，无需再次压缩或重建历史。

正常空闲退出后更新原生文件检查点。CLI 已关闭时，只有原历史、系统指令、工具配置和文件检查点均能验证，才使用原 UUID `--resume`；不导入旧 Desktop 长历史，也不退回 JSON 包装。已有旧版长对话缺少检查点时会拒绝恢复，需要明确交接到新对话。

首次无工具、无历史且未绑定固定身份的请求遇到 `SESSION_LIMIT` 时，结束本次 CLI 并保留原生文件，由账户额度保护返回 429 和短期冷却，不永久封存其消息前缀。否则 Desktop 重复发送相同的启动测试（例如单条 `.`）会在额度恢复后仍被错误拦成 409。真实历史、工具等待、固定会话及其他异常继续执行原封存规则。

等待工具时先确认旧轮次停止，再将 Desktop 已完成的真实结果作为不触发推理的上下文保存一次，按消息 UUID 确认入队后才压缩。失败冻结并保留原生历史；不会通过重复工具执行或长历史重建来恢复。

冻结会话收到新消息时会自动核验并尝试恢复，不需要先手动解封。新任务保留为原生用户输入；相同恢复请求防重，成功后才移除封存标记。仅恢复安全边界的存活 CLI；进程丢失或工具状态不明确时拒绝，不自动重建。详细恢复和精简交接见 [会话恢复说明](../SESSION-RECOVERY.md)。

## 验证边界

自动测试使用合成消息、假 CLI 或本地模拟上游，不调用账号模型。额外在隔离 Linux 网络命名空间中使用官方 CLI 2.1.309 验证原生压缩、关闭后恢复、工具边界中断、真实结果只保留一次、摘要请求重试和失败冻结。模拟数据的请求历史由约 25 KB 降至约 3 KB，恢复后旧正文未再次出现。

可在安装了官方 CLI、Node 和 `ip` 的 Linux 上重复离线协议验收。下列命令只启用新网络命名空间的 loopback，测试 HOME 必须为空；测试脚本拒绝使用宿主网络或非空 HOME：

```sh
probe_home="$(mktemp -d)"
sudo env CLAUDE_TEST_BIN=/absolute/path/to/claude unshare --net -- \
  sh -c 'ip link set lo up && exec node "$1" "$2"' offline \
  "$PWD/model-gateway/native-compaction-offline-probe.mjs" "$probe_home"
```

该验收使用合成凭据和本地模拟服务，不加载账号 HOME，也不会向真实模型服务发请求；输出的 token 数是模拟计数，不是实际额度测量。

真实 Desktop 与真实模型的完整联调及实际额度、缓存命中表现仍需验收。原生压缩的单轮 `usage` 可能为零，因此使用累计 `modelUsage` 前后差额计账。缓存过期或前缀变化时，一次压缩仍可能有较高用量；本候选不保证压缩免费或额度不会突增。压缩失败的内部摘要尝试由 CLI 控制，网关不会在冻结后自动重新提交该请求。

缓存默认一小时；显式设置 `GATEWAY_CACHE_BREAKPOINT=auto` 时交给官方 CLI 选择，也可设置 `5m` 或 `off`。已有部署的显式配置仍优先，需要修改后在安全维护窗口生效。ToolSearch 在云端入口默认开启。`--resume` 保留原生系统提示词快照，新增指令通过已校验的 MCP 通道交付，避免恢复时改写缓存前缀。缓存过期、模型改变和原生压缩仍可能产生正常缓存创建。

## 数据保留与退役

七天及 128 条索引淘汰已移除。进程半小时空闲退出不会删除恢复检查点。数据管理通过受鉴权的 `/sessions/lifecycle` 与 `retain`、`retire`、`restore`、`sweep` 接口完成；显式退役前不删除有效原生历史。退役归档默认保留 30 天，过期后只在管理员调用 sweep 时清理。冻结现场、待工具会话、存活 CLI 及保留标记均受保护。具体接口和中断处理见 `SESSION-RECOVERY.md`。
