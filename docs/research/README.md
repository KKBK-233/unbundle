<!-- termiters:research-evidence -->
# 研究证据

此文件自动生成；按机制保留多来源、版本、完整条件、原文引用与代码依据。

证据程度：报告描述＋源码静态评估。没有真实流量验证，不代表检测到了服务器实际发送行为。

<a id="mechanism-anthropic-cache-keepalive-response-header"></a>
## anthropic-cache-keepalive 响应头

机制 ID：anthropic-cache-keepalive-response-header

### 当前报告来源 · 2.1.300 · anthropic-cache-keepalive 响应头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)；评估时间：2026-11-14T03:16:27Z；审阅提交：0f6041e85c9b。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：缓存保活响应头：Messages 响应以 anthropic-cache-keepalive: active 通知客户端武装 cache&#95;touch。

完整触发条件：服务端在 Messages 响应中返回 anthropic-cache-keepalive: active。

方向：服务端 → CLI；触发：条件触发；网关处理：不经过网关。

当前有效性：未过滤。历史评估结论：未过滤。

这是上游服务端到 CLI 的条件响应头，不是客户端上传字段。网关 SSE 只写 content-type 与 cache-control，不生成也不复制该头；若上游返回，走 CLI 直连路径，未经网关过滤。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> the response header &#96;anthropic-cache-keepalive: active&#96;

报告原文（trigger）：

> the response header &#96;anthropic-cache-keepalive: active&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> the response header &#96;anthropic-cache-keepalive: active&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> armed when the response header &#96;anthropic-cache-keepalive: active&#96; is seen (&#96;:394191&#96;, &#96;:394360&#96;)

代码：[model-gateway/anthropic.mjs:81](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/anthropic.mjs#L81)

> res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cli-output-audit.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-anthropic-google-cloud-provider-plane"></a>
## Anthropic Google Cloud 平面

机制 ID：anthropic-google-cloud-provider-plane

### 当前报告来源 · 2.1.300 · Anthropic Google Cloud 平面

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)；评估时间：2026-11-14T03:16:27Z；审阅提交：0f6041e85c9b。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：Anthropic Google Cloud 提供方平面：选择该平面时请求发往 claude.googleapis.com，路径含 project/location/workspace，使用 Google bearer token。

完整触发条件：当 Ie() 选择 anthropicGoogleCloud（由 CLAUDE&#95;CODE&#95;USE&#95;ANTHROPIC&#95;GOOGLE&#95;CLOUD 等配置）且 workspaceId 提供时。

方向：本地客户端 → 网关；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

默认 env 白名单未设 CLAUDE&#95;CODE&#95;USE&#95;ANTHROPIC&#95;GOOGLE&#95;CLOUD 及 Google 项目、位置、工作区，Ie() 不会选 anthropicGoogleCloud，仍走 firstParty；若启用，该提供方请求由 CLI 直连 claude.googleapis.com，不经网关。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;https://claude.googleapis.com&#96;

报告原文（trigger）：

> &#96;CLAUDE&#95;CODE&#95;USE&#95;ANTHROPIC&#95;GOOGLE&#95;CLOUD&#96;, &#96;ANTHROPIC&#95;GOOGLE&#95;CLOUD&#95;{BASE&#95;URL,PROJECT,LOCATION,WORKSPACE&#95;ID}&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> &#96;https://claude.googleapis.com&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/environment-variables.md)

> &#124; &#42;&#42;&#96;CLAUDE&#95;CODE&#95;USE&#95;ANTHROPIC&#95;GOOGLE&#95;CLOUD&#96;&#42;&#42; &#124; bool (&#96;K&#96;) &#124; Selects the plane. Its display label is "Claude Platform on Google Cloud" (&#96;:21678&#96;). It is the 4th check in &#96;Ie()&#96; (&#96;:21729&#96;): gateway → bedrock → foundry → anthropicAws → &#42;&#42;anthropicGoogleCloud&#42;&#42; → mantle → vertex → firstParty &#124;

代码：[model-gateway/engine.mjs:94](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/engine.mjs#L94)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: discovery.environment, MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cli-output-audit.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-arbiter-safeguard-results-field"></a>
## 仲裁器 safeguard&#95;results 响应

机制 ID：arbiter-safeguard-results-field

### 当前报告来源 · 2.1.300 · 仲裁器 safeguard&#95;results 响应

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)；评估时间：2026-11-15T03:26:33Z；审阅提交：747f1900a697。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：仲裁器 safeguard&#95;results 响应协议指纹：服务端分类器响应携带 evaluated、skipped 或 unavailable 裁决。

完整触发条件：arbiter 服务端分类器返回响应时，响应中的 safeguard&#95;results 给出 evaluated、skipped 或 unavailable 裁决。

方向：服务端 → CLI；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

safeguard&#95;results 是 arbiter 服务端响应字段，不是本地入站上传；默认不启用自动模式，arbiter 不触发，故无该响应。服务端响应直接回 CLI，网关只读 CLI stdio 事件。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> the response field &#96;safeguard&#95;results&#96; (&#96;:96445&#96;) carry an &#96;evaluated{outcome:"flagged"&#124;"not&#95;flagged"}&#96; / &#96;skipped&#96; / &#96;unavailable&#96; verdict

报告原文（trigger）：

> the response field &#96;safeguard&#95;results&#96; (&#96;:96445&#96;)

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> the response field &#96;safeguard&#95;results&#96; (&#96;:96445&#96;)

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)

> The API beta &#96;dangerous-tool-use-2026-09-03&#96; (&#96;YC&#96;, &#96;:92316&#96;) and the response field &#96;safeguard&#95;results&#96; (&#96;:96445&#96;) carry an &#96;evaluated{outcome:"flagged"&#124;"not&#95;flagged"}&#96; / &#96;skipped&#96; / &#96;unavailable&#96; verdict (&#96;AEo&#96;, &#96;:431576&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)

> User-facing copy: &#42;"Auto mode held this command for the server-side classifier to review"&#42; (&#96;Ddn&#96;, &#96;:25531&#96;).

代码：[model-gateway/engine.mjs:105](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L105)

> '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

代码：[model-gateway/engine.mjs:129](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L129)

> lines = readline.createInterface({ input: child.stdout });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-probe.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-atis-pin-attribute"></a>
## ATIS pin 评估上下文属性

机制 ID：atis-pin-attribute

### 当前报告来源 · 2.1.300 · ATIS pin 评估上下文属性

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；评估时间：2026-10-22T09:49:12Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：ATIS pin 评估属性：atisPin 是远程评估上下文的属性之一（进入缓存键），其变化触发 GrowthBook 重评估，另由开关锁定会话 ATIS。

完整触发条件：共同前置为发生 GrowthBook 远程评估；在此前提下，评估上下文的 atisPin 属性发生变化时触发重评估，tengu&#95;kestrel&#95;moor 另锁定会话 ATIS。

方向：云端 CLI → 服务端；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

默认 engine 的 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1 经 Oj 关闭 GrowthBook，atisPin 只作为远程评估上下文属性随 eval 使用；无 eval 即不触发。网关只经 stdio 启动 CLI，不代理该属性或评估请求，额外启用时属 CLI 自发路径。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> The remote-eval cache is keyed on &#96;&#91;"id", "organizationUUID", "slackTagConnected", "atisPin", "ccrDerivedSurface"&#93;&#96;

报告原文（trigger）：

> &#96;tengu&#95;serene&#95;teacup&#96; (&#96;BW()&#96;, &#96;:142951&#96;) re-evaluates when the &#96;atisPin&#96; attribute changes.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> The remote-eval cache is keyed on &#96;&#91;"id", "organizationUUID", "slackTagConnected", "atisPin", "ccrDerivedSurface"&#93;&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#96;tengu&#95;serene&#95;teacup&#96; (&#96;BW()&#96;, &#96;:142951&#96;) re-evaluates when the &#96;atisPin&#96; attribute changes.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L92)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs、model-gateway/transport-check.mjs、model-gateway/wire-probe.mjs

<a id="mechanism-auto-mode-classifier-beta-header"></a>
## 自动模式分类器 beta 头协议指纹

机制 ID：auto-mode-classifier-beta-header

### 当前报告来源 · 2.1.300 · 自动模式分类器 beta 头协议指纹

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)；评估时间：2026-11-15T03:26:33Z；审阅提交：747f1900a697。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自动模式分类器 beta 头协议指纹：调用自动模式分类器时，请求携带 auto-mode-classifier-2026-07-16 beta 头，标识该请求为分类器调用。

完整触发条件：自动模式分类器请求被发起时，请求使用 querySource:auto&#95;mode 与 classifierStage:xml&#95;s1，并携带 auto-mode-classifier-2026-07-16 beta 头。

方向：云端 CLI → 服务端；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

网关用 &#96;--permission-mode dontAsk&#96; 和空 setting-sources 启动独立 CLI，默认不进入 auto 模式，自动模式分类器请求条件不成立；该 beta 头随 CLI 自发请求直连服务，不经网关。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#42;&#42;Beta header&#42;&#42; &#96;auto-mode-classifier-2026-07-16&#96; (&#96;wPo&#96;, &#96;:92315&#96;). &#42;&#42;NEW&#42;&#42;.

报告原文（trigger）：

> &#96;querySource:"auto&#95;mode"&#96;, &#96;classifierStage:"xml&#95;s1"&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> Request: &#96;max&#95;tokens&#96; = &#96;(fast ? 256 : 64) + budget&#96;, stop sequence &#96;&lt;/severity&gt;&#96; or &#96;&lt;/block&gt;&#96;, &#96;querySource:"auto&#95;mode"&#96;, &#96;classifierStage:"xml&#95;s1"&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)

> &#42;&#42;Beta header&#42;&#42; &#96;auto-mode-classifier-2026-07-16&#96; (&#96;wPo&#96;, &#96;:92315&#96;). &#42;&#42;NEW&#42;&#42;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)

> Request: &#96;max&#95;tokens&#96; = &#96;(fast ? 256 : 64) + budget&#96;, stop sequence &#96;&lt;/severity&gt;&#96; or &#96;&lt;/block&gt;&#96;, &#96;querySource:"auto&#95;mode"&#96;, &#96;classifierStage:"xml&#95;s1"&#96; (&#96;:456600&#96;–&#96;:456630&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)

> &#96;q0e()&#96; (&#96;:731673&#96;) computes &#96;canEnterAuto&#96; from &#96;tengu&#95;auto&#95;mode&#95;config.enabled&#96; (&#96;"disabled"&#96; → reason &#96;circuit-breaker&#96;), &#96;disableAutoMode&#96; (reason &#96;settings&#96;), &#96;disableFastMode&#96; together with &#96;/fast&#96; (reason &#96;fast-mode&#96;), and model support (reason &#96;model&#96;).

代码：[model-gateway/engine.mjs:105](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L105)

> '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-probe.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-auto-mode-classifier-context-meta"></a>
## 自动模式分类器环境元数据

机制 ID：auto-mode-classifier-context-meta

### 当前报告来源 · 2.1.300 · 自动模式分类器环境元数据

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)；评估时间：2026-11-15T03:26:33Z；审阅提交：747f1900a697。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自动模式分类器环境元数据：在分类器提示中按命令类型附加 repoVisibility、gitStatus 和 navigation 行，承载仓库可见性、工作区状态和跨站导航信息。

完整触发条件：自动模式分类器构造提示并发送时，若配置启用 repoVisibility/gitStatus，则分别在可外传 git/gh 命令、破坏性命令前附加 repoVisibility、gitStatus；Claude-in-Chrome 跨站跳转附加 navigation。

方向：云端 CLI → 服务端；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

repoVisibility/gitStatus/navigation 仅随自动模式分类器提示发送；默认 dontAsk 且 setting-sources 为空，不进入 auto 模式，分类器请求不触发。即使触发也属 CLI 自发上游请求，网关只经 stdio 收事件。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#42;&#42;NEW meta lines:&#42;&#42; &#96;repoVisibility&#96; before exfil-capable git/gh commands (&#96;"public"&#96; is authoritative), &#96;gitStatus&#96; before work-destroying commands (&#96;{"clean":true}&#96; clears the presume-dirty rule), and &#96;navigation:{from,to}&#96; for Claude-in-Chrome landings on another site.

报告原文（trigger）：

> &#96;repoVisibility:true&#96;, &#96;gitStatusType:true&#96;, &#96;gitStatusUploads:false&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> &#42;&#42;NEW meta lines:&#42;&#42; &#96;repoVisibility&#96; before exfil-capable git/gh commands (&#96;"public"&#96; is authoritative), &#96;gitStatus&#96; before work-destroying commands (&#96;{"clean":true}&#96; clears the presume-dirty rule), and &#96;navigation:{from,to}&#96; for Claude-in-Chrome landings on another site.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)

> &#42;&#42;NEW meta lines:&#42;&#42; &#96;repoVisibility&#96; before exfil-capable git/gh commands (&#96;"public"&#96; is authoritative), &#96;gitStatus&#96; before work-destroying commands (&#96;{"clean":true}&#96; clears the presume-dirty rule), and &#96;navigation:{from,to}&#96; for Claude-in-Chrome landings on another site.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)

> &#96;q0e()&#96; (&#96;:731673&#96;) computes &#96;canEnterAuto&#96; from &#96;tengu&#95;auto&#95;mode&#95;config.enabled&#96; (&#96;"disabled"&#96; → reason &#96;circuit-breaker&#96;), &#96;disableAutoMode&#96; (reason &#96;settings&#96;), &#96;disableFastMode&#96; together with &#96;/fast&#96; (reason &#96;fast-mode&#96;), and model support (reason &#96;model&#96;).

代码：[model-gateway/engine.mjs:105](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L105)

> '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-probe.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-background-dispatcher-tier-env"></a>
## 后台调度订阅层级环境标记

机制 ID：background-dispatcher-tier-env

### 当前报告来源 · 2.1.300 · 后台调度订阅层级环境标记

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)；评估时间：2026-10-22T09:45:06Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：后台调度订阅层级环境标记：后台调度器把订阅类型和速率限制层级写入 CLAUDE&#95;BG&#95;DISPATCHER&#95;&#42; 环境变量，交给后台子进程。

完整触发条件：后台调度器向后台子进程交接环境时，把订阅类型和速率限制层级写入 CLAUDE&#95;BG&#95;DISPATCHER&#95;&#42; 变量。

方向：组件内部传递；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

默认每轮以 --tools ''、--setting-sources ''、--no-session-persistence、--max-turns 2 启动独立 CLI，不产生后台子进程交接；CLAUDE&#95;BG&#95;DISPATCHER&#95;&#42; 只在后台调度器向子进程传递环境时生成。网关仅通过 stdio 与 CLI 交互，不介入该内部环境。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; / &#96;&#95;RATE&#95;LIMIT&#95;TIER&#96; are handed to background children (&#96;:102488–102491&#96;).

