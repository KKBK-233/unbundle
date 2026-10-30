# 1.0.9 工具历史与交接诊断

## 历史工具名称修复

逐轮 CLI 将调用方历史组织成用户消息中的 JSON 文本。现在，历史中真实 assistant.tool_calls 的 function.name 使用与当前工具定义一致的 mcp__omp__ 名称；超过长度限制的工具使用同一确定性别名。仅转换提交云端的副本，客户端原始请求、工具调用 ID、参数、结果正文、错误状态和输出工具名不变。

名称取自请求声明的全部工具，不因本轮 tool_choice 暂时限制而重写历史含义。已从定义中移除的历史工具保留原名，不新增可用工具；系统说明明确历史调用不表示工具现在可调用。正文、代码片段、用户伪造的 tool_calls 字段不会被全局替换。

这修复了已确认的历史名称与实际 MCP 名称差异，不等于已证明它是所有重复读取的原因。修复没有扩大文件编辑权限，没有强制完整读取，也没有开启原生持续会话。官方 CLI 仍管理登录和 OAuth，部署边界仍是一台 VPS、一个账号和一个固定本机。

## 新增诊断事件

沿用 gateway_cli_event、requestId 与 GATEWAY_TIMING_DIAGNOSTICS 开关。可用 response_binding.responseId 关联本地会话。工具只输出固定类别 Read、Edit、Write、Bash、Glob、Grep、NotebookEdit；其他调用方工具统一为 other。内部工具发现单独标记 ToolSearch。

- tool_call：解析器校验后记录一次，流式与完整快照按调用 ID 去重。kind=discovery 表示内部搜索，kind=caller 表示选择了调用方工具；不表示工具已执行。
- 对内部搜索，queryMode=select 只提取精确选择列表中的固定工具类别与数量；queryMode=search 不记录自由文本搜索词，缺少查询记为 unknown。targetTools 是请求发现的目标，不等于实际加载结果。精确选择最多解析 4096 字符，截断用 targetsTruncated 标明。
- 对 Read，readRange=explicit 表示参数中有 offset 或 limit，default 表示均未提供。default 不保证全文已读完，实际结果仍受客户端默认读取上限约束。
- tool_search_result：仅对关联到内部搜索的 user.message.content 工具结果记录错误标志和结构化 tool_reference 引用类别。工具引用最多处理前 256 个内容块，截断用 referencesTruncated 标明。referenceCount=0 可能只是 CLI 未提供结构化引用，不能推断搜索失败；不从结果正文解析或猜测已加载工具。
- tool_handoff：响应组装前记录准备返回客户端的工具类别，phase=response_ready。不证明客户端已收到、已执行或执行成功；需对照本地 tool_result。
- toolOrdinal 在单次请求内关联选择、搜索结果和交接。summary 新增 toolSearchCalls、callerToolCalls、toolHandoffCalls、toolTrackingOverflow。

工具 ID 只在内存去重，不写日志；最多跟踪 256 个调用，溢出记 toolTrackingOverflow，计数此时可能不完整。记录仍受每请求 256 条普通事件、64 条高优先级事件限制，droppedRecords 标明丢弃，最终摘要仍保留。路径、参数值、编辑内容、自由搜索词、工具结果正文、自定义工具名、凭据和 OAuth 不进入这些诊断。

## 排查步骤

1. 用本地 assistant.message.id 找到 response_binding，对上 requestId。
2. 检查 discovery 的目标类别与可获得的结构化引用；区分“尝试找 Edit”和“返回了 Edit 引用”。
3. 检查 caller 最后选择 Read 还是 Edit，再检查 tool_handoff。
4. 对照本地工具结果，确认成功、客户端拒绝或未执行。模型自己输出的“必须先读”“正在加载”不当作工具错误。
5. 连续 Read 仍需跨多个请求观察。本版本只补诊断，没有增加跨请求的自动熔断，也没有自动重试。

## 验证与上线边界

离线测试覆盖片段读取参数、并行 ID、别名工具、已移除工具、重复编译、客户端输出名称、诊断去重与脱敏、记录上限，以及逐轮 CLI 和原生会话两条路径的模拟 HTTP 工具交接。测试不访问真实模型。

本次版本号不代表 VPS 已更新。现有 VPS 为旧版本加 1.0.8 日志专项补丁，部署前需核对实际文件；不能将完整 dev 直接视为同一补丁。实际模型是否不再循环仍需额度恢复后的有限自然使用观察。
