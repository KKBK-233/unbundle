# Unbundle

**化整为零，自由组合。单用户自部署，云端推理，本地工具与审批。**

Unbundle 是实验性 CLI 适配器：在自己控制的服务器上运行官方 Claude Code CLI，通过加密隧道连接本地 Harness。本地工作区、工具执行与审批由调用方掌握，云端网关负责推理请求和协议桥接。

## 使用范围

- 每套部署面向同一账号持有人，使用自己的账号和设备；同一用户可以运行并发任务。
- 不提供多租户、账号池、订阅共享、额度转售或公共中转站支持。
- 不提供代管他人登录凭据的功能；官方 CLI 管理自身登录状态，网关不读取或转发 OAuth Token。
- 按上游服务允许的认证方式和使用范围运行，自部署不改变上游的使用规则。

上述内容说明项目支持范围，不是运行时访问限制或新的许可证条款。项目仍处于实验阶段，尚未添加开源许可证。

## 说明文档

安装前请阅读 [完整说明](https://github.com/KKBK-233/unbundle/blob/docs/README.md)，确认环境要求、部署步骤和兼容边界。

`main` 保存程序、配置模板和部署脚本；[docs 分支](https://github.com/KKBK-233/unbundle/tree/docs) 集中维护详细文档。

部署服务名、供应商 ID 和诊断标记沿用原值，以兼容已有安装和配置。

<!-- termiters:research:start -->
## 隐写与指纹跟踪

按报告分析版本新→旧排列；过滤状态仅指本仓库可见路径的静态判断，非真实流量验证，亦不证明新版 CLI 仍生成该标记。时间依原报告，未说明不推断。

| 报告版本 | 机制 | 过滤 | 触发条件（摘要） | 发现／引入 |
| --- | --- | --- | --- | --- |
| 2.1.196 | 隐写 · 撇号宿主分类标记 [↗](https://thereallo.dev/blog/claude-code-prompt-steganography) | 未过滤 | 需设置 ANTHROPIC&#95;BASE&#95;URL 且主机非官方，构建系统提示日期行时按主机是否命中域名清单或实验室关键词选撇号 [详情](#termiters-evidence-1) | 未说明／未说明 |
| 2.1.196 | 隐写 · 日期分隔符时区标记 [↗](https://thereallo.dev/blog/claude-code-prompt-steganography) | 未过滤 | 需设置 ANTHROPIC&#95;BASE&#95;URL 且主机非官方，系统时区为 Asia/Shanghai 或 Asia/Urumqi 时把日期 - 换成 / [详情](#termiters-evidence-2) | 未说明／未说明 |
| 2.1.37 | 协议指纹 · cc&#95;version 后缀哈希 [↗](https://a10k.co/b/reverse-engineering-claude-code-cch.html) | 部分过滤 | 构造计费头时，取首条用户消息索引 4、7、20 字符（不足补 0），加 salt 和版本做 SHA-256，取前 3 位十六进制。 [详情](#termiters-evidence-3) | 2026 年 2 月／未说明 |
| 2.1.37 | 协议指纹 · cch 请求完整性哈希 [↗](https://a10k.co/b/reverse-engineering-claude-code-cch.html) | 部分过滤 | 向 /v1/messages 发送请求，体含 cch=00000 占位符且带 anthropic-version 头时，Bun 运行时计算并替换 cch。 [详情](#termiters-evidence-4) | 2026 年 2 月／未说明 |

<details>
<summary>展开完整条件与代码证据</summary>

<a id="termiters-evidence-1"></a>
**1. 撇号宿主分类标记** · 2.1.196 · [原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)

机制：系统提示日期句撇号隐写：按 API 基础 URL 主机是否命中解码后的域名清单或 AI 实验室关键词，把 Today's 中的撇号分别写成 '、&#92;u2019、&#92;u02BC、&#92;u02B9，在正常英文句中承载宿主分类位

完整触发条件：必须已设置环境变量 ANTHROPIC&#95;BASE&#95;URL 且其主机不是 api.anthropic.com（未设置或为官方端点时 Crt() 提前返回，不做任何标记），在构建 agent 上下文的日期行时按主机分类替换撇号；域名清单经 base64 存储并以 91 异或解码，命中清单记 known，命中 deepseek/moonshot 等关键词记 labKw

未过滤：适配器入站仅移除 x-anthropic-billing-header 行，stableJson 按传入字符串序列化；出站 CliEvents.publishText 与 anthropicWriter.text 直接透传 text&#95;delta，无 U+0027/U+2019/U+02BC/U+02B9 过滤。仅覆盖适配器入站/出站路径，CLI 内部系统提示日期行构造不可见。

代码：[model-gateway/context.mjs:56](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/context.mjs#L56)、[model-gateway/cli-events.mjs:57](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/cli-events.mjs#L57)、[model-gateway/anthropic.mjs:124](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/anthropic.mjs#L124)；审阅提交 3c4ebaf56687。发现：报告未说明；引入：报告未说明。

<a id="termiters-evidence-2"></a>
**2. 日期分隔符时区标记** · 2.1.196 · [原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)

机制：系统提示日期分隔符隐写：当系统时区为中国大陆时区时，把写入系统提示的日期字符串中的 - 全部替换为 /，在看似正常的日期句里承载地域/时区标记位

完整触发条件：必须已设置 ANTHROPIC&#95;BASE&#95;URL 且其主机不是 api.anthropic.com（官方端点或未设置时提前返回），且运行环境系统时区为 Asia/Shanghai 或 Asia/Urumqi，才会触发日期分隔符替换

未过滤：适配器未对日期字符串做分隔符规范化：compileContext 原样序列化消息文本，CliEvents.publishText 直接累积并回调，anthropicWriter.text 原样写入 text&#95;delta；没有把 / 还原为 - 或反向过滤。仅覆盖适配器入站/出站路径，CLI 内部系统提示日期行生成不可见。

代码：[model-gateway/context.mjs:111](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/context.mjs#L111)、[model-gateway/cli-events.mjs:57](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/cli-events.mjs#L57)、[model-gateway/anthropic.mjs:124](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/anthropic.mjs#L124)；审阅提交 3c4ebaf56687。发现：报告未说明；引入：报告未说明。

<a id="termiters-evidence-3"></a>
**3. cc&#95;version 后缀哈希** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

机制：cc&#95;version 后缀哈希：取第一条用户消息索引 4、7、20 的字符（不足补 0），与嵌在 JS 中的 salt 及版本号拼接后做 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：构造 Claude Code 计费头时，基于对话首条用户消息的特定位置字符和版本号计算 cc&#95;version 后缀，该后缀随对话内容变化。

部分过滤：fromAnthropic 仅移除 Anthropic 入站 system 文本块开头的 x-anthropic-billing-header 整行；若 cc&#95;version 及其 3 位后缀位于该行会被去除，否则正文或其他入口保留。CLI 内部构造并发送到上游的计费头不经适配器，engine 只通过 stdio 读写 CLI，未覆盖出站后缀哈希路径，故为 partial。

代码：[model-gateway/anthropic.mjs:17](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/anthropic.mjs#L17)、[model-gateway/engine.mjs:111](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/engine.mjs#L111)；审阅提交 3c4ebaf56687。发现：2026 年 2 月；引入：报告未说明。

<a id="termiters-evidence-4"></a>
**4. cch 请求完整性哈希** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

机制：请求完整性哈希 cch：在 system 数组首个计费头中放置 cch=00000 占位符，Bun nativeFetch 对完整序列化请求体计算 xxHash64 后取低 5 位十六进制并回写替换。

完整触发条件：向 Anthropic API 发送 /v1/messages 请求，且请求体包含 cch=00000 占位符并带有 anthropic-version 头时，Bun nativeFetch 激活哈希替换。

部分过滤：仅 Anthropic 入站转换路径 fromAnthropic 会移除 system 文本块开头的 x-anthropic-billing-header 整行，若 cch=00000 占位符位于该行则被清除；普通正文内保留。CLI 子进程向上游 /v1/messages 的 Bun nativeFetch 替换不经该适配器，engine 仅以 stdio 启动 CLI，未覆盖出站哈希路径，故为 partial。

代码：[model-gateway/anthropic.mjs:17](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/anthropic.mjs#L17)、[model-gateway/engine.mjs:111](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/engine.mjs#L111)；审阅提交 3c4ebaf56687。发现：2026 年 2 月；引入：报告未说明。

</details>

此追踪由 [TermiteRS](https://github.com/KKBK-233/TermiteRS) 进行在线追踪更新。

<!-- termiters:research:end -->