报告原文（trigger）：

> are handed to background children

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> are handed to background children

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

> &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; / &#96;&#95;RATE&#95;LIMIT&#95;TIER&#96; are handed to background children (&#96;:102488–102491&#96;).

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

### 当前报告来源 · 2.1.300 · 后台调度订阅层级环境标记

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)；评估时间：2026-10-22T10:00:45Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：后台调度订阅层级环境标记：仅当 CLAUDE&#95;CODE&#95;SESSION&#95;KIND 为 bg 时，从 CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE / CLAUDE&#95;BG&#95;DISPATCHER&#95;RATE&#95;LIMIT&#95;TIER 继承父会话计划与层级。

完整触发条件：当无 CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN、无 FD token 且 token 非来自 bg 快照，并且 CLAUDE&#95;CODE&#95;SESSION&#95;KIND 为 bg 时，后台调度器写入的 CLAUDE&#95;BG&#95;DISPATCHER&#95;&#42; 被读取，子进程继承父计划/层级。

方向：组件内部传递；触发：默认关闭／不触发；网关处理：移除。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

默认未设 CLAUDE&#95;CODE&#95;SESSION&#95;KIND=bg，且 engine env 白名单不含 CLAUDE&#95;BG&#95;DISPATCHER&#95;&#42;；CLI 以 -p 独立进程运行，不会从父会话继承后台计划/层级，默认不触发。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;$E()&#96; (&#96;130948&#96;) and &#96;GE()&#96; (&#96;131019&#96;) are &#42;&#42;NEW&#42;&#42; fallbacks. They apply only when &#96;Iee()&#96; (&#96;130964&#96;)  holds: no &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96;, no FD token (&#96;nn()&#96;), and the token did not come from a bg snapshot.  They read &#96;uOo()&#96; (&#96;102496&#96;), which returns &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; /  &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;RATE&#95;LIMIT&#95;TIER&#96; only when &#96;CLAUDE&#95;CODE&#95;SESSION&#95;KIND === "bg"&#96;. The dispatcher  sets them through &#96;JFs()&#96; (&#96;102485&#96;, key list &#96;Cgt&#96; &#96;102483&#96;). A bg-dispatched session therefore  inherits its parent's plan.

报告原文（trigger）：

> &#96;$E()&#96; (&#96;130948&#96;) and &#96;GE()&#96; (&#96;131019&#96;) are &#42;&#42;NEW&#42;&#42; fallbacks. They apply only when &#96;Iee()&#96; (&#96;130964&#96;)  holds: no &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96;, no FD token (&#96;nn()&#96;), and the token did not come from a bg snapshot.  They read &#96;uOo()&#96; (&#96;102496&#96;), which returns &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; /  &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;RATE&#95;LIMIT&#95;TIER&#96; only when &#96;CLAUDE&#95;CODE&#95;SESSION&#95;KIND === "bg"&#96;.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> A bg-dispatched session therefore  inherits its parent's plan.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> &#96;$E()&#96; (&#96;130948&#96;) and &#96;GE()&#96; (&#96;131019&#96;) are &#42;&#42;NEW&#42;&#42; fallbacks. They apply only when &#96;Iee()&#96; (&#96;130964&#96;)  holds: no &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96;, no FD token (&#96;nn()&#96;), and the token did not come from a bg snapshot.  They read &#96;uOo()&#96; (&#96;102496&#96;), which returns &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; /  &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;RATE&#95;LIMIT&#95;TIER&#96; only when &#96;CLAUDE&#95;CODE&#95;SESSION&#95;KIND === "bg"&#96;. The dispatcher  sets them through &#96;JFs()&#96; (&#96;102485&#96;, key list &#96;Cgt&#96; &#96;102483&#96;). A bg-dispatched session therefore  inherits its parent's plan.

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/wire-probe.mjs

<a id="mechanism-bridge-host-profile"></a>
## Bridge host profile

机制 ID：bridge-host-profile

### 当前报告来源 · 2.1.300 · Bridge host profile

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接主机软件画像：桥接注册的host字段携带平台、arch、OS版本、发行版、WSL、PATH工具清单和可选MCP服务器，默认关闭。

完整触发条件：仅在桥接环境注册路径、GrowthBook tengu&#95;bridge&#95;host&#95;profile 非 off 或 remoteControl.shareHostProfile 覆盖、且无 remote-control 设置错误时附加 host 软件画像；默认 off，full 含 MCP 列表。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

host 画像只在桥接注册路径附加，GrowthBook tengu&#95;bridge&#95;host&#95;profile 默认 "off"；默认 engine 未启动 remote-control/桥接，故默认不收集也不发送。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;Pzr()&#96; (&#96;:1074734&#96;) / &#96;Izr()&#96; (&#96;:1074792&#96;) collect a profile and attach it to bridge registration as

报告原文（trigger）：

> GrowthBook &#96;tengu&#95;bridge&#95;host&#95;profile&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

> GrowthBook &#96;tengu&#95;bridge&#95;host&#95;profile&#96; (default &#96;"off"&#96;, &#96;:1074678&#96;).

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-bridge-machine-id"></a>
## remoteControlMachineId 原样随桥接注册请求发送

机制 ID：bridge-machine-id

### 当前报告来源 · 2.1.300 · Bridge machine ID

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接环境机器ID透传：随机UUID remoteControlMachineId在注册远程控制桥环境时，作为顶层machine&#95;id和metadata.machine&#95;id原样发送。

完整触发条件：仅在 claude remote-control 桥接启动或独立桥接路径注册环境、且 remoteControlMachineId 非空时，将其作为顶层 machine&#95;id 和 metadata.machine&#95;id 发送到 /v1/environments/bridge。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

报告把 machine&#95;id 限定于 claude remote-control 或独立桥接注册 /v1/environments/bridge；默认 engine 以 -p 启动一次性 CLI，未启用 remote-control/桥接，默认不进入注册路径。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> machine&#95;id: r.machineId

报告原文（trigger）：

> &#42;&#42;Transmission:&#42;&#42; &#96;registerBridgeEnvironment&#96; (&#96;:1075710&#96;) POSTs to &#96;${baseUrl}/v1/environments/bridge&#96;:

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

> &#96;claude remote-control&#96; bridge startup: &#96;machineId: An&#96; (&#96;:1079764-1079864&#96;)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

### 当前报告来源 · 2.1.300 · remoteControlMachineId 原样随桥接注册请求发送

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/overview.md)；评估时间：2026-11-15T03:17:04Z；审阅提交：747f1900a697。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接环境机器 ID 透传：remoteControlMachineId（UUID）在 POST /v1/environments/bridge 中原样发送。

完整触发条件：当客户端实际发起 POST /v1/environments/bridge 注册桥接环境时触发；默认未启用远程控制时不产生该请求。

方向：云端 CLI → 服务端；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

默认远程控制未开：tengu&#95;cobalt&#95;harbor 默认 false，Unbundle 固定参数也未启用远程或桥接，不会发起 POST /v1/environments/bridge；若发起，属 CLI 自发请求，不经过网关。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> The NEW &#96;remoteControlMachineId&#96; (a UUID) is sent raw on &#96;POST /v1/environments/bridge&#96;.

报告原文（trigger）：

> The NEW &#96;remoteControlMachineId&#96; (a UUID) is sent raw on &#96;POST /v1/environments/bridge&#96;.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> The NEW &#96;remoteControlMachineId&#96; (a UUID) is sent raw on &#96;POST /v1/environments/bridge&#96;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/overview.md)

> The NEW &#96;remoteControlMachineId&#96; (a UUID) is sent raw on &#96;POST /v1/environments/bridge&#96;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;cobalt&#95;harbor&#96; &#124; &#96;false&#96; &#124; k &#124; kept &#124; &#96;:290108&#96; &#124; Default Remote Control ON at startup (a6o()) &#42;(2.1.197 desc.)&#42; &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', discovery.builtin, '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;caller&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', String(discovery.enabled ? discovery.maxCalls + 2 : 2), '--model', model, '--system-prompt-file', promptFile&#93;;

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs、model-gateway/session-entry.mjs

<a id="mechanism-bridge-owner-account-env"></a>
## 桥接所有者账号环境标记

机制 ID：bridge-owner-account-env

### 当前报告来源 · 2.1.300 · 桥接所有者账号环境标记

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)；评估时间：2026-10-22T09:45:06Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接所有者账号环境标记：桥接重连与桥接环境变量携带 owner account 和 organization UUID，供后续桥接流程识别归属。

完整触发条件：桥接重连或构造桥接环境变量时，把所有者账号与组织 UUID 写入 CLAUDE&#95;BRIDGE&#95;REATTACH&#95;&#42; / CLAUDE&#95;CODE&#95;BRIDGE&#95;&#42; 变量。

方向：组件内部传递；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

默认启动未启用远程控制/桥接，也无桥接重连；这些 owner/org 变量只在构造桥接子环境时由 CLI 写入。网关仅以白名单 env 启动独立 CLI 并走 stdio，不读取或改写该内部环境，故默认不产生该标记。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;CLAUDE&#95;BRIDGE&#95;REATTACH&#95;OWNER&#95;ACCT&#96; / &#96;&#95;ORG&#96; (&#96;:376419–376420&#96;) and &#96;CLAUDE&#95;CODE&#95;BRIDGE&#95;OWNER&#95;ACCOUNT&#95;UUID&#96; / &#96;&#95;ORG&#95;UUID&#96; (&#96;:24581–24584&#96;) carry the owner account and organization.

报告原文（trigger）：

> &#96;CLAUDE&#95;BRIDGE&#95;REATTACH&#95;OWNER&#95;ACCT&#96; / &#96;&#95;ORG&#96; (&#96;:376419–376420&#96;) and &#96;CLAUDE&#95;CODE&#95;BRIDGE&#95;OWNER&#95;ACCOUNT&#95;UUID&#96; / &#96;&#95;ORG&#95;UUID&#96; (&#96;:24581–24584&#96;) carry the owner account and organization.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> carry the owner account and organization

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

> &#96;CLAUDE&#95;BRIDGE&#95;REATTACH&#95;OWNER&#95;ACCT&#96; / &#96;&#95;ORG&#96; (&#96;:376419–376420&#96;) and &#96;CLAUDE&#95;CODE&#95;BRIDGE&#95;OWNER&#95;ACCOUNT&#95;UUID&#96; / &#96;&#95;ORG&#95;UUID&#96; (&#96;:24581–24584&#96;) carry the owner account and organization.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;ccr&#95;bridge&#96; &#124; &#96;!1&#96; / &#96;n/a&#96; &#124; k,rb &#124; kept &#124; &#96;:289564&#96; &#124; CCR bridge mode (cloud-backed remote execution bridge) &#42;(2.1.197 desc.)&#42; &#124;

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-cache-keepalive-touch-beta"></a>
## cache&#95;touch 缓存保活 beta

机制 ID：cache-keepalive-touch-beta

### 当前报告来源 · 2.1.300 · cache&#95;touch 缓存保活 beta

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)；评估时间：2026-11-14T03:16:27Z；审阅提交：0f6041e85c9b。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：缓存保活请求 beta 头：收到 active 响应头后向 /v1/messages/cache&#95;touch 发送 {request&#95;id}，并携带 cache-keepalive-2026-09-03 beta 头。

完整触发条件：收到响应头 anthropic-cache-keepalive: active 时武装。

方向：本地客户端 → 网关；触发：条件触发；网关处理：不经过网关。

当前有效性：未过滤。历史评估结论：未过滤。

报告仅在上游响应出现 anthropic-cache-keepalive: active 时武装 cache&#95;touch；默认网关不产生该头，故默认不触发。触发时 CLI 自发请求 /v1/messages/cache&#95;touch，满足报告条件时未经过网关过滤。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> Cache keep-alive ping, body &#96;{request&#95;id}&#96;, betas &#96;oauth-2025-04-20,cache-keepalive-2026-09-03&#96;

报告原文（trigger）：

> armed when the response header &#96;anthropic-cache-keepalive: active&#96; is seen

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> Cache keep-alive ping, body &#96;{request&#95;id}&#96;, betas &#96;oauth-2025-04-20,cache-keepalive-2026-09-03&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> &#124; &#96;/v1/messages/cache&#95;touch&#96; &#124; POST &#124; &#42;&#42;NEW.&#42;&#42; Cache keep-alive ping, body &#96;{request&#95;id}&#96;, betas &#96;oauth-2025-04-20,cache-keepalive-2026-09-03&#96; (&#96;A$(&#91;fEe,bI&#93;)&#96;, &#96;:394659-394667&#96;); armed when the response header &#96;anthropic-cache-keepalive: active&#96; is seen (&#96;:394191&#96;, &#96;:394360&#96;) &#124;

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

代码：[model-gateway/anthropic.mjs:81](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/anthropic.mjs#L81)

> res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cli-output-audit.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-ccr-heartbeat-probe-fields"></a>
## CCR 心跳探测字段

机制 ID：ccr-heartbeat-probe-fields

### 当前报告来源 · 2.1.300 · CCR 心跳探测字段

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)；评估时间：2026-11-14T03:16:27Z；审阅提交：0f6041e85c9b。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：CCR 心跳探测字段：Remote Control 的 CCRClient 心跳体携带 session&#95;id、worker&#95;epoch，并在探测开启时附加 supports&#95;heartbeat&#95;probe、current&#95;interval&#95;seconds 及 idle&#95;seconds。

完整触发条件：Remote Control 的 CCRClient.sendHeartbeat 且 tengu&#95;ccr&#95;idle&#95;heartbeat 为真、传输非 outboundOnly 时附加探测字段。

方向：本地客户端 → 网关；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

探测字段要求 Remote Control 的 CCRClient 且 tengu&#95;ccr&#95;idle&#95;heartbeat 为真；报告称该 flag 默认 false，默认 engine 未启用远程控制或 CCR，故不发送。若触发，心跳由 CLI 直连上游。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;{session&#95;id, worker&#95;epoch}&#96; plus, when probe support is on, &#96;supports&#95;heartbeat&#95;probe: true&#96;, &#96;current&#95;interval&#95;seconds&#96;, and &#96;idle&#95;seconds&#96; if the idle tracker has a sample

报告原文（trigger）：

> &#96;advertiseHeartbeatProbeSupport&#96; comes from &#96;k("tengu&#95;ccr&#95;idle&#95;heartbeat", false)&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> &#96;CCRClient.sendHeartbeat()&#96; (module 1319), used by Remote Control

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> &#96;CCRClient.sendHeartbeat()&#96; (module 1319), used by Remote Control

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> &#96;advertiseHeartbeatProbeSupport&#96; comes from &#96;k("tengu&#95;ccr&#95;idle&#95;heartbeat", false)&#96;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', discovery.builtin, '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;caller&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', String(discovery.enabled ? discovery.maxCalls + 2 : 2), '--model', model, '--system-prompt-file', promptFile&#93;;

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cli-output-audit.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-ccr-idle-heartbeat-probe"></a>
## CCR idle heartbeat probe

