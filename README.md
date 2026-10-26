# Unbundle

**化整为零，自由组合。单用户自部署，云端推理，本地工具与审批。**

Unbundle 是实验性 CLI 适配器：在自己控制的服务器上运行官方 Claude Code CLI，通过加密隧道连接本机的 Claude Code 桌面版（Claude Desktop 的 Code 工作区）。本地工作区、工具执行与审批由调用方掌握，云端网关负责推理请求和协议桥接。

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

日常推理建议只使用 Claude Code 桌面版，不建议使用 OMP、OpenCode 或其他第三方 Harness。Claude Desktop 的配置说明与 CLI 设置文件输出到 `.local/profiles/名称/`；首次 Desktop 切换需用户操作，本版不会覆盖已有活动配置。`doctor` 不调用模型；显式使用 `doctor --live` 才进行一次真实推理。

完整步骤、支持范围与恢复方式见 [安装说明](INSTALL.md)。也可以把本仓库地址、VPS 的 SSH Host 和目标客户端交给本机 AI，按 [AGENTS.md](AGENTS.md) 完成安装。Windows 支持当前用户登录后自动维护隧道；其他本机系统暂用 `npm start` 启动。SSH 重连恢复后续连接，不恢复已断开的推理。

## 使用范围

- 每套部署限定为一台 VPS、一个账号和账号持有人的一台固定本机；同账号、同设备可以运行多个并发会话。
- 不提供多租户、账号池、订阅共享、额度转售或公共中转站支持。
- 不提供代管他人登录凭据的功能；OAuth 登录、保存和刷新由官方 CLI 管理，网关不读取、复制、导出、转发或自行刷新 OAuth Token。
- 按上游服务允许的认证方式和使用范围运行，自部署不改变上游的使用规则。

上述内容说明项目使用建议与支持范围，不代表已经实现客户端识别或设备绑定，也不保证上游账号不会受限，不是新的许可证条款。项目仍处于实验阶段，尚未添加开源许可证。

## 说明文档

[系统提示词对比与暂停信息分析](docs/system-prompt-comparison.md)：记录 Unbundle 与 Magpie 默认、Lean 模式的差别及目前能确认的证据范围。

