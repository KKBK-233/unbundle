<!-- termiters:research-evidence -->
# 研究证据

此文件自动生成；按机制保留多来源、版本、完整条件、原文引用与代码依据。

证据程度：报告描述＋源码静态评估。没有真实流量验证，不代表检测到了服务器实际发送行为。

<a id="mechanism-atis-pin-attribute"></a>
## ATIS pin attribute

机制 ID：atis-pin-attribute

### 当前报告来源 · 2.1.300 · ATIS pin attribute

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；评估时间：2026-10-21T03:15:16Z；审阅提交：c95455119f84。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：ATIS pin 环境属性：atisPin 变化触发 GrowthBook 重评估，tengu&#95;kestrel&#95;moor 锁定会话 ATIS，作为评估上下文。

完整触发条件：GrowthBook 评估上下文包含 atisPin；属性变化时重新评估，tengu&#95;kestrel&#95;moor 锁定会话 ATIS。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

atisPin 是 GrowthBook 评估上下文属性，tengu&#95;serene&#95;teacup 仅在该属性变化时触发重评估。默认网关通过 engine.mjs 设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，关联报告明确该变量关闭 GrowthBook（经 Oj），因此默认不会构造包含 atisPin 的 GrowthBook 评估请求；入站 API 请求不携带此字段。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;tengu&#95;serene&#95;teacup&#96; (&#96;BW()&#96;, &#96;:142951&#96;) re-evaluates when the &#96;atisPin&#96; attribute changes. &#96;tengu&#95;kestrel&#95;moor&#96; (&#96;r6s()&#96;, &#96;:142963&#96;) latches the conversation ATIS.

报告原文（trigger）：

> &#96;tengu&#95;serene&#95;teacup&#96; (&#96;BW()&#96;, &#96;:142951&#96;) re-evaluates when the &#96;atisPin&#96; attribute changes. &#96;tengu&#95;kestrel&#95;moor&#96; (&#96;r6s()&#96;, &#96;:142963&#96;) latches the conversation ATIS.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#42;&#42;ATIS pin.&#42;&#42; &#96;tengu&#95;serene&#95;teacup&#96; (&#96;BW()&#96;, &#96;:142951&#96;) re-evaluates when the &#96;atisPin&#96; attribute changes. &#96;tengu&#95;kestrel&#95;moor&#96; (&#96;r6s()&#96;, &#96;:142963&#96;) latches the conversation ATIS.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

<a id="mechanism-auto-mode-classifier-beta-header"></a>
## auto-mode classifier beta header

机制 ID：auto-mode-classifier-beta-header

### 当前报告来源 · 2.1.300 · auto-mode classifier beta header

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)；评估时间：2026-10-22T03:13:15Z；审阅提交：c5ff84ac0652。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自动模式分类器 beta 头协议指纹：客户端调用自动模式分类器时在请求中携带 &#96;auto-mode-classifier-2026-07-16&#96; beta 头，标识该分类器请求类型。

完整触发条件：自动模式分类器发起请求时（默认两阶段分类或严重度评分路径）。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

引擎固定以 &#96;--permission-mode dontAsk&#96; 启动 CLI；报告将 dontAsk 与 auto 列为不同模式，自动模式分类器及其 beta 头在默认配置下不会发起。网关仅经 stdio 启动 CLI，不介入其出站请求，但默认条件下无该信号。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#42;&#42;Beta header&#42;&#42; &#96;auto-mode-classifier-2026-07-16&#96; (&#96;wPo&#96;, &#96;:92315&#96;). &#42;&#42;NEW&#42;&#42;.

报告原文（trigger）：

> &#42;&#42;Two stages&#42;&#42; &#96;Gjo()&#96; (&#96;:457475&#96;): &#96;twoStageClassifier&#96; = &#96;"fast"&#96; &#124; &#96;"thinking"&#96; &#124; default &#96;"both"&#96;.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300 &#124; &#42;&#42;Build&#42;&#42;: &#96;2026-10-14T12:54:55Z&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

> &#42;&#42;Beta header&#42;&#42; &#96;auto-mode-classifier-2026-07-16&#96; (&#96;wPo&#96;, &#96;:92315&#96;). &#42;&#42;NEW&#42;&#42;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

> Six external modes, unchanged: &#96;TD = &#91;"acceptEdits","auto","bypassPermissions","default","dontAsk","plan"&#93;&#96; (&#96;:25394&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

> &#42;&#42;Two stages&#42;&#42; &#96;Gjo()&#96; (&#96;:457475&#96;): &#96;twoStageClassifier&#96; = &#96;"fast"&#96; &#124; &#96;"thinking"&#96; &#124; default &#96;"both"&#96;.

代码：[model-gateway/engine.mjs:105](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L105)

> '--no-chrome', '--permission-mode', 'dontAsk',

<a id="mechanism-background-dispatcher-tier-env"></a>
## 后台调度层级环境标记

机制 ID：background-dispatcher-tier-env

### 当前报告来源 · 2.1.300 · 后台调度订阅层级环境变量

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)；评估时间：2026-10-21T03:13:15Z；审阅提交：c95455119f84。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：后台调度订阅层级环境标记：后台调度器把订阅类型和速率限制层级写入 CLAUDE&#95;BG&#95;DISPATCHER&#95;&#42; 环境变量，交给后台子进程。

完整触发条件：后台调度器派生子进程时传递这两个环境变量；未启用后台调度器或无子进程时不触发。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

报告只说明后台调度器派生子进程时把 BG&#95;DISPATCHER&#95;&#42; 交给 background children。网关以 --tools '' 禁用内置工具、--max-turns 2 且每轮独立进程，默认无后台任务派生子进程；该内部环境传递条件不成立，且非模型请求字段。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; / &#96;&#95;RATE&#95;LIMIT&#95;TIER&#96; are handed to background children (&#96;:102488–102491&#96;).

报告原文（trigger）：

> &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; / &#96;&#95;RATE&#95;LIMIT&#95;TIER&#96; are handed to background children (&#96;:102488–102491&#96;).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

> &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; / &#96;&#95;RATE&#95;LIMIT&#95;TIER&#96; are handed to background children (&#96;:102488–102491&#96;).

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

### 当前报告来源 · 2.1.300 · 后台调度层级环境标记

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)；评估时间：2026-10-22T03:11:38Z；审阅提交：c5ff84ac0652。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：后台调度订阅层级环境标记：后台调度器把订阅类型和速率限制层级写入 CLAUDE&#95;BG&#95;DISPATCHER&#95;&#42; 环境变量，后台子进程在无 OAuth/FD token 且非 bg 快照时据此继承父会话计划。

完整触发条件：后台调度会话（CLAUDE&#95;CODE&#95;SESSION&#95;KIND=bg）且无 CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN、无 FD token、token 非来自 bg 快照时，读取调度器写入的订阅类型和速率限制层级环境变量，子进程继承父会话层级。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

报告要求 CLAUDE&#95;CODE&#95;SESSION&#95;KIND=bg 且无 OAuth/FD token 时才读取调度层级；engine.mjs 以 -p、--no-session-persistence、--max-turns 2 单轮运行，子进程环境按固定白名单重建且不含 SESSION&#95;KIND，默认不产生后台调度，两个标记不会出现。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> They read &#96;uOo()&#96; (&#96;102496&#96;), which returns &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; /  &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;RATE&#95;LIMIT&#95;TIER&#96; only when &#96;CLAUDE&#95;CODE&#95;SESSION&#95;KIND === "bg"&#96;. The dispatcher  sets them through &#96;JFs()&#96; (&#96;102485&#96;, key list &#96;Cgt&#96; &#96;102483&#96;). A bg-dispatched session therefore  inherits its parent's plan.