机制 ID：ccr-idle-heartbeat-probe

### 当前报告来源 · 2.1.300 · CCR idle heartbeat probe

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；评估时间：2026-10-21T03:15:16Z；审阅提交：c95455119f84。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：CCR 空闲心跳探测声明：CCR worker 空闲时按 flag 在心跳中声明支持 heartbeat-probe。

完整触发条件：CCR worker 空闲且 tengu&#95;ccr&#95;idle&#95;heartbeat 为 true 时广告 heartbeat-probe 支持；默认 false。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（来源已修订）。历史评估结论：当前配置不触发。

该机制要求 CCR worker 空闲且 tengu&#95;ccr&#95;idle&#95;heartbeat 为 true；报告明确该 flag 默认 false。默认网关以 -p 单轮方式启动官方 CLI，env 从空对象按白名单构造且未注入 CLAUDE&#95;CODE&#95;REMOTE/CCR worker 启动条件；因此默认不会广告 heartbeat-probe 支持。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#124; &#96;tengu&#95;ccr&#95;idle&#95;heartbeat&#96; &#124; &#96;false&#96; &#124; k &#124; NEW &#124; &#96;:1051142&#96; &#124; Advertise heartbeat-probe support while idle. &#124;

报告原文（trigger）：

> &#124; &#96;tengu&#95;ccr&#95;idle&#95;heartbeat&#96; &#124; &#96;false&#96; &#124; k &#124; NEW &#124; &#96;:1051142&#96; &#124; Advertise heartbeat-probe support while idle. &#124;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;ccr&#95;idle&#95;heartbeat&#96; &#124; &#96;false&#96; &#124; k &#124; NEW &#124; &#96;:1051142&#96; &#124; Advertise heartbeat-probe support while idle. &#124;

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-device-bind-attestation"></a>
## 每账号 ECDSA P-256 设备密钥注册留存

机制 ID：device-bind-attestation

### 当前报告来源 · 2.1.300 · 会话设备绑定证明

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)；评估时间：2026-10-22T09:39:51Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：会话设备绑定证明：向 /v1/code/sessions/{id}/device 发送 target&#95;device&#95;id、bind&#95;attestation（kid、signature）及 bind&#95;attestation&#95;issued&#95;at，形成设备绑定凭证。

完整触发条件：客户端调用 /v1/code/sessions/{id}/device 进行会话设备绑定时发送。

方向：本地客户端 → 网关；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：待核实（来源已修订）。历史评估结论：当前配置不触发。

默认 CLI 以 -p 单次推理启动，未建立 CCR 会话，未调用 /v1/code/sessions/{id}/device；报告要求设备绑定时才发送 bind&#95;attestation。该请求由 CLI 自发，不经过网关入站适配器，故默认不触发。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> Device bind: &#96;{target&#95;device&#95;id, bind&#95;attestation:{kid,signature}, bind&#95;attestation&#95;issued&#95;at, …}&#96; (&#96;:1518262&#96;)

报告原文（trigger）：

> &#96;/v1/code/sessions/{id}/device&#96; &#124; POST &#124; &#42;&#42;NEW.&#42;&#42; Device bind:

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> &#96;/v1/code/sessions/{id}/device&#96; &#124; POST &#124; &#42;&#42;NEW.&#42;&#42; Device bind:

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> &#124; &#96;/v1/code/sessions/{id}/device&#96; &#124; POST &#124; &#42;&#42;NEW.&#42;&#42; Device bind: &#96;{target&#95;device&#95;id, bind&#95;attestation:{kid,signature}, bind&#95;attestation&#95;issued&#95;at, …}&#96; (&#96;:1518262&#96;) &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L92)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/cloud-server.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

### 当前报告来源 · 2.1.300 · Device bind attestation

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：设备绑定证明透传：按账号生成P-256设备密钥并注册为远程设备，会话创建请求携带target&#95;device&#95;id与ECDSA bind&#95;attestation签名，形成服务端可核验的设备凭证。

完整触发条件：仅在 tengu&#95;violin&#95;wood 开启、非 diskless 且已按账号生成/加载 P-256 设备密钥并向 /cowork/remote&#95;devices 注册后，创建会话时附加 target&#95;device&#95;id 与 bind&#95;attestation；否则不发送。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

设备绑定由 GrowthBook 主 gate tengu&#95;violin&#95;wood 控制，报告默认值 !1（关），并需按账号注册设备密钥。默认 engine 未启用远程设备绑定，默认不发送 target&#95;device&#95;id/bind&#95;attestation。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> P-256 keypair; server row UUID (&#42;&#42;NEW&#42;&#42;)

报告原文（trigger）：

> Session create then carries &#96;target&#95;device&#95;id: deviceUUID&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

> Gated by &#96;nx()&#96; = &#96;rb("tengu&#95;violin&#95;wood")&#96; (module 272, &#96;:280539-280544&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;violin&#95;wood&#96; &#124; &#96;n/a&#96; / &#96;!1&#96; &#124; k,rb,vn,vr &#124; NEW &#124; &#96;:280541&#96; &#124; Master gate (rb nx() / k Xf()); env CLAUDE&#95;CODE&#95;HIDE&#95;CWD near a site. &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

### 当前报告来源 · 2.1.300 · 每账号 ECDSA P-256 设备密钥注册留存

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/overview.md)；评估时间：2026-11-15T03:17:04Z；审阅提交：747f1900a697。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：设备绑定密钥注册留存：按账号生成 ECDSA P-256 设备密钥并在服务端注册，注销后仍保留。

完整触发条件：当为账号注册 ECDSA P-256 设备密钥时触发；该注册在注销后仍保留。

方向：云端 CLI → 服务端；触发：待核实；网关处理：待核实。

当前有效性：待核实。历史评估结论：待核实。

报告只称每账号 ECDSA P-256 设备密钥在服务端注册并跨注销保留，未给出默认触发条件或控制开关；Unbundle 默认是否注册无法判定。网关只启动 CLI，不处理该出站注册。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> The NEW per-account ECDSA P-256 device key is registered server-side and &#42;&#42;survives logout&#42;&#42;.

报告原文（trigger）：

> The NEW per-account ECDSA P-256 device key is registered server-side and &#42;&#42;survives logout&#42;&#42;.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> The NEW per-account ECDSA P-256 device key is registered server-side and &#42;&#42;survives logout&#42;&#42;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/overview.md)

> The NEW per-account ECDSA P-256 device key is registered server-side and &#42;&#42;survives logout&#42;&#42;.

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs、model-gateway/session-entry.mjs

<a id="mechanism-environment-context-attachment"></a>
## 环境附件工作目录与主机画像

机制 ID：environment-context-attachment

### 当前报告来源 · 2.1.300 · 环境附件工作目录与主机画像

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/system-prompt.md)；评估时间：2026-11-12T03:19:09Z；审阅提交：327237427977。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：环境附件环境画像：每轮把工作目录、git 仓库、附加目录、平台、Shell、OS 版本和 scratchpad 渲染为用户 isMeta 消息随对话发送。

完整触发条件：非 SIMPLE、非 bareFork、非 isolatedContext 时每轮渲染 environment 附件；字段变化发 # Environment update 增量，cwd 消失或重现时记录 tengu&#95;environment&#95;directory&#95;change。

方向：本地客户端 → 网关；触发：待核实；网关处理：待核实。

当前有效性：待核实。历史评估结论：待核实。

复核未通过：2.1.300 报告支持该环境附件机制：每轮构建并以 user isMeta 渲染，Btt 排除 SIMPLE、bareFork、isolatedContext，字段变化发增量并记录 cwd 变化遥测。但候选评估的 status、handling、trigger&#95;state 均为 unknown，reason 明确称尚不能确定过滤状态，summary 却断言“未经过网关过滤”，把未知证据当成未过滤结论，且摘要与状态、理由矛盾；现有代码只展示网关启动 CLI 及 CLI 自身上游发送，未给出一致的过滤处理结论。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> Full: &#96;# Environment&#96; / &#96;You have been invoked in the following environment: &#96; + bullets (&#96;lgt&#96;, &#96;:388648&#96;). Delta: &#96;# Environment update&#96; + changed fields (&#96;ugt&#96;, &#96;:388698&#96;)

报告原文（trigger）：

> &#96;Btt&#96;: not SIMPLE, not &#96;bareFork&#96;, not &#96;isolatedContext&#96; (&#96;:554492&#96;)

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> render as &#96;isMeta&#96; user messages (&#96;:588925&#96;)

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/system-prompt.md)