安装前请阅读 [完整说明](https://github.com/KKBK-233/unbundle/blob/docs/README.md)，确认环境要求、部署步骤和兼容边界。

`main` 保存程序、配置模板、部署脚本与当前安装入口；[docs 分支](https://github.com/KKBK-233/unbundle/tree/docs) 集中维护详细文档和历史记录。

部署服务名、供应商 ID 和诊断标记沿用原值，以兼容已有安装和配置。

<!-- termiters:research:start -->
## 隐写与指纹跟踪

评估基准：Unbundle 默认配置；假设云端 CLI 按指定报告版本描述运行，结合同版本报告及仓库源码静态评估。未经真实流量验证，不代表已检测实际部署版本或确认发生采集。

方向、触发条件、网关处理分别记录；不经过网关不等于上传，未过滤不等于默认触发。来源差异须结合版本和路径查看，不能强行合并成确定结论。

固定研究上游：[wtfwhs/tengu-decoded](https://github.com/wtfwhs/tengu-decoded)；报告版本：2.1.300（不代表官方最新发布版本）；读取提交：`068b7a24325b`。

去重后 **26 项机制**；**14 项含待重评来源**；**0 项存在来源结论差异**。最近保存的报告核验记录：2026-10-22T03:13:15Z。

研究快照：部分完成，保留旧评估及其基准，待重评项不作当前确定结论。

| 报告版本 | 机制 | 来源／方向 | 默认触发 | 网关处理 | 评估状态 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1.300 | 环境标记 · ATIS pin attribute | 待补充 | 默认关闭／不触发 | 待核实 | 默认关闭／不触发 | [1 份来源](docs/research/README.md#mechanism-atis-pin-attribute) |
| 2.1.300 | 协议指纹 · auto-mode classifier beta header | 待补充 | 默认关闭／不触发 | 待核实 | 默认关闭／不触发 | [1 份来源](docs/research/README.md#mechanism-auto-mode-classifier-beta-header) |
| 2.1.300 | 环境标记 · 后台调度层级环境标记 | 待补充 | 默认关闭／不触发 | 待核实 | 默认关闭／不触发 | [2 份来源](docs/research/README.md#mechanism-background-dispatcher-tier-env) |
| 2.1.300 | 环境标记 · Bridge host profile | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [1 份来源](docs/research/README.md#mechanism-bridge-host-profile) |
| 2.1.300 | 环境标记 · 桥接机器 UUID 原样发送 | 待补充 | 默认关闭／不触发 | 待核实 | 当前配置不触发；部分来源待重评 | [2 份来源](docs/research/README.md#mechanism-bridge-machine-id) |
| 2.1.300 | 环境标记 · 桥接所有者账号环境变量 | 待补充 | 默认关闭／不触发 | 待核实 | 默认关闭／不触发 | [1 份来源](docs/research/README.md#mechanism-bridge-owner-account-env) |
| 2.1.300 | 环境标记 · CCR 心跳探测字段 | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [1 份来源](docs/research/README.md#mechanism-ccr-heartbeat-probe-fields) |
| 2.1.300 | 协议指纹 · CCR idle heartbeat probe | 待补充 | 默认关闭／不触发 | 待核实 | 默认关闭／不触发 | [1 份来源](docs/research/README.md#mechanism-ccr-idle-heartbeat-probe) |
| 2.1.300 | 环境标记 · 设备绑定证明 | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [2 份来源](docs/research/README.md#mechanism-device-bind-attestation) |
| 2.1.300 | 协议指纹 · 环境运行器版本头 | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [1 份来源](docs/research/README.md#mechanism-environment-runner-version-header) |
| 2.1.300 | 协议指纹 · feature&#95;name 闭集遥测枚举 | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [1 份来源](docs/research/README.md#mechanism-feature-name-telemetry-enum) |
| 2.1.300 | 协议指纹 · GB authed eval endpoint | 待补充 | 默认关闭／不触发 | 待核实 | 默认关闭／不触发 | [1 份来源](docs/research/README.md#mechanism-growthbook-authed-eval-endpoint) |
| 2.1.300 | 环境标记 · userID 元数据原样透传 | 待补充 | 待核实 | 待核实 | 未过滤；部分来源待重评 | [2 份来源](docs/research/README.md#mechanism-install-user-id-metadata) |
| 2.1.300 | 协议指纹 · 低优先级慢速协议头 | 待补充 | 默认关闭／不触发 | 待核实 | 默认关闭／不触发 | [1 份来源](docs/research/README.md#mechanism-low-priority-slow-protocol-headers) |
| 2.1.300 | 环境标记 · machineID 错误报告截断 | 待补充 | 默认关闭／不触发 | 待核实 | 当前配置不触发；部分来源待重评 | [2 份来源](docs/research/README.md#mechanism-machine-id-error-prefix) |
| 2.1.300 | 环境标记 · OTel user email | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [1 份来源](docs/research/README.md#mechanism-otel-user-email) |
| 2.1.300 | 协议指纹 · 超额范围协议头 | 待补充 | 待核实 | 待核实 | 未过滤 | [1 份来源](docs/research/README.md#mechanism-overage-scope-protocol-header) |
| 2.1.300 | 协议指纹 · peer message fromMode | 待补充 | 待核实 | 待核实 | 未过滤 | [1 份来源](docs/research/README.md#mechanism-peer-message-frommode-marker) |
| 2.1.300 | 环境标记 · 计划层级环境覆盖 | 待补充 | 待核实 | 移除 | 已过滤 | [1 份来源](docs/research/README.md#mechanism-plan-tier-env-override) |
| 2.1.300 | 环境标记 · Plugin telemetry deviceId | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [1 份来源](docs/research/README.md#mechanism-plugin-telemetry-device-id) |
| 2.1.300 | 协议指纹 · x-cc-tender-quilt 拒绝切换头 | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [1 份来源](docs/research/README.md#mechanism-safety-refusal-model-switch-header) |
| 2.1.300 | 环境标记 · 自托管运行器JWT身份环境变量 | 待补充 | 默认关闭／不触发 | 待核实 | 默认关闭／不触发 | [1 份来源](docs/research/README.md#mechanism-self-hosted-runner-jwt-identity-env) |
| 2.1.300 | 协议指纹 · 自托管运行器版本头 | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [1 份来源](docs/research/README.md#mechanism-self-hosted-runner-version-header) |
| 2.1.300 | 协议指纹 · server-side arbiter beta header | 待补充 | 默认关闭／不触发 | 待核实 | 默认关闭／不触发 | [1 份来源](docs/research/README.md#mechanism-server-side-arbiter-beta-header) |
| 2.1.300 | 协议指纹 · Summon SID HMAC | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [1 份来源](docs/research/README.md#mechanism-summon-sid-hmac) |
| 2.1.300 | 环境标记 · 可信设备令牌头 | 待补充 | 待重评 | 待重评 | 待核实（代码已变化） | [2 份来源](docs/research/README.md#mechanism-trusted-device-token) |

[完整条件、原文引用、代码证据与历史来源](docs/research/README.md)。发现时间按上游报告首发／首次可查提交记账，不代表机制引入时间。

此追踪由 [TermiteRS](https://github.com/KKBK-233/TermiteRS) 自动更新。

<!-- termiters:research:end -->
