# 社区方案取舍（2026-09-30）

本轮修改适用于云端网关 `velella-model-gateway`。本地 OMP 继续提供工作区、工具与审批；frp STCP、双向 TLS 和独立 API 鉴权保持原有职责。

## 借鉴与取舍

| 项目 | 核对内容 | 本轮采用 |
| --- | --- | --- |
| [OCP](https://github.com/dtzp555-max/ocp/tree/2ae7151843cb5f070c1f44d3f685629e28b3be59) | `lib/multimodal.mjs`、`lib/cli-usage.mjs`、ADR 0022、CLI 事件处理 | 历史逐消息分块、最后一块缓存断点；等待 `message_delta.stop_reason=tool_use` 收齐调用；从 CLI 事件读取用量 |
| [claude-code-cache-fix](https://github.com/cnighswonger/claude-code-cache-fix/tree/0e7aa809ee29612c3db76132d2578d01f798056a) | `fresh-session-sort.mjs`、`cache-telemetry.mjs` | 保持工具定义顺序稳定；缺失统计保持未知。没有引入其上游拦截代理或身份相关改写 |
| [openclaw-claude-proxy](https://github.com/majdyz/openclaw-claude-proxy) | README、`claude-proxy.js` 的文本工具协议 | 保留我们的结构化 MCP/CLI 事件桥，避免依赖模型生成 XML 标签 |
| [claude-openai-proxy](https://github.com/kpod13/claude-openai-proxy) | `internal/proxy/claude.go` | 参考取消与用量分层；其无状态包装本身并不证明解决了长对话缓存 |
| [Harness Remote](https://github.com/giuliastro/harness-remote) | 原生会话及工具归属设计 | 保留 OMP 对历史和工具的控制；目前不引入远程 GUI、会话控制平面 |
| [cc-enhanced](https://github.com/camjac251/cc-enhanced) | 官方二进制的 AST 补丁与重打包路线 | 本轮不需要二进制补丁。聊天中的维护状态、目标版本不作为本项目的验证依据 |

以上采用机制并在本项目独立实现，没有复制项目代码。社区性能数字是作者的测试结果，不是本项目的指标。

## 0.5.0 行为

- 调用方每条历史消息独占一个文本块，保持 JSON 原文语义、角色和工具 ID；通过 CLI `--input-format stream-json` 发送一个 user envelope。不会声称把历史恢复成了 CLI 原生 assistant/tool 轮次。
- 续接说明位于固定系统提示中；默认缓存断点 `5m`，可设 `GATEWAY_CACHE_BREAKPOINT=1h` 或 `off`。上游是否接受、是否命中仍需实测。
- 合法工具名称保留；超长或不合法名称使用确定性别名。工具定义和对象键排序，但不重排历史、数组，不删改调用方文档。
- 工作目录固定为运行目录的 `workspace`；每轮协议文件仍独立并在退出时删除，不建立隐藏持久对话。
- 等整条工具消息结束后返回全部 `tool_calls`；缺少结束信号时失败，不返回不完整的部分调用。MCP 不执行任何工具，也不返回虚假成功结果。
- 子进程取消先 SIGTERM，宽限期后 SIGKILL；Linux 按单次请求的独立进程组清理。
- CLI stdout 默认最多 16 MiB，超过后取消推理，避免 readline 无界积累输出。
- 完整用量转换为响应顶层 `usage`；保留 `upstream_usage` 与 `usage_complete`。SSE 用量需 `stream_options.include_usage=true`。未知用量不会伪造为零。
- HTTP 字节累计后再解码 UTF-8，避免中文跨网络块时损坏。

没有引入响应缓存、常驻 CLI、多用户或自动上下文压缩。会话少时优先用一个 CLI 进程；达到请求并发上限仍返回 429。

## 验证口径

本地测试覆盖消息前缀稳定、工具重排、并行调用、重复事件、部分统计、失败与取消、临时文件清理、中文分块及 SSE 用量。

云端官方 CLI 2.1.277 对模拟上游完成了两工具往返：第一轮保留两次调用，第二轮读取两份工具结果，返回预设验证标记；没有付费上游调用。

真实复测使用 DeepSeek，结果单独记录。不能将 DeepSeek 的缓存字段直接折算为 Claude Pro/Max 额度；“消耗不超过 1.5 倍”需要同模型、同任务、同工具结果的直接调用基线，不能仅凭这次前后改版比较证明。

实测数据和审计质量边界见 [DeepSeek 复测](deepseek-comparison.md)。