报告原文（trigger）：

> They apply only when &#96;Iee()&#96; (&#96;130964&#96;)  holds: no &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96;, no FD token (&#96;nn()&#96;), and the token did not come from a bg snapshot.  They read &#96;uOo()&#96; (&#96;102496&#96;), which returns &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;SUBSCRIPTION&#95;TYPE&#96; /  &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;RATE&#95;LIMIT&#95;TIER&#96; only when &#96;CLAUDE&#95;CODE&#95;SESSION&#95;KIND === "bg"&#96;. The dispatcher  sets them through &#96;JFs()&#96; (&#96;102485&#96;, key list &#96;Cgt&#96; &#96;102483&#96;). A bg-dispatched session therefore  inherits its parent's plan.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> &#96;CLAUDE&#95;BG&#95;DISPATCHER&#95;RATE&#95;LIMIT&#95;TIER&#96; only when &#96;CLAUDE&#95;CODE&#95;SESSION&#95;KIND === "bg"&#96;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> holds: no &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96;, no FD token (&#96;nn()&#96;), and the token did not come from a bg snapshot.

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,

<a id="mechanism-bridge-host-profile"></a>
## Bridge host profile

机制 ID：bridge-host-profile

### 当前报告来源 · 2.1.300 · Bridge host profile

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接主机软件画像：桥接注册的host字段携带平台、arch、OS版本、发行版、WSL、PATH工具清单和可选MCP服务器，默认关闭。

完整触发条件：仅在桥接环境注册路径、GrowthBook tengu&#95;bridge&#95;host&#95;profile 非 off 或 remoteControl.shareHostProfile 覆盖、且无 remote-control 设置错误时附加 host 软件画像；默认 off，full 含 MCP 列表。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

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
## 桥接机器 UUID 原样发送

机制 ID：bridge-machine-id

### 当前报告来源 · 2.1.300 · Bridge machine ID

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接环境机器ID透传：随机UUID remoteControlMachineId在注册远程控制桥环境时，作为顶层machine&#95;id和metadata.machine&#95;id原样发送。

完整触发条件：仅在 claude remote-control 桥接启动或独立桥接路径注册环境、且 remoteControlMachineId 非空时，将其作为顶层 machine&#95;id 和 metadata.machine&#95;id 发送到 /v1/environments/bridge。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

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

### 当前报告来源 · 2.1.300 · 桥接机器 UUID 原样发送

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)；评估时间：2026-10-22T03:08:34Z；审阅提交：c5ff84ac0652。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接环境机器 ID 透传：remoteControlMachineId 为 UUID，注册远程控制桥环境时原样发送。

完整触发条件：身份初始化后，remoteControlMachineId 作为 UUID 不做哈希或截断，直接进入远程控制桥环境注册请求。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

报告称 remoteControlMachineId 随 POST /v1/environments/bridge 原样发送；控制项 tengu&#95;cobalt&#95;harbor 默认 false，默认部署不额外启用远程控制/桥接，engine 固定 -p 单次运行也未启用 bridge。必要触发条件不成立，UUID 不发送；不是网关过滤 UUID。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> The NEW &#96;remoteControlMachineId&#96; (a UUID) is sent raw on &#96;POST /v1/environments/bridge&#96;.

报告原文（trigger）：

> The NEW &#96;remoteControlMachineId&#96; (a UUID) is sent raw on &#96;POST /v1/environments/bridge&#96;.

报告原文（version）：

> 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)

> The NEW &#96;remoteControlMachineId&#96; (a UUID) is sent raw on &#96;POST /v1/environments/bridge&#96;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;cobalt&#95;harbor&#96; &#124; &#96;false&#96; &#124; k &#124; kept &#124; &#96;:290108&#96; &#124; Default Remote Control ON at startup (a6o()) &#42;(2.1.197 desc.)&#42; &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L92)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

<a id="mechanism-bridge-owner-account-env"></a>
## 桥接所有者账号环境变量

机制 ID：bridge-owner-account-env

### 当前报告来源 · 2.1.300 · 桥接所有者账号环境变量

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)；评估时间：2026-10-21T03:13:15Z；审阅提交：c95455119f84。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接所有者账号环境标记：桥接重连与桥接环境变量携带 owner account 和 organization UUID，供后续桥接流程识别归属。

完整触发条件：使用远程控制桥接并构造重连/桥接所有者环境时设置这些 OWNER&#95;&#42; 环境变量；普通非桥接会话不设置。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

报告将在桥接重连/所有者环境中设置的 OWNER&#95;&#42; 列为桥接身份载体；关联报告显示控制远程控制默认开启的 tengu&#95;cobalt&#95;harbor 默认为 false。网关固定参数也未启用远程控制/桥接，并以 --no-chrome 关闭 Chrome 路径，默认普通会话不构造该桥接环境。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;CLAUDE&#95;BRIDGE&#95;REATTACH&#95;OWNER&#95;ACCT&#96; / &#96;&#95;ORG&#96; (&#96;:376419–376420&#96;) and &#96;CLAUDE&#95;CODE&#95;BRIDGE&#95;OWNER&#95;ACCOUNT&#95;UUID&#96; / &#96;&#95;ORG&#95;UUID&#96; (&#96;:24581–24584&#96;) carry the owner account and organization.

报告原文（trigger）：

> &#96;CLAUDE&#95;BRIDGE&#95;REATTACH&#95;OWNER&#95;ACCT&#96; / &#96;&#95;ORG&#96; (&#96;:376419–376420&#96;) and &#96;CLAUDE&#95;CODE&#95;BRIDGE&#95;OWNER&#95;ACCOUNT&#95;UUID&#96; / &#96;&#95;ORG&#95;UUID&#96; (&#96;:24581–24584&#96;) carry the owner account and organization.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

> &#96;CLAUDE&#95;BRIDGE&#95;REATTACH&#95;OWNER&#95;ACCT&#96; / &#96;&#95;ORG&#96; (&#96;:376419–376420&#96;) and &#96;CLAUDE&#95;CODE&#95;BRIDGE&#95;OWNER&#95;ACCOUNT&#95;UUID&#96; / &#96;&#95;ORG&#95;UUID&#96; (&#96;:24581–24584&#96;) carry the owner account and organization.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#124; &#96;tengu&#95;cobalt&#95;harbor&#96; &#124; &#96;false&#96; &#124; k &#124; kept &#124; &#96;:290108&#96; &#124; Default Remote Control ON at startup (a6o()) &#42;(2.1.197 desc.)&#42; &#124;

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-ccr-heartbeat-probe-fields"></a>
## CCR 心跳探测字段

机制 ID：ccr-heartbeat-probe-fields

### 当前报告来源 · 2.1.300 · CCR 心跳探测字段

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)；评估时间：2026-10-20T03:12:07Z；审阅提交：1041cadac6fc。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：CCR 心跳探测字段：Remote Control 的 CCRClient.sendHeartbeat() 在心跳体附加 supports&#95;heartbeat&#95;probe、current&#95;interval&#95;seconds 及 idle&#95;seconds（有样本时），并携带 session&#95;id、worker&#95;epoch。

