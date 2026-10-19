# Unbundle

**化整为零，自由组合。单用户自部署，云端推理，本地工具与审批。**

Unbundle 是实验性 CLI 适配器：在自己控制的服务器上运行官方 Claude Code CLI，通过加密隧道连接本地 Harness。本地工作区、工具执行与审批由调用方掌握，云端网关负责推理请求和协议桥接。

## 1.0 快速安装

准备：Debian/Ubuntu x64 VPS、自己的 Claude 订阅、本机 Node.js 22+、OpenSSH 和 tar。复用已有 SSH 密钥或 Host 配置。

```powershell
git clone https://github.com/KKBK-233/unbundle.git
cd unbundle
npm ci
npm run deploy -- --host root@你的VPS
npm run login
npm run doctor
```

账号持有人完成官方浏览器登录。安装器准备云端依赖、协议验收、systemd 服务和 SSH 隧道，无需 FRP 或额外公网模型端口。已有网关时增加 `--profile second --local-port 18797`，保留原入口。

Claude Desktop 的配置说明与 CLI 设置文件输出到 `.local/profiles/名称/`；首次 Desktop 切换需用户操作，本版不会覆盖已有活动配置。`doctor` 不调用模型；显式使用 `doctor --live` 才进行一次真实推理。

完整步骤、支持范围与恢复方式见 [安装说明](INSTALL.md)。也可以把本仓库地址、VPS 的 SSH Host 和目标客户端交给本机 AI，按 [AGENTS.md](AGENTS.md) 完成安装。Windows 支持当前用户登录后自动维护隧道；其他本机系统暂用 `npm start` 启动。SSH 重连恢复后续连接，不恢复已断开的推理。

## 使用范围

- 每套部署面向同一账号持有人，使用自己的账号和设备；同一用户可以运行并发任务。
- 不提供多租户、账号池、订阅共享、额度转售或公共中转站支持。
- 不提供代管他人登录凭据的功能；官方 CLI 管理自身登录状态，网关不读取或转发 OAuth Token。
- 按上游服务允许的认证方式和使用范围运行，自部署不改变上游的使用规则。

上述内容说明项目支持范围，不是运行时访问限制或新的许可证条款。项目仍处于实验阶段，尚未添加开源许可证。

## 说明文档