> The attachment builders run per turn (&#96;:553890&#96;, &#96;hd("environment", …)&#96;, &#96;hd("model", …)&#96;, &#96;hd("session&#95;settings", …)&#96;) and render as &#96;isMeta&#96; user messages (&#96;:588925&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/system-prompt.md)

> &#124; &#96;environment&#96; &#124; &#96;YAn&#96; (&#96;:554512&#96;) via &#96;igt&#96; (&#96;:388577&#96;) &#124; &#96;Btt&#96;: not SIMPLE, not &#96;bareFork&#96;, not &#96;isolatedContext&#96; (&#96;:554492&#96;) &#124; Full: &#96;# Environment&#96; / &#96;You have been invoked in the following environment: &#96; + bullets (&#96;lgt&#96;, &#96;:388648&#96;). Delta: &#96;# Environment update&#96; + changed fields (&#96;ugt&#96;, &#96;:388698&#96;) &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/327237427977204476b665d465c69b4688059d25/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', discovery.builtin, '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;caller&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', String(discovery.enabled ? discovery.maxCalls + 2 : 2), '--model', model, '--system-prompt-file', promptFile&#93;;

代码：[model-gateway/engine.mjs:94](https://github.com/KKBK-233/unbundle/blob/327237427977204476b665d465c69b4688059d25/model-gateway/engine.mjs#L94)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: discovery.environment, MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/327237427977204476b665d465c69b4688059d25/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

代码：[model-gateway/context.mjs:11](https://github.com/KKBK-233/unbundle/blob/327237427977204476b665d465c69b4688059d25/model-gateway/context.mjs#L11)

> // 环境块说明：CLI 在对话末尾追加的环境信息描述的是云端服务器，最显眼却与工具实际所在位置相反，需显式消歧。

<a id="mechanism-environment-runner-version-header"></a>
## x-environment-runner-version 头

机制 ID：environment-runner-version-header

### 当前报告来源 · 2.1.300 · x-environment-runner-version 头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)；评估时间：2026-11-14T03:16:27Z；审阅提交：0f6041e85c9b。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：环境运行器版本头：桥接环境请求携带 x-environment-runner-version，标识运行器版本。

完整触发条件：桥接环境请求使用 Bearer 与 environments-2025-11-01 beta 头时发送。

方向：本地客户端 → 网关；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

报告仅让桥接环境请求（Bearer 与 environments-2025-11-01）携带 x-environment-runner-version；默认 engine 未启用桥接或远程控制，不调用 /v1/environments/bridge，故不触发。若触发为 CLI 直连上游，网关不介入。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;x-environment-runner-version&#96; and optional &#96;X-Trusted-Device-Token&#96;

报告原文（trigger）：

> &#96;anthropic-beta: environments-2025-11-01&#96; (&#96;bPo.header&#96;)

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> &#96;x-environment-runner-version&#96; and optional &#96;X-Trusted-Device-Token&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> Headers: &#96;Bearer&#96;, &#96;anthropic-beta: environments-2025-11-01&#96; (&#96;bPo.header&#96;), &#96;x-environment-runner-version&#96; and optional &#96;X-Trusted-Device-Token&#96; (&#96;:1075676-1075688&#96;).

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', discovery.builtin, '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;caller&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', String(discovery.enabled ? discovery.maxCalls + 2 : 2), '--model', model, '--system-prompt-file', promptFile&#93;;

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cli-output-audit.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-feature-name-telemetry-enum"></a>
## 遥测 feature&#95;name 闭集枚举

机制 ID：feature-name-telemetry-enum

### 当前报告来源 · 2.1.300 · 遥测 feature&#95;name 闭集枚举

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)；评估时间：2026-10-22T09:42:46Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：遥测 feature&#95;name 闭集枚举：tengu&#95;feature&#95;ok/bad/sad 事件使用由 gH、&#95;H、yH 合并成的 1,431 项 feature&#95;name 闭集枚举。

完整触发条件：当客户端发出 tengu&#95;feature&#95;ok/bad/sad 遥测事件时，feature&#95;name 从 1,431 项闭集枚举中取值，承载内部功能名。

方向：证据不足；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

feature&#95;name 仅随 CLI 的 tengu&#95;feature&#95;ok/bad/sad 遥测发出。网关默认注入 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，报告的控制矩阵称其关闭 1P、Datadog、错误上报等非必要流量，故默认不触发。若开启遥测也属 CLI 自发路径，不经过网关字段过滤。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#42;&#42;Closed &#96;feature&#95;name&#96; enum&#42;&#42; of 1,431 names: &#96;gH&#96; (1,427, &#96;:135922&#96;) plus 4 names from &#96;&#95;H&#96;/&#96;yH&#96;, joined into &#96;Uk&#96; at &#96;:135928&#96;

报告原文（trigger）：

> used by &#96;tengu&#95;feature&#95;ok/bad/sad&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> used by &#96;tengu&#95;feature&#95;ok/bad/sad&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)

> &#42;&#42;Closed &#96;feature&#95;name&#96; enum&#42;&#42; of 1,431 names: &#96;gH&#96; (1,427, &#96;:135922&#96;) plus 4 names from &#96;&#95;H&#96;/&#96;yH&#96;, joined into &#96;Uk&#96; at &#96;:135928&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

代码：[model-gateway/engine.mjs:93](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L93)

> CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-growthbook-authed-eval-endpoint"></a>
## GrowthBook 认证评估端点

机制 ID：growthbook-authed-eval-endpoint

### 当前报告来源 · 2.1.300 · GrowthBook 认证评估端点

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)；评估时间：2026-11-14T03:16:27Z；审阅提交：0f6041e85c9b。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：GrowthBook 认证远程评估端点：开关启用后向 /api/eval-authed/{clientKey} 发送带 OAuth 头的评估请求，失败回退 /api/eval。

完整触发条件：仅当 tengu&#95;gb&#95;eval&#95;authed&#95;enable 启用时使用；否则或失败时回退 /api/eval。

方向：本地客户端 → 网关；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

默认 engine 固定 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，报告控制矩阵称其关闭 GrowthBook；且 tengu&#95;gb&#95;eval&#95;authed&#95;enable 默认 false，故认证评估不发送。若启用也由 CLI 直连 /api/eval-authed，不经网关。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> Authenticated remote eval (POST with OAuth headers) behind flag &#96;tengu&#95;gb&#95;eval&#95;authed&#95;enable&#96; (default &#96;!1&#96;); falls back to &#96;/api/eval&#96; on error

报告原文（trigger）：

> behind flag &#96;tengu&#95;gb&#95;eval&#95;authed&#95;enable&#96; (default &#96;!1&#96;); falls back to &#96;/api/eval&#96; on error

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> Authenticated remote eval (POST with OAuth headers)

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> &#124; &#96;/api/eval-authed/{clientKey}&#96; &#124; &#96;api.anthropic.com&#96; &#124; &#42;&#42;NEW.&#42;&#42; Authenticated remote eval (POST with OAuth headers) behind flag &#96;tengu&#95;gb&#95;eval&#95;authed&#95;enable&#96; (default &#96;!1&#96;); falls back to &#96;/api/eval&#96; on error (&#96;:134018-134054&#96;) &#124;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

代码：[model-gateway/engine.mjs:94](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/engine.mjs#L94)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: discovery.environment, MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cli-output-audit.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

### 当前报告来源 · 2.1.300 · GrowthBook 认证评估端点

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；评估时间：2026-10-22T09:49:12Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：GrowthBook 认证远程评估端点：开关启用后客户端向 ${host}/api/eval-authed/{clientKey} 发送评估请求；工作区可信时先刷新 OAuth 再附认证头，失败或非 OK 时回退 /api/eval。

完整触发条件：共同前置为客户端发起 GrowthBook 远程评估且 tengu&#95;gb&#95;eval&#95;authed&#95;enable 为真（在解析类内部读取）；工作区可信时先刷新 OAuth 并附加认证头，不可信工作区仍请求 eval-authed 但无认证头；响应非 OK 或抛错回退 /api/eval。

方向：云端 CLI → 服务端；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

默认 engine 向子 CLI 注入 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，报告明确其经 Oj 关闭 GrowthBook；eval-authed 以远程评估为前提，故默认不触发。网关只 spawn CLI 经 stdio 交互，不介入其 GrowthBook 出站 HTTP；额外启用时亦属 CLI 自发路径。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> the client POSTs to &#96;${host}/api/eval-authed/${clientKey}&#96;

报告原文（trigger）：

> When &#96;tengu&#95;gb&#95;eval&#95;authed&#95;enable&#96; is on (read inside the class, &#96;:134017&#96;)

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> the client POSTs to &#96;${host}/api/eval-authed/${clientKey}&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> When &#96;tengu&#95;gb&#95;eval&#95;authed&#95;enable&#96; is on (read inside the class, &#96;:134017&#96;), the client POSTs to &#96;${host}/api/eval-authed/${clientKey}&#96;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L92)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs、model-gateway/transport-check.mjs、model-gateway/wire-probe.mjs

<a id="mechanism-install-user-id-metadata"></a>
## 持久 userID 原样透传至 Messages 元数据及遥测

机制 ID：install-user-id-metadata

### 当前报告来源 · 2.1.300 · Install userID metadata passthrough

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：持久安装用户标识透传：配置中无合法64位十六进制userID时随机生成并持久化，之后作为device&#95;id/user.id原样发往Messages API metadata.user&#95;id、1P事件、GrowthBook和OTel。

完整触发条件：在构造 Messages API metadata.user&#95;id 或各遥测入口时，总是读取持久 userID（无合法 64 位十六进制则随机生成并持久化），随后 Messages API 将其作为 device&#95;id 原样写入，1P/GrowthBook/OTel 另按各自通道发送。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待重评（报告核验未完成）。历史评估结论：未过滤。

报告基准下，Messages API metadata.user&#95;id 由 CLI 自行构造出站；默认 engine 仅 spawn CLI，经 stdio 传输入并读事件，不代理或改写 CLI 到 Anthropic 的请求。essential-traffic 只关遥测，不关 Messages 推理；CLI 自发路径满足触发条件时未经过网关过滤。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;userID&#96; → raw on Messages API &#96;metadata.user&#95;id&#96;, 1P events, GrowthBook, OTel &#96;user.id&#96;, and the NEW built-in plugin telemetry service.

报告原文（trigger）：

> &#42;&#42;Messages API &#96;metadata.user&#95;id&#96;&#42;&#42; (&#96;EBe&#96;, module 187, &#96;:176875-176918&#96;):

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

> &#96;userID&#96; → raw on Messages API &#96;metadata.user&#95;id&#96;, 1P events, GrowthBook, OTel &#96;user.id&#96;, and the NEW built-in plugin telemetry service.

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

### 当前报告来源 · 2.1.300 · 持久 userID 原样透传至 Messages 元数据及遥测

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/overview.md)；评估时间：2026-11-15T03:17:04Z；审阅提交：747f1900a697。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：安装用户标识 metadata 透传：userID 作为 Messages API 的 metadata.user&#95;id 原样发出，并进入 1P 事件、GrowthBook 和 OTel。

完整触发条件：当本地已有或首次生成并持久化 userID 后，发起 Messages API 请求或 1P/GrowthBook/OTel 上报时触发。

方向：多条路径（见证据）；触发：默认触发；网关处理：不经过网关。

当前有效性：未过滤。历史评估结论：未过滤。

Messages 路径：默认 CLI 自发请求携带 metadata.user&#95;id，网关仅经 stdio 启动独立 CLI，不介入出站，满足报告条件时未经过网关过滤。1P/GrowthBook 因默认设置禁用非必要流量而不发送；用户 OTel 默认未启用。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;userID&#96; still leaves raw (Messages API &#96;metadata.user&#95;id&#96;, 1P events, GrowthBook, OTel).

报告原文（trigger）：

> &#96;userID&#96; still leaves raw (Messages API &#96;metadata.user&#95;id&#96;, 1P events, GrowthBook, OTel).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> &#96;userID&#96; still leaves raw (Messages API &#96;metadata.user&#95;id&#96;, 1P events, GrowthBook, OTel).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/overview.md)

> &#96;userID&#96; still leaves raw (Messages API &#96;metadata.user&#95;id&#96;, 1P events, GrowthBook, OTel).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

代码：[model-gateway/engine.mjs:94](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L94)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: discovery.environment, MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs、model-gateway/session-entry.mjs

<a id="mechanism-low-priority-slow-protocol-headers"></a>
## 低优先级慢速通道协议头

机制 ID：low-priority-slow-protocol-headers

### 当前报告来源 · 2.1.300 · 低优先级慢速通道协议头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)；评估时间：2026-10-22T10:00:45Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：低优先级慢速通道协议头：服务端 slow-&#42; 头下发 treatment/control，客户端激活后发送 anthropic-usage-limit: slow。

完整触发条件：消费者 OAuth（kt）且 firstParty、billingType 非 usage&#95;based、交互会话、非远程模式且非 $t()，限流类型为 five&#95;hour，低优先级开关 tengu&#95;toasty&#95;breeze.enabled === true 且服务端 slow-offer 为 treatment 时，激活后请求携带 anthropic-usage-limit: slow。

方向：多条路径（见证据）；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

该头在 CLI 激活低优先级后由其直连上游发送；但默认 engine 以 -p 非交互方式启动，报告要求交互会话且 flag/treatment 才触发，故默认不发送。网关只经 stdio 与 CLI 交互，不介入该出站头。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> - The server arms the offer through &#42;&#42;NEW&#42;&#42; headers &#96;anthropic-ratelimit-unified-slow-offer&#96;  (&#96;treatment&#96;&#124;&#96;control&#96;), &#96;-slow-status&#96; (&#96;active&#96;/&#96;not&#95;needed&#96;/&#96;slot&#95;busy&#96;/&#96;weekly&#95;limit&#96;/  &#96;budget&#95;exhausted&#96;/&#96;ineligible&#96;/&#96;off&#96;), &#96;-slow-retry-after&#96;, &#96;-slow-max-wait&#96;,  &#96;-slow-budget-utilization&#96; and &#96;-slow-budget-reset&#96; (&#96;177296&#96;–&#96;177337&#96;). None of them occur in 2.1.197.  &#96;EVe()&#96; (&#96;934618&#96;) offers only on &#96;treatment&#96;. &#96;lXo()&#96; logs &#96;tengu&#95;lowpri&#95;offer&#95;capable&#96; for either arm;  &#96;tengu&#95;lowpri&#95;offer&#95;withheld&#96; (&#96;934652&#96;) fires for a &#42;&#42;&#96;treatment&#96;&#42;&#42; arm suppressed by the cool-off  (&#96;TBe()&#96; set, &#96;reason: "cooloff"&#96;), not for &#96;control&#96;. - While active (&#96;iL()&#96; &#96;177442&#96;), requests carry &#42;&#42;&#96;anthropic-usage-limit: slow&#96;&#42;&#42; (&#96;wpt&#96;/&#96;PCr&#96;,  &#96;177294&#96;; set at &#96;182423&#96; and &#96;529644&#96;). The header name itself is &#42;&#42;not&#42;&#42; new: 2.1.197 already sent  &#96;anthropic-usage-limit: extended&#96; behind &#96;tengu&#95;lantern&#95;spool&#96; (&#96;2.1.197:595982&#96;), and 2.1.300 still  does (&#96;529645&#96;). The &#96;slow&#96; value is NEW.

报告原文（trigger）：

> Gate &#96;Ept()&#96; (&#96;177366&#96;) is &#96;k("tengu&#95;toasty&#95;breeze", {}).enabled === !0&#96;. The flag object also supplies  copy and &#96;cooloffMinutes&#96; (clamped 0–1440, default 10, &#96;177391&#96;–&#96;177395&#96;). - Eligibility: &#96;Xvt()&#96; (&#96;934499&#96;) requires &#96;kt()&#96;, &#96;billingType !== "usage&#95;based"&#96;, &#96;Aa()&#96; (firstParty),  an interactive session, not remote mode and not &#96;$t()&#96;. &#96;kVe(limits)&#96; (&#96;934503&#96;) adds  &#96;rateLimitType === "five&#95;hour"&#96;. - The server arms the offer through &#42;&#42;NEW&#42;&#42; headers &#96;anthropic-ratelimit-unified-slow-offer&#96;  (&#96;treatment&#96;&#124;&#96;control&#96;), &#96;-slow-status&#96; (&#96;active&#96;/&#96;not&#95;needed&#96;/&#96;slot&#95;busy&#96;/&#96;weekly&#95;limit&#96;/  &#96;budget&#95;exhausted&#96;/&#96;ineligible&#96;/&#96;off&#96;), &#96;-slow-retry-after&#96;, &#96;-slow-max-wait&#96;,  &#96;-slow-budget-utilization&#96; and &#96;-slow-budget-reset&#96; (&#96;177296&#96;–&#96;177337&#96;). None of them occur in 2.1.197.  &#96;EVe()&#96; (&#96;934618&#96;) offers only on &#96;treatment&#96;.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> - The server arms the offer through &#42;&#42;NEW&#42;&#42; headers &#96;anthropic-ratelimit-unified-slow-offer&#96;  (&#96;treatment&#96;&#124;&#96;control&#96;), &#96;-slow-status&#96; (&#96;active&#96;/&#96;not&#95;needed&#96;/&#96;slot&#95;busy&#96;/&#96;weekly&#95;limit&#96;/  &#96;budget&#95;exhausted&#96;/&#96;ineligible&#96;/&#96;off&#96;), &#96;-slow-retry-after&#96;, &#96;-slow-max-wait&#96;,  &#96;-slow-budget-utilization&#96; and &#96;-slow-budget-reset&#96; (&#96;177296&#96;–&#96;177337&#96;). None of them occur in 2.1.197.  &#96;EVe()&#96; (&#96;934618&#96;) offers only on &#96;treatment&#96;. &#96;lXo()&#96; logs &#96;tengu&#95;lowpri&#95;offer&#95;capable&#96; for either arm;  &#96;tengu&#95;lowpri&#95;offer&#95;withheld&#96; (&#96;934652&#96;) fires for a &#42;&#42;&#96;treatment&#96;&#42;&#42; arm suppressed by the cool-off  (&#96;TBe()&#96; set, &#96;reason: "cooloff"&#96;), not for &#96;control&#96;. - While active (&#96;iL()&#96; &#96;177442&#96;), requests carry &#42;&#42;&#96;anthropic-usage-limit: slow&#96;&#42;&#42; (&#96;wpt&#96;/&#96;PCr&#96;,  &#96;177294&#96;; set at &#96;182423&#96; and &#96;529644&#96;). The header name itself is &#42;&#42;not&#42;&#42; new: 2.1.197 already sent  &#96;anthropic-usage-limit: extended&#96; behind &#96;tengu&#95;lantern&#95;spool&#96; (&#96;2.1.197:595982&#96;), and 2.1.300 still  does (&#96;529645&#96;). The &#96;slow&#96; value is NEW.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> Gate &#96;Ept()&#96; (&#96;177366&#96;) is &#96;k("tengu&#95;toasty&#95;breeze", {}).enabled === !0&#96;. The flag object also supplies  copy and &#96;cooloffMinutes&#96; (clamped 0–1440, default 10, &#96;177391&#96;–&#96;177395&#96;). - Eligibility: &#96;Xvt()&#96; (&#96;934499&#96;) requires &#96;kt()&#96;, &#96;billingType !== "usage&#95;based"&#96;, &#96;Aa()&#96; (firstParty),  an interactive session, not remote mode and not &#96;$t()&#96;. &#96;kVe(limits)&#96; (&#96;934503&#96;) adds  &#96;rateLimitType === "five&#95;hour"&#96;. - The server arms the offer through &#42;&#42;NEW&#42;&#42; headers &#96;anthropic-ratelimit-unified-slow-offer&#96;  (&#96;treatment&#96;&#124;&#96;control&#96;), &#96;-slow-status&#96; (&#96;active&#96;/&#96;not&#95;needed&#96;/&#96;slot&#95;busy&#96;/&#96;weekly&#95;limit&#96;/  &#96;budget&#95;exhausted&#96;/&#96;ineligible&#96;/&#96;off&#96;), &#96;-slow-retry-after&#96;, &#96;-slow-max-wait&#96;,  &#96;-slow-budget-utilization&#96; and &#96;-slow-budget-reset&#96; (&#96;177296&#96;–&#96;177337&#96;). None of them occur in 2.1.197.  &#96;EVe()&#96; (&#96;934618&#96;) offers only on &#96;treatment&#96;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> - While active (&#96;iL()&#96; &#96;177442&#96;), requests carry &#42;&#42;&#96;anthropic-usage-limit: slow&#96;&#42;&#42; (&#96;wpt&#96;/&#96;PCr&#96;,  &#96;177294&#96;; set at &#96;182423&#96; and &#96;529644&#96;). The header name itself is &#42;&#42;not&#42;&#42; new: 2.1.197 already sent  &#96;anthropic-usage-limit: extended&#96; behind &#96;tengu&#95;lantern&#95;spool&#96; (&#96;2.1.197:595982&#96;), and 2.1.300 still  does (&#96;529645&#96;). The &#96;slow&#96; value is NEW.

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/wire-probe.mjs

<a id="mechanism-machine-id-error-prefix"></a>
## machineID 12 字符前缀随错误报告外发

机制 ID：machine-id-error-prefix

### 当前报告来源 · 2.1.300 · MachineID error prefix

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：随机安装机器标识截断透传：持久化的64位十六进制machineID仅取前12字符，作为host&#95;name&#95;redacted随错误报告日志发送。

完整触发条件：在错误报告日志构造路径，读取持久化 machineID（无则随机生成）并截取前 12 个十六进制字符作为 host&#95;name&#95;redacted 放入 payload；不发送完整 machineID。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

默认 engine 设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1；报告控制矩阵将其归为 essential-traffic 并关闭错误报告，且错误跟踪 flag tengu&#95;orford&#95;ness 默认 !1。host&#95;name&#95;redacted 的 machineID 前缀默认不发送。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;host&#95;name&#95;redacted: Umt().slice(0, 12)&#96;

报告原文（trigger）：

> &#42;&#42;Only read&#42;&#42; at &#96;:115593&#96; (seed) and &#96;:350262&#96;:

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> flag &#96;tengu&#95;orford&#95;ness&#96; (default &#96;!1&#96;, &#96;:349389&#96;)

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

### 当前报告来源 · 2.1.300 · machineID 12 字符前缀随错误报告外发

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/overview.md)；评估时间：2026-11-15T03:17:04Z；审阅提交：747f1900a697。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：机器标识截断透传：machineID 仅以 12 字符前缀出现在错误报告中。