完整触发条件：Remote Control 使用 CCRClient 发送心跳，且 tengu&#95;ccr&#95;idle&#95;heartbeat 开启、传输非 outbound-only 时。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

报告标明探测字段由 Remote Control 的 &#96;CCRClient.sendHeartbeat()&#96; 发送，且受 &#96;tengu&#95;ccr&#95;idle&#95;heartbeat&#96;（默认 false）控制；默认引擎未启用 Remote Control/&#96;--sdk-url&#96;，不发心跳，故未触发。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;{session&#95;id, worker&#95;epoch}&#96; plus, when probe support is on, &#96;supports&#95;heartbeat&#95;probe: true&#96;, &#96;current&#95;interval&#95;seconds&#96;, and &#96;idle&#95;seconds&#96; if the idle tracker has a sample

报告原文（trigger）：

> &#96;advertiseHeartbeatProbeSupport&#96; comes from &#96;k("tengu&#95;ccr&#95;idle&#95;heartbeat", false)&#96;  (&#96;:1051142&#96;, passed in at &#96;:1051166&#96;) and is forced off for outbound-only transports (&#96;F = !e.outboundOnly&#96;,  &#96;:1049036&#96;, applied at &#96;:1049068&#96;).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> &#124; &#96;CCRClient.sendHeartbeat()&#96; (module 1319), used by Remote Control &#124; &#96;{session&#95;id, worker&#95;epoch}&#96; plus, when probe support is on, &#96;supports&#95;heartbeat&#95;probe: true&#96;, &#96;current&#95;interval&#95;seconds&#96;, and &#96;idle&#95;seconds&#96; if the idle tracker has a sample &#124; &#96;:1046420-1046450&#96; &#124;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> - &#42;&#42;Probe fields are gated.&#42;&#42; &#96;advertiseHeartbeatProbeSupport&#96; comes from &#96;k("tengu&#95;ccr&#95;idle&#95;heartbeat", false)&#96;  (&#96;:1051142&#96;, passed in at &#96;:1051166&#96;) and is forced off for outbound-only transports (&#96;F = !e.outboundOnly&#96;,  &#96;:1049036&#96;, applied at &#96;:1049068&#96;). The capture therefore implies that flag was on for that session.

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-ccr-idle-heartbeat-probe"></a>
## CCR idle heartbeat probe

机制 ID：ccr-idle-heartbeat-probe

### 当前报告来源 · 2.1.300 · CCR idle heartbeat probe

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；评估时间：2026-10-21T03:15:16Z；审阅提交：c95455119f84。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：CCR 空闲心跳探测声明：CCR worker 空闲时按 flag 在心跳中声明支持 heartbeat-probe。

完整触发条件：CCR worker 空闲且 tengu&#95;ccr&#95;idle&#95;heartbeat 为 true 时广告 heartbeat-probe 支持；默认 false。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

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
## 设备绑定证明

机制 ID：device-bind-attestation

### 当前报告来源 · 2.1.300 · 设备绑定证明

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)；评估时间：2026-10-20T03:12:07Z；审阅提交：1041cadac6fc。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：会话设备绑定证明：向 /v1/code/sessions/{id}/device 发送 target&#95;device&#95;id 与 bind&#95;attestation（含 kid 和 signature）及 bind&#95;attestation&#95;issued&#95;at，形成设备绑定凭证。

完整触发条件：调用 POST /v1/code/sessions/{id}/device 进行设备绑定时。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

报告触发点是调用会话设备绑定 POST &#96;/v1/code/sessions/{id}/device&#96;，需先有 ccr 会话；默认引擎仅以 &#96;-p&#96; 执行一次推理，未传 &#96;--sdk-url&#96; 也未建立 ccr 会话，默认不发送绑定证明，故未触发。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> Device bind: &#96;{target&#95;device&#95;id, bind&#95;attestation:{kid,signature}, bind&#95;attestation&#95;issued&#95;at, …}&#96; (&#96;:1518262&#96;)

报告原文（trigger）：

> &#124; &#96;/v1/code/sessions/{id}/device&#96; &#124; POST &#124; &#42;&#42;NEW.&#42;&#42;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> &#124; &#96;/v1/code/sessions/{id}/device&#96; &#124; POST &#124; &#42;&#42;NEW.&#42;&#42; Device bind: &#96;{target&#95;device&#95;id, bind&#95;attestation:{kid,signature}, bind&#95;attestation&#95;issued&#95;at, …}&#96; (&#96;:1518262&#96;) &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

### 当前报告来源 · 2.1.300 · Device bind attestation

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：设备绑定证明透传：按账号生成P-256设备密钥并注册为远程设备，会话创建请求携带target&#95;device&#95;id与ECDSA bind&#95;attestation签名，形成服务端可核验的设备凭证。

完整触发条件：仅在 tengu&#95;violin&#95;wood 开启、非 diskless 且已按账号生成/加载 P-256 设备密钥并向 /cowork/remote&#95;devices 注册后，创建会话时附加 target&#95;device&#95;id 与 bind&#95;attestation；否则不发送。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

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

<a id="mechanism-environment-runner-version-header"></a>
## 环境运行器版本头

机制 ID：environment-runner-version-header

### 当前报告来源 · 2.1.300 · 环境运行器版本头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)；评估时间：2026-10-20T03:12:07Z；审阅提交：1041cadac6fc。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：环境运行器版本头：桥接环境请求和 sign-commit 请求携带 x-environment-runner-version（如 shr-…），标明运行器版本。

完整触发条件：桥接环境注册、轮询、心跳等请求，以及 sign-commit 请求。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

报告将该头放在桥接环境请求和 sign-commit 路径；默认引擎未传 &#96;--sdk-url&#96;、未启用 Remote Control/桥接，未执行环境注册、轮询或签名提交，默认不发送该头，故未触发。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;x-environment-runner-version&#96; and optional &#96;X-Trusted-Device-Token&#96; (&#96;:1075676-1075688&#96;).

报告原文（trigger）：

> &#96;x-environment-runner-version: shr-…&#96; (&#96;:605102&#96;)

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> ### 3.2 Bridge environments (module 1379 &#96;chunk-xtarwp8w.js&#96;) Headers: &#96;Bearer&#96;, &#96;anthropic-beta: environments-2025-11-01&#96; (&#96;bPo.header&#96;), &#96;x-environment-runner-version&#96; and optional &#96;X-Trusted-Device-Token&#96; (&#96;:1075676-1075688&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> &#124; &#96;/v1/code/sessions/{id}/sign-commit&#96; &#124; POST &#124; &#42;&#42;NEW.&#42;&#42; Server-side git commit signing, &#96;x-environment-runner-version: shr-…&#96; (&#96;:605102&#96;) &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-feature-name-telemetry-enum"></a>
## feature&#95;name 闭集遥测枚举

机制 ID：feature-name-telemetry-enum

### 当前报告来源 · 2.1.300 · feature&#95;name 闭集遥测枚举

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)；评估时间：2026-10-20T03:15:34Z；审阅提交：1041cadac6fc。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：遥测 feature&#95;name 闭集枚举：tengu&#95;feature&#95;ok/bad/sad 事件使用由 gH、&#95;H、yH 合并的 1,431 项 feature&#95;name 闭集枚举。

完整触发条件：发送 tengu&#95;feature&#95;ok/bad/sad 遥测事件时，feature&#95;name 取闭集枚举值。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