安装前请阅读 [完整说明](https://github.com/KKBK-233/unbundle/blob/docs/README.md)，确认环境要求、部署步骤和兼容边界。

`main` 保存程序、配置模板、部署脚本与当前安装入口；[docs 分支](https://github.com/KKBK-233/unbundle/tree/docs) 集中维护详细文档和历史记录。

部署服务名、供应商 ID 和诊断标记沿用原值，以兼容已有安装和配置。

<!-- termiters:research:start -->
## 隐写与指纹跟踪

按报告分析版本新→旧排列。过滤仅对折叠证据列明的路径成立，不是端到端保证；未经真实流量验证，旧版标记不推定新版仍有。发现时间以原报告首发时间为准，不推断引入时间。

| 报告版本 | 机制 | 过滤 | 触发条件（摘要） | 发现时间 |
| --- | --- | --- | --- | --- |
| 2.1.196 | 隐写 · 日期撇号宿主分类 [↗](https://thereallo.dev/blog/claude-code-prompt-steganography) | 待核实 | 自定义 ANTHROPIC&#95;BASE&#95;URL（非官方主机）且主机命中域名清单或实验室关键词时，日期句撇号改为对应近形字符 [详情](#termiters-evidence-1) | 2026-06-30 |
| 2.1.196 | 隐写 · 日期分隔符时区标记 [↗](https://thereallo.dev/blog/claude-code-prompt-steganography) | 待核实 | 自定义 ANTHROPIC&#95;BASE&#95;URL（非官方主机）且系统时区为上海/乌鲁木齐时，日期分隔符 - 改为 / [详情](#termiters-evidence-2) | 2026-06-30 |
| 2.1.169 | 隐写 · 系统提示撇号端点标记 [↗](https://github.com/anthropics/claude-code/issues/67120) | 待核实 | 构造系统提示日期句且 gate() 为假；ANTHROPIC&#95;BASE&#95;URL 主机命中 KNOWN&#95;HOSTS 或含 LAB&#95;KEYWORDS 时按组合替换撇号。 [详情](#termiters-evidence-3) | 2026-06-10 |
| 2.1.169 | 隐写 · 系统提示日期分隔符标记 [↗](https://github.com/anthropics/claude-code/issues/67120) | 待核实 | 构造系统提示日期句且 gate() 为假；系统时区为 Asia/Shanghai 或 Asia/Urumqi 时将日期 - 替换为 /。 [详情](#termiters-evidence-4) | 2026-06-10 |
| 2.1.90 / 2.1.92 | 协议指纹 · 计费归属头 [↗](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md) | 部分过滤 | 归属头默认启用且未被环境变量/特性开关关闭时，随请求写入 system 首块。 [详情](#termiters-evidence-5) | 未说明 |
| 2.1.90 / 2.1.92 | 环境标记 · 入口/负载标记 [↗](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md) | 部分过滤 | 计费头启用时写入 cc&#95;entrypoint；仅 getWorkload() 有值时附加 cc&#95;workload。 [详情](#termiters-evidence-6) | 未说明 |
| 2.1.90 / 2.1.92 | 协议指纹 · cc&#95;version 指纹 [↗](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md) | 部分过滤 | 构造 API 请求且取首条用户消息，在注入合成消息前计算 3 位十六进制后缀。 [详情](#termiters-evidence-7) | 未说明 |
| 2.1.90 / 2.1.92 | 协议指纹 · cch 完整性哈希 [↗](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md) | 部分过滤 | NATIVE&#95;CLIENT&#95;ATTESTATION 开启且计费头发出时，先写 cch=00000，再由 Bun 发送前回写。 [详情](#termiters-evidence-8) | 未说明 |
| 2.1.37 | 协议指纹 · 计费归属头 [↗](https://a10k.co/b/reverse-engineering-claude-code-cch.html) | 部分过滤 | 每次请求在system数组首元素注入，位于身份行和系统提示前，含cc&#95;version/cc&#95;entrypoint/cch。 [详情](#termiters-evidence-9) | 未说明 |
| 2.1.37 | 环境标记 · cc&#95;entrypoint标记 [↗](https://a10k.co/b/reverse-engineering-claude-code-cch.html) | 部分过滤 | 每次请求的system首个计费头写入cc&#95;entrypoint，报告实测均为cli。 [详情](#termiters-evidence-10) | 未说明 |
| 2.1.37 | 协议指纹 · cc&#95;version后缀哈希 [↗](https://a10k.co/b/reverse-engineering-claude-code-cch.html) | 部分过滤 | 每次请求生成cc&#95;version时，取首条用户消息索引4/7/20字符，与salt和版本做SHA-256取前3位。 [详情](#termiters-evidence-11) | 未说明 |
| 2.1.37 / 1.3.9 | 协议指纹 · cch请求完整性哈希 [↗](https://a10k.co/b/reverse-engineering-claude-code-cch.html) | 部分过滤 | 请求路径含/v1/messages、带anthropic-version且体含cch=00000时计算并回写完整请求体哈希。 [详情](#termiters-evidence-12) | 未说明 |

<details>
<summary>展开完整条件与代码证据</summary>

<a id="termiters-evidence-1"></a>
**1. 日期撇号宿主分类** · Claude Code 2.1.196 · [原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)

机制：系统提示日期句撇号隐写：在构造系统上下文时，依据 ANTHROPIC&#95;BASE&#95;URL 主机是否命中解码域名清单或 AI 实验室关键词，选用 '、’、ʼ、ʹ 四个近形撇号，在 Today's date is … 句中承载宿主分类位。

完整触发条件：仅当 ANTHROPIC&#95;BASE&#95;URL 已设置且主机不是 api.anthropic.com 时进入标记路径；随后若主机命中解码域名清单或包含实验室关键词，日期句撇号才改为对应近形字符，否则保持普通撇号。

待核实：适配器可见路径仅移除入站 system 的 billing 行，并将自建 systemPrompt 原样写入 CLI；CLI 输出文本原样转发，未见撇号规范化。该机制位于 CLI 内部系统提示构造，提供代码不覆盖该路径，无法确认其是否被过滤。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:110](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L110)、[model-gateway/cli-events.mjs:57](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/cli-events.mjs#L57)；审阅提交 1160cc476165。发现时间：2026-06-30（以来源首发时间为准）。

<a id="termiters-evidence-2"></a>
**2. 日期分隔符时区标记** · Claude Code 2.1.196 · [原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)

机制：系统提示日期分隔符隐写：在构造系统上下文时，若系统时区为 Asia/Shanghai 或 Asia/Urumqi，将 Today's date is 后的日期从 YYYY-MM-DD 改为 YYYY/MM/DD，在正常日期句中承载时区标记位。

完整触发条件：仅当 ANTHROPIC&#95;BASE&#95;URL 已设置且指向非官方主机时进入标记路径；在此基础上，系统时区为 Asia/Shanghai 或 Asia/Urumqi 时，日期分隔符由 - 改为 /。

待核实：适配器未见日期分隔符规范化：入站 system 除 billing 行外原样进入提示，systemPrompt 原样写入 CLI，CLI 输出文本原样转发。该标记若由 CLI 内部日期句生成，提供代码不覆盖其构造路径，证据不足。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:110](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L110)、[model-gateway/server.mjs:183](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/server.mjs#L183)；审阅提交 1160cc476165。发现时间：2026-06-30（以来源首发时间为准）。

<a id="termiters-evidence-3"></a>
**3. 系统提示撇号端点标记** · v2.1.169（npm @anthropic-ai/claude-code，native win32-x64 binary） · [原报告](https://github.com/anthropics/claude-code/issues/67120)

机制：系统提示日期句撇号隐写：构造系统提示时，按 ANTHROPIC&#95;BASE&#95;URL 主机是否命中 KNOWN&#95;HOSTS 或包含 LAB&#95;KEYWORDS，在 Today's date is 句中选择 U+0027、U+2019、U+02BC、U+02B9 四个近形撇号，随提示发往端点。

完整触发条件：构造系统提示日期句且 gate() 为假；配置了 ANTHROPIC&#95;BASE&#95;URL 且主机精确匹配 KNOWN&#95;HOSTS 或以 .KNOWN&#95;HOST 结尾，或主机包含 LAB&#95;KEYWORDS 时，按命中组合选撇号；未命中则用 ASCII 撇号。

待核实：复核未通过：原文直接给出四码位撇号按 ANTHROPIC&#95;BASE&#95;URL 主机分类切换的机制、classify()/pickApostrophe() 逻辑与 v2.1.169 版本，trigger&#95;summary 保留了共同前置条件 gate() 为假，并正确概括「精确匹配或 .后缀 KNOWN&#95;HOSTS / 含 LAB&#95;KEYWORDS 组合」与默认 ASCII 撇号，版本字段有原文引文支撑，label 与 category=隐写 相符（近形码位携带端点分类，非协议签名或显式身份字段）。但所给仓库为 model-gateway 适配器，anthropic.mjs 仅删除系统块开头 billing 行，engine.mjs 只以 --system-prompt-file 传入自建提示，日期句由外部 CLI 内部生成并直接上行，代码中既无该撇号生成路径也无拦截/净化路径，且白名单版本为 2.1.280 而非 2.1.169，故代码证据不足以判定该机制存在或已被过滤，supported=false。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L104)；审阅提交 1160cc476165。发现时间：2026-06-10（以来源首发时间为准）。

<a id="termiters-evidence-4"></a>
**4. 系统提示日期分隔符标记** · v2.1.169（npm @anthropic-ai/claude-code，native win32-x64 binary） · [原报告](https://github.com/anthropics/claude-code/issues/67120)

机制：系统提示日期分隔符隐写：构造系统提示时，若系统时区为 Asia/Shanghai 或 Asia/Urumqi，将 Today's date is 后的日期从 YYYY-MM-DD 改为 YYYY/MM/DD，在正常日期句中承载时区标记位。

完整触发条件：构造系统提示日期句且 gate() 为假；系统时区为 Asia/Shanghai 或 Asia/Urumqi 时，将日期字符串中的 - 全部替换为 /，否则保持原分隔符。

待核实：复核未通过：原文明确「系统时区为 Asia/Shanghai 或 Asia/Urumqi 时 - 变 /」，并给出 buildDateLine 中 c?.cnTZ ? date.replaceAll('-','/') 的对应代码，trigger&#95;summary 完整保留 gate() 为假这一共同前置条件与两个时区条件，版本 v2.1.169 有原文引文支撑，label 与 category=隐写 相符（格式近似等价的分隔符携带时区分类位）。但所给适配器代码（context.mjs 仅拼接 RELAY&#95;PROMPT 与调用方指令，engine.mjs 写 --system-prompt-file）不包含日期句构造或该字符串的检测处理，无法证明该变异存在，也无法证明其被过滤或未被过滤，且调查版本（CLI 白名单 2.1.280）与报告版本不一致，故代码证据不完整，supported=false。

代码：[model-gateway/context.mjs:102](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L102)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L104)；审阅提交 1160cc476165。发现时间：2026-06-10（以来源首发时间为准）。

<a id="termiters-evidence-5"></a>
**5. 计费归属头** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

机制：计费归属头协议元数据：在 system 数组首个独立文本块写入 x-anthropic-billing-header，携带 cc&#95;version 指纹、cc&#95;entrypoint、可选 cch 与 cc&#95;workload，供服务端计费/分析解析。

完整触发条件：计费归属头默认启用；可由 CLAUDE&#95;CODE&#95;ATTRIBUTION&#95;HEADER 环境变量或 tengu&#95;attribution&#95;header 特性开关关闭。

部分过滤：仅在 Anthropic /v1/messages 入站 body.system 的各文本块开头删除整行；OpenAI messages 的 system 原样编入 instructions，且 engine 直接 spawn CLI，未提供拦截 CLI 内部出站请求的代码，故仅部分覆盖。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（以来源首发时间为准）。

<a id="termiters-evidence-6"></a>
**6. 入口/负载标记** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

机制：计费头环境标记：cc&#95;entrypoint 记录入口来源，取 CLAUDE&#95;CODE&#95;ENTRYPOINT 或 unknown；cc&#95;workload 在 getWorkload() 返回有值时记录工作负载。

完整触发条件：计费归属头启用时，cc&#95;entrypoint 取环境变量或 unknown；cc&#95;workload 仅在 getWorkload() 有值时出现。

部分过滤：无入口/负载标记专门过滤；仅 Anthropic body.system 的 billing 行首整行删除会一并移除 cc&#95;entrypoint/cc&#95;workload。OpenAI 系统消息与 CLI 内部出站未覆盖。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（以来源首发时间为准）。

<a id="termiters-evidence-7"></a>
**7. cc&#95;version 指纹** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

机制：cc&#95;version 后缀哈希：取首条用户消息索引 4、7、20 的字符（不足补 0），与内置 salt 和版本号拼成 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：构造 API 请求时，从 messagesForAPI 提取首条用户消息并在注入合成消息之前计算指纹。

部分过滤：未单独识别 cc&#95;version 哈希后缀；仅当它位于 Anthropic body.system 的 billing 行首时随整行删除。OpenAI system 原样保留，CLI 内部出站请求由官方 CLI 直发，未覆盖。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（以来源首发时间为准）。

<a id="termiters-evidence-8"></a>
**8. cch 完整性哈希** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

机制：cch 请求完整性哈希：计费头先写 cch=00000 占位符，原生 Bun HTTP 栈发送前在序列化请求体中查找并等长回写计算哈希；OSS 未验证算法与输入。

完整触发条件：仅当 feature('NATIVE&#95;CLIENT&#95;ATTESTATION') 为真且计费头发出时，cch=00000 被写入；发送前由 Bun 原生栈替换。

部分过滤：无 cch 专门匹配；仅 Anthropic body.system 开头 billing 行整行剥离可顺带删去占位符。Bun 发送前回写及 CLI 出站不在适配器代码中，OpenAI 系统消息亦不覆盖。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（以来源首发时间为准）。

<a id="termiters-evidence-9"></a>
**9. 计费归属头** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

机制：计费归属头协议元数据：在 system 数组首个独立文本块写入 x-anthropic-billing-header，携带 cc&#95;version、cc&#95;entrypoint 和 cch。

完整触发条件：每次发往 Anthropic API 的请求都会在 system 数组首个元素注入该计费头，位于身份行和系统提示之前。

部分过滤：Anthropic 入站顶层 system 块开头的 x-anthropic-billing-header 行会被 fromAnthropic 删除；但 messages 内 system/developer 内容原样转文本，OpenAI 入站经 compileContext 原样序列化，CLI 出站请求也未由适配器代理，覆盖不完整。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)；审阅提交 1160cc476165。发现时间：未说明（以来源首发时间为准）。

<a id="termiters-evidence-10"></a>
**10. cc&#95;entrypoint标记** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

机制：计费头环境标记：cc&#95;entrypoint 记录入口来源，报告实测始终为 cli；作为请求来源环境信号随计费头发出。

完整触发条件：每次发往 Anthropic API 的请求在 system 首个计费头写入 cc&#95;entrypoint；报告观察值为 cli。

部分过滤：cc&#95;entrypoint 随 billing 行在 Anthropic 顶层 system 块开头被 fromAnthropic 删除；但 messages 内 system/developer 内容原样保留，OpenAI 入站经 compileContext 原样序列化，CLI 出站请求未由适配器代理。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)；审阅提交 1160cc476165。发现时间：未说明（以来源首发时间为准）。

<a id="termiters-evidence-11"></a>
**11. cc&#95;version后缀哈希** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

机制：cc&#95;version 后缀哈希：取首条用户消息索引 4、7、20 的字符（不足补 0），与内置 salt 和版本号拼成 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：每次请求生成 cc&#95;version 时，从对话首条用户消息取固定索引字符参与哈希，生成三字符十六进制后缀。

部分过滤：cc&#95;version 位于 billing 行时，Anthropic 入站顶层 system 块首行会被 fromAnthropic 删除，后缀哈希随之不入上游；但适配器不计算该后缀，也不代理 CLI 出站请求，messages 内 system 角色与 OpenAI 入站均未覆盖。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)、[model-gateway/engine.mjs:98](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L98)；审阅提交 1160cc476165。发现时间：未说明（以来源首发时间为准）。

<a id="termiters-evidence-12"></a>
**12. cch请求完整性哈希** · Claude Code 2.1.37 / 定制 Bun 1.3.9-canary.51+d5628db23 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

机制：cch 请求完整性哈希：在 system 首个计费头写入 cch=00000 占位符，原生 Bun 对完整序列化请求体计算 xxHash64 后取低 5 位十六进制回写。

完整触发条件：请求路径含 /v1/messages、带 anthropic-version 头且请求体含 cch=00000 占位符时激活；哈希覆盖整个序列化请求体。

部分过滤：Anthropic 入站顶层 system 文本块开头的 billing 行会被 fromAnthropic 整体删除，故其中的 cch 占位符不会透传；但 cch 哈希由 CLI 内部出站请求计算，engine 直接 spawn CLI 且正式入口不注入 testUpstream，适配器未代理该出站路径。

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:98](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L98)；审阅提交 1160cc476165。发现时间：未说明（以来源首发时间为准）。

</details>

此追踪由 [TermiteRS](https://github.com/KKBK-233/TermiteRS) 进行在线追踪更新。

<!-- termiters:research:end -->