完整触发条件：当本地已有持久化 machineID 且产生并发送错误报告时触发；普通请求不携带完整 machineID。

方向：云端 CLI → 服务端；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

默认 Datadog 错误跟踪的 tengu&#95;orford&#95;ness 为 false，且 Unbundle 设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC，默认不发送错误报告，machineID 前缀不外发；若启用，属 CLI 自发上报，不经过网关。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;machineID&#96; leaves only as a 12-character prefix in error reports.

报告原文（trigger）：

> &#96;machineID&#96; leaves only as a 12-character prefix in error reports.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> &#96;machineID&#96; leaves only as a 12-character prefix in error reports.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/telemetry.md)

> &#124; &#42;&#42;Datadog error tracking&#42;&#42; (modules 331/333/334) &#124; Crash and &#96;logError&#96; reports with stack, fingerprint, frames &#124; &#96;https://browser-intake-us5-datadoghq.com/api/v2/logs&#96; (&#96;:349907&#96;), query &#96;dd-api-key&#96; (&#96;:349926&#96;) &#124; &#42;&#42;OFF&#42;&#42; &#124; flag &#96;tengu&#95;orford&#95;ness&#96; (default &#96;!1&#96;, &#96;:349389&#96;); &#96;DISABLE&#95;ERROR&#95;REPORTING&#96;; org restriction &#96;allow&#95;error&#95;reporting&#96;; min version &#96;2.1.193&#96; &#124;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

代码：[model-gateway/engine.mjs:94](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L94)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: discovery.environment, MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs、model-gateway/session-entry.mjs

<a id="mechanism-otel-user-email"></a>
## OTel user email

机制 ID：otel-user-email

### 当前报告来源 · 2.1.300 · OTel user email

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：OTel邮箱透传：非diskless模式下，用户配置的OTel资源在账号有邮箱时无条件写入user.email；企业网关OIDC覆盖时从JWT补充身份属性。

完整触发条件：用户配置 OTel 导出且非 diskless 模式时，只要账号有 emailAddress，就无条件写入 OTel resource 的 user.email；企业网关 OIDC 覆盖时从 JWT 补充 user.&#42; 身份属性。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

报告将 user.email 限定于用户启用 3P OTel 且非 diskless；默认 engine 的环境白名单不传 CLAUDE&#95;CODE&#95;ENABLE&#95;TELEMETRY/OTEL&#95;&#42;，用户 OTel 默认 OFF，故默认不发送。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;user.email&#96; is still sent without an env gate in normal mode (&#96;:194465&#96;); diskless mode changes that.

报告原文（trigger）：

> In normal (non-diskless) mode email is still emitted unconditionally whenever the account has one.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#42;&#42;OFF&#42;&#42; &#124; &#96;CLAUDE&#95;CODE&#95;ENABLE&#95;TELEMETRY&#96; (&#96;isTelemetryEnabled&#96; &#96;Nt&#96;, &#96;:1470670&#96;) plus the &#96;OTEL&#95;&#42;&#96; family

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

<a id="mechanism-overage-scope-protocol-header"></a>
## 限流超额范围协议头

机制 ID：overage-scope-protocol-header

### 当前报告来源 · 2.1.300 · 限流超额范围协议头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)；评估时间：2026-10-22T10:00:45Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：限流超额范围协议头：服务端 anthropic-ratelimit-unified-overage-scope 取值 service、channel 或 group&#95;pool，客户端据此显示团队共享预算、渠道支出限额或普通超额文案。

完整触发条件：服务端响应携带 anthropic-ratelimit-unified-overage-scope 且值为 service、channel 或 group&#95;pool 时，客户端按 scope 显示对应共享预算/渠道限额文案。

方向：服务端 → CLI；触发：条件触发；网关处理：不经过网关。

当前有效性：待重评（报告核验未完成）。历史评估结论：未过滤。

该值是服务端响应头，不是客户端上传字段；CLI 直连上游时在进程内解析。网关仅用 stdio 启动并读取 CLI，不代理或过滤该响应头；默认是否出现取决于服务端返回，触发为条件性。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;nh()&#96; (&#96;184317&#96;) parses the &#42;&#42;NEW&#42;&#42; header &#96;anthropic-ratelimit-unified-overage-scope&#96; (0 in 2.1.197) into &#96;service&#96; / &#96;channel&#96; / &#96;group&#95;pool&#96;. &#96;bS()&#96; (&#96;183137&#96;) uses it:

报告原文（trigger）：

> &#96;nh()&#96; (&#96;184317&#96;) parses the &#42;&#42;NEW&#42;&#42; header &#96;anthropic-ratelimit-unified-overage-scope&#96; (0 in 2.1.197) into &#96;service&#96; / &#96;channel&#96; / &#96;group&#95;pool&#96;. &#96;bS()&#96; (&#96;183137&#96;) uses it:

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> &#96;nh()&#96; (&#96;184317&#96;) parses the &#42;&#42;NEW&#42;&#42; header &#96;anthropic-ratelimit-unified-overage-scope&#96; (0 in 2.1.197) into &#96;service&#96; / &#96;channel&#96; / &#96;group&#95;pool&#96;. &#96;bS()&#96; (&#96;183137&#96;) uses it:

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> &#96;nh()&#96; (&#96;184317&#96;) parses the &#42;&#42;NEW&#42;&#42; header &#96;anthropic-ratelimit-unified-overage-scope&#96; (0 in 2.1.197) into &#96;service&#96; / &#96;channel&#96; / &#96;group&#95;pool&#96;. &#96;bS()&#96; (&#96;183137&#96;) uses it:

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/wire-probe.mjs

<a id="mechanism-peer-message-frommode-marker"></a>
## peer message fromMode

机制 ID：peer-message-frommode-marker

### 当前报告来源 · 2.1.300 · peer message fromMode

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；评估时间：2026-10-21T03:15:16Z；审阅提交：c95455119f84。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：对等消息 fromMode 标记：跨会话 peer messaging 构造消息时，按 tengu&#95;harbor&#95;kite&#95;mode&#95;emit 决定是否写入 fromMode 来源模式字段。

完整触发条件：peer messaging 可用且构造消息；tengu&#95;harbor&#95;kite&#95;mode&#95;emit 为 true 时发送 fromMode。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（来源已修订）。历史评估结论：未过滤。

报告显示 tengu&#95;harbor&#95;kite 与 tengu&#95;harbor&#95;kite&#95;mode&#95;emit 默认均为 true，跨会话 peer messaging 满足条件时会写入 fromMode。目标网关仅 spawn 独立 CLI、通过 stdin/stdout 交换消息并解析 stdout 事件，不检查或改写 CLI 自发的 peer 出站消息；这是 CLI 自发路径，满足报告触发条件时未经过网关过滤。未声称默认会话已实际构造消息。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#124; &#96;tengu&#95;harbor&#95;kite&#95;mode&#95;emit&#96; &#124; &#96;true&#96; &#124; k &#124; NEW &#124; &#96;:1271282&#96; &#124; Emit fromMode in peer messages. &#124;

报告原文（trigger）：

> &#124; &#96;tengu&#95;harbor&#95;kite&#95;mode&#95;emit&#96; &#124; &#96;true&#96; &#124; k &#124; NEW &#124; &#96;:1271282&#96; &#124; Emit fromMode in peer messages. &#124;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;harbor&#95;kite&#96; &#124; &#96;true&#96; &#124; k &#124; NEW &#124; &#96;:348689&#96; &#124; Peer messaging between sessions (env CLAUDE&#95;CODE&#95;HARBOR&#95;KITE overrides). &#124; &#124; &#96;tengu&#95;harbor&#95;kite&#95;cloud&#96; &#124; &#96;false&#96; &#124; k &#124; NEW &#124; &#96;:1042692&#96; &#124; Peer messaging to cloud sessions (firstParty only). &#124; &#124; &#96;tengu&#95;harbor&#95;kite&#95;limits&#96; &#124; &#96;J&#96; &#124; MG &#124; NEW &#124; &#96;:347223&#96; &#124; MG-read limits object, refresh 300000 ms. &#124; &#124; &#96;tengu&#95;harbor&#95;kite&#95;mode&#95;emit&#96; &#124; &#96;true&#96; &#124; k &#124; NEW &#124; &#96;:1271282&#96; &#124; Emit fromMode in peer messages. &#124;

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

代码：[model-gateway/engine.mjs:128](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L128)

> lines = readline.createInterface({ input: child.stdout });     lines.on('line', line =&gt; {       let event; try { event = JSON.parse(line); } catch { return; }

<a id="mechanism-plan-tier-env-override"></a>
## 计划层级环境覆盖

机制 ID：plan-tier-env-override

### 当前报告来源 · 2.1.300 · 计划层级环境覆盖

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)；评估时间：2026-10-22T10:00:45Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：计划层级环境覆盖：存在 OAuth 或托管/FD token 时，用 CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE 与 CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER 覆盖 subscriptionType/rateLimitTier；后台认证快照写入 process.env 并透传子进程。

完整触发条件：当存在 CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN，或存在托管/FD token 时，读取 CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE 与 CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER 覆盖订阅类型与限流层级。

方向：组件内部传递；触发：默认关闭／不触发；网关处理：移除。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

默认 engine 仅复制少量系统 env 并显式赋值，未传入 CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE/RATE&#95;LIMIT&#95;TIER；即使 CLI 凭据存在，这两个覆盖变量为空，默认不触发。网关重建子进程环境，属移除而非请求字段过滤。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;H0()&#96; (&#96;129942&#96;) builds the token record. When &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96; is set (&#96;129943&#96;), or a managed/FD token is present (&#96;129951&#96;–&#96;129959&#96;), it reads: - &#96;CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE&#96; → &#96;subscriptionType&#96; (&#96;129948&#96;, &#96;129957&#96;) - &#96;CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER&#96; → &#96;rateLimitTier&#96; (&#96;129949&#96;, &#96;129958&#96;)

报告原文（trigger）：

> &#96;H0()&#96; (&#96;129942&#96;) builds the token record. When &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96; is set (&#96;129943&#96;), or a managed/FD token is present (&#96;129951&#96;–&#96;129959&#96;), it reads: - &#96;CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE&#96; → &#96;subscriptionType&#96; (&#96;129948&#96;, &#96;129957&#96;) - &#96;CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER&#96; → &#96;rateLimitTier&#96; (&#96;129949&#96;, &#96;129958&#96;)

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> The bg auth-snapshot consumer also writes both onto &#96;process.env&#96; (&#96;100807&#96;–&#96;100808&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> &#96;H0()&#96; (&#96;129942&#96;) builds the token record. When &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96; is set (&#96;129943&#96;), or a managed/FD token is present (&#96;129951&#96;–&#96;129959&#96;), it reads: - &#96;CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE&#96; → &#96;subscriptionType&#96; (&#96;129948&#96;, &#96;129957&#96;) - &#96;CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER&#96; → &#96;rateLimitTier&#96; (&#96;129949&#96;, &#96;129958&#96;)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/wire-probe.mjs

<a id="mechanism-plugin-telemetry-device-id"></a>
## Plugin telemetry deviceId

机制 ID：plugin-telemetry-device-id

### 当前报告来源 · 2.1.300 · Plugin telemetry deviceId

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：内置插件遥测设备标识：builtin/core插件读取配置userID作为deviceId，携带账号、组织和session，POST到硬编码api.anthropic.com批量事件接口。

完整触发条件：仅 builtin/core 插件可调用该遥测能力，且 !iy() 为真并通过分析开关/策略检查时，读取配置 userID 作为 deviceId，携带账号、组织和 session POST 到硬编码 api.anthropic.com 批量事件接口。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

插件遥测可用性为 !iy()；默认 engine 设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，报告控制矩阵将其归为 essential-traffic 并关闭插件遥测。默认不以 userID 作为 deviceId 发送。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;deviceId&#96; = &#96;userID&#96;, under a &#42;looser&#42; regex &#96;/^&#91;A-Za-z0-9&#95;-&#93;{8,128}$/&#96;

报告原文（trigger）：

> Gated by &#96;F = () =&gt; !iy()&#96; (&#96;:1534436&#96;) and the analytics switches/policy check (&#96;c()&#96;).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

> Gated by &#96;F = () =&gt; !iy()&#96; (&#96;:1534436&#96;) and the analytics switches/policy check (&#96;c()&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

<a id="mechanism-safety-refusal-model-switch-header"></a>
## 安全拒绝模型切换头

机制 ID：safety-refusal-model-switch-header

### 当前报告来源 · 2.1.300 · 安全拒绝模型切换头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)；评估时间：2026-10-22T09:42:46Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：安全拒绝模型切换头协议标记：HTTP 头 x-cc-tender-quilt 与 convolute&#95;arcades/tender&#95;quilt 状态及拒绝后模型切换逻辑关联。

完整触发条件：在安全拒绝分类为 cyber 或 frontier&#95;llm 并触发模型切换时，QPe 返回 convolute&#95;arcades/tender&#95;quilt/none 状态；HTTP 头 x-cc-tender-quilt 与该状态关联。

方向：证据不足；触发：条件触发；网关处理：不经过网关。

当前有效性：待重评（报告核验未完成）。历史评估结论：未过滤。

x-cc-tender-quilt 是 CLI 在安全拒绝后切换模型时自行附加的出站头；网关只通过 stdio 启动独立 CLI 并转交提示词，不代理该 HTTP 请求。默认不会必然遇到 cyber/frontier&#95;llm 拒绝，故属条件触发；属 CLI 自发路径，满足报告触发条件时未经过网关过滤。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;var Rl = "convolute&#95;arcades"&#96;, header &#96;x-cc-tender-quilt&#96; (&#96;:179815–179816&#96;)

报告原文（trigger）：

> &#96;zEo()&#96; swaps the model only for refusal categories &#96;yy = new Set(&#91;"cyber","frontier&#95;llm"&#93;)&#96; (&#96;:179847–179856&#96;)

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> header &#96;x-cc-tender-quilt&#96; (&#96;:179815–179816&#96;)

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)