feature&#95;name 闭集仅用于 tengu&#95;feature&#95;ok/bad/sad 等遥测事件；默认 engine 启动 CLI 时硬编码 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，报告控制矩阵说明该变量关闭 1P、Datadog 等遥测。默认配置不发送此类事件，故非字段被过滤，而是触发条件被阻止；用户额外开启遥测不属默认行为。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;feature&#95;name&#96; enum&#42;&#42; of 1,431 names

报告原文（trigger）：

> used by &#96;tengu&#95;feature&#95;ok/bad/sad&#96;.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)

> - &#42;&#42;Closed &#96;feature&#95;name&#96; enum&#42;&#42; of 1,431 names: &#96;gH&#96; (1,427, &#96;:135922&#96;) plus 4 names from &#96;&#95;H&#96;/&#96;yH&#96;, joined into &#96;Uk&#96; at &#96;:135928&#96;. This is a new codebook of internal feature  names (for example &#96;hfi&#95;&#42;&#96;, &#96;byoc&#95;&#42;&#96;, &#96;swarm&#95;&#42;&#96;, &#96;workshop&#95;&#42;&#96;, &#96;laptop&#95;memory&#95;&#42;&#96;, &#96;rtc&#95;&#42;&#96;, &#96;cedar&#95;ember&#96;,  &#96;shoji&#95;engine&#96;), used by &#96;tengu&#95;feature&#95;ok/bad/sad&#96;.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L92)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

<a id="mechanism-growthbook-authed-eval-endpoint"></a>
## GB authed eval endpoint

机制 ID：growthbook-authed-eval-endpoint

### 当前报告来源 · 2.1.300 · GB authed eval endpoint

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；评估时间：2026-10-21T03:15:16Z；审阅提交：c95455119f84。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：GrowthBook 认证远程评估端点：启用后向 /api/eval-authed/{clientKey} 发送评估请求，并在可信工作区附加 OAuth 认证头。

完整触发条件：GrowthBook 启用且 tengu&#95;gb&#95;eval&#95;authed&#95;enable 为真；可信工作区附加认证头，不可信仍访问 eval-authed 但不带认证头。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

该机制是 CLI 自发 GrowthBook 出站请求。默认网关在 engine.mjs 中注入 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1；关联报告说明该变量关闭 GrowthBook（经 Oj），因此 tengu&#95;gb&#95;eval&#95;authed&#95;enable 不会被用于发起 /api/eval-authed/{clientKey}。网关本身不介入 CLI 出站 HTTP，但默认配置已阻止触发。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> When &#96;tengu&#95;gb&#95;eval&#95;authed&#95;enable&#96; is on (read inside the class, &#96;:134017&#96;), the client POSTs to &#96;${host}/api/eval-authed/${clientKey}&#96;.

报告原文（trigger）：

> Only when the workspace is trusted (&#96;hasWorkspaceTrust()&#96;) does it first refresh OAuth and attach the auth headers; an untrusted workspace still hits &#96;eval-authed&#96;, just without them (&#96;:134026–134034&#96;).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

> &#42;&#42;Authenticated remote eval.&#42;&#42; When &#96;tengu&#95;gb&#95;eval&#95;authed&#95;enable&#96; is on (read inside the class, &#96;:134017&#96;), the client POSTs to &#96;${host}/api/eval-authed/${clientKey}&#96;. Only when the workspace is trusted (&#96;hasWorkspaceTrust()&#96;) does it first refresh OAuth and attach the auth headers; an untrusted workspace still hits &#96;eval-authed&#96;, just without them (&#96;:134026–134034&#96;). On a non-OK response or a throw it falls back to the stock &#96;/api/eval&#96; (&#96;:134036–134055&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

<a id="mechanism-install-user-id-metadata"></a>
## userID 元数据原样透传

机制 ID：install-user-id-metadata

### 当前报告来源 · 2.1.300 · Install userID metadata passthrough

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：持久安装用户标识透传：配置中无合法64位十六进制userID时随机生成并持久化，之后作为device&#95;id/user.id原样发往Messages API metadata.user&#95;id、1P事件、GrowthBook和OTel。

完整触发条件：在构造 Messages API metadata.user&#95;id 或各遥测入口时，总是读取持久 userID（无合法 64 位十六进制则随机生成并持久化），随后 Messages API 将其作为 device&#95;id 原样写入，1P/GrowthBook/OTel 另按各自通道发送。

方向：待补充；触发：待核实；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：未过滤。

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

### 当前报告来源 · 2.1.300 · userID 元数据原样透传

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)；评估时间：2026-10-22T03:08:34Z；审阅提交：c5ff84ac0652。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：持久安装用户标识透传：随机生成的 64 位十六进制 userID 作为账号或设备标识，随 Messages API metadata.user&#95;id、1P 事件、GrowthBook 和 OTel 原样发出。

完整触发条件：身份初始化时生成随机 32 字节值，经 64 位十六进制校验并持久化到全局配置后，userID 不哈希、不截断，原样写入 Messages API metadata.user&#95;id、1P 事件、GrowthBook 与 OTel。

方向：待补充；触发：待核实；网关处理：待核实。

当前有效性：未过滤。历史评估结论：未过滤。

报告基准下，userID 原样进入 Messages API metadata.user&#95;id；默认环境仅停用非必要遥测/1P/GrowthBook/OTel，不禁核心 Messages API。引擎仅 spawn CLI 并以 stdio 交互，不代理其出站 HTTP，故该 CLI 自发路径满足条件时未经过网关过滤。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;userID&#96; still leaves raw (Messages API &#96;metadata.user&#95;id&#96;, 1P events, GrowthBook, OTel).

报告原文（trigger）：

> each produce &#96;randomBytes(32).toString("hex")&#96;, validated as 64-hex and persisted to the

报告原文（version）：

> 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)

> &#96;userID&#96; still leaves raw (Messages API &#96;metadata.user&#95;id&#96;, 1P events, GrowthBook, OTel).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#42;&#42;OpenTelemetry (user 3P)&#42;&#42; (module 1771) &#124; Metrics, logs and traces to the operator's own collector &#124; &#96;OTEL&#95;EXPORTER&#95;OTLP&#95;&#42;&#96;; &#42;&#42;NEW&#42;&#42; CCR relay &#96;/v1/code/sessions/{id}/worker/otlp/…&#96; (&#96;:194015&#96;) &#124; &#42;&#42;OFF&#42;&#42; &#124; &#96;CLAUDE&#95;CODE&#95;ENABLE&#95;TELEMETRY&#96; (&#96;isTelemetryEnabled&#96; &#96;Nt&#96;, &#96;:1470670&#96;) plus the &#96;OTEL&#95;&#42;&#96; family &#124;

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L92)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

<a id="mechanism-low-priority-slow-protocol-headers"></a>
## 低优先级慢速协议头

机制 ID：low-priority-slow-protocol-headers

### 当前报告来源 · 2.1.300 · 低优先级慢速协议头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)；评估时间：2026-10-22T03:11:38Z；审阅提交：c5ff84ac0652。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：低优先级慢速通道协议头：服务端以 anthropic-ratelimit-unified-slow-&#42; 组头下发 treatment/control 与状态，客户端在低优先级激活时发送 anthropic-usage-limit: slow（历史 extended 值仍可用）。

完整触发条件：仅当消费者 OAuth（kt）成立，且 iL 或 tengu&#95;toasty&#95;breeze.enabled=true，并满足非 usage&#95;based、firstParty、交互式、非远程、非 $t()、five&#95;hour 资格；低优先级激活时请求携带 anthropic-usage-limit: slow，服务端 slow-offer 仅在 treatment 组报价。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

