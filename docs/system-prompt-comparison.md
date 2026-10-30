# 系统提示词对比与暂停信息分析

核对日期：2026-10-26。Unbundle 源码基线为本地提交 `30ad2a4`（1.0.4）；Magpie 固定为 `44a626bed3c434a61786e939613be25c9573e538`。本文分析提示词结构，不将某种包装方式描述为避免账号限制的保证。

## 本次事件能确认什么

用户转述朋友遇到了以下错误，并观察到约一小时后恢复：

`model: claude-opus-5-5 is suspended for this organization until 2026-10-23T11:07:03Z`

这段文本描述了 organization 对某个 model 的有期限暂停，不能据此判断是人工操作还是自动策略，也不能判断触发原因。模型名仅按报告保留，未据此验证模型可用性。结束时间为 **2026-10-23 11:07:03 UTC**，即洛杉矶时间 **2026-10-23 04:07:03 PDT**，是本次核对日期之前的事件。单独一个结束时间不能推算暂停持续时长。

目前缺少首次错误时间、HTTP 状态码、完整脱敏错误结构、request ID 以及当时的客户端和云端 CLI 版本。不能将它直接认定为普通额度耗尽、管理员手动封禁、第三方 Harness 导致，或自定义系统提示词导致。本仓库未发现生成这条特定错误的代码；其中的进程 suspend/freeze 是本地进程管理，不能据此解释上游模型暂停。

2026-10-26 尝试通过用户授权的服务器 SSH 入口只读检查，两次均在端口 22 的握手阶段收到 connection reset，未进入认证。因此本文没有确认线上运行版本、启用模式或事件日志；本地源码不能代替线上状态证据。

## 三种提示词结构

官方 CLI 文档说明：`--system-prompt-file` 用文件内容替换默认系统提示词；`--append-system-prompt-file` 在默认提示词后追加内容。替换默认提示词不等于移除 CLI 生成的全部身份、传输元数据或运行上下文。[1]

| 项目 | Unbundle 当前代码 | Magpie 默认模式 | Magpie Lean 模式 |
| --- | --- | --- | --- |
| 云端 CLI 默认系统提示词 | 使用文件替换 | 保留 | 使用文件替换 |
| 客户端 system | 归一化后作为 JSON 放入自定义系统提示词 | 首条 user 内的 external_system_instructions 文本 | 去掉客户端 billing 行后作为自定义系统提示词正文 |
| 网关补充说明 | 本机/VPS 环境区分、工具交接、运行状态、指令优先级、按需工具选择 | 按条件补充环境说明和工具选择 | 合并工具选择要求 |
| 首次提交的既有历史 | 默认路线按消息序列化为 JSON 文本块，图片保留原生块 | Human/Assistant 文本，按条件区分历史与当前轮次 | 沿用默认模式的历史包装 |
| 工具注册 | 调用方工具通过 MCP 提供给云端 CLI | MCP | MCP |

表中 Magpie 基于其源码和子系统文档。[2][3] 带客户端缓存标记的请求不会进入 Lean 模式，因此不能仅凭全局开关判断某次请求实际使用的模式。[3]

### Unbundle 的实际转换

入口 [anthropic.mjs](../model-gateway/anthropic.mjs) 归一化客户端 system 文本块，并移除每个块开头的客户端 billing 行。[context.mjs](../model-gateway/context.mjs) 再生成以下逻辑结构：

```text
自定义 system 文件：
  RELAY_PROMPT：本机与 VPS 环境、真实工具结果、审批和指令优先级
  runtimePrompt：运行状态与目录快照的含义
  toolChoicePrompt：按需工具选择要求
  Caller instructions：客户端开头 system/developer 的 JSON
  Caller instruction updates：按需加入后续指令及其位置

默认路线的 user 输入：
  历史消息的 JSON 文本块 + 原生图片块
```

[engine.mjs](../model-gateway/engine.mjs) 与 [native-cli-session.mjs](../model-gateway/native-cli-session.mjs) 都使用 `--system-prompt-file`。原生会话候选改变了后续消息与工具结果的续接方式，没有把首次系统提示词恢复为 CLI 默认提示词。

