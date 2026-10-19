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
| 2.1.300 | 环境标记 · Bridge host profile [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 默认关闭／不触发 | 桥接画像 flag 默认 off，且默认未启动桥接，不发送。 [详情](#termiters-evidence-1) | 2026-10-14 |
| 2.1.300 | 环境标记 · Bridge machine ID [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 默认关闭／不触发 | 默认未启动 remote-control/桥接，不发送 bridge machine&#95;id。 [详情](#termiters-evidence-2) | 2026-10-14 |
| 2.1.300 | 协议指纹 · Device bind attestation [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 默认关闭／不触发 | 设备绑定主 gate 默认关闭，默认不发送绑定证明。 [详情](#termiters-evidence-3) | 2026-10-14 |
| 2.1.300 | 环境标记 · Install userID metadata passthrough [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 未过滤 | 报告基准下，Messages 请求中的 userID 原样携带，未经网关过滤。 [详情](#termiters-evidence-4) | 2026-10-14 |
| 2.1.300 | 环境标记 · MachineID error prefix [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 默认关闭／不触发 | 错误报告默认关闭，不发 machineID 前缀。 [详情](#termiters-evidence-5) | 2026-10-14 |
| 2.1.300 | 环境标记 · OTel user email [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 默认关闭／不触发 | 默认未启用用户 OTel 导出，不发送 user.email。 [详情](#termiters-evidence-6) | 2026-10-14 |
| 2.1.300 | 环境标记 · Plugin telemetry deviceId [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 默认关闭／不触发 | 默认 essential-traffic 关闭插件遥测，不发 plugin deviceId。 [详情](#termiters-evidence-7) | 2026-10-14 |
| 2.1.300 | 协议指纹 · Summon SID HMAC [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 默认关闭／不触发 | artifact 评论默认关闭，默认不生成或发送 summon sid。 [详情](#termiters-evidence-8) | 2026-10-14 |
| 2.1.300 | 协议指纹 · Trusted device token [↗](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md) | 默认关闭／不触发 | 默认无桥接/CCR/PR 路径，不透传可信设备令牌头。 [详情](#termiters-evidence-9) | 2026-10-14 |

<details>
<summary>展开完整条件与代码证据</summary>

<a id="termiters-evidence-1"></a>
**1. Bridge host profile** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接主机软件画像：桥接注册的host字段携带平台、arch、OS版本、发行版、WSL、PATH工具清单和可选MCP服务器，默认关闭。

完整触发条件：仅在桥接环境注册路径、GrowthBook tengu&#95;bridge&#95;host&#95;profile 非 off 或 remoteControl.shareHostProfile 覆盖、且无 remote-control 设置错误时附加 host 软件画像；默认 off，full 含 MCP 列表。

默认关闭／不触发：host 画像只在桥接注册路径附加，GrowthBook tengu&#95;bridge&#95;host&#95;profile 默认 "off"；默认 engine 未启动 remote-control/桥接，故默认不收集也不发送。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-2"></a>
**2. Bridge machine ID** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：桥接环境机器ID透传：随机UUID remoteControlMachineId在注册远程控制桥环境时，作为顶层machine&#95;id和metadata.machine&#95;id原样发送。

完整触发条件：仅在 claude remote-control 桥接启动或独立桥接路径注册环境、且 remoteControlMachineId 非空时，将其作为顶层 machine&#95;id 和 metadata.machine&#95;id 发送到 /v1/environments/bridge。

默认关闭／不触发：报告把 machine&#95;id 限定于 claude remote-control 或独立桥接注册 /v1/environments/bridge；默认 engine 以 -p 启动一次性 CLI，未启用 remote-control/桥接，默认不进入注册路径。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-3"></a>
**3. Device bind attestation** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：设备绑定证明透传：按账号生成P-256设备密钥并注册为远程设备，会话创建请求携带target&#95;device&#95;id与ECDSA bind&#95;attestation签名，形成服务端可核验的设备凭证。

完整触发条件：仅在 tengu&#95;violin&#95;wood 开启、非 diskless 且已按账号生成/加载 P-256 设备密钥并向 /cowork/remote&#95;devices 注册后，创建会话时附加 target&#95;device&#95;id 与 bind&#95;attestation；否则不发送。

默认关闭／不触发：设备绑定由 GrowthBook 主 gate tengu&#95;violin&#95;wood 控制，报告默认值 !1（关），并需按账号注册设备密钥。默认 engine 未启用远程设备绑定，默认不发送 target&#95;device&#95;id/bind&#95;attestation。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-4"></a>
**4. Install userID metadata passthrough** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：持久安装用户标识透传：配置中无合法64位十六进制userID时随机生成并持久化，之后作为device&#95;id/user.id原样发往Messages API metadata.user&#95;id、1P事件、GrowthBook和OTel。

完整触发条件：在构造 Messages API metadata.user&#95;id 或各遥测入口时，总是读取持久 userID（无合法 64 位十六进制则随机生成并持久化），随后 Messages API 将其作为 device&#95;id 原样写入，1P/GrowthBook/OTel 另按各自通道发送。

未过滤：报告基准下，Messages API metadata.user&#95;id 由 CLI 自行构造出站；默认 engine 仅 spawn CLI，经 stdio 传输入并读事件，不代理或改写 CLI 到 Anthropic 的请求。essential-traffic 只关遥测，不关 Messages 推理；CLI 自发路径满足触发条件时未经过网关过滤。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

代码：[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L112)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-5"></a>
**5. MachineID error prefix** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：随机安装机器标识截断透传：持久化的64位十六进制machineID仅取前12字符，作为host&#95;name&#95;redacted随错误报告日志发送。

完整触发条件：在错误报告日志构造路径，读取持久化 machineID（无则随机生成）并截取前 12 个十六进制字符作为 host&#95;name&#95;redacted 放入 payload；不发送完整 machineID。

默认关闭／不触发：默认 engine 设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1；报告控制矩阵将其归为 essential-traffic 并关闭错误报告，且错误跟踪 flag tengu&#95;orford&#95;ness 默认 !1。host&#95;name&#95;redacted 的 machineID 前缀默认不发送。

关联报告依据：[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-6"></a>
**6. OTel user email** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：OTel邮箱透传：非diskless模式下，用户配置的OTel资源在账号有邮箱时无条件写入user.email；企业网关OIDC覆盖时从JWT补充身份属性。

完整触发条件：用户配置 OTel 导出且非 diskless 模式时，只要账号有 emailAddress，就无条件写入 OTel resource 的 user.email；企业网关 OIDC 覆盖时从 JWT 补充 user.&#42; 身份属性。

默认关闭／不触发：报告将 user.email 限定于用户启用 3P OTel 且非 diskless；默认 engine 的环境白名单不传 CLAUDE&#95;CODE&#95;ENABLE&#95;TELEMETRY/OTEL&#95;&#42;，用户 OTel 默认 OFF，故默认不发送。

关联报告依据：[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-7"></a>
**7. Plugin telemetry deviceId** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：内置插件遥测设备标识：builtin/core插件读取配置userID作为deviceId，携带账号、组织和session，POST到硬编码api.anthropic.com批量事件接口。

完整触发条件：仅 builtin/core 插件可调用该遥测能力，且 !iy() 为真并通过分析开关/策略检查时，读取配置 userID 作为 deviceId，携带账号、组织和 session POST 到硬编码 api.anthropic.com 批量事件接口。

默认关闭／不触发：插件遥测可用性为 !iy()；默认 engine 设置 CLAUDE&#95;CODE&#95;DISABLE&#95;NONESSENTIAL&#95;TRAFFIC=1，报告控制矩阵将其归为 essential-traffic 并关闭插件遥测。默认不以 userID 作为 deviceId 发送。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；[versions/2.1.300/telemetry.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/telemetry.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-8"></a>
**8. Summon SID HMAC** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：召唤状态伪匿名标识：以summonSidKey为HMAC密钥，对sessionId与artifact slug计算SHA-256并取前16位十六进制，作为sid随summon-status上报；密钥本身不离开本机。

完整触发条件：仅在 artifact-comment 的 summon-status 上报路径、当前 (sessionId, artifact slug) 尚无 sid 时，以 summonSidKey 对 sessionId+slug 做 HMAC-SHA256 并取前16位作为 sid 发送；密钥本身不离开本机。

默认关闭／不触发：报告将 sid 限定于 artifact-comment 的 summon-status 通道；feature flags 显示 artifact comments 主 gate tengu&#95;teal&#95;corbel 和读取 gate tengu&#95;onyx&#95;sluice 默认 false。默认不生成或发送 summon sid。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)；[versions/2.1.300/feature-flags.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/feature-flags.md)

代码：[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-9"></a>
**9. Trusted device token** · 2.1.300 · [原报告](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

评估基准：假设云端使用报告版本，并接受报告描述的 CLI 行为。

机制：可信设备令牌头透传：优先读取环境变量CLAUDE&#95;TRUSTED&#95;DEVICE&#95;TOKEN，否则用凭证存储的device&#95;token，通过X-Trusted-Device-Token随桥接、PR订阅、CCR等请求发送；注册名含主机名与Linux。

完整触发条件：仅 Claude.ai 订阅用户且 Jn() 成立、非 CLAUDE&#95;CODE&#95;REMOTE 云端容器；若环境变量或凭证存储有 device&#95;token，则在桥接、PR 订阅、CCR 等已接入请求带 X-Trusted-Device-Token；报告未发现 Messages API 路径。

默认关闭／不触发：报告列出的 X-Trusted-Device-Token 仅用于桥接、PR 订阅、CCR 等路径，未发现 Messages API 路径；默认 engine 无这些路径，环境白名单也不传 CLAUDE&#95;TRUSTED&#95;DEVICE&#95;TOKEN。默认不触发。

关联报告依据：[versions/2.1.300/device-fingerprinting.md](https://github.com/wtfwhs/tengu-decoded/blob/068b7a24325bbf92af5f024bdb9525a654251155/versions/2.1.300/device-fingerprinting.md)

代码：[model-gateway/engine.mjs:90](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L90)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/10e3b5ed3047a73a00285e472bb253e41d6d833e/model-gateway/engine.mjs#L104)；审阅提交 10e3b5ed3047。发现时间：2026-10-14（上游报告提交日期）。

<a id="termiters-evidence-10"></a>
**10. 日期撇号宿主分类** · Claude Code 2.1.196 · [原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：系统提示日期句撇号隐写：在构造系统上下文时，依据 ANTHROPIC&#95;BASE&#95;URL 主机是否命中解码域名清单或 AI 实验室关键词，选用 '、’、ʼ、ʹ 四个近形撇号，在 Today's date is … 句中承载宿主分类位。

完整触发条件：仅当 ANTHROPIC&#95;BASE&#95;URL 已设置且主机不是 api.anthropic.com 时进入标记路径；随后若主机命中解码域名清单或包含实验室关键词，日期句撇号才改为对应近形字符，否则保持普通撇号。

待重评（默认配置）：适配器可见路径仅移除入站 system 的 billing 行，并将自建 systemPrompt 原样写入 CLI；CLI 输出文本原样转发，未见撇号规范化。该机制位于 CLI 内部系统提示构造，提供代码不覆盖该路径，无法确认其是否被过滤。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:110](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L110)、[model-gateway/cli-events.mjs:57](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/cli-events.mjs#L57)；审阅提交 1160cc476165。发现时间：2026-06-30（文章标题日期）。

<a id="termiters-evidence-11"></a>
**11. 日期分隔符时区标记** · Claude Code 2.1.196 · [原报告](https://thereallo.dev/blog/claude-code-prompt-steganography)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：系统提示日期分隔符隐写：在构造系统上下文时，若系统时区为 Asia/Shanghai 或 Asia/Urumqi，将 Today's date is 后的日期从 YYYY-MM-DD 改为 YYYY/MM/DD，在正常日期句中承载时区标记位。

完整触发条件：仅当 ANTHROPIC&#95;BASE&#95;URL 已设置且指向非官方主机时进入标记路径；在此基础上，系统时区为 Asia/Shanghai 或 Asia/Urumqi 时，日期分隔符由 - 改为 /。

待重评（默认配置）：适配器未见日期分隔符规范化：入站 system 除 billing 行外原样进入提示，systemPrompt 原样写入 CLI，CLI 输出文本原样转发。该标记若由 CLI 内部日期句生成，提供代码不覆盖其构造路径，证据不足。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:110](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L110)、[model-gateway/server.mjs:183](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/server.mjs#L183)；审阅提交 1160cc476165。发现时间：2026-06-30（文章标题日期）。

<a id="termiters-evidence-12"></a>
**12. 系统提示撇号端点标记** · v2.1.169（npm @anthropic-ai/claude-code，native win32-x64 binary） · [原报告](https://github.com/anthropics/claude-code/issues/67120)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：系统提示日期句撇号隐写：构造系统提示时，按 ANTHROPIC&#95;BASE&#95;URL 主机是否命中 KNOWN&#95;HOSTS 或包含 LAB&#95;KEYWORDS，在 Today's date is 句中选择 U+0027、U+2019、U+02BC、U+02B9 四个近形撇号，随提示发往端点。

完整触发条件：构造系统提示日期句且 gate() 为假；配置了 ANTHROPIC&#95;BASE&#95;URL 且主机精确匹配 KNOWN&#95;HOSTS 或以 .KNOWN&#95;HOST 结尾，或主机包含 LAB&#95;KEYWORDS 时，按命中组合选撇号；未命中则用 ASCII 撇号。

待重评（默认配置）：复核未通过：原文直接给出四码位撇号按 ANTHROPIC&#95;BASE&#95;URL 主机分类切换的机制、classify()/pickApostrophe() 逻辑与 v2.1.169 版本，trigger&#95;summary 保留了共同前置条件 gate() 为假，并正确概括「精确匹配或 .后缀 KNOWN&#95;HOSTS / 含 LAB&#95;KEYWORDS 组合」与默认 ASCII 撇号，版本字段有原文引文支撑，label 与 category=隐写 相符（近形码位携带端点分类，非协议签名或显式身份字段）。但所给仓库为 model-gateway 适配器，anthropic.mjs 仅删除系统块开头 billing 行，engine.mjs 只以 --system-prompt-file 传入自建提示，日期句由外部 CLI 内部生成并直接上行，代码中既无该撇号生成路径也无拦截/净化路径，且白名单版本为 2.1.280 而非 2.1.169，故代码证据不足以判定该机制存在或已被过滤，supported=false。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L104)；审阅提交 1160cc476165。发现时间：2026-06-10（结构化首发时间）。

<a id="termiters-evidence-13"></a>
**13. 系统提示日期分隔符标记** · v2.1.169（npm @anthropic-ai/claude-code，native win32-x64 binary） · [原报告](https://github.com/anthropics/claude-code/issues/67120)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：系统提示日期分隔符隐写：构造系统提示时，若系统时区为 Asia/Shanghai 或 Asia/Urumqi，将 Today's date is 后的日期从 YYYY-MM-DD 改为 YYYY/MM/DD，在正常日期句中承载时区标记位。

完整触发条件：构造系统提示日期句且 gate() 为假；系统时区为 Asia/Shanghai 或 Asia/Urumqi 时，将日期字符串中的 - 全部替换为 /，否则保持原分隔符。

待重评（默认配置）：复核未通过：原文明确「系统时区为 Asia/Shanghai 或 Asia/Urumqi 时 - 变 /」，并给出 buildDateLine 中 c?.cnTZ ? date.replaceAll('-','/') 的对应代码，trigger&#95;summary 完整保留 gate() 为假这一共同前置条件与两个时区条件，版本 v2.1.169 有原文引文支撑，label 与 category=隐写 相符（格式近似等价的分隔符携带时区分类位）。但所给适配器代码（context.mjs 仅拼接 RELAY&#95;PROMPT 与调用方指令，engine.mjs 写 --system-prompt-file）不包含日期句构造或该字符串的检测处理，无法证明该变异存在，也无法证明其被过滤或未被过滤，且调查版本（CLI 白名单 2.1.280）与报告版本不一致，故代码证据不完整，supported=false。

关联报告依据：见主报告与代码说明

代码：[model-gateway/context.mjs:102](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L102)、[model-gateway/engine.mjs:104](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L104)；审阅提交 1160cc476165。发现时间：2026-06-10（结构化首发时间）。

<a id="termiters-evidence-14"></a>
**14. 计费归属头** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：计费归属头协议元数据：在 system 数组首个独立文本块写入 x-anthropic-billing-header，携带 cc&#95;version 指纹、cc&#95;entrypoint、可选 cch 与 cc&#95;workload，供服务端计费/分析解析。

完整触发条件：计费归属头默认启用；可由 CLAUDE&#95;CODE&#95;ATTRIBUTION&#95;HEADER 环境变量或 tengu&#95;attribution&#95;header 特性开关关闭。

待重评（默认配置）：仅在 Anthropic /v1/messages 入站 body.system 的各文本块开头删除整行；OpenAI messages 的 system 原样编入 instructions，且 engine 直接 spawn CLI，未提供拦截 CLI 内部出站请求的代码，故仅部分覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-15"></a>
**15. 入口/负载标记** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：计费头环境标记：cc&#95;entrypoint 记录入口来源，取 CLAUDE&#95;CODE&#95;ENTRYPOINT 或 unknown；cc&#95;workload 在 getWorkload() 返回有值时记录工作负载。

完整触发条件：计费归属头启用时，cc&#95;entrypoint 取环境变量或 unknown；cc&#95;workload 仅在 getWorkload() 有值时出现。

待重评（默认配置）：无入口/负载标记专门过滤；仅 Anthropic body.system 的 billing 行首整行删除会一并移除 cc&#95;entrypoint/cc&#95;workload。OpenAI 系统消息与 CLI 内部出站未覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-16"></a>
**16. cc&#95;version 指纹** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：cc&#95;version 后缀哈希：取首条用户消息索引 4、7、20 的字符（不足补 0），与内置 salt 和版本号拼成 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：构造 API 请求时，从 messagesForAPI 提取首条用户消息并在注入合成消息之前计算指纹。

待重评（默认配置）：未单独识别 cc&#95;version 哈希后缀；仅当它位于 Anthropic body.system 的 billing 行首时随整行删除。OpenAI system 原样保留，CLI 内部出站请求由官方 CLI 直发，未覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-17"></a>
**17. cch 完整性哈希** · 2.1.90 / 2.1.92 · [原报告](https://raw.githubusercontent.com/rmk40/opencode-anthropic-auth/rmk/docs/claude-code-auth-and-headers-reference.md)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：cch 请求完整性哈希：计费头先写 cch=00000 占位符，原生 Bun HTTP 栈发送前在序列化请求体中查找并等长回写计算哈希；OSS 未验证算法与输入。

完整触发条件：仅当 feature('NATIVE&#95;CLIENT&#95;ATTESTATION') 为真且计费头发出时，cch=00000 被写入；发送前由 Bun 原生栈替换。

待重评（默认配置）：无 cch 专门匹配；仅 Anthropic body.system 开头 billing 行整行剥离可顺带删去占位符。Bun 发送前回写及 CLI 出站不在适配器代码中，OpenAI 系统消息亦不覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)、[model-gateway/engine.mjs:112](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L112)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-18"></a>
**18. 计费归属头** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：计费归属头协议元数据：在 system 数组首个独立文本块写入 x-anthropic-billing-header，携带 cc&#95;version、cc&#95;entrypoint 和 cch。

完整触发条件：每次发往 Anthropic API 的请求都会在 system 数组首个元素注入该计费头，位于身份行和系统提示之前。

待重评（默认配置）：Anthropic 入站顶层 system 块开头的 x-anthropic-billing-header 行会被 fromAnthropic 删除；但 messages 内 system/developer 内容原样转文本，OpenAI 入站经 compileContext 原样序列化，CLI 出站请求也未由适配器代理，覆盖不完整。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-19"></a>
**19. cc&#95;entrypoint标记** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：计费头环境标记：cc&#95;entrypoint 记录入口来源，报告实测始终为 cli；作为请求来源环境信号随计费头发出。

完整触发条件：每次发往 Anthropic API 的请求在 system 首个计费头写入 cc&#95;entrypoint；报告观察值为 cli。

待重评（默认配置）：cc&#95;entrypoint 随 billing 行在 Anthropic 顶层 system 块开头被 fromAnthropic 删除；但 messages 内 system/developer 内容原样保留，OpenAI 入站经 compileContext 原样序列化，CLI 出站请求未由适配器代理。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)、[model-gateway/context.mjs:100](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/context.mjs#L100)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-20"></a>
**20. cc&#95;version后缀哈希** · 2.1.37 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：cc&#95;version 后缀哈希：取首条用户消息索引 4、7、20 的字符（不足补 0），与内置 salt 和版本号拼成 SHA-256，取前 3 位十六进制作为 cc&#95;version 后缀。

完整触发条件：每次请求生成 cc&#95;version 时，从对话首条用户消息取固定索引字符参与哈希，生成三字符十六进制后缀。

待重评（默认配置）：cc&#95;version 位于 billing 行时，Anthropic 入站顶层 system 块首行会被 fromAnthropic 删除，后缀哈希随之不入上游；但适配器不计算该后缀，也不代理 CLI 出站请求，messages 内 system 角色与 OpenAI 入站均未覆盖。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/anthropic.mjs:26](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L26)、[model-gateway/engine.mjs:98](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L98)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

<a id="termiters-evidence-21"></a>
**21. cch请求完整性哈希** · Claude Code 2.1.37 / 定制 Bun 1.3.9-canary.51+d5628db23 · [原报告](https://a10k.co/b/reverse-engineering-claude-code-cch.html)

评估基准：历史记录，尚未按报告版本假设重新评估。

机制：cch 请求完整性哈希：在 system 首个计费头写入 cch=00000 占位符，原生 Bun 对完整序列化请求体计算 xxHash64 后取低 5 位十六进制回写。

完整触发条件：请求路径含 /v1/messages、带 anthropic-version 头且请求体含 cch=00000 占位符时激活；哈希覆盖整个序列化请求体。

待重评（默认配置）：Anthropic 入站顶层 system 文本块开头的 billing 行会被 fromAnthropic 整体删除，故其中的 cch 占位符不会透传；但 cch 哈希由 CLI 内部出站请求计算，engine 直接 spawn CLI 且正式入口不注入 testUpstream，适配器未代理该出站路径。

关联报告依据：见主报告与代码说明

代码：[model-gateway/anthropic.mjs:19](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/anthropic.mjs#L19)、[model-gateway/engine.mjs:98](https://github.com/KKBK-233/unbundle/blob/1160cc476165dbb2a3bace38c281b6fee8046dc3/model-gateway/engine.mjs#L98)；审阅提交 1160cc476165。发现时间：未说明（上游未提供可用日期）。

</details>

此追踪由 [TermiteRS](https://github.com/KKBK-233/TermiteRS) 进行在线追踪更新。

<!-- termiters:research:end -->