报告资格含交互式会话、消费者 OAuth 且 iL 或 tengu&#95;toasty&#95;breeze.enabled 为真；engine.mjs 以 -p 非交互运行、未设该 flag，默认不进入低优先级，anthropic-usage-limit: slow 不会发出；且该头由 CLI 直连 API，不经网关。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> - The server arms the offer through &#42;&#42;NEW&#42;&#42; headers &#96;anthropic-ratelimit-unified-slow-offer&#96;  (&#96;treatment&#96;&#124;&#96;control&#96;), &#96;-slow-status&#96; (&#96;active&#96;/&#96;not&#95;needed&#96;/&#96;slot&#95;busy&#96;/&#96;weekly&#95;limit&#96;/  &#96;budget&#95;exhausted&#96;/&#96;ineligible&#96;/&#96;off&#96;), &#96;-slow-retry-after&#96;, &#96;-slow-max-wait&#96;,  &#96;-slow-budget-utilization&#96; and &#96;-slow-budget-reset&#96; (&#96;177296&#96;–&#96;177337&#96;). None of them occur in 2.1.197.  &#96;EVe()&#96; (&#96;934618&#96;) offers only on &#96;treatment&#96;. &#96;lXo()&#96; logs &#96;tengu&#95;lowpri&#95;offer&#95;capable&#96; for either arm;  &#96;tengu&#95;lowpri&#95;offer&#95;withheld&#96; (&#96;934652&#96;) fires for a &#42;&#42;&#96;treatment&#96;&#42;&#42; arm suppressed by the cool-off  (&#96;TBe()&#96; set, &#96;reason: "cooloff"&#96;), not for &#96;control&#96;. - While active (&#96;iL()&#96; &#96;177442&#96;), requests carry &#42;&#42;&#96;anthropic-usage-limit: slow&#96;&#42;&#42; (&#96;wpt&#96;/&#96;PCr&#96;,  &#96;177294&#96;; set at &#96;182423&#96; and &#96;529644&#96;). The header name itself is &#42;&#42;not&#42;&#42; new: 2.1.197 already sent  &#96;anthropic-usage-limit: extended&#96; behind &#96;tengu&#95;lantern&#95;spool&#96; (&#96;2.1.197:595982&#96;), and 2.1.300 still  does (&#96;529645&#96;). The &#96;slow&#96; value is NEW.

报告原文（trigger）：

> - Command &#96;I6o&#96; (&#96;476488&#96;), &#96;name: fve&#96; = &#96;"low-priority"&#96; (&#96;177349&#96;): &#96;"Continue now at lower priority  after reaching your session limit; run again to stop"&#96;. &#96;isEnabled: () =&gt; kt() &amp;&amp; (iL() &#124;&#124; Ept())&#96;,  hidden. Its name is an identifier, so &#96;&#95;facts.md&#96; §1.6 does not count it. - Gate &#96;Ept()&#96; (&#96;177366&#96;) is &#96;k("tengu&#95;toasty&#95;breeze", {}).enabled === !0&#96;. The flag object also supplies  copy and &#96;cooloffMinutes&#96; (clamped 0–1440, default 10, &#96;177391&#96;–&#96;177395&#96;). - Eligibility: &#96;Xvt()&#96; (&#96;934499&#96;) requires &#96;kt()&#96;, &#96;billingType !== "usage&#95;based"&#96;, &#96;Aa()&#96; (firstParty),  an interactive session, not remote mode and not &#96;$t()&#96;. &#96;kVe(limits)&#96; (&#96;934503&#96;) adds  &#96;rateLimitType === "five&#95;hour"&#96;.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> an interactive session, not remote mode and not &#96;$t()&#96;. &#96;kVe(limits)&#96; (&#96;934503&#96;) adds

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> - Gate &#96;Ept()&#96; (&#96;177366&#96;) is &#96;k("tengu&#95;toasty&#95;breeze", {}).enabled === !0&#96;.

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',

<a id="mechanism-machine-id-error-prefix"></a>
## machineID 错误报告截断

机制 ID：machine-id-error-prefix

### 当前报告来源 · 2.1.300 · MachineID error prefix

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：随机安装机器标识截断透传：持久化的64位十六进制machineID仅取前12字符，作为host&#95;name&#95;redacted随错误报告日志发送。

完整触发条件：在错误报告日志构造路径，读取持久化 machineID（无则随机生成）并截取前 12 个十六进制字符作为 host&#95;name&#95;redacted 放入 payload；不发送完整 machineID。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

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

### 当前报告来源 · 2.1.300 · machineID 错误报告截断

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)；评估时间：2026-10-22T03:08:34Z；审阅提交：c5ff84ac0652。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：机器标识截断透传：持久化的 64 位十六进制 machineID 只以 12 字符前缀形式出现在错误报告中。

完整触发条件：身份初始化并持久化 machineID 后，触发错误报告时只截取前 12 个字符作为机器标识，不发送完整值。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

默认 engine 环境设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1；报告控制矩阵明确其禁用 error tracking，且 Datadog 错误跟踪默认 OFF、受 tengu&#95;orford&#95;ness 等门控。默认配置下错误报告必要触发条件不成立，12 字符 machineID 前缀不会发出；这是触发控制而非网关截断。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;machineID&#96; leaves only as a 12-character prefix in error reports.

报告原文（trigger）：

> &#96;machineID&#96; leaves only as a 12-character prefix in error reports.

报告原文（version）：

> 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#96;DISABLE&#95;TELEMETRY&#96; / &#96;DO&#95;NOT&#95;TRACK&#96; / &#96;CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC&#96; &#124; Disable 1P, Datadog, error tracking, GrowthBook (via &#96;Oj&#96;), BigQuery metrics (via &#96;LD&#96;), and the plugin telemetry mod &#124; &#96;:10162&#96;, &#96;:22061&#96;, &#96;:142788&#96;, &#96;:1470484&#96;, &#96;:1534612&#96; &#124;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#124; &#42;&#42;OFF&#42;&#42; &#124; flag &#96;tengu&#95;orford&#95;ness&#96; (default &#96;!1&#96;, &#96;:349389&#96;); &#96;DISABLE&#95;ERROR&#95;REPORTING&#96;; org restriction &#96;allow&#95;error&#95;reporting&#96;; min version &#96;2.1.193&#96; &#124;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

> &#42;&#42;machineID &#96;Umt()&#96;&#42;&#42; (&#96;:115581&#96;) &#42;&#42;is transmitted.&#42;&#42; Datadog error tracking sends &#96;host&#95;name&#95;redacted: Umt().slice(0, 12)&#96;, the first 12 hex characters (&#96;:350262&#96;).

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L92)

> Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

<a id="mechanism-otel-user-email"></a>
## OTel user email

机制 ID：otel-user-email

### 当前报告来源 · 2.1.300 · OTel user email

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：OTel邮箱透传：非diskless模式下，用户配置的OTel资源在账号有邮箱时无条件写入user.email；企业网关OIDC覆盖时从JWT补充身份属性。

完整触发条件：用户配置 OTel 导出且非 diskless 模式时，只要账号有 emailAddress，就无条件写入 OTel resource 的 user.email；企业网关 OIDC 覆盖时从 JWT 补充 user.&#42; 身份属性。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

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
## 超额范围协议头

机制 ID：overage-scope-protocol-header