> &#96;var Rl = "convolute&#95;arcades"&#96;, header &#96;x-cc-tender-quilt&#96; (&#96;:179815–179816&#96;). &#96;QPe()&#96; returns &#96;"convolute&#95;arcades"&#96;, &#96;"tender&#95;quilt"&#96; or &#96;"none"&#96; (&#96;:179835&#96;). &#96;zEo()&#96; swaps the model only for refusal categories &#96;yy = new Set(&#91;"cyber","frontier&#95;llm"&#93;)&#96; (&#96;:179847–179856&#96;).

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-self-hosted-runner-jwt-identity-env"></a>
## 自托管运行器JWT身份环境注入

机制 ID：self-hosted-runner-jwt-identity-env

### 当前报告来源 · 2.1.300 · 自托管运行器JWT身份环境注入

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)；评估时间：2026-10-22T09:45:06Z；审阅提交：9429ba2c51d9。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自托管运行器 JWT 身份环境注入：从工单 JWT 的 account&#95;email、account&#95;id、jti 等 claims 生成 CLAUDE&#95;RUNNER&#95;&#42; 环境变量，交给 hook 脚本，承载账号与工单身份。

完整触发条件：自托管运行器（BYOC）为 hook 脚本构造环境且持有工单 JWT 时，从 claims 写入 CLAUDE&#95;RUNNER&#95;&#42; 账号与工单标识变量。

方向：组件内部传递；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

默认 Unbundle 启动参数未启用自托管运行器/BYOC，也没有工单 JWT；CLAUDE&#95;RUNNER&#95;&#42; 仅在该模式下由 CLI 为 hook 脚本构造，属于 CLI 内部子进程环境。网关只以白名单 env 启动独立 CLI 并走 stdio，不介入该路径，故默认不产生、也无过滤点。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;EMAIL&#96; / &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;ID&#96; are set &#42;&#42;for&#42;&#42; self-hosted runner hook scripts, from the work order's JWT claims (&#96;claims.account&#95;email&#96;, &#96;claims.account&#95;id&#96;, &#96;:617889–617890&#96;), together with &#96;CLAUDE&#95;RUNNER&#95;ORDER&#95;ID&#96; = &#96;claims.jti&#96; and &#96;CLAUDE&#95;RUNNER&#95;POOL&#95;ID&#96;.

报告原文（trigger）：

> are set &#42;&#42;for&#42;&#42; self-hosted runner hook scripts, from the work order's JWT claims

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> are set &#42;&#42;for&#42;&#42; self-hosted runner hook scripts

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

> &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;EMAIL&#96; / &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;ID&#96; are set &#42;&#42;for&#42;&#42; self-hosted runner hook scripts, from the work order's JWT claims (&#96;claims.account&#95;email&#96;, &#96;claims.account&#95;id&#96;, &#96;:617889–617890&#96;), together with &#96;CLAUDE&#95;RUNNER&#95;ORDER&#95;ID&#96; = &#96;claims.jti&#96; and &#96;CLAUDE&#95;RUNNER&#95;POOL&#95;ID&#96;.

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/9429ba2c51d9845f9b6278145ca54d98b4be64e7/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-compat.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-client.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-self-hosted-runner-version-header"></a>
## x-self-hosted-runner-version 头

机制 ID：self-hosted-runner-version-header

### 当前报告来源 · 2.1.300 · x-self-hosted-runner-version 头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)；评估时间：2026-11-14T03:16:27Z；审阅提交：0f6041e85c9b。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自托管运行器版本头：控制面请求在 Authorization 与 anthropic-version 之外携带 x-self-hosted-runner-version，标识运行器版本。

完整触发条件：调用自托管运行器控制面且使用 ee()/B() 组装请求头时附加；worker 调用使用 K() 时不带该头。

方向：本地客户端 → 网关；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

默认 engine 以普通 -p 模式启动 CLI，未设置自托管运行器参数或环境，未调用自托管控制面，故不附加该版本头；若作为自托管运行器调用，CLI 自行直连上游，不经过网关。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;x-self-hosted-runner-version&#96; (0 occurrences in 2.1.197)

报告原文（trigger）：

> worker calls use &#96;K()&#96; &#96;:600275&#96;, no runner-version header

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> Headers (&#96;ee()&#96;/&#96;B()&#96;, &#96;:600255-600273&#96;; worker calls use &#96;K()&#96; &#96;:600275&#96;, no runner-version header)

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> &#96;x-self-hosted-runner-version&#96; (0 occurrences in 2.1.197).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> Client &#96;cfn()&#96; in module 432 (&#96;:600413-600720&#96;). Headers (&#96;ee()&#96;/&#96;B()&#96;, &#96;:600255-600273&#96;; worker calls use &#96;K()&#96; &#96;:600275&#96;, no runner-version header):

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> A whole &#96;/v1/code/runners/self-hosted/&#42;&#96; control plane: register,

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', discovery.builtin, '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;caller&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', String(discovery.enabled ? discovery.maxCalls + 2 : 2), '--model', model, '--system-prompt-file', promptFile&#93;;

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cli-output-audit.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-server-side-arbiter-beta-header"></a>
## 服务端仲裁器 beta 头协议指纹

机制 ID：server-side-arbiter-beta-header

### 当前报告来源 · 2.1.300 · 服务端仲裁器 beta 头协议指纹

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)；评估时间：2026-11-15T03:26:33Z；审阅提交：747f1900a697。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：服务端仲裁器 beta 头协议指纹：arbiter 请求携带 dangerous-tool-use-2026-09-03 beta 头，标识服务端分类器调用。

完整触发条件：当 cE(tool) 选择 arbiter 或 arbiterWithLocalFallback 路径并发送服务端分类器请求时，请求携带 dangerous-tool-use-2026-09-03 beta 头。

方向：云端 CLI → 服务端；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

报告将 arbiter 描述为自动模式危险工具复核；默认 dontAsk 且 setting-sources 为空，未启用自动模式，cE(tool) 的 arbiter 请求条件不成立。CLI 自发上游请求不经过网关。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> The API beta &#96;dangerous-tool-use-2026-09-03&#96; (&#96;YC&#96;, &#96;:92316&#96;)

报告原文（trigger）：

> &#96;cE(tool)&#96; (&#96;:431829&#96;) returns &#96;"off"&#96;, &#96;"arbiter"&#96; (first party) or &#96;"arbiterWithLocalFallback"&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> The API beta &#96;dangerous-tool-use-2026-09-03&#96; (&#96;YC&#96;, &#96;:92316&#96;)

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)

> &#96;cE(tool)&#96; (&#96;:431829&#96;) returns &#96;"off"&#96;, &#96;"arbiter"&#96; (first party) or &#96;"arbiterWithLocalFallback"&#96; (third-party planes: bedrock, mantle, vertex, foundry, anthropicAws, anthropicGoogleCloud, gateway; &#96;j3()&#96; &#96;:431810&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/security-model.md)

> User-facing copy: &#42;"Auto mode held this command for the server-side classifier to review"&#42; (&#96;Ddn&#96;, &#96;:25531&#96;).

代码：[model-gateway/engine.mjs:105](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L105)

> '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/747f1900a6973ea9c6ffa1bc6bdd4e4ac19c2fca/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cloud-probe.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

<a id="mechanism-summon-sid-hmac"></a>
## Summon SID HMAC

机制 ID：summon-sid-hmac

### 当前报告来源 · 2.1.300 · Summon SID HMAC

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：召唤状态伪匿名标识：以summonSidKey为HMAC密钥，对sessionId与artifact slug计算SHA-256并取前16位十六进制，作为sid随summon-status上报；密钥本身不离开本机。

完整触发条件：仅在 artifact-comment 的 summon-status 上报路径、当前 (sessionId, artifact slug) 尚无 sid 时，以 summonSidKey 对 sessionId+slug 做 HMAC-SHA256 并取前16位作为 sid 发送；密钥本身不离开本机。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

报告将 sid 限定于 artifact-comment 的 summon-status 通道；feature flags 显示 artifact comments 主 gate tengu&#95;teal&#95;corbel 和读取 gate tengu&#95;onyx&#95;sluice 默认 false。默认不生成或发送 summon sid。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;sid = HMAC-SHA256(key = summonSidKey, msg = sessionId + artifactSlug)&#91;0:16 hex&#93;&#96;

报告原文（trigger）：

> &#96;Bns(slug, threadId, body)&#96; (module 572, &#96;:700337&#96;) sends it with

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

> &#96;Bns(slug, threadId, body)&#96; (module 572, &#96;:700337&#96;) sends it with

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;teal&#95;corbel&#96; &#124; &#96;false&#96; &#124; k,vn &#124; NEW &#124; &#96;:698965&#96; &#124; Artifact comments (env CLAUDE&#95;CODE&#95;ARTIFACT&#95;COMMENTS). &#124;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;onyx&#95;sluice&#96; &#124; &#96;false&#96; &#124; k &#124; NEW &#124; &#96;:699948&#96; &#124; Artifact comments read; off -&gt; 'comments are not available'. &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-tool-schema-strict-flag"></a>
## 工具定义 strict 协议标记

机制 ID：tool-schema-strict-flag

### 当前报告来源 · 2.1.300 · 工具定义 strict 协议标记

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/tool-definitions.md)；评估时间：2026-11-12T03:09:12Z；审阅提交：327237427977。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：工具定义 strict 协议标记：序列化发往 API 的工具定义时，在结构化输出 beta 可用且工具声明 strict 或 strictInputJSONSchema 并通过对应门槛时写入 strict:true，并可能替换 input&#95;schema。

完整触发条件：序列化发往 API 的工具定义时，模型 beta 列表含 bae（structured-outputs-2025-12-15，需 tengu&#95;tool&#95;pear 与 rKn(model)）；随后若工具声明 strict:!0 且 Ywr(schema) 通过，或未走该分支但声明 strictInputJSONSchema 且 tengu&#95;structured&#95;output&#95;strict 开启，则写入 strict:true。

方向：本地客户端 → 网关；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

按报告默认 tengu&#95;tool&#95;pear=false、tengu&#95;structured&#95;output&#95;strict=false，且默认 --tools 为空，strict 标记不触发；若显式启用，strict 由 CLI 序列化后直接发往 Anthropic，网关仅以 stdio 启动 CLI 并转交输入，不检查该出站请求，故不在网关过滤范围。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> if (e.strict === !0) { let So = Ywr(Kn); if (So.ok) { Vn.strict = !0; Vn.input&#95;schema = So.schema } else warn(...) }  else if (e.strictInputJSONSchema &amp;&amp; k("tengu&#95;structured&#95;output&#95;strict", !1)) { Vn.strict = !0; ... }

报告原文（trigger）：

> The model's beta list contains &#96;bae&#96; (&#96;aKn&#96;, &#96;:127578&#96;). &#96;bae = k("structured&#95;outputs", "structured-outputs-2025-12-15")&#96;  (&#96;:92281&#96;), so the header string itself is flag-overridable. That beta is  attached only when &#96;tengu&#95;tool&#95;pear&#96; (default &#96;!1&#96;) &#42;&#42;and&#42;&#42; &#96;rKn(model)&#96; hold (&#96;:127468&#96;).  2. The tool declares &#96;strict:!0&#96;.  3. &#96;Ywr(schema)&#96; (&#96;:300383&#96;) accepts the schema. If it rejects it, the client logs &#42;"has strict: true but its  schema is not strict-compatible … sending non-strict"&#42;.   The flag still gates the feature, but now through the beta. 2.1.197 checked it inline. The same  &#42;&#42;8&#42;&#42; tools declare &#96;strict:!0&#96;: Bash, Read, Write, Edit, Grep, PowerShell, TodoWrite, ReportFindings.  &#96;strictInputJSONSchema&#96; is a second, NEW path, gated by &#96;tengu&#95;structured&#95;output&#95;strict&#96;.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> ## How Tool Schemas Are Serialised for the API

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/tool-definitions.md)

> 1. The model's beta list contains &#96;bae&#96; (&#96;aKn&#96;, &#96;:127578&#96;). &#96;bae = k("structured&#95;outputs", "structured-outputs-2025-12-15")&#96;  (&#96;:92281&#96;), so the header string itself is flag-overridable. That beta is  attached only when &#96;tengu&#95;tool&#95;pear&#96; (default &#96;!1&#96;) &#42;&#42;and&#42;&#42; &#96;rKn(model)&#96; hold (&#96;:127468&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;structured&#95;output&#95;strict&#96; &#124; &#96;false&#96; &#124; k &#124; NEW &#124; &#96;:446552&#96; &#124; Send strict:true tool input schemas. &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/327237427977204476b665d465c69b4688059d25/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', discovery.builtin, '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;caller&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', String(discovery.enabled ? discovery.maxCalls + 2 : 2), '--model', model, '--system-prompt-file', promptFile&#93;;     if (discovery.enabled) args.splice(args.indexOf('--allowedTools') + 1, 0, 'ToolSearch');

代码：[model-gateway/engine.mjs:113](https://github.com/KKBK-233/unbundle/blob/327237427977204476b665d465c69b4688059d25/model-gateway/engine.mjs#L113)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs、model-gateway/tool-definition-update.mjs、model-gateway/tool-search-config.mjs

<a id="mechanism-tool-search-beta-headers"></a>
## ToolSearch beta 头协议指纹

机制 ID：tool-search-beta-headers

### 当前报告来源 · 2.1.300 · ToolSearch beta 头协议指纹

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/tool-definitions.md)；评估时间：2026-11-12T03:09:12Z；审阅提交：327237427977。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：ToolSearch beta 头协议指纹：ToolSearch 工具路径在请求中携带 advanced-tool-use-2025-11-20 与 tool-search-tool-2025-10-19 beta 头，标识客户端工具搜索能力。

完整触发条件：ToolSearch 工具描述构造路径中（描述由 Wwr() 生成，toolSearchFetchRule 可切换描述变体），请求携带 advanced-tool-use-2025-11-20 与 tool-search-tool-2025-10-19 beta 头。

方向：本地客户端 → 网关；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

