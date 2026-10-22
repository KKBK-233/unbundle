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

评估基准：Unbundle 默认配置；假设云端 CLI 使用下列报告版本，并接受报告描述的行为。结合同版本关联报告判断是否发送及是否过滤，不自行逆向 CLI。发现日期按上游报告文件最早可查提交日期记账，不代表确认或机制引入时间。

已过滤＝相关路径移除信号；未过滤＝保留信号或 CLI 自发请求不经网关过滤；当前配置不触发＝有证据表明必要触发条件被禁用，不等于已过滤；待核实＝报告或网关证据仍不足。

固定研究上游：[wtfwhs/tengu-decoded](https://github.com/wtfwhs/tengu-decoded)；本轮读取提交 [`068b7a24325b`](https://github.com/wtfwhs/tengu-decoded/commit/068b7a24325bbf92af5f024bdb9525a654251155)。报告目录版本：2.1.300（不代表官方最新发布版本）。历史来源保留供查证。

| 报告版本 | 机制 | 默认配置结论 | 原因（简述） | 发现时间 |
| --- | --- | --- | --- | --- |
| 2.1.300 | 环境标记 · ATIS pin attribute [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md) | 默认关闭／不触发 | GrowthBook 关闭，atisPin 不进入评估 [详情](#termiters-evidence-1) | 2026-10-14 |
| 2.1.300 | 协议指纹 · auto-mode classifier beta header [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md) | 默认关闭／不触发 | 默认 dontAsk 启动，自动模式分类器 beta 头不发起。 [详情](#termiters-evidence-2) | 2026-10-14 |
| 2.1.300 | 环境标记 · 后台调度订阅层级环境变量 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md) | 默认关闭／不触发 | 默认无工具、无后台子进程，BG&#95;DISPATCHER&#95;&#42; 不传递。 [详情](#termiters-evidence-3) | 2026-10-14 |
| 2.1.300 | 环境标记 · 后台调度层级环境标记 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md) | 默认关闭／不触发 | 默认单轮 -p 运行，不产生 bg 调度标记 [详情](#termiters-evidence-4) | 2026-10-14 |
| 2.1.300 | 环境标记 · Bridge host profile [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-5) | 2026-10-14 |
| 2.1.300 | 环境标记 · Bridge machine ID [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-6) | 2026-10-14 |
| 2.1.300 | 环境标记 · 桥接机器 UUID 原样发送 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md) | 默认关闭／不触发 | 默认远程控制启动关闭，桥环境注册不触发，UUID 不发送 [详情](#termiters-evidence-7) | 2026-10-14 |
| 2.1.300 | 环境标记 · 桥接所有者账号环境变量 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md) | 默认关闭／不触发 | 默认未启用远程控制桥接，OWNER&#95;&#42; 环境不生成。 [详情](#termiters-evidence-8) | 2026-10-14 |
| 2.1.300 | 环境标记 · CCR 心跳探测字段 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-9) | 2026-10-14 |
| 2.1.300 | 协议指纹 · CCR idle heartbeat probe [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md) | 默认关闭／不触发 | CCR 心跳 flag 默认 false，不发送 [详情](#termiters-evidence-10) | 2026-10-14 |
| 2.1.300 | 环境标记 · 设备绑定证明 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-11) | 2026-10-14 |
| 2.1.300 | 协议指纹 · Device bind attestation [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-12) | 2026-10-14 |
| 2.1.300 | 协议指纹 · 环境运行器版本头 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-13) | 2026-10-14 |
| 2.1.300 | 协议指纹 · feature&#95;name 闭集遥测枚举 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-14) | 2026-10-14 |
| 2.1.300 | 协议指纹 · GB authed eval endpoint [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md) | 默认关闭／不触发 | 默认禁用 GrowthBook，authed eval 不发送 [详情](#termiters-evidence-15) | 2026-10-14 |
| 2.1.300 | 环境标记 · Install userID metadata passthrough [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-16) | 2026-10-14 |
| 2.1.300 | 环境标记 · userID 元数据原样透传 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md) | 未过滤 | Messages API 的 metadata.user&#95;id 由 CLI 自发发送，网关不代理过滤 [详情](#termiters-evidence-17) | 2026-10-14 |
| 2.1.300 | 协议指纹 · 低优先级慢速协议头 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md) | 默认关闭／不触发 | 默认非交互且未启用低优先级，头部不发 [详情](#termiters-evidence-18) | 2026-10-14 |
| 2.1.300 | 环境标记 · MachineID error prefix [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-19) | 2026-10-14 |
| 2.1.300 | 环境标记 · machineID 错误报告截断 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md) | 默认关闭／不触发 | 默认禁用错误跟踪，12 字符 machineID 前缀不会上报 [详情](#termiters-evidence-20) | 2026-10-14 |
| 2.1.300 | 环境标记 · OTel user email [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-21) | 2026-10-14 |
| 2.1.300 | 协议指纹 · 超额范围协议头 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md) | 未过滤 | 响应头由 CLI 直连解析，网关未介入 [详情](#termiters-evidence-22) | 2026-10-14 |
| 2.1.300 | 协议指纹 · peer message fromMode [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md) | 未过滤 | 默认 peer fromMode 保留，网关不介入 [详情](#termiters-evidence-23) | 2026-10-14 |
| 2.1.300 | 环境标记 · 计划层级环境覆盖 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md) | 已过滤 | 两个计划层级环境变量被白名单剥除 [详情](#termiters-evidence-24) | 2026-10-14 |
| 2.1.300 | 环境标记 · Plugin telemetry deviceId [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-25) | 2026-10-14 |
| 2.1.300 | 协议指纹 · x-cc-tender-quilt 拒绝切换头 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-26) | 2026-10-14 |
| 2.1.300 | 环境标记 · 自托管运行器JWT身份环境变量 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md) | 默认关闭／不触发 | 默认未启用自托管运行器 hook，CLAUDE&#95;RUNNER&#95;&#42; 不生成。 [详情](#termiters-evidence-27) | 2026-10-14 |
| 2.1.300 | 协议指纹 · 自托管运行器版本头 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-28) | 2026-10-14 |
| 2.1.300 | 协议指纹 · server-side arbiter beta header [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md) | 默认关闭／不触发 | 默认 dontAsk 启动，arbiter beta 头与 safeguard&#95;results 不发起。 [详情](#termiters-evidence-29) | 2026-10-14 |
| 2.1.300 | 协议指纹 · Summon SID HMAC [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-30) | 2026-10-14 |
| 2.1.300 | 环境标记 · 可信设备令牌头 [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-31) | 2026-10-14 |
| 2.1.300 | 协议指纹 · Trusted device token [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 待核实（代码已变化） | 条件或配置已变化，等待重新评估。 [详情](#termiters-evidence-32) | 2026-10-14 |

<details>
<summary>展开完整条件与代码证据</summary>

<a id="termiters-evidence-1"></a>
**1. ATIS pin attribute** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：ATIS pin 环境属性：atisPin 变化触发 GrowthBook 重评估，tengu&#95;kestrel&#95;moor 锁定会话 ATIS，作为评估上下文。

完整触发条件：GrowthBook 评估上下文包含 atisPin；属性变化时重新评估，tengu&#95;kestrel&#95;moor 锁定会话 ATIS。

默认关闭／不触发：atisPin 是 GrowthBook 评估上下文属性，tengu&#95;serene&#95;teacup 仅在该属性变化时触发重评估。默认网关通过 engine.mjs 设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，关联报告明确该变量关闭 GrowthBook（经 Oj），因此默认不会构造包含 atisPin 的 GrowthBook 评估请求；入站 API 请求不携带此字段。

关联报告依据：[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)；审阅提交 c95455119f84。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-2"></a>
**2. auto-mode classifier beta header** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自动模式分类器 beta 头协议指纹：客户端调用自动模式分类器时在请求中携带 &#96;auto-mode-classifier-2026-07-16&#96; beta 头，标识该分类器请求类型。

完整触发条件：自动模式分类器发起请求时（默认两阶段分类或严重度评分路径）。

默认关闭／不触发：引擎固定以 &#96;--permission-mode dontAsk&#96; 启动 CLI；报告将 dontAsk 与 auto 列为不同模式，自动模式分类器及其 beta 头在默认配置下不会发起。网关仅经 stdio 启动 CLI，不介入其出站请求，但默认条件下无该信号。

关联报告依据：[versions/2.1.300/security-model.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

代码：[model-gateway/engine.mjs:105](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L105)；审阅提交 c5ff84ac0652。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-3"></a>
**3. 后台调度订阅层级环境变量** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：后台调度订阅层级环境标记：后台调度器把订阅类型和速率限制层级写入 CLAUDE&#95;BG&#95;DISPATCHER&#95;&#42; 环境变量，交给后台子进程。

完整触发条件：后台调度器派生子进程时传递这两个环境变量；未启用后台调度器或无子进程时不触发。

默认关闭／不触发：报告只说明后台调度器派生子进程时把 BG&#95;DISPATCHER&#95;&#42; 交给 background children。网关以 --tools '' 禁用内置工具、--max-turns 2 且每轮独立进程，默认无后台任务派生子进程；该内部环境传递条件不成立，且非模型请求字段。

关联报告依据：[versions/2.1.300/environment-variables.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L104)；审阅提交 c95455119f84。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-4"></a>
**4. 后台调度层级环境标记** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：后台调度订阅层级环境标记：后台调度器把订阅类型和速率限制层级写入 CLAUDE&#95;BG&#95;DISPATCHER&#95;&#42; 环境变量，后台子进程在无 OAuth/FD token 且非 bg 快照时据此继承父会话计划。

完整触发条件：后台调度会话（CLAUDE&#95;CODE&#95;SESSION&#95;KIND=bg）且无 CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN、无 FD token、token 非来自 bg 快照时，读取调度器写入的订阅类型和速率限制层级环境变量，子进程继承父会话层级。

默认关闭／不触发：报告要求 CLAUDE&#95;CODE&#95;SESSION&#95;KIND=bg 且无 OAuth/FD token 时才读取调度层级；engine.mjs 以 -p、--no-session-persistence、--max-turns 2 单轮运行，子进程环境按固定白名单重建且不含 SESSION&#95;KIND，默认不产生后台调度，两个标记不会出现。

关联报告依据：[versions/2.1.300/plan-tier-gating.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L104)、[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L90)；审阅提交 c5ff84ac0652。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-5"></a>
**5. Bridge host profile** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接主机软件画像：桥接注册的host字段携带平台、arch、OS版本、发行版、WSL、PATH工具清单和可选MCP服务器，默认关闭。

完整触发条件：仅在桥接环境注册路径、GrowthBook tengu&#95;bridge&#95;host&#95;profile 非 off 或 remoteControl.shareHostProfile 覆盖、且无 remote-control 设置错误时附加 host 软件画像；默认 off，full 含 MCP 列表。

待核实（代码已变化）：host 画像只在桥接注册路径附加，GrowthBook tengu&#95;bridge&#95;host&#95;profile 默认 "off"；默认 engine 未启动 remote-control/桥接，故默认不收集也不发送。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-6"></a>
**6. Bridge machine ID** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接环境机器ID透传：随机UUID remoteControlMachineId在注册远程控制桥环境时，作为顶层machine&#95;id和metadata.machine&#95;id原样发送。

完整触发条件：仅在 claude remote-control 桥接启动或独立桥接路径注册环境、且 remoteControlMachineId 非空时，将其作为顶层 machine&#95;id 和 metadata.machine&#95;id 发送到 /v1/environments/bridge。

待核实（代码已变化）：报告把 machine&#95;id 限定于 claude remote-control 或独立桥接注册 /v1/environments/bridge；默认 engine 以 -p 启动一次性 CLI，未启用 remote-control/桥接，默认不进入注册路径。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-7"></a>
**7. 桥接机器 UUID 原样发送** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接环境机器 ID 透传：remoteControlMachineId 为 UUID，注册远程控制桥环境时原样发送。

完整触发条件：身份初始化后，remoteControlMachineId 作为 UUID 不做哈希或截断，直接进入远程控制桥环境注册请求。

默认关闭／不触发：报告称 remoteControlMachineId 随 POST /v1/environments/bridge 原样发送；控制项 tengu&#95;cobalt&#95;harbor 默认 false，默认部署不额外启用远程控制/桥接，engine 固定 -p 单次运行也未启用 bridge。必要触发条件不成立，UUID 不发送；不是网关过滤 UUID。

关联报告依据：[versions/2.1.300/overview.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)；[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L104)、[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L92)；审阅提交 c5ff84ac0652。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-8"></a>
**8. 桥接所有者账号环境变量** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接所有者账号环境标记：桥接重连与桥接环境变量携带 owner account 和 organization UUID，供后续桥接流程识别归属。

完整触发条件：使用远程控制桥接并构造重连/桥接所有者环境时设置这些 OWNER&#95;&#42; 环境变量；普通非桥接会话不设置。

默认关闭／不触发：报告将在桥接重连/所有者环境中设置的 OWNER&#95;&#42; 列为桥接身份载体；关联报告显示控制远程控制默认开启的 tengu&#95;cobalt&#95;harbor 默认为 false。网关固定参数也未启用远程控制/桥接，并以 --no-chrome 关闭 Chrome 路径，默认普通会话不构造该桥接环境。

关联报告依据：[versions/2.1.300/environment-variables.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)；[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L104)；审阅提交 c95455119f84。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-9"></a>
**9. CCR 心跳探测字段** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：CCR 心跳探测字段：Remote Control 的 CCRClient.sendHeartbeat() 在心跳体附加 supports&#95;heartbeat&#95;probe、current&#95;interval&#95;seconds 及 idle&#95;seconds（有样本时），并携带 session&#95;id、worker&#95;epoch。

完整触发条件：Remote Control 使用 CCRClient 发送心跳，且 tengu&#95;ccr&#95;idle&#95;heartbeat 开启、传输非 outbound-only 时。

待核实（代码已变化）：报告标明探测字段由 Remote Control 的 &#96;CCRClient.sendHeartbeat()&#96; 发送，且受 &#96;tengu&#95;ccr&#95;idle&#95;heartbeat&#96;（默认 false）控制；默认引擎未启用 Remote Control/&#96;--sdk-url&#96;，不发心跳，故未触发。

关联报告依据：[versions/2.1.300/api-endpoints.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)；审阅提交 1041cadac6fc。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-10"></a>
**10. CCR idle heartbeat probe** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：CCR 空闲心跳探测声明：CCR worker 空闲时按 flag 在心跳中声明支持 heartbeat-probe。

完整触发条件：CCR worker 空闲且 tengu&#95;ccr&#95;idle&#95;heartbeat 为 true 时广告 heartbeat-probe 支持；默认 false。

默认关闭／不触发：该机制要求 CCR worker 空闲且 tengu&#95;ccr&#95;idle&#95;heartbeat 为 true；报告明确该 flag 默认 false。默认网关以 -p 单轮方式启动官方 CLI，env 从空对象按白名单构造且未注入 CLAUDE&#95;CODE&#95;REMOTE/CCR worker 启动条件；因此默认不会广告 heartbeat-probe 支持。

关联报告依据：[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L104)；审阅提交 c95455119f84。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-11"></a>
**11. 设备绑定证明** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：会话设备绑定证明：向 /v1/code/sessions/{id}/device 发送 target&#95;device&#95;id 与 bind&#95;attestation（含 kid 和 signature）及 bind&#95;attestation&#95;issued&#95;at，形成设备绑定凭证。

完整触发条件：调用 POST /v1/code/sessions/{id}/device 进行设备绑定时。

待核实（代码已变化）：报告触发点是调用会话设备绑定 POST &#96;/v1/code/sessions/{id}/device&#96;，需先有 ccr 会话；默认引擎仅以 &#96;-p&#96; 执行一次推理，未传 &#96;--sdk-url&#96; 也未建立 ccr 会话，默认不发送绑定证明，故未触发。

关联报告依据：[versions/2.1.300/api-endpoints.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)；审阅提交 1041cadac6fc。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-12"></a>
**12. Device bind attestation** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：设备绑定证明透传：按账号生成P-256设备密钥并注册为远程设备，会话创建请求携带target&#95;device&#95;id与ECDSA bind&#95;attestation签名，形成服务端可核验的设备凭证。

完整触发条件：仅在 tengu&#95;violin&#95;wood 开启、非 diskless 且已按账号生成/加载 P-256 设备密钥并向 /cowork/remote&#95;devices 注册后，创建会话时附加 target&#95;device&#95;id 与 bind&#95;attestation；否则不发送。

待核实（代码已变化）：设备绑定由 GrowthBook 主 gate tengu&#95;violin&#95;wood 控制，报告默认值 !1（关），并需按账号注册设备密钥。默认 engine 未启用远程设备绑定，默认不发送 target&#95;device&#95;id/bind&#95;attestation。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-13"></a>
**13. 环境运行器版本头** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：环境运行器版本头：桥接环境请求和 sign-commit 请求携带 x-environment-runner-version（如 shr-…），标明运行器版本。

完整触发条件：桥接环境注册、轮询、心跳等请求，以及 sign-commit 请求。

待核实（代码已变化）：报告将该头放在桥接环境请求和 sign-commit 路径；默认引擎未传 &#96;--sdk-url&#96;、未启用 Remote Control/桥接，未执行环境注册、轮询或签名提交，默认不发送该头，故未触发。

关联报告依据：[versions/2.1.300/api-endpoints.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)；审阅提交 1041cadac6fc。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-14"></a>
**14. feature&#95;name 闭集遥测枚举** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：遥测 feature&#95;name 闭集枚举：tengu&#95;feature&#95;ok/bad/sad 事件使用由 gH、&#95;H、yH 合并的 1,431 项 feature&#95;name 闭集枚举。

完整触发条件：发送 tengu&#95;feature&#95;ok/bad/sad 遥测事件时，feature&#95;name 取闭集枚举值。

待核实（代码已变化）：feature&#95;name 闭集仅用于 tengu&#95;feature&#95;ok/bad/sad 等遥测事件；默认 engine 启动 CLI 时硬编码 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，报告控制矩阵说明该变量关闭 1P、Datadog 等遥测。默认配置不发送此类事件，故非字段被过滤，而是触发条件被阻止；用户额外开启遥测不属默认行为。

关联报告依据：[versions/2.1.300/codenames.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)；[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L92)；审阅提交 1041cadac6fc。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-15"></a>
**15. GB authed eval endpoint** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：GrowthBook 认证远程评估端点：启用后向 /api/eval-authed/{clientKey} 发送评估请求，并在可信工作区附加 OAuth 认证头。

完整触发条件：GrowthBook 启用且 tengu&#95;gb&#95;eval&#95;authed&#95;enable 为真；可信工作区附加认证头，不可信仍访问 eval-authed 但不带认证头。

默认关闭／不触发：该机制是 CLI 自发 GrowthBook 出站请求。默认网关在 engine.mjs 中注入 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1；关联报告说明该变量关闭 GrowthBook（经 Oj），因此 tengu&#95;gb&#95;eval&#95;authed&#95;enable 不会被用于发起 /api/eval-authed/{clientKey}。网关本身不介入 CLI 出站 HTTP，但默认配置已阻止触发。

关联报告依据：[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)；[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)；审阅提交 c95455119f84。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-16"></a>
**16. Install userID metadata passthrough** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：持久安装用户标识透传：配置中无合法64位十六进制userID时随机生成并持久化，之后作为device&#95;id/user.id原样发往Messages API metadata.user&#95;id、1P事件、GrowthBook和OTel。

完整触发条件：在构造 Messages API metadata.user&#95;id 或各遥测入口时，总是读取持久 userID（无合法 64 位十六进制则随机生成并持久化），随后 Messages API 将其作为 device&#95;id 原样写入，1P/GrowthBook/OTel 另按各自通道发送。

待核实（代码已变化）：报告基准下，Messages API metadata.user&#95;id 由 CLI 自行构造出站；默认 engine 仅 spawn CLI，经 stdio 传输入并读事件，不代理或改写 CLI 到 Anthropic 的请求。essential-traffic 只关遥测，不关 Messages 推理；CLI 自发路径满足触发条件时未经过网关过滤。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L112)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-17"></a>
**17. userID 元数据原样透传** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：持久安装用户标识透传：随机生成的 64 位十六进制 userID 作为账号或设备标识，随 Messages API metadata.user&#95;id、1P 事件、GrowthBook 和 OTel 原样发出。

完整触发条件：身份初始化时生成随机 32 字节值，经 64 位十六进制校验并持久化到全局配置后，userID 不哈希、不截断，原样写入 Messages API metadata.user&#95;id、1P 事件、GrowthBook 与 OTel。

未过滤：报告基准下，userID 原样进入 Messages API metadata.user&#95;id；默认环境仅停用非必要遥测/1P/GrowthBook/OTel，不禁核心 Messages API。引擎仅 spawn CLI 并以 stdio 交互，不代理其出站 HTTP，故该 CLI 自发路径满足条件时未经过网关过滤。

关联报告依据：[versions/2.1.300/overview.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)；[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L92)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L112)；审阅提交 c5ff84ac0652。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-18"></a>
**18. 低优先级慢速协议头** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：低优先级慢速通道协议头：服务端以 anthropic-ratelimit-unified-slow-&#42; 组头下发 treatment/control 与状态，客户端在低优先级激活时发送 anthropic-usage-limit: slow（历史 extended 值仍可用）。

完整触发条件：仅当消费者 OAuth（kt）成立，且 iL 或 tengu&#95;toasty&#95;breeze.enabled=true，并满足非 usage&#95;based、firstParty、交互式、非远程、非 $t()、five&#95;hour 资格；低优先级激活时请求携带 anthropic-usage-limit: slow，服务端 slow-offer 仅在 treatment 组报价。

默认关闭／不触发：报告资格含交互式会话、消费者 OAuth 且 iL 或 tengu&#95;toasty&#95;breeze.enabled 为真；engine.mjs 以 -p 非交互运行、未设该 flag，默认不进入低优先级，anthropic-usage-limit: slow 不会发出；且该头由 CLI 直连 API，不经网关。

关联报告依据：[versions/2.1.300/plan-tier-gating.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L104)；审阅提交 c5ff84ac0652。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-19"></a>
**19. MachineID error prefix** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：随机安装机器标识截断透传：持久化的64位十六进制machineID仅取前12字符，作为host&#95;name&#95;redacted随错误报告日志发送。

完整触发条件：在错误报告日志构造路径，读取持久化 machineID（无则随机生成）并截取前 12 个十六进制字符作为 host&#95;name&#95;redacted 放入 payload；不发送完整 machineID。

待核实（代码已变化）：默认 engine 设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1；报告控制矩阵将其归为 essential-traffic 并关闭错误报告，且错误跟踪 flag tengu&#95;orford&#95;ness 默认 !1。host&#95;name&#95;redacted 的 machineID 前缀默认不发送。

关联报告依据：[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-20"></a>
**20. machineID 错误报告截断** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/overview.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：机器标识截断透传：持久化的 64 位十六进制 machineID 只以 12 字符前缀形式出现在错误报告中。

完整触发条件：身份初始化并持久化 machineID 后，触发错误报告时只截取前 12 个字符作为机器标识，不发送完整值。

默认关闭／不触发：默认 engine 环境设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1；报告控制矩阵明确其禁用 error tracking，且 Datadog 错误跟踪默认 OFF、受 tengu&#95;orford&#95;ness 等门控。默认配置下错误报告必要触发条件不成立，12 字符 machineID 前缀不会发出；这是触发控制而非网关截断。

关联报告依据：[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:92](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L92)；审阅提交 c5ff84ac0652。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-21"></a>
**21. OTel user email** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：OTel邮箱透传：非diskless模式下，用户配置的OTel资源在账号有邮箱时无条件写入user.email；企业网关OIDC覆盖时从JWT补充身份属性。

完整触发条件：用户配置 OTel 导出且非 diskless 模式时，只要账号有 emailAddress，就无条件写入 OTel resource 的 user.email；企业网关 OIDC 覆盖时从 JWT 补充 user.&#42; 身份属性。

待核实（代码已变化）：报告将 user.email 限定于用户启用 3P OTel 且非 diskless；默认 engine 的环境白名单不传 CLAUDE&#95;CODE&#95;ENABLE&#95;TELEMETRY/OTEL&#95;&#42;，用户 OTel 默认 OFF，故默认不发送。

关联报告依据：[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-22"></a>
**22. 超额范围协议头** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：限流超额范围协议头：服务端 anthropic-ratelimit-unified-overage-scope 取值 service、channel 或 group&#95;pool，客户端据此显示团队共享预算、渠道月度支出限额或普通超额文案。

完整触发条件：仅当响应头 anthropic-ratelimit-unified-overage-scope 存在时解析为 service、channel 或 group&#95;pool；group&#95;pool 显示团队共享预算提示，channel 且触发 spend cap 显示渠道月度支出限额提示。

未过滤：该机制是 CLI 解析服务端 anthropic-ratelimit-unified-overage-scope 响应头生成提示文案，属 CLI 直连 api.anthropic.com 路径；engine.mjs 仅以 stdio 启动独立 CLI，默认不设 ANTHROPIC&#95;BASE&#95;URL，网关不转发也不解析该响应头，未过滤，也未实际触发。

关联报告依据：[versions/2.1.300/plan-tier-gating.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L112)、[model-gateway/engine.mjs:100](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L100)；审阅提交 c5ff84ac0652。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-23"></a>
**23. peer message fromMode** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：对等消息 fromMode 标记：跨会话 peer messaging 构造消息时，按 tengu&#95;harbor&#95;kite&#95;mode&#95;emit 决定是否写入 fromMode 来源模式字段。

完整触发条件：peer messaging 可用且构造消息；tengu&#95;harbor&#95;kite&#95;mode&#95;emit 为 true 时发送 fromMode。

未过滤：报告显示 tengu&#95;harbor&#95;kite 与 tengu&#95;harbor&#95;kite&#95;mode&#95;emit 默认均为 true，跨会话 peer messaging 满足条件时会写入 fromMode。目标网关仅 spawn 独立 CLI、通过 stdin/stdout 交换消息并解析 stdout 事件，不检查或改写 CLI 自发的 peer 出站消息；这是 CLI 自发路径，满足报告触发条件时未经过网关过滤。未声称默认会话已实际构造消息。

关联报告依据：[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L112)、[model-gateway/engine.mjs:128](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L128)；审阅提交 c95455119f84。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-24"></a>
**24. 计划层级环境覆盖** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：计划层级环境覆盖：存在 OAuth token 或托管/FD token 时，用 CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE 与 CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER 覆盖 subscriptionType/rateLimitTier，bg 快照亦写入 process.env 并透传子进程。

完整触发条件：当设置 CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN 或存在托管/FD token 时读取两个环境变量并覆盖计划/层级；bg 认证快照也会把二者写入 process.env，且二者在子进程环境透传允许列表中。

已过滤：机制经 CLAUDE&#95;CODE&#95;SUBSCRIPTION&#95;TYPE / CLAUDE&#95;CODE&#95;RATE&#95;LIMIT&#95;TIER 覆盖计划层级；engine.mjs 只按固定白名单重建子进程环境，这两个变量与 CLAUDE&#95;CODE&#95;OAUTH&#95;TOKEN 都不传入，覆盖通道被去除；CLI 自有凭据中的计划显示不属此机制。

关联报告依据：[versions/2.1.300/plan-tier-gating.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/plan-tier-gating.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L90)；审阅提交 c5ff84ac0652。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-25"></a>
**25. Plugin telemetry deviceId** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：内置插件遥测设备标识：builtin/core插件读取配置userID作为deviceId，携带账号、组织和session，POST到硬编码api.anthropic.com批量事件接口。

完整触发条件：仅 builtin/core 插件可调用该遥测能力，且 !iy() 为真并通过分析开关/策略检查时，读取配置 userID 作为 deviceId，携带账号、组织和 session POST 到硬编码 api.anthropic.com 批量事件接口。

待核实（代码已变化）：插件遥测可用性为 !iy()；默认 engine 设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，报告控制矩阵将其归为 essential-traffic 并关闭插件遥测。默认不以 userID 作为 deviceId 发送。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-26"></a>
**26. x-cc-tender-quilt 拒绝切换头** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：安全拒绝模型切换头协议标记：请求头 x-cc-tender-quilt 与 convolute&#95;arcades/tender&#95;quilt 状态及拒绝后模型切换逻辑关联。

完整触发条件：消息被标记为 cyber 或 frontier&#95;llm 拒绝类别并触发自动切换模型时。

待核实（代码已变化）：报告称该头由 CLI 在 cyber/frontier&#95;llm 拒绝切换时生成；默认 engine 仅 spawn 独立 CLI 并经 stdio 交互，CLI 自行认证、直接向上游发请求，网关不解析或改写出站 HTTP 头。CLI 自发路径，满足报告触发条件时未经过网关过滤；默认配置未禁用该切换，但未声称实际触发。

关联报告依据：[versions/2.1.300/codenames.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/codenames.md)

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L112)、[model-gateway/cloud-server.mjs:8](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/cloud-server.mjs#L8)；审阅提交 1041cadac6fc。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-27"></a>
**27. 自托管运行器JWT身份环境变量** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自托管运行器 JWT 身份环境注入：从工单 JWT 的 account&#95;email、account&#95;id、jti 等 claims 生成 CLAUDE&#95;RUNNER&#95;&#42; 环境变量，交给 hook 脚本，承载账号与工单身份。

完整触发条件：自托管运行器（BYOC）执行 hook 脚本，且工单 JWT 含 account&#95;email/account&#95;id 等 claims 时；普通云端会话或无 hook 场景不触发。

默认关闭／不触发：报告要求自托管运行器（BYOC）执行 hook 脚本，才从工单 JWT 生成 CLAUDE&#95;RUNNER&#95;&#42;。网关仅以 --setting-sources ''、--tools '' 等固定参数启动独立 CLI，环境仅白名单加固定项，默认未配置 BYOC runner 或 hook；该 CLI 内部环境注入条件不成立，且非模型请求字段。

关联报告依据：[versions/2.1.300/environment-variables.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/environment-variables.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L90)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/c95455119f8479636dc880f6267c135646b422d1/model-gateway/engine.mjs#L104)；审阅提交 c95455119f84。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-28"></a>
**28. 自托管运行器版本头** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：自托管运行器版本头：自托管 runner 控制面请求携带 x-self-hosted-runner-version，作为运行器版本协议指纹。

完整触发条件：自托管 runner 的注册、轮询、spawn-hints、会话令牌、释放、注销等控制面请求。

待核实（代码已变化）：报告将 &#96;x-self-hosted-runner-version&#96; 限定在自托管 runner 控制面调用；默认网关是一次性 &#96;-p&#96; 推理进程，未运行 self-hosted runner 客户端或注册/轮询循环，默认不触发该控制面，故未发送。

关联报告依据：[versions/2.1.300/api-endpoints.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)；审阅提交 1041cadac6fc。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-29"></a>
**29. server-side arbiter beta header** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：服务端仲裁器 beta 头协议指纹：服务端分类器（arbiter）请求携带 &#96;dangerous-tool-use-2026-09-03&#96; beta 头，响应以 &#96;safeguard&#95;results&#96; 返回裁决。

完整触发条件：自动模式使用服务端分类器审查工具调用且 &#96;cE(tool)&#96; 返回 &#96;arbiter&#96; 或 &#96;arbiterWithLocalFallback&#96; 时。

默认关闭／不触发：默认固定 &#96;--permission-mode dontAsk&#96;，未进入 auto 模式；报告把 server-side arbiter 归入自动模式分类器路径，因此该 beta 头与 safeguard&#95;results 请求在默认配置下不发起，网关也未介入 CLI 出站。

关联报告依据：[versions/2.1.300/security-model.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/security-model.md)

代码：[model-gateway/engine.mjs:105](https://github.com/KKBK-233/unbundle/blob/c5ff84ac0652cef55683b4993fff57cca924b09b/model-gateway/engine.mjs#L105)；审阅提交 c5ff84ac0652。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-30"></a>
**30. Summon SID HMAC** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：召唤状态伪匿名标识：以summonSidKey为HMAC密钥，对sessionId与artifact slug计算SHA-256并取前16位十六进制，作为sid随summon-status上报；密钥本身不离开本机。

完整触发条件：仅在 artifact-comment 的 summon-status 上报路径、当前 (sessionId, artifact slug) 尚无 sid 时，以 summonSidKey 对 sessionId+slug 做 HMAC-SHA256 并取前16位作为 sid 发送；密钥本身不离开本机。

待核实（代码已变化）：报告将 sid 限定于 artifact-comment 的 summon-status 通道；feature flags 显示 artifact comments 主 gate tengu&#95;teal&#95;corbel 和读取 gate tengu&#95;onyx&#95;sluice 默认 false。默认不生成或发送 summon sid。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-31"></a>
**31. 可信设备令牌头** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：可信设备令牌头透传：将 X-Trusted-Device-Token 随 CCR CRUD、桥接、桥接环境、inbox、move-to-cloud 和 GitHub PR 请求发送，供服务端识别可信设备。

完整触发条件：当存在可信设备令牌时，上述请求附加该头。

待核实（代码已变化）：报告将该头限定在 CCR CRUD、bridge、bridge-environment、inbox、move-to-cloud 和 GitHub PR 路径，且需已有令牌；默认引擎只启动普通 &#96;claude -p&#96;，未传 &#96;--sdk-url&#96; 或建立 CCR/桥接会话，默认配置不进入这些路径，故未触发，非网关过滤。

关联报告依据：[versions/2.1.300/api-endpoints.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/api-endpoints.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1041cadac6fc7609c308a9da6dc5913402eb1904/model-gateway/engine.mjs#L104)；审阅提交 1041cadac6fc。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-32"></a>
**32. Trusted device token** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：可信设备令牌头透传：优先读取环境变量CLAUDE&#95;TRUSTED&#95;DEVICE&#95;TOKEN，否则用凭证存储的device&#95;token，通过X-Trusted-Device-Token随桥接、PR订阅、CCR等请求发送；注册名含主机名与Linux。

完整触发条件：仅 Claude.ai 订阅用户且 Jn() 成立、非 CLAUDE&#95;CODE&#95;REMOTE 云端容器；若环境变量或凭证存储有 device&#95;token，则在桥接、PR 订阅、CCR 等已接入请求带 X-Trusted-Device-Token；报告未发现 Messages API 路径。

待核实（代码已变化）：报告列出的 X-Trusted-Device-Token 仅用于桥接、PR 订阅、CCR 等路径，未发现 Messages API 路径；默认 engine 无这些路径，环境白名单也不传 CLAUDE&#95;TRUSTED&#95;DEVICE&#95;TOKEN。默认不触发。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-33"></a>
**33. 日期撇号宿主分类** · Claude Code 2.1.196 · [原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：系统提示日期句撇号隐写：在构造系统上下文时，依据 ANTHROPIC&#95;BASE&#95;URL 主机是否命中解码域名清单或 AI 实验室关键词，选用 '、’、ʼ、ʹ 四个近形撇号，在 Today's date is … 句中承载宿主分类位。

完整触发条件：仅当 ANTHROPIC&#95;BASE&#95;URL 已设置且主机不是 api.anthropic.com 时进入标记路径；随后若主机命中解码域名清单或包含实验室关键词，日期句撇号才改为对应近形字符，否则保持普通撇号。

待核实（代码已变化）：适配器可见路径仅移除入站 system 的 billing 行，并将自建 systemPrompt 原样写入 CLI；CLI 输出文本原样转发，未见撇号规范化。该机制位于 CLI 内部系统提示构造，提供代码不覆盖该路径，无法确认其是否被过滤。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:110](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L110)、[model-gateway/cli-events.mjs:57](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/cli-events.mjs#L57)；审阅提交 1160cc476165。发现时间：2026-06-30（文章标题日期）。

<a id="termiters-evidence-34"></a>
**34. 日期分隔符时区标记** · Claude Code 2.1.196 · [原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：系统提示日期分隔符隐写：在构造系统上下文时，若系统时区为 Asia/Shanghai 或 Asia/Urumqi，将 Today's date is 后的日期从 YYYY-MM-DD 改为 YYYY/MM/DD，在正常日期句中承载时区标记位。

完整触发条件：仅当 ANTHROPIC&#95;BASE&#95;URL 已设置且指向非官方主机时进入标记路径；在此基础上，系统时区为 Asia/Shanghai 或 Asia/Urumqi 时，日期分隔符由 - 改为 /。

待核实（代码已变化）：适配器未见日期分隔符规范化：入站 system 除 billing 行外原样进入提示，systemPrompt 原样写入 CLI，CLI 输出文本原样转发。该标记若由 CLI 内部日期句生成，提供代码不覆盖其构造路径，证据不足。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:110](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L110)、[model-gateway/server.mjs:183](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/server.mjs#L183)；审阅提交 1160cc476165。发现时间：2026-06-30（文章标题日期）。

<a id="termiters-evidence-35"></a>
**35. 系统提示撇号端点标记** · v2.1.169（npm @anthropic-ai/claude-code，native win32-x64 binary） · [原报告](https://github.com/anthropics/claude-code/issues/67120)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：系统提示日期句撇号隐写：构造系统提示时，按 ANTHROPIC&#95;BASE&#95;URL 主机是否命中 KNOWN&#95;HOSTS 或包含 LAB&#95;KEYWORDS，在 Today's date is 句中选择 U+0027、U+2019、U+02BC、U+02B9 四个近形撇号，随提示发往端点。

完整触发条件：构造系统提示日期句且 gate() 为假；配置了 ANTHROPIC&#95;BASE&#95;URL 且主机精确匹配 KNOWN&#95;HOSTS 或以 .KNOWN&#95;HOST 结尾，或主机包含 LAB&#95;KEYWORDS 时，按命中组合选撇号；未命中则用 ASCII 撇号。

待核实（代码已变化）：复核未通过：原文直接给出四码位撇号按 ANTHROPIC&#95;BASE&#95;URL 主机分类切换的机制、classify()/pickApostrophe() 逻辑与 v2.1.169 版本，trigger&#95;summary 保留了共同前置条件 gate() 为假，并正确概括「精确匹配或 .后缀 KNOWN&#95;HOSTS / 含 LAB&#95;KEYWORDS 组合」与默认 ASCII 撇号，版本字段有原文引文支撑，label 与 category=隐写 相符（近形码位携带端点分类，非协议签名或显式身份字段）。但所给仓库为 model-gateway 适配器，anthropic.mjs 仅删除系统块开头 billing 行，engine.mjs 只以 --system-prompt-file 传入自建提示，日期句由外部 CLI 内部生成并直接上行，代码中既无该撇号生成路径也无拦截/净化路径，且白名单版本为 2.1.280 而非 2.1.169，故代码证据不足以判定该机制存在或已被过滤，supported=false。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L104)；审阅提交 1160cc476165。发现时间：2026-06-10（结构化首发时间）。

<a id="termiters-evidence-36"></a>
**36. 系统提示日期分隔符标记** · v2.1.169（npm @anthropic-ai/claude-code，native win32-x64 binary） · [原报告](https://github.com/anthropics/claude-code/issues/67120)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：系统提示日期分隔符隐写：构造系统提示时，若系统时区为 Asia/Shanghai 或 Asia/Urumqi，将 Today's date is 后的日期从 YYYY-MM-DD 改为 YYYY/MM/DD，在正常日期句中承载时区标记位。

完整触发条件：构造系统提示日期句且 gate() 为假；系统时区为 Asia/Shanghai 或 Asia/Urumqi 时，将日期字符串中的 - 全部替换为 /，否则保持原分隔符。

待核实（代码已变化）：复核未通过：原文明确「系统时区为 Asia/Shanghai 或 Asia/Urumqi 时 - 变 /」，并给出 buildDateLine 中 c?.cnTZ ? date.replaceAll('-','/') 的对应代码，trigger&#95;summary 完整保留 gate() 为假这一共同前置条件与两个时区条件，版本 v2.1.169 有原文引文支撑，label 与 category=隐写 相符（格式近似等价的分隔符携带时区分类位）。但所给适配器代码（context.mjs 仅拼接 RELAY&#95;PROMPT 与调用方指令，engine.mjs 写 --system-prompt-file）不包含日期句构造或该字符串的检测处理，无法证明该变异存在，也无法证明其被过滤或未被过滤，且调查版本（CLI 白名单 2.1.280）与报告版本不一致，故代码证据不完整，supported=false。

关联报告依据：见主报告与代码说明

代码：[model-gateway/context.mjs:102](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L102)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L104)；审阅提交 1160cc476165。发现时间：2026-06-10（结构化首发时间）。

<a id="termiters-evidence-37"></a>
**37. 计费归属头** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：计费归属头协议元数据：在 system 数组首个独立文本块写入 x-anthropic-billing-header，携带 cc&#95;version 指纹、cc&#95;entrypoint、可选 cch 与 cc&#95;workload，供服务端计费/分析解析。

完整触发条件：计费归属头默认启用；可由 CLAUDE&#95;CODE&#95;ATTRIBUTION&#95;HEADER 环境变量或 tengu&#95;attribution&#95;header 特性开关关闭。

待核实（代码已变化）：仅在 Anthropic /v1/messages 入站 body.system 的各文本块开头删除整行；OpenAI messages 的 system 原样编入 instructions，且 engine 直接 spawn CLI，未提供拦截 CLI 内部出站请求的代码，故仅部分覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-38"></a>
**38. 入口/负载标记** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：计费头环境标记：cc&#95;entrypoint 记录入口来源，取 CLAUDE&#95;CODE&#95;ENTRYPOINT 或 unknown；cc&#95;workload 在 getWorkload() 返回有值时记录工作负载。

完整触发条件：计费归属头启用时，cc&#95;entrypoint 取环境变量或 unknown；cc&#95;workload 仅在 getWorkload() 有值时出现。

待核实（代码已变化）：无入口/负载标记专门过滤；仅 Anthropic body.system 的 billing 行首整行删除会一并移除 cc&#95;entrypoint/cc&#95;workload。OpenAI 系统消息与 CLI 内部出站未覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-39"></a>
**39. cc&#95;version 指纹** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：cc&#95;version 后缀哈希：取首条用户消息索引 4、7、20 的字符（不足补 0），与内置 salt 和版本号拼成 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：构造 API 请求时，从 messagesForAPI 提取首条用户消息并在注入合成消息之前计算指纹。

待核实（代码已变化）：未单独识别 cc&#95;version 哈希后缀；仅当它位于 Anthropic body.system 的 billing 行首时随整行删除。OpenAI system 原样保留，CLI 内部出站请求由官方 CLI 直发，未覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-40"></a>
**40. cch 完整性哈希** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：cch 请求完整性哈希：计费头先写 cch=00000 占位符，原生 Bun HTTP 栈发送前在序列化请求体中查找并等长回写计算哈希；OSS 未验证算法与输入。

完整触发条件：仅当 feature('NATIVE&#95;CLIENT&#95;ATTESTATION') 为真且计费头发出时，cch=00000 被写入；发送前由 Bun 原生栈替换。

待核实（代码已变化）：无 cch 专门匹配；仅 Anthropic body.system 开头 billing 行整行剥离可顺带删去占位符。Bun 发送前回写及 CLI 出站不在适配器代码中，OpenAI 系统消息亦不覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-41"></a>
**41. 计费归属头** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：计费归属头协议元数据：在 system 数组首个独立文本块写入 x-anthropic-billing-header，携带 cc&#95;version、cc&#95;entrypoint 和 cch。

完整触发条件：每次发往 Anthropic API 的请求都会在 system 数组首个元素注入该计费头，位于身份行和系统提示之前。

待核实（代码已变化）：Anthropic 入站顶层 system 块开头的 x-anthropic-billing-header 行会被 fromAnthropic 删除；但 messages 内 system/developer 内容原样转文本，OpenAI 入站经 compileContext 原样序列化，CLI 出站请求也未由适配器代理，覆盖不完整。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-42"></a>
**42. cc&#95;entrypoint标记** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：计费头环境标记：cc&#95;entrypoint 记录入口来源，报告实测始终为 cli；作为请求来源环境信号随计费头发出。

完整触发条件：每次发往 Anthropic API 的请求在 system 首个计费头写入 cc&#95;entrypoint；报告观察值为 cli。

待核实（代码已变化）：cc&#95;entrypoint 随 billing 行在 Anthropic 顶层 system 块开头被 fromAnthropic 删除；但 messages 内 system/developer 内容原样保留，OpenAI 入站经 compileContext 原样序列化，CLI 出站请求未由适配器代理。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-43"></a>
**43. cc&#95;version后缀哈希** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：cc&#95;version 后缀哈希：取首条用户消息索引 4、7、20 的字符（不足补 0），与内置 salt 和版本号拼成 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：每次请求生成 cc&#95;version 时，从对话首条用户消息取固定索引字符参与哈希，生成三字符十六进制后缀。

待核实（代码已变化）：cc&#95;version 位于 billing 行时，Anthropic 入站顶层 system 块首行会被 fromAnthropic 删除，后缀哈希随之不入上游；但适配器不计算该后缀，也不代理 CLI 出站请求，messages 内 system 角色与 OpenAI 入站均未覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)、[model-gateway/engine.mjs:98](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L98)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-44"></a>
**44. cch请求完整性哈希** · Claude Code 2.1.37 / 定制 Bun 1.3.9-canary.51+d5628db23 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：cch 请求完整性哈希：在 system 首个计费头写入 cch=00000 占位符，原生 Bun 对完整序列化请求体计算 xxHash64 后取低 5 位十六进制回写。

完整触发条件：请求路径含 /v1/messages、带 anthropic-version 头且请求体含 cch=00000 占位符时激活；哈希覆盖整个序列化请求体。

待核实（代码已变化）：Anthropic 入站顶层 system 文本块开头的 billing 行会被 fromAnthropic 整体删除，故其中的 cch 占位符不会透传；但 cch 哈希由 CLI 内部出站请求计算，engine 直接 spawn CLI 且正式入口不注入 testUpstream，适配器未代理该出站路径。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:98](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L98)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

</details>

此追踪由 [TermiteRS](https://github.com/KKBK-233/TermiteRS) 进行在线追踪更新。

<!-- termiters:research:end -->