### 当前报告来源 · 2.1.300 · 超额范围协议头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)；评估时间：2026-10-22T03:11:38Z；审阅提交：c5ff84ac0652。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：限流超额范围协议头：服务端 anthropic-ratelimit-unified-overage-scope 取值 service、channel 或 group&#95;pool，客户端据此显示团队共享预算、渠道月度支出限额或普通超额文案。

完整触发条件：仅当响应头 anthropic-ratelimit-unified-overage-scope 存在时解析为 service、channel 或 group&#95;pool；group&#95;pool 显示团队共享预算提示，channel 且触发 spend cap 显示渠道月度支出限额提示。

方向：待补充；触发：待核实；网关处理：待核实。

当前有效性：未过滤。历史评估结论：未过滤。

该机制是 CLI 解析服务端 anthropic-ratelimit-unified-overage-scope 响应头生成提示文案，属 CLI 直连 api.anthropic.com 路径；engine.mjs 仅以 stdio 启动独立 CLI，默认不设 ANTHROPIC&#95;BASE&#95;URL，网关不转发也不解析该响应头，未过滤，也未实际触发。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;nh()&#96; (&#96;184317&#96;) parses the &#42;&#42;NEW&#42;&#42; header &#96;anthropic-ratelimit-unified-overage-scope&#96; (0 in 2.1.197) into &#96;service&#96; / &#96;channel&#96; / &#96;group&#95;pool&#96;. &#96;bS()&#96; (&#96;183137&#96;) uses it:

报告原文（trigger）：

> - &#96;group&#95;pool&#96; → &#96;"You've hit your team's shared budget"&#96; with a raise-it-at-admin link (&#96;183155&#96;–&#96;183159&#96;). - &#96;channel&#96; + spend cap → &#96;"You've hit your channel's monthly spend limit · an org owner or channel manager  can raise it in the channel's Claude settings"&#96; (&#96;183052&#96;–&#96;183056&#96;, &#96;183168&#96;).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> &#96;nh()&#96; (&#96;184317&#96;) parses the &#42;&#42;NEW&#42;&#42; header &#96;anthropic-ratelimit-unified-overage-scope&#96; (0 in 2.1.197) into

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> - &#96;group&#95;pool&#96; → &#96;"You've hit your team's shared budget"&#96; with a raise-it-at-admin link (&#96;183155&#96;–&#96;183159&#96;).

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

代码：[model-gateway/engine.mjs:100](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L100)