按报告 beta 头仅在 ToolSearch 描述/工具路径出现；默认 toolSearch=false，discovery.builtin 为空且不追加 ToolSearch，ENABLE&#95;TOOL&#95;SEARCH 设为 'false'，故默认不触发。若显式启用，CLI 自行向上游发送该请求，网关不介入其出站路径。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> Beta headers: &#96;advanced-tool-use-2025-11-20&#96; (&#96;hPo&#96;) and &#96;tool-search-tool-2025-10-19&#96; (&#96;gqn&#96;) (&#96;:92283&#96;–&#96;:92284&#96;).

报告原文（trigger）：

> The description is built by &#96;Wwr()&#96; (&#96;:365150&#96;) as &#96;c + (u$s() ? p : m) + h&#96;. When &#96;Po().toolSearchFetchRule&#96; is set (&#96;:113300&#96;), the variant &#96;p&#96; adds: &#42;"calling the tool fails with InputValidationError. When any instruction, system reminder, or other tool's description names a deferred tool, fetch it with query "select:&lt;name&gt;" before calling it."&#42; Query forms are unchanged: &#96;select:A,B&#96;, keyword, &#96;+require&#96;. Beta headers: &#96;advanced-tool-use-2025-11-20&#96; (&#96;hPo&#96;) and &#96;tool-search-tool-2025-10-19&#96; (&#96;gqn&#96;) (&#96;:92283&#96;–&#96;:92284&#96;).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> Beta headers: &#96;advanced-tool-use-2025-11-20&#96; (&#96;hPo&#96;) and &#96;tool-search-tool-2025-10-19&#96; (&#96;gqn&#96;) (&#96;:92283&#96;–&#96;:92284&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/tool-definitions.md)

> The description is built by &#96;Wwr()&#96; (&#96;:365150&#96;) as &#96;c + (u$s() ? p : m) + h&#96;. When &#96;Po().toolSearchFetchRule&#96; is set (&#96;:113300&#96;), the variant &#96;p&#96; adds: &#42;"calling the tool fails with InputValidationError. When any instruction, system reminder, or other tool's description names a deferred tool, fetch it with query "select:&lt;name&gt;" before calling it."&#42; Query forms are unchanged: &#96;select:A,B&#96;, keyword, &#96;+require&#96;. Beta headers: &#96;advanced-tool-use-2025-11-20&#96; (&#96;hPo&#96;) and &#96;tool-search-tool-2025-10-19&#96; (&#96;gqn&#96;) (&#96;:92283&#96;–&#96;:92284&#96;).

代码：[model-gateway/tool-search-config.mjs:2](https://github.com/KKBK-233/unbundle/blob/327237427977204476b665d465c69b4688059d25/model-gateway/tool-search-config.mjs#L2)

> export function toolSearchConfig({ toolSearch = false, maxToolSearchCalls = 8 } = {}) {   if (typeof toolSearch !== 'boolean') throw new Error('toolSearch 必须为布尔值');   if (!Number.isSafeInteger(maxToolSearchCalls) &#124;&#124; maxToolSearchCalls &lt; 1 &#124;&#124; maxToolSearchCalls &gt; 64) throw new Error('maxToolSearchCalls 必须为 1..64');   return { enabled: toolSearch, maxCalls: maxToolSearchCalls, builtin: toolSearch ? 'ToolSearch' : '', environment: toolSearch ? 'true' : 'false' }; }

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/327237427977204476b665d465c69b4688059d25/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', discovery.builtin, '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;caller&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', String(discovery.enabled ? discovery.maxCalls + 2 : 2), '--model', model, '--system-prompt-file', promptFile&#93;;     if (discovery.enabled) args.splice(args.indexOf('--allowedTools') + 1, 0, 'ToolSearch');

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs、model-gateway/tool-definition-update.mjs、model-gateway/tool-search-config.mjs

<a id="mechanism-trusted-device-token"></a>
## X-Trusted-Device-Token 头

机制 ID：trusted-device-token

### 当前报告来源 · 2.1.300 · X-Trusted-Device-Token 头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)；评估时间：2026-11-14T03:16:27Z；审阅提交：0f6041e85c9b。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：可信设备令牌头：存在可信设备令牌时，X-Trusted-Device-Token 随 CCR CRUD、桥接、桥接环境、inbox、move-to-cloud 和 GitHub PR 请求发送。

完整触发条件：存在可信设备令牌时；v2/v1 CCR 请求均会附加。

方向：本地客户端 → 网关；触发：默认关闭／不触发；网关处理：不经过网关。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

报告仅在存在可信设备令牌且发起 CCR CRUD、桥接、桥接环境、inbox、move-to-cloud 或 GitHub PR 调用时附带；默认 engine 未启用这些远程路径，也不转发入站头，故默认不触发。若触发为 CLI 直连上游。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> CCR CRUD, bridge, bridge-environment, inbox, move-to-cloud and github-PR calls.

报告原文（trigger）：

> Both add &#96;X-Trusted-Device-Token&#96; when one is present.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

报告原文（direction）：

> Both add &#96;X-Trusted-Device-Token&#96; when one is present.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> Both add &#96;X-Trusted-Device-Token&#96; when one is present.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/7ede2930a00ed591cdc44aeb7d1e903e3d7adc0a/versions/2.1.300/api-endpoints.md)

> &#96;X-Trusted-Device-Token&#96; occurs &#42;&#42;27×&#42;&#42; in 2.1.300 (5× in 2.1.197). It now rides on the CCR CRUD, bridge, bridge-environment, inbox, move-to-cloud and github-PR calls.

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/0f6041e85c9b27e4e6f14322e18a58300aa73e37/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', discovery.builtin, '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;caller&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', String(discovery.enabled ? discovery.maxCalls + 2 : 2), '--model', model, '--system-prompt-file', promptFile&#93;;

依赖文件：model-gateway/anthropic.mjs、model-gateway/cli-events.mjs、model-gateway/cli-output-audit.mjs、model-gateway/context.mjs、model-gateway/engine.mjs、model-gateway/messages.mjs、model-gateway/request-body.mjs、model-gateway/request.mjs、model-gateway/server.mjs

### 当前报告来源 · 2.1.300 · Trusted device token

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：可信设备令牌头透传：优先读取环境变量CLAUDE&#95;TRUSTED&#95;DEVICE&#95;TOKEN，否则用凭证存储的device&#95;token，通过X-Trusted-Device-Token随桥接、PR订阅、CCR等请求发送；注册名含主机名与Linux。

完整触发条件：仅 Claude.ai 订阅用户且 Jn() 成立、非 CLAUDE&#95;CODE&#95;REMOTE 云端容器；若环境变量或凭证存储有 device&#95;token，则在桥接、PR 订阅、CCR 等已接入请求带 X-Trusted-Device-Token；报告未发现 Messages API 路径。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待重评（报告核验未完成）。历史评估结论：当前配置不触发。

报告列出的 X-Trusted-Device-Token 仅用于桥接、PR 订阅、CCR 等路径，未发现 Messages API 路径；默认 engine 无这些路径，环境白名单也不传 CLAUDE&#95;TRUSTED&#95;DEVICE&#95;TOKEN。默认不触发。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;X-Trusted-Device-Token&#96; occurs 27 times (2.1.197: 5).

报告原文（trigger）：

> Read: env &#96;CLAUDE&#95;TRUSTED&#95;DEVICE&#95;TOKEN&#96; first, then the credentials store (&#96;:292428-292430&#96;).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

> &#42;&#42;No site on the Messages API path was found&#42;&#42; (consistent with 2.1.197, tentative).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

> Read: env &#96;CLAUDE&#95;TRUSTED&#95;DEVICE&#95;TOKEN&#96; first, then the credentials store (&#96;:292428-292430&#96;).

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-billing-attribution-header"></a>
## 计费归属头

机制 ID：billing-attribution-header

### 历史来源 · 2.1.90 / 2.1.92 · 计费归属头

[原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)；评估时间：2026-10-19T10:15:42Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：计费归属头协议元数据：在 system 数组首个独立文本块写入 x-anthropic-billing-header，携带 cc&#95;version 指纹、cc&#95;entrypoint、可选 cch 与 cc&#95;workload，供服务端计费/分析解析。

完整触发条件：计费归属头默认启用；可由 CLAUDE&#95;CODE&#95;ATTRIBUTION&#95;HEADER 环境变量或 tengu&#95;attribution&#95;header 特性开关关闭。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：部分过滤。

仅在 Anthropic /v1/messages 入站 body.system 的各文本块开头删除整行；OpenAI messages 的 system 原样编入 instructions，且 engine 直接 spawn CLI，未提供拦截 CLI 内部出站请求的代码，故仅部分覆盖。

发现时间：未说明（上游未提供可用日期）。

报告原文（mechanism）：

> x-anthropic-billing-header: cc&#95;version={version}.{fingerprint}; cc&#95;entrypoint={entrypoint};&#91; cch=00000;&#93;&#91; cc&#95;workload={workload};&#93;

报告原文（trigger）：

> The attribution header is:  - &#42;&#42;Enabled by default&#42;&#42; - Can be disabled via &#96;CLAUDE&#95;CODE&#95;ATTRIBUTION&#95;HEADER&#96; env var (falsy) - Can be disabled via GrowthBook feature flag &#96;tengu&#95;attribution&#95;header&#96;

报告原文（version）：

> &#96;2.1.90&#96; and &#96;2.1.92&#96;

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)

> const instructionJson = instructions.length ? stableJson(instructions) : '';

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

### 历史来源 · 2.1.37 · 计费归属头

[原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)；评估时间：2026-10-19T10:10:53Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：计费归属头协议元数据：在 system 数组首个独立文本块写入 x-anthropic-billing-header，携带 cc&#95;version、cc&#95;entrypoint 和 cch。

完整触发条件：每次发往 Anthropic API 的请求都会在 system 数组首个元素注入该计费头，位于身份行和系统提示之前。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：部分过滤。

Anthropic 入站顶层 system 块开头的 x-anthropic-billing-header 行会被 fromAnthropic 删除；但 messages 内 system/developer 内容原样转文本，OpenAI 入站经 compileContext 原样序列化，CLI 出站请求也未由适配器代理，覆盖不完整。

发现时间：未说明（上游未提供可用日期）。

报告原文（mechanism）：

> x-anthropic-billing-header: cc&#95;version=2.1.37.fbe; cc&#95;entrypoint=cli; cch=a112b;

报告原文（trigger）：

> It's injected as the first element of the system array — before the identity line, before the system prompt.

报告原文（version）：

> x-anthropic-billing-header: cc&#95;version=2.1.37.fbe; cc&#95;entrypoint=cli; cch=a112b;

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)

> if (&#91;'system', 'developer'&#93;.includes(message.role)) { messages.push({ role: message.role, content: text(message.content) }); continue; }

代码：[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)

> const instructionJson = instructions.length ? stableJson(instructions) : '';

<a id="mechanism-cc-entrypoint-workload-markers"></a>
## 入口/负载标记

机制 ID：cc-entrypoint-workload-markers

### 历史来源 · 2.1.90 / 2.1.92 · 入口/负载标记

[原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)；评估时间：2026-10-19T10:15:42Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：计费头环境标记：cc&#95;entrypoint 记录入口来源，取 CLAUDE&#95;CODE&#95;ENTRYPOINT 或 unknown；cc&#95;workload 在 getWorkload() 返回有值时记录工作负载。

完整触发条件：计费归属头启用时，cc&#95;entrypoint 取环境变量或 unknown；cc&#95;workload 仅在 getWorkload() 有值时出现。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：部分过滤。

无入口/负载标记专门过滤；仅 Anthropic body.system 的 billing 行首整行删除会一并移除 cc&#95;entrypoint/cc&#95;workload。OpenAI 系统消息与 CLI 内部出站未覆盖。

发现时间：未说明（上游未提供可用日期）。

报告原文（mechanism）：

> - &#96;entrypoint&#96; = &#96;process.env.CLAUDE&#95;CODE&#95;ENTRYPOINT ?? 'unknown'&#96; - &#96;cch&#96; = only present when &#96;feature('NATIVE&#95;CLIENT&#95;ATTESTATION')&#96; is true - &#96;cc&#95;workload&#96; = only present when &#96;getWorkload()&#96; returns a value

报告原文（trigger）：

> - &#96;entrypoint&#96; = &#96;process.env.CLAUDE&#95;CODE&#95;ENTRYPOINT ?? 'unknown'&#96; - &#96;cch&#96; = only present when &#96;feature('NATIVE&#95;CLIENT&#95;ATTESTATION')&#96; is true - &#96;cc&#95;workload&#96; = only present when &#96;getWorkload()&#96; returns a value

报告原文（version）：

> &#96;2.1.90&#96; and &#96;2.1.92&#96;

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)

> const instructionJson = instructions.length ? stableJson(instructions) : '';

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

### 历史来源 · 2.1.37 · cc&#95;entrypoint标记

[原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)；评估时间：2026-10-19T10:10:53Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：计费头环境标记：cc&#95;entrypoint 记录入口来源，报告实测始终为 cli；作为请求来源环境信号随计费头发出。

完整触发条件：每次发往 Anthropic API 的请求在 system 首个计费头写入 cc&#95;entrypoint；报告观察值为 cli。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：部分过滤。

cc&#95;entrypoint 随 billing 行在 Anthropic 顶层 system 块开头被 fromAnthropic 删除；但 messages 内 system/developer 内容原样保留，OpenAI 入站经 compileContext 原样序列化，CLI 出站请求未由适配器代理。

发现时间：未说明（上游未提供可用日期）。

报告原文（mechanism）：

> cc&#95;entrypoint — always cli

报告原文（trigger）：

> Every request to the Anthropic API includes a system block that isn't really a prompt:

报告原文（version）：

> x-anthropic-billing-header: cc&#95;version=2.1.37.fbe; cc&#95;entrypoint=cli; cch=a112b;

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)

> if (&#91;'system', 'developer'&#93;.includes(message.role)) { messages.push({ role: message.role, content: text(message.content) }); continue; }

代码：[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)

> const instructionJson = instructions.length ? stableJson(instructions) : '';

<a id="mechanism-cc-version-suffix-hash"></a>
## cc&#95;version 指纹

机制 ID：cc-version-suffix-hash

### 历史来源 · 2.1.90 / 2.1.92 · cc&#95;version 指纹

[原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)；评估时间：2026-10-19T10:15:42Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：cc&#95;version 后缀哈希：取首条用户消息索引 4、7、20 的字符（不足补 0），与内置 salt 和版本号拼成 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：构造 API 请求时，从 messagesForAPI 提取首条用户消息并在注入合成消息之前计算指纹。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：部分过滤。

未单独识别 cc&#95;version 哈希后缀；仅当它位于 Anthropic body.system 的 billing 行首时随整行删除。OpenAI system 原样保留，CLI 内部出站请求由官方 CLI 直发，未覆盖。

发现时间：未说明（上游未提供可用日期）。

报告原文（mechanism）：

> indices = &#91;4, 7, 20&#93; chars = indices.map(i =&gt; messageText&#91;i&#93; &#124;&#124; '0').join('') input = FINGERPRINT&#95;SALT + chars + version fingerprint = SHA256(input).hex().slice(0, 3)

报告原文（trigger）：

> Compute fingerprint from first user message for attribution. // Must run BEFORE injecting synthetic messages

报告原文（version）：

> &#96;2.1.90&#96; and &#96;2.1.92&#96;

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)