因此，即使本机使用 Claude Code 桌面版，发往上游的系统提示词也不是客户端原始提示词的原字节透传。网关仍增加了说明、序列化和层级解释。内部 JSON 的 system/developer 标签表达网关希望模型遵守的优先级，并不是两个独立的上游协议角色。

### Magpie 默认模式的取舍

默认模式保留云端 CLI 默认提示词，将客户端规则放入首条 user 的 `<external_system_instructions>`。其 `<conversation_history>` 和 `<current_turn>` 用于区分已经回答的历史与当前任务；这些标签只组织文本，不生成协议级角色。[2]

这提供了一种不同的兼容性取舍：保留云端默认规则，同时使外部 system 不再处于独立 system 位置。本地与云端的路径、工具名称和环境说明仍可能不同，Magpie 也为此增加了条件性环境说明。不能把“保留默认提示词”直接等同于“恢复官方直连请求”。

Magpie 的 Lean 模式同样替换默认提示词，因此在这一点上更接近 Unbundle。项目文档明确提示了这一模式的账号风险，但那是作者的风险说明，不是 Anthropic 对此次事件的诊断，也不证明默认模式不会触发限制。[3]

## 新会话与客户端建议

新会话可避免继续沿用旧会话的提示词快照，但仍会执行同一套 compileContext 转换。它不能单独排除请求结构、客户端差异或账号状态因素。官方 CLI 对恢复会话的快照控制，也不意味着将网关自定义提示词换回默认提示词。[1]

日常推理建议只使用 **Claude Code 桌面版（Claude Desktop 的 Code 工作区）**，不建议使用 OMP、OpenCode 或其他第三方 Harness。目的在于收敛客户端指令、工具协议与复现条件，便于研究和验收；这不是对本次暂停原因的认定，也不保证账号不会受限。官方网关接入文档描述了 Desktop 的 Messages API 接入要求，但不能据此推导订阅 CLI 桥接得到官方认可。[4]

部署边界继续为一台 VPS、一个账号和账号持有人的一台固定本机，允许同账号、同设备多会话并发。OAuth 登录、保存和刷新由官方 CLI 负责，网关不读取、复制、导出、转发或自行刷新 Token。这些使用约定不等于已实现客户端识别或设备绑定。

## 接下来如何验证

本次只调整文档，保留现有提示词行为。后续研究优先使用合成消息和模拟 CLI，逐项比较规则是否丢失、环境是否冲突、工具结果是否被当成用户指令、缓存前缀是否稳定。若比较替换与追加模式，应独立设置实验路径，并先验证工具执行位置和指令冲突；不能仅以短期未再次受限作为结论。

定位这次暂停最有用的证据是：当时使用的客户端与版本、首次与最后一次错误的 UTC 时间、脱敏 HTTP 状态/error.type/message/request ID、云端 CLI 与网关版本，以及上游账号通知。诊断只摘取相关错误元数据，不导出 OAuth、完整环境变量或对话正文。当前没有足够证据建议为了避免限制而伪装客户端身份或更换提示词格式。

## 来源

1. [Claude Code 官方 CLI 参数说明](https://code.claude.com/docs/en/cli-reference#system-prompt-flags)：替换、追加及恢复会话快照。
2. [Magpie 固定版本源码](https://github.com/yetone/magpie/blob/44a626bed3c434a61786e939613be25c9573e538/internal/gateway/claude_subscription.go)：renderClaudePrompt、leanSystem、historyEnd、renderClaudeTurn。
3. [Magpie 固定版本订阅桥接文档](https://github.com/yetone/magpie/blob/44a626bed3c434a61786e939613be25c9573e538/docs/subsystems/claude-subscription-bridge.md)：默认模式、Lean、缓存标记例外及作者的风险说明。
4. [Claude Desktop 官方第三方网关配置](https://claude.com/docs/third-party/claude-desktop/gateway)。
