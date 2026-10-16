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

按报告分析版本新→旧排列。过滤仅对折叠证据列明的路径成立，不是端到端保证；未经真实流量验证，旧版标记不推定新版仍有。时间依原报告。

| 报告版本 | 机制 | 过滤 | 触发条件（摘要） | 发现／引入 |
| --- | --- | --- | --- | --- |
| 2.1.196 | 隐写 · 撇号宿主分类标记 [↗](https://thereallo.dev/blog/claude-code-prompt-steganography) | 未过滤 | 需设置 ANTHROPIC&#95;BASE&#95;URL 且主机非官方，构建系统提示日期行时按主机是否命中域名清单或实验室关键词选撇号 [详情](#termiters-evidence-1) | 未说明／未说明 |
| 2.1.196 | 隐写 · 日期分隔符时区标记 [↗](https://thereallo.dev/blog/claude-code-prompt-steganography) | 未过滤 | 需设置 ANTHROPIC&#95;BASE&#95;URL 且主机非官方，系统时区为 Asia/Shanghai 或 Asia/Urumqi 时把日期 - 换成 / [详情](#termiters-evidence-2) | 未说明／未说明 |
| 2.1.169 | 隐写 · 端点分类撇号标记 [↗](https://github.com/anthropics/claude-code/issues/67120) | 未过滤 | 构造系统提示日期行且 gate() 为假时，按 ANTHROPIC&#95;BASE&#95;URL 主机是否命中 KNOWN&#95;HOSTS/LAB&#95;KEYWORDS 组合改写撇号码点。 [详情](#termiters-evidence-3) | 未说明／未说明 |
| 2.1.169 | 隐写 · 时区日期分隔符 [↗](https://github.com/anthropics/claude-code/issues/67120) | 未过滤 | 构造系统提示日期行且 gate() 为假时，若系统时区为 Asia/Shanghai 或 Asia/Urumqi，则日期中的 - 全部替换为 /。 [详情](#termiters-evidence-4) | 未说明／未说明 |
| 2.1.90 / 2.1.92 | 协议指纹 · 计费归属头元数据 [↗](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md) | 部分过滤 | 默认启用计费归属头并构造 API 请求时，在注入合成消息前生成，作为 system 首块发送。 [详情](#termiters-evidence-5) | 未说明／未说明 |
| 2.1.90 / 2.1.92 | 环境标记 · 计费头入口标记 [↗](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md) | 部分过滤 | 默认启用计费归属头并构造 API 请求时，cc&#95;entrypoint 取环境变量或 unknown，cc&#95;workload 仅在有值时附加。 [详情](#termiters-evidence-6) | 未说明／未说明 |
| 2.1.90 / 2.1.92 | 协议指纹 · cc&#95;version 指纹后缀 [↗](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md) | 部分过滤 | 默认启用计费归属头并构造 API 请求时，注入合成消息前，取首条用户消息索引 4/7/20 字符与 salt、版本做 SHA-256，写入 cc&#95;version。 [详情](#termiters-evidence-7) | 未说明／未说明 |
| 2.1.90 / 2.1.92 | 协议指纹 · cch 占位符回写 [↗](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md) | 部分过滤 | 默认启用计费归属头并构造 API 请求时，若 NATIVE&#95;CLIENT&#95;ATTESTATION 开启，在 system 首块写 cch=00000，Bun 发送前等长替换。 [详情](#termiters-evidence-8) | 未说明／未说明 |
| 2.1.37 | 协议指纹 · cc&#95;version 后缀哈希 [↗](https://a10k.co/b/reverse-engineering-claude-code-cch.html) | 部分过滤 | 构造计费头时，取首条用户消息索引 4、7、20 字符（不足补 0），加 salt 和版本做 SHA-256，取前 3 位十六进制。 [详情](#termiters-evidence-9) | 2026 年 2 月／未说明 |
| 2.1.37 | 协议指纹 · cch 请求完整性哈希 [↗](https://a10k.co/b/reverse-engineering-claude-code-cch.html) | 部分过滤 | 向 /v1/messages 发送请求，体含 cch=00000 占位符且带 anthropic-version 头时，Bun 运行时计算并替换 cch。 [详情](#termiters-evidence-10) | 2026 年 2 月／未说明 |

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
**3. 端点分类撇号标记** · v2.1.169（npm @anthropic-ai/claude-code，原生 win32-x64 二进制） · [原报告](https://github.com/anthropics/claude-code/issues/67120)

机制：系统提示日期句撇号隐写：按 ANTHROPIC&#95;BASE&#95;URL 主机是否命中 KNOWN&#95;HOSTS 或 LAB&#95;KEYWORDS，把 Today's 的撇号写成 U+0027/U+2019/U+02BC/U+02B9 四个近形码点后随系统提示发出。

完整触发条件：共同前置条件：进入系统提示日期行构造（Today's date is …），且 classify() 中 gate() 为假才继续分类；此时读取 ANTHROPIC&#95;BASE&#95;URL 主机（未配置或解析失败取 U+0027），按精确或 &#42;.子域命中 KNOWN&#95;HOSTS、子串命中 LAB&#95;KEYWORDS 的四种组合分别取 ' / ’ / ʼ / ʹ。

未过滤：提供的适配器未对系统提示日期行做撇号码点规范化；engine.mjs 仅把自己的 systemPrompt 写入 --system-prompt-file 后启动 CLI，CLI 内部日期行不经过适配器，因此适配器不会去除该标记。入站转换与出站事件解析亦无相关过滤，边界是不覆盖 CLI 内部提示构造。

代码：[model-gateway/engine.mjs:109](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/engine.mjs#L109)、[model-gateway/engine.mjs:105](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/engine.mjs#L105)、[model-gateway/context.mjs:102](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/context.mjs#L102)；审阅提交 1665f50eb216。发现：报告未说明；引入：报告未说明。

<a id="termiters-evidence-4"></a>
**4. 时区日期分隔符** · v2.1.169（npm @anthropic-ai/claude-code，原生 win32-x64 二进制） · [原报告](https://github.com/anthropics/claude-code/issues/67120)

机制：系统提示日期分隔符隐写：当系统时区为 Asia/Shanghai 或 Asia/Urumqi 时，把写入系统提示的日期字符串中的 - 全部替换为 /，在正常日期句中承载时区标记。

完整触发条件：同一入口：构造 Today's date is … 系统提示日期行时，classify() 中 gate() 为假才继续分类，并由 Intl 时区计算 cnTZ；仅当 cnTZ 为真（系统时区为 Asia/Shanghai 或 Asia/Urumqi）时，日期中所有 - 替换为 /，其余时区保持原样。

未过滤：适配器未对日期分隔符做任何规范化；engine.mjs 把 systemPrompt 写入 --system-prompt-file 并启动 CLI，CLI 内部根据时区生成的日期行不经过适配器。入站/出站路径均无将 / 还原为 - 或过滤时区标记的代码，边界是不覆盖 CLI 内部日期构造。

代码：[model-gateway/engine.mjs:109](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/engine.mjs#L109)、[model-gateway/engine.mjs:89](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/engine.mjs#L89)、[model-gateway/context.mjs:102](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/context.mjs#L102)；审阅提交 1665f50eb216。发现：报告未说明；引入：报告未说明。

<a id="termiters-evidence-5"></a>
**5. 计费归属头元数据** · 2.1.90/2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

机制：计费归属头协议元数据：在 system 数组首个独立文本块写入 x-anthropic-billing-header，包含 cc&#95;version 指纹、cc&#95;entrypoint、可选 cch 和 cc&#95;workload，作为服务端计费/分析解析字段。

完整触发条件：默认启用计费归属头并构造 API 请求时，在合成消息注入前生成，并作为 system 数组首个独立文本块发送；可由 CLAUDE&#95;CODE&#95;ATTRIBUTION&#95;HEADER 环境变量或 tengu&#95;attribution&#95;header 功能开关关闭。

部分过滤：入站 /v1/messages 由 fromAnthropic 移除 system 文本块开头的 x-anthropic-billing-header 整行；CLI 出站生成的 system 首块不由适配器改写，出站路径未覆盖。

代码：[model-gateway/anthropic.mjs:17](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/anthropic.mjs#L17)、[model-gateway/server.mjs:126](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/server.mjs#L126)、[model-gateway/engine.mjs:111](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/engine.mjs#L111)；审阅提交 1665f50eb216。发现：报告未说明；引入：报告未说明。

<a id="termiters-evidence-6"></a>
**6. 计费头入口标记** · 2.1.90/2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

机制：计费头环境标记：cc&#95;entrypoint 记录入口来源，取 process.env.CLAUDE&#95;CODE&#95;ENTRYPOINT 或 unknown；cc&#95;workload 在 getWorkload() 返回有值时记录工作负载。

完整触发条件：默认启用计费归属头并构造 API 请求时，cc&#95;entrypoint 取 CLAUDE&#95;CODE&#95;ENTRYPOINT 或 unknown；cc&#95;workload 仅在 getWorkload() 返回有值时附加。

部分过滤：入站 fromAnthropic 剥离含 cc&#95;entrypoint/cc&#95;workload 的计费头整行，覆盖入站；CLI 出站请求由 engine.mjs 直接 spawn，适配器无出站过滤，环境标记未覆盖。

代码：[model-gateway/anthropic.mjs:17](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/anthropic.mjs#L17)、[model-gateway/server.mjs:126](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/server.mjs#L126)、[model-gateway/engine.mjs:111](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/engine.mjs#L111)；审阅提交 1665f50eb216。发现：报告未说明；引入：报告未说明。

<a id="termiters-evidence-7"></a>
**7. cc&#95;version 指纹后缀** · 2.1.90/2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

机制：cc&#95;version 后缀指纹：取首条用户消息索引 4、7、20 的字符（不足补 0），与 FINGERPRINT&#95;SALT 和版本号拼接后做 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：默认启用计费归属头并构造 API 请求时，在消息归一化后、注入合成消息前，从 messagesForAPI 首条用户消息文本提取索引 4、7、20 字符，与 FINGERPRINT&#95;SALT 和 MACRO.VERSION 拼接计算 SHA-256，取前 3 位十六进制写入 system 首块计费头的 cc&#95;version 后缀。

部分过滤：入站 Anthropic 路径会剥离 system 文本块开头的计费头整行，cc&#95;version 后缀随之被过滤；CLI 出站构造请求直接发往上游，不经过适配器，指纹写入路径未覆盖。

代码：[model-gateway/anthropic.mjs:17](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/anthropic.mjs#L17)、[model-gateway/server.mjs:126](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/server.mjs#L126)、[model-gateway/engine.mjs:111](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/engine.mjs#L111)；审阅提交 1665f50eb216。发现：报告未说明；引入：报告未说明。

<a id="termiters-evidence-8"></a>
**8. cch 占位符回写** · 2.1.90/2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

机制：cch 请求完整性哈希占位符回写：TS 层在启用的计费归属头中写入 cch=00000 占位符，不在 OSS 的 Bun 原生 HTTP 栈在发送前查找并等长替换为计算哈希；OSS 仅能确认占位符与等长替换，哈希算法和输入未验证。

完整触发条件：默认启用计费归属头并构造 API 请求时，若 feature('NATIVE&#95;CLIENT&#95;ATTESTATION') 为 true，在 system 首个计费头写入 cch=00000 占位符；请求体序列化后由 Bun 原生 HTTP 在发送前查找并等长替换。

部分过滤：入站 /v1/messages 经 fromAnthropic 时，system 文本块开头的 x-anthropic-billing-header 整行被剥离，入站 cch 占位符随之移除；CLI 内部 Bun 回写发生在适配器不拦截的出站请求中，未覆盖。

代码：[model-gateway/anthropic.mjs:17](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/anthropic.mjs#L17)、[model-gateway/server.mjs:126](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/server.mjs#L126)、[model-gateway/engine.mjs:111](https://github.com/KKBK-233/unbundle/blob/1665f50eb21697a650529ec6c3573a10f14aec65/model-gateway/engine.mjs#L111)；审阅提交 1665f50eb216。发现：报告未说明；引入：报告未说明。

<a id="termiters-evidence-9"></a>
**9. cc&#95;version 后缀哈希** · Claude Code 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

机制：cc&#95;version 后缀哈希：取第一条用户消息索引 4、7、20 的字符（不足补 0），与嵌在 JS 中的 salt 及版本号拼接后做 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：构造 Claude Code 计费头时，基于对话首条用户消息的特定位置字符和版本号计算 cc&#95;version 后缀，该后缀随对话内容变化。

部分过滤：fromAnthropic 仅移除 Anthropic 入站 system 文本块开头的 x-anthropic-billing-header 整行；若 cc&#95;version 及其 3 位后缀位于该行会被去除，否则正文或其他入口保留。CLI 内部构造并发送到上游的计费头不经适配器，engine 只通过 stdio 读写 CLI，未覆盖出站后缀哈希路径，故为 partial。

代码：[model-gateway/anthropic.mjs:17](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/anthropic.mjs#L17)、[model-gateway/engine.mjs:111](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/engine.mjs#L111)；审阅提交 3c4ebaf56687。发现：2026 年 2 月；引入：报告未说明。

<a id="termiters-evidence-10"></a>
**10. cch 请求完整性哈希** · Claude Code 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

机制：请求完整性哈希 cch：在 system 数组首个计费头中放置 cch=00000 占位符，Bun nativeFetch 对完整序列化请求体计算 xxHash64 后取低 5 位十六进制并回写替换。

完整触发条件：向 Anthropic API 发送 /v1/messages 请求，且请求体包含 cch=00000 占位符并带有 anthropic-version 头时，Bun nativeFetch 激活哈希替换。

部分过滤：仅 Anthropic 入站转换路径 fromAnthropic 会移除 system 文本块开头的 x-anthropic-billing-header 整行，若 cch=00000 占位符位于该行则被清除；普通正文内保留。CLI 子进程向上游 /v1/messages 的 Bun nativeFetch 替换不经该适配器，engine 仅以 stdio 启动 CLI，未覆盖出站哈希路径，故为 partial。

代码：[model-gateway/anthropic.mjs:17](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/anthropic.mjs#L17)、[model-gateway/engine.mjs:111](https://github.com/KKBK-233/unbundle/blob/3c4ebaf5668797f6971eda7e05cb351c43af8ade/model-gateway/engine.mjs#L111)；审阅提交 3c4ebaf56687。发现：2026 年 2 月；引入：报告未说明。

</details>

此追踪由 [TermiteRS](https://github.com/KKBK-233/TermiteRS) 进行在线追踪更新。

<!-- termiters:research:end -->