> Object.assign(env, { ANTHROPIC&#95;BASE&#95;URL: testUpstream.baseUrl, ANTHROPIC&#95;AUTH&#95;TOKEN: testUpstream.token });

<a id="mechanism-peer-message-frommode-marker"></a>
## peer message fromMode

机制 ID：peer-message-frommode-marker

### 当前报告来源 · 2.1.300 · peer message fromMode

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；评估时间：2026-10-21T03:15:16Z；审阅提交：c95455119f84。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：对等消息 fromMode 标记：跨会话 peer messaging 构造消息时，按 tengu&#95;harbor&#95;kite&#95;mode&#95;emit 决定是否写入 fromMode 来源模式字段。

完整触发条件：peer messaging 可用且构造消息；tengu&#95;harbor&#95;kite&#95;mode&#95;emit 为 true 时发送 fromMode。

方向：待补充；触发：待核实；网关处理：待核实。

当前有效性：未过滤。历史评估结论：未过滤。

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

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)；评估时间：2026-10-22T03:11:38Z；审阅提交：c5ff84ac0652。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：计划层级环境覆盖：存在 OAuth token 或托管/FD token 时，用 CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE 与 CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER 覆盖 subscriptionType/rateLimitTier，bg 快照亦写入 process.env 并透传子进程。

完整触发条件：当设置 CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN 或存在托管/FD token 时读取两个环境变量并覆盖计划/层级；bg 认证快照也会把二者写入 process.env，且二者在子进程环境透传允许列表中。

方向：待补充；触发：待核实；网关处理：移除。

当前有效性：已过滤。历史评估结论：已过滤。

机制经 CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE / CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER 覆盖计划层级；engine.mjs 只按固定白名单重建子进程环境，这两个变量与 CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN 都不传入，覆盖通道被去除；CLI 自有凭据中的计划显示不属此机制。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> When &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96; is set (&#96;129943&#96;), or a managed/FD token is present (&#96;129951&#96;–&#96;129959&#96;), it reads: - &#96;CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE&#96; → &#96;subscriptionType&#96; (&#96;129948&#96;, &#96;129957&#96;) - &#96;CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER&#96; → &#96;rateLimitTier&#96; (&#96;129949&#96;, &#96;129958&#96;)

报告原文（trigger）：

> When &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96; is set (&#96;129943&#96;), or a managed/FD token is present (&#96;129951&#96;–&#96;129959&#96;), it reads: - &#96;CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE&#96; → &#96;subscriptionType&#96; (&#96;129948&#96;, &#96;129957&#96;) - &#96;CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER&#96; → &#96;rateLimitTier&#96; (&#96;129949&#96;, &#96;129958&#96;)  The bg auth-snapshot consumer also writes both onto &#96;process.env&#96; (&#96;100807&#96;–&#96;100808&#96;). Both names are on the child-env passthrough allowlists (&#96;102888&#96;, &#96;102965&#96;, &#96;165624&#96;, &#96;1646702&#96;).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> When &#96;CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN&#96; is set (&#96;129943&#96;)

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

> - &#96;CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE&#96; → &#96;subscriptionType&#96; (&#96;129948&#96;, &#96;129957&#96;)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,

<a id="mechanism-plugin-telemetry-device-id"></a>
## Plugin telemetry deviceId

机制 ID：plugin-telemetry-device-id

### 当前报告来源 · 2.1.300 · Plugin telemetry deviceId

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：内置插件遥测设备标识：builtin/core插件读取配置userID作为deviceId，携带账号、组织和session，POST到硬编码api.anthropic.com批量事件接口。

完整触发条件：仅 builtin/core 插件可调用该遥测能力，且 !iy() 为真并通过分析开关/策略检查时，读取配置 userID 作为 deviceId，携带账号、组织和 session POST 到硬编码 api.anthropic.com 批量事件接口。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

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
## x-cc-tender-quilt 拒绝切换头

机制 ID：safety-refusal-model-switch-header

### 当前报告来源 · 2.1.300 · x-cc-tender-quilt 拒绝切换头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)；评估时间：2026-10-20T03:15:34Z；审阅提交：1041cadac6fc。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：安全拒绝模型切换头协议标记：请求头 x-cc-tender-quilt 与 convolute&#95;arcades/tender&#95;quilt 状态及拒绝后模型切换逻辑关联。

完整触发条件：消息被标记为 cyber 或 frontier&#95;llm 拒绝类别并触发自动切换模型时。

方向：待补充；触发：待核实；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：未过滤。

报告称该头由 CLI 在 cyber/frontier&#95;llm 拒绝切换时生成；默认 engine 仅 spawn 独立 CLI 并经 stdio 交互，CLI 自行认证、直接向上游发请求，网关不解析或改写出站 HTTP 头。CLI 自发路径，满足报告触发条件时未经过网关过滤；默认配置未禁用该切换，但未声称实际触发。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;var Rl = "convolute&#95;arcades"&#96;, header &#96;x-cc-tender-quilt&#96;

报告原文（trigger）：

> swaps the model only for refusal categories &#96;yy = new Set(&#91;"cyber","frontier&#95;llm"&#93;)&#96;

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)

> &#42;&#42;NEW in 2.1.300 (0 occurrences in 2.1.197; see the correction below).&#42;&#42; &#96;var Rl = "convolute&#95;arcades"&#96;, header &#96;x-cc-tender-quilt&#96; (&#96;:179815–179816&#96;). &#96;QPe()&#96; returns &#96;"convolute&#95;arcades"&#96;, &#96;"tender&#95;quilt"&#96; or &#96;"none"&#96; (&#96;:179835&#96;). &#96;zEo()&#96; swaps the model only for refusal categories &#96;yy = new Set(&#91;"cyber","frontier&#95;llm"&#93;)&#96; (&#96;:179847–179856&#96;). The user string is &#96;"automatically switched from ${e} after a message was flagged — run /model to switch back"&#96; (&#96;:179813&#96;). Events &#96;tengu&#95;convolute&#95;arcades&#95;tools&#96;/&#96;&#95;retry&#96;/&#96;&#95;retry&#95;outcome&#96; (&#96;:751498&#96;, &#96;:757068&#96;).

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L112)

> child = spawnProcess(cli, args, { env, cwd, detached: group, windowsHide: true, stdio: &#91;'pipe', 'pipe', 'pipe'&#93; });

代码：[model-gateway/cloud-server.mjs:8](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/cloud-server.mjs#L8)

> // 云端专用入口：官方 CLI 持有认证；网关仅检查登录布尔状态。

<a id="mechanism-self-hosted-runner-jwt-identity-env"></a>
## 自托管运行器JWT身份环境变量

机制 ID：self-hosted-runner-jwt-identity-env

### 当前报告来源 · 2.1.300 · 自托管运行器JWT身份环境变量

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)；评估时间：2026-10-21T03:13:15Z；审阅提交：c95455119f84。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自托管运行器 JWT 身份环境注入：从工单 JWT 的 account&#95;email、account&#95;id、jti 等 claims 生成 CLAUDE&#95;RUNNER&#95;&#42; 环境变量，交给 hook 脚本，承载账号与工单身份。

完整触发条件：自托管运行器（BYOC）执行 hook 脚本，且工单 JWT 含 account&#95;email/account&#95;id 等 claims 时；普通云端会话或无 hook 场景不触发。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

报告要求自托管运行器（BYOC）执行 hook 脚本，才从工单 JWT 生成 CLAUDE&#95;RUNNER&#95;&#42;。网关仅以 --setting-sources ''、--tools '' 等固定参数启动独立 CLI，环境仅白名单加固定项，默认未配置 BYOC runner 或 hook；该 CLI 内部环境注入条件不成立，且非模型请求字段。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;EMAIL&#96; / &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;ID&#96; are set &#42;&#42;for&#42;&#42; self-hosted runner hook scripts, from the work order's JWT claims (&#96;claims.account&#95;email&#96;, &#96;claims.account&#95;id&#96;, &#96;:617889–617890&#96;), together with &#96;CLAUDE&#95;RUNNER&#95;ORDER&#95;ID&#96; = &#96;claims.jti&#96; and &#96;CLAUDE&#95;RUNNER&#95;POOL&#95;ID&#96;.

报告原文（trigger）：

> &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;EMAIL&#96; / &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;ID&#96; are set &#42;&#42;for&#42;&#42; self-hosted runner hook scripts, from the work order's JWT claims (&#96;claims.account&#95;email&#96;, &#96;claims.account&#95;id&#96;, &#96;:617889–617890&#96;), together with &#96;CLAUDE&#95;RUNNER&#95;ORDER&#95;ID&#96; = &#96;claims.jti&#96; and &#96;CLAUDE&#95;RUNNER&#95;POOL&#95;ID&#96;.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

> &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;EMAIL&#96; / &#96;CLAUDE&#95;RUNNER&#95;ACCOUNT&#95;ID&#96; are set &#42;&#42;for&#42;&#42; self-hosted runner hook scripts, from the work order's JWT claims (&#96;claims.account&#95;email&#96;, &#96;claims.account&#95;id&#96;, &#96;:617889–617890&#96;), together with &#96;CLAUDE&#95;RUNNER&#95;ORDER&#95;ID&#96; = &#96;claims.jti&#96; and &#96;CLAUDE&#95;RUNNER&#95;POOL&#95;ID&#96;.

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)

> const env = {};     for (const k of &#91;'PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'LANG'&#93;) if (process.env&#91;k&#93;) env&#91;k&#93; = process.env&#91;k&#93;;     Object.assign(env, { HOME: home, USERPROFILE: home, CLAUDE&#95;CONFIG&#95;DIR: configDir,       CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC: '1', CLAUDE&#95;CODE&#95;DISABLE&#95;AUTO&#95;MEMORY: '1', DISABLE&#95;AUTOUPDATER: '1',       ENABLE&#95;TOOL&#95;SEARCH: 'false', MCP&#95;TOOL&#95;TIMEOUT: String(timeoutMs &#124;&#124; 2147483647), CLAUDE&#95;CODE&#95;MAX&#95;OUTPUT&#95;TOKENS: String(maxOutputTokens) });

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-self-hosted-runner-version-header"></a>
## 自托管运行器版本头

机制 ID：self-hosted-runner-version-header

### 当前报告来源 · 2.1.300 · 自托管运行器版本头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)；评估时间：2026-10-20T03:12:07Z；审阅提交：1041cadac6fc。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自托管运行器版本头：自托管 runner 控制面请求携带 x-self-hosted-runner-version，作为运行器版本协议指纹。

完整触发条件：自托管 runner 的注册、轮询、spawn-hints、会话令牌、释放、注销等控制面请求。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

报告将 &#96;x-self-hosted-runner-version&#96; 限定在自托管 runner 控制面调用；默认网关是一次性 &#96;-p&#96; 推理进程，未运行 self-hosted runner 客户端或注册/轮询循环，默认不触发该控制面，故未发送。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;x-self-hosted-runner-version&#96; (0 occurrences in 2.1.197).

报告原文（trigger）：

> Calls carry the header &#96;x-self-hosted-runner-version&#96; (§4).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> Calls carry the header &#96;x-self-hosted-runner-version&#96; (§4).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> &#124; &#96;/v1/code/runners/self-hosted/runners/register&#96; &#124; POST &#124; &#96;{runner&#95;version, use&#95;anthropic&#95;git&#95;proxy, server&#95;auto&#95;mode&#95;lists, client&#95;label?, lock&#95;to&#95;account&#95;id?}&#96; → &#96;runner&#95;id&#96; (&#96;:600435&#96;) &#124;

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

<a id="mechanism-server-side-arbiter-beta-header"></a>
## server-side arbiter beta header

机制 ID：server-side-arbiter-beta-header

### 当前报告来源 · 2.1.300 · server-side arbiter beta header

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)；评估时间：2026-10-22T03:13:15Z；审阅提交：c5ff84ac0652。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：服务端仲裁器 beta 头协议指纹：服务端分类器（arbiter）请求携带 &#96;dangerous-tool-use-2026-09-03&#96; beta 头，响应以 &#96;safeguard&#95;results&#96; 返回裁决。

完整触发条件：自动模式使用服务端分类器审查工具调用且 &#96;cE(tool)&#96; 返回 &#96;arbiter&#96; 或 &#96;arbiterWithLocalFallback&#96; 时。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：当前配置不触发。历史评估结论：当前配置不触发。

默认固定 &#96;--permission-mode dontAsk&#96;，未进入 auto 模式；报告把 server-side arbiter 归入自动模式分类器路径，因此该 beta 头与 safeguard&#95;results 请求在默认配置下不发起，网关也未介入 CLI 出站。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> The API beta &#96;dangerous-tool-use-2026-09-03&#96; (&#96;YC&#96;, &#96;:92316&#96;) and the response field &#96;safeguard&#95;results&#96; (&#96;:96445&#96;) carry an &#96;evaluated{outcome:"flagged"&#124;"not&#95;flagged"}&#96; / &#96;skipped&#96; / &#96;unavailable&#96; verdict (&#96;AEo&#96;, &#96;:431576&#96;).

报告原文（trigger）：

> &#96;cE(tool)&#96; (&#96;:431829&#96;) returns &#96;"off"&#96;, &#96;"arbiter"&#96; (first party) or &#96;"arbiterWithLocalFallback"&#96; (third-party planes: bedrock, mantle, vertex, foundry, anthropicAws, anthropicGoogleCloud, gateway; &#96;j3()&#96; &#96;:431810&#96;).

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300 &#124; &#42;&#42;Build&#42;&#42;: &#96;2026-10-14T12:54:55Z&#96;

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

> The model-based layer is the &#42;&#42;auto-mode classifier&#42;&#42;, and it was substantially rebuilt (graded severity, a consent-bar framework, a server-side "arbiter" path, and 72 SOFT-BLOCK rules where 2.1.197 had 55).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

> &#96;cE(tool)&#96; (&#96;:431829&#96;) returns &#96;"off"&#96;, &#96;"arbiter"&#96; (first party) or &#96;"arbiterWithLocalFallback"&#96; (third-party planes: bedrock, mantle, vertex, foundry, anthropicAws, anthropicGoogleCloud, gateway; &#96;j3()&#96; &#96;:431810&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

> The API beta &#96;dangerous-tool-use-2026-09-03&#96; (&#96;YC&#96;, &#96;:92316&#96;) and the response field &#96;safeguard&#95;results&#96; (&#96;:96445&#96;) carry an &#96;evaluated{outcome:"flagged"&#124;"not&#95;flagged"}&#96; / &#96;skipped&#96; / &#96;unavailable&#96; verdict (&#96;AEo&#96;, &#96;:431576&#96;).

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

> Six external modes, unchanged: &#96;TD = &#91;"acceptEdits","auto","bypassPermissions","default","dontAsk","plan"&#93;&#96; (&#96;:25394&#96;).

代码：[model-gateway/engine.mjs:105](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L105)

> '--no-chrome', '--permission-mode', 'dontAsk',

<a id="mechanism-summon-sid-hmac"></a>
## Summon SID HMAC

机制 ID：summon-sid-hmac

### 当前报告来源 · 2.1.300 · Summon SID HMAC

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：召唤状态伪匿名标识：以summonSidKey为HMAC密钥，对sessionId与artifact slug计算SHA-256并取前16位十六进制，作为sid随summon-status上报；密钥本身不离开本机。

完整触发条件：仅在 artifact-comment 的 summon-status 上报路径、当前 (sessionId, artifact slug) 尚无 sid 时，以 summonSidKey 对 sessionId+slug 做 HMAC-SHA256 并取前16位作为 sid 发送；密钥本身不离开本机。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

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

<a id="mechanism-trusted-device-token"></a>
## 可信设备令牌头

机制 ID：trusted-device-token

### 当前报告来源 · 2.1.300 · 可信设备令牌头

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)；评估时间：2026-10-20T03:12:07Z；审阅提交：1041cadac6fc。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：可信设备令牌头透传：将 X-Trusted-Device-Token 随 CCR CRUD、桥接、桥接环境、inbox、move-to-cloud 和 GitHub PR 请求发送，供服务端识别可信设备。

完整触发条件：当存在可信设备令牌时，上述请求附加该头。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

报告将该头限定在 CCR CRUD、bridge、bridge-environment、inbox、move-to-cloud 和 GitHub PR 路径，且需已有令牌；默认引擎只启动普通 &#96;claude -p&#96;，未传 &#96;--sdk-url&#96; 或建立 CCR/桥接会话，默认配置不进入这些路径，故未触发，非网关过滤。

发现时间：2026-10-14（上游报告提交日期）。

报告原文（mechanism）：

> &#96;X-Trusted-Device-Token&#96; occurs &#42;&#42;27×&#42;&#42; in 2.1.300 (5× in 2.1.197). It now rides on the CCR CRUD, bridge, bridge-environment, inbox, move-to-cloud and github-PR calls.

报告原文（trigger）：

> Both add &#96;X-Trusted-Device-Token&#96; when one is present.

报告原文（version）：

> &#42;&#42;Version&#42;&#42;: 2.1.300

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> &#96;X-Trusted-Device-Token&#96; occurs &#42;&#42;27×&#42;&#42; in 2.1.300 (5× in 2.1.197). It now rides on the CCR CRUD, bridge, bridge-environment, inbox, move-to-cloud and github-PR calls.

关联报告：[原文](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

> Both add &#96;X-Trusted-Device-Token&#96; when one is present. Session ids must start with &#96;cse&#95;&#96; (&#96;:881171&#96;).

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)

> const args = &#91;'-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--tools', '', '--strict-mcp-config', '--mcp-config', mcp,       '--setting-sources', '', '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk',       '--allowedTools', 'mcp&#95;&#95;omp&#95;&#95;&#42;', '--no-session-persistence', '--max-turns', '2', '--model', model, '--system-prompt-file', promptFile&#93;;

### 当前报告来源 · 2.1.300 · Trusted device token

[原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；评估时间：2026-10-19T15:34:29Z；审阅提交：10e3b5ed3047。

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：可信设备令牌头透传：优先读取环境变量CLAUDE&#95;TRUSTED&#95;DEVICE&#95;TOKEN，否则用凭证存储的device&#95;token，通过X-Trusted-Device-Token随桥接、PR订阅、CCR等请求发送；注册名含主机名与Linux。

完整触发条件：仅 Claude.ai 订阅用户且 Jn() 成立、非 CLAUDE&#95;CODE&#95;REMOTE 云端容器；若环境变量或凭证存储有 device&#95;token，则在桥接、PR 订阅、CCR 等已接入请求带 X-Trusted-Device-Token；报告未发现 Messages API 路径。

方向：待补充；触发：默认关闭／不触发；网关处理：待核实。

当前有效性：待核实（代码已变化）。历史评估结论：当前配置不触发。

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

方向：待补充；触发：待核实；网关处理：部分处理。

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

方向：待补充；触发：待核实；网关处理：部分处理。

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

方向：待补充；触发：待核实；网关处理：部分处理。

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

方向：待补充；触发：待核实；网关处理：部分处理。

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

方向：待补充；触发：待核实；网关处理：部分处理。

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

方向：待补充；触发：待核实；网关处理：部分处理。

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

方向：待补充；触发：待核实；网关处理：部分处理。

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

方向：待补充；触发：待核实；网关处理：部分处理。

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

方向：待补充；触发：待核实；网关处理：待核实。

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

方向：待补充；触发：待核实；网关处理：待核实。

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

方向：待补充；触发：待核实；网关处理：待核实。

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

方向：待补充；触发：待核实；网关处理：待核实。

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