> const instructionJson = instructions.length ? stableJson(instructions) : '';

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

### 历史来源 · 2.1.37 · cc&#95;version后缀哈希

[原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)；评估时间：2026-10-19T10:10:53Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：cc&#95;version 后缀哈希：取首条用户消息索引 4、7、20 的字符（不足补 0），与内置 salt 和版本号拼成 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：每次请求生成 cc&#95;version 时，从对话首条用户消息取固定索引字符参与哈希，生成三字符十六进制后缀。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：部分过滤。

cc&#95;version 位于 billing 行时，Anthropic 入站顶层 system 块首行会被 fromAnthropic 删除，后缀哈希随之不入上游；但适配器不计算该后缀，也不代理 CLI 出站请求，messages 内 system 角色与 OpenAI 入站均未覆盖。

发现时间：未说明（上游未提供可用日期）。

报告原文（mechanism）：

> chars = "".join(msg&#91;i&#93; if i &lt; len(msg) else "0" for i in (4, 7, 20)) suffix = sha256(f"{salt}{chars}{version}".encode()).hexdigest()&#91;:3&#93;

报告原文（trigger）：

> The cc&#95;version field includes a 3-character hex suffix derived from the conversation content:

报告原文（version）：

> VERSION = "2.1.37"

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)

> if (&#91;'system', 'developer'&#93;.includes(message.role)) { messages.push({ role: message.role, content: text(message.content) }); continue; }

代码：[model-gateway/engine.mjs:98](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L98)

> // 测试上游只经显式参数注入，正式订阅入口不会传入此参数。     if (testUpstream) {       Object.assign(env, { ANTHROPIC&#95;BASE&#95;URL: testUpstream.baseUrl, ANTHROPIC&#95;AUTH&#95;TOKEN: testUpstream.token });

<a id="mechanism-cch-request-integrity-hash"></a>
## cch 完整性哈希

机制 ID：cch-request-integrity-hash

### 历史来源 · 2.1.90 / 2.1.92 · cch 完整性哈希

[原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)；评估时间：2026-10-19T10:15:42Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：cch 请求完整性哈希：计费头先写 cch=00000 占位符，原生 Bun HTTP 栈发送前在序列化请求体中查找并等长回写计算哈希；OSS 未验证算法与输入。

完整触发条件：仅当 feature('NATIVE&#95;CLIENT&#95;ATTESTATION') 为真且计费头发出时，cch=00000 被写入；发送前由 Bun 原生栈替换。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：部分过滤。

无 cch 专门匹配；仅 Anthropic body.system 开头 billing 行整行剥离可顺带删去占位符。Bun 发送前回写及 CLI 出站不在适配器代码中，OpenAI 系统消息亦不覆盖。

发现时间：未说明（上游未提供可用日期）。

报告原文（mechanism）：

> Before the request is sent, Bun's native HTTP stack finds this placeholder &gt; in the request body and overwrites the zeros with a computed hash.

报告原文（trigger）：

> Checks &#96;feature('NATIVE&#95;CLIENT&#95;ATTESTATION')&#96; 2. If true, emits &#96;cch=00000&#96; as a &#42;&#42;placeholder&#42;&#42; 3. If false, emits no &#96;cch&#96; field at all

报告原文（version）：

> &#96;2.1.90&#96; and &#96;2.1.92&#96;

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)

> const instructionJson = instructions.length ? stableJson(instructions) : '';

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

### 历史来源 · Claude Code 2.1.37 / 定制 Bun 1.3.9-canary.51+d5628db23 · cch请求完整性哈希

[原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)；评估时间：2026-10-19T10:10:53Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：cch 请求完整性哈希：在 system 首个计费头写入 cch=00000 占位符，原生 Bun 对完整序列化请求体计算 xxHash64 后取低 5 位十六进制回写。

完整触发条件：请求路径含 /v1/messages、带 anthropic-version 头且请求体含 cch=00000 占位符时激活；哈希覆盖整个序列化请求体。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：部分过滤。

Anthropic 入站顶层 system 文本块开头的 billing 行会被 fromAnthropic 整体删除，故其中的 cch 占位符不会透传；但 cch 哈希由 CLI 内部出站请求计算，engine 直接 spawn CLI 且正式入口不注入 testUpstream，适配器未代理该出站路径。

发现时间：未说明（上游未提供可用日期）。

报告原文（mechanism）：

> When all three are true, it computes a hash of the entire request body (with the placeholder still in place), then overwrites the 00000 bytes in the string buffer with the 5-character hex result before sending.

报告原文（trigger）：

> The custom nativeFetch does three checks before activating:  URL path contains /v1/messages  anthropic-version header is present  Request body contains the cch=00000 placeholder

报告原文（version）：

> Claude Code ships with a custom Bun build (1.3.9-canary.51+d5628db23), an unreleased private fork.

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/engine.mjs:98](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L98)

> // 测试上游只经显式参数注入，正式订阅入口不会传入此参数。     if (testUpstream) {       Object.assign(env, { ANTHROPIC&#95;BASE&#95;URL: testUpstream.baseUrl, ANTHROPIC&#95;AUTH&#95;TOKEN: testUpstream.token });

<a id="mechanism-system-prompt-apostrophe-marker"></a>
## 系统提示撇号端点标记

机制 ID：system-prompt-apostrophe-marker

### 历史来源 · Claude Code 2.1.196 · 日期撇号宿主分类

[原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)；评估时间：2026-10-19T10:12:53Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：系统提示日期句撇号隐写：在构造系统上下文时，依据 ANTHROPIC&#95;BASE&#95;URL 主机是否命中解码域名清单或 AI 实验室关键词，选用 '、’、ʼ、ʹ 四个近形撇号，在 Today's date is … 句中承载宿主分类位。

完整触发条件：仅当 ANTHROPIC&#95;BASE&#95;URL 已设置且主机不是 api.anthropic.com 时进入标记路径；随后若主机命中解码域名清单或包含实验室关键词，日期句撇号才改为对应近形字符，否则保持普通撇号。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：待核实。

适配器可见路径仅移除入站 system 的 billing 行，并将自建 systemPrompt 原样写入 CLI；CLI 输出文本原样转发，未见撇号规范化。该机制位于 CLI 内部系统提示构造，提供代码不覆盖该路径，无法确认其是否被过滤。

发现时间：2026-06-30（文章标题日期）。

报告原文（mechanism）：

> function edp(known, labKw) {  if (!known &amp;&amp; !labKw) return "'";  if (known &amp;&amp; !labKw) return "&#92;u2019";  if (!known &amp;&amp; labKw) return "&#92;u02BC";  return "&#92;u02B9"; }

报告原文（trigger）：

> The trigger is ANTHROPIC&#95;BASE&#95;URL, Claude Code's API base URL override.  Then it checks if:  the system timezone is Asia/Shanghai or Asia/Urumqi  the API base URL hostname matches a decoded domain list  the hostname contains specific AI lab keywords

报告原文（version）：

> my local Claude Code (2.1.196) install

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/engine.mjs:110](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L110)

> await fs.writeFile(promptFile, systemPrompt, { mode: 0o600 });

代码：[model-gateway/cli-events.mjs:57](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/cli-events.mjs#L57)

> publishText(text) {     if (!text) return;     this.text += text;     this.onText?.(text);   }

### 历史来源 · v2.1.169（npm @anthropic-ai/claude-code，native win32-x64 binary） · 系统提示撇号端点标记

[原报告](https://github.com/anthropics/claude-code/issues/67120)；评估时间：2026-10-19T10:17:14Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：系统提示日期句撇号隐写：构造系统提示时，按 ANTHROPIC&#95;BASE&#95;URL 主机是否命中 KNOWN&#95;HOSTS 或包含 LAB&#95;KEYWORDS，在 Today's date is 句中选择 U+0027、U+2019、U+02BC、U+02B9 四个近形撇号，随提示发往端点。

完整触发条件：构造系统提示日期句且 gate() 为假；配置了 ANTHROPIC&#95;BASE&#95;URL 且主机精确匹配 KNOWN&#95;HOSTS 或以 .KNOWN&#95;HOST 结尾，或主机包含 LAB&#95;KEYWORDS 时，按命中组合选撇号；未命中则用 ASCII 撇号。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：待核实。

复核未通过：原文直接给出四码位撇号按 ANTHROPIC&#95;BASE&#95;URL 主机分类切换的机制、classify()/pickApostrophe() 逻辑与 v2.1.169 版本，trigger&#95;summary 保留了共同前置条件 gate() 为假，并正确概括「精确匹配或 .后缀 KNOWN&#95;HOSTS / 含 LAB&#95;KEYWORDS 组合」与默认 ASCII 撇号，版本字段有原文引文支撑，label 与 category=隐写 相符（近形码位携带端点分类，非协议签名或显式身份字段）。但所给仓库为 model-gateway 适配器，anthropic.mjs 仅删除系统块开头 billing 行，engine.mjs 只以 --system-prompt-file 传入自建提示，日期句由外部 CLI 内部生成并直接上行，代码中既无该撇号生成路径也无拦截/净化路径，且白名单版本为 2.1.280 而非 2.1.169，故代码证据不足以判定该机制存在或已被过滤，supported=false。

发现时间：2026-06-10（结构化首发时间）。

报告原文（mechanism）：

> So the apostrophe codepoint and the date separator together encode a classification of the configured endpoint + timezone, and that encoding travels in the outgoing system prompt to whatever endpoint receives it.

报告原文（trigger）：

> The apostrophe in Today's switches between four visually near-identical Unicode codepoints depending on the host of ANTHROPIC&#95;BASE&#95;URL:

报告原文（version）：

> Static inspection of the released claude.exe (npm @anthropic-ai/claude-code, v2.1.169, native win32-x64 binary)

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');     if (instruction) messages.push({ role: 'system', content: instruction });

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-system-prompt-date-separator-marker"></a>
## 系统提示日期分隔符标记

机制 ID：system-prompt-date-separator-marker

### 历史来源 · Claude Code 2.1.196 · 日期分隔符时区标记

[原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)；评估时间：2026-10-19T10:12:53Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：系统提示日期分隔符隐写：在构造系统上下文时，若系统时区为 Asia/Shanghai 或 Asia/Urumqi，将 Today's date is 后的日期从 YYYY-MM-DD 改为 YYYY/MM/DD，在正常日期句中承载时区标记位。

完整触发条件：仅当 ANTHROPIC&#95;BASE&#95;URL 已设置且指向非官方主机时进入标记路径；在此基础上，系统时区为 Asia/Shanghai 或 Asia/Urumqi 时，日期分隔符由 - 改为 /。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：待核实。

适配器未见日期分隔符规范化：入站 system 除 billing 行外原样进入提示，systemPrompt 原样写入 CLI，CLI 输出文本原样转发。该标记若由 CLI 内部日期句生成，提供代码不覆盖其构造路径，证据不足。

发现时间：2026-06-30（文章标题日期）。

报告原文（mechanism）：

> let renderedDate = marker?.cnTZ ? date.replaceAll("-", "/") : date;

报告原文（trigger）：

> The trigger is ANTHROPIC&#95;BASE&#95;URL, Claude Code's API base URL override.  Then it checks if:  the system timezone is Asia/Shanghai or Asia/Urumqi

报告原文（version）：

> my local Claude Code (2.1.196) install

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)

> const instruction = blocks.map(value =&gt; value.replace(/^x-anthropic-billing-header:&#91;^&#92;r&#92;n&#93;&#42;(?:&#92;r?&#92;n&#124;$)/, '')).filter(value =&gt; value.length).join('&#92;n');

代码：[model-gateway/engine.mjs:110](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L110)

> await fs.writeFile(promptFile, systemPrompt, { mode: 0o600 });

代码：[model-gateway/server.mjs:183](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/server.mjs#L183)

> if (nativeWriter) nativeWriter.text(text);           else chunk({ content: text });

### 历史来源 · v2.1.169（npm @anthropic-ai/claude-code，native win32-x64 binary） · 系统提示日期分隔符标记

[原报告](https://github.com/anthropics/claude-code/issues/67120)；评估时间：2026-10-19T10:17:14Z；审阅提交：1160cc476165。

评估基准：历史评估口径，见条件与证据。

机制：系统提示日期分隔符隐写：构造系统提示时，若系统时区为 Asia/Shanghai 或 Asia/Urumqi，将 Today's date is 后的日期从 YYYY-MM-DD 改为 YYYY/MM/DD，在正常日期句中承载时区标记位。

完整触发条件：构造系统提示日期句且 gate() 为假；系统时区为 Asia/Shanghai 或 Asia/Urumqi 时，将日期字符串中的 - 全部替换为 /，否则保持原分隔符。

方向：旧记录待回填；触发：旧记录待回填；网关处理：旧记录待回填。

当前有效性：待核实（代码已变化）。历史评估结论：待核实。

复核未通过：原文明确「系统时区为 Asia/Shanghai 或 Asia/Urumqi 时 - 变 /」，并给出 buildDateLine 中 c?.cnTZ ? date.replaceAll('-','/') 的对应代码，trigger&#95;summary 完整保留 gate() 为假这一共同前置条件与两个时区条件，版本 v2.1.169 有原文引文支撑，label 与 category=隐写 相符（格式近似等价的分隔符携带时区分类位）。但所给适配器代码（context.mjs 仅拼接 RELAY&#95;PROMPT 与调用方指令，engine.mjs 写 --system-prompt-file）不包含日期句构造或该字符串的检测处理，无法证明该变异存在，也无法证明其被过滤或未被过滤，且调查版本（CLI 白名单 2.1.280）与报告版本不一致，故代码证据不完整，supported=false。

发现时间：2026-06-10（结构化首发时间）。

报告原文（mechanism）：

> const d = c?.cnTZ ? date.replaceAll("-", "/") : date; // separator swap on CN timezones

报告原文（trigger）：

> The date separator switches from - to / when the system timezone is Asia/Shanghai or Asia/Urumqi.

报告原文（version）：

> Static inspection of the released claude.exe (npm @anthropic-ai/claude-code, v2.1.169, native win32-x64 binary)

代码：[model-gateway/context.mjs:102](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L102)

> const systemPrompt = RELAY&#95;PROMPT + (instructionJson ? &#96;&#92;nCaller instructions:&#92;n${instructionJson}&#96; : '')     + (updateJson ? &#96;&#92;n${UPDATE&#95;PROMPT}&#92;nCaller instruction updates:&#92;n${updateJson}&#96; : '');

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

