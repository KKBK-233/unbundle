# 安装 Unbundle 1.0

准备一台能访问官方 Claude 服务的 Debian/Ubuntu x64 VPS，以及能运行 Node.js 22+、OpenSSH 和 tar 的本机。VPS 需要 root 或免交互 sudo；SSH 使用本机已有配置、密钥或 agent。首次连接时先通过可信渠道核实主机指纹并完成一次普通 SSH 登录。账号持有人需要自己的 Claude 订阅；授权由本人在官方浏览器流程完成。每台 VPS 只使用一个账号，只服务账号持有人的一台固定本机；同账号、同设备可以并发多个会话。日常推理建议只使用 Claude Code 桌面版（Claude Desktop 的 Code 工作区），不建议使用 OMP、OpenCode 或其他第三方 Harness。

## 交给 AI 安装

将下列信息交给本机上的编码助手即可。部署助手只需能运行本地安装命令，不必使用 Unbundle 推理；部署助手的选择不代表推荐将其作为本项目的推理客户端。

```text
请安装 https://github.com/KKBK-233/unbundle，先读 AGENTS.md 和 INSTALL.md。
VPS：我的 SSH Host 名或 root@主机IP
SSH：复用本机已有配置和密钥，不索取或上传私钥。
目标：先建立 SSH 隧道，再配置 Claude Code 桌面版（Claude Desktop 的 Code 工作区）。
Claude 登录由我完成浏览器授权。现有客户端配置需保留。
真实推理测试前告知我请求数量；不要仅凭 HTTP 200 声称使用成功。
```

## 最短路径

```powershell
git clone https://github.com/KKBK-233/unbundle.git
cd unbundle
npm ci
npm run deploy -- --host root@你的VPS
npm run login
npm run doctor
```

首次安装自动准备服务账户、Node 24、经官方签名和 SHA256 校验的 Claude CLI、隔离协议验收、systemd 网关及 CLI 更新定时器。模型只监听服务器 `127.0.0.1:18796`；不开放公网模型端口，不安装 FRP。Windows 安装当前用户登录触发的 SSH 后台任务；其他本机系统当前用 `npm start` 启动维护器，自动登录启动尚未集成。

每个部署配置保存在 `.local/profiles/名称/`，含独立令牌、隧道状态和客户端配置导出。安装失败后使用相同命令重跑，复用原令牌和登录；请勿删除该目录后直接覆盖已有云端安装。服务端升级会备份程序，失败不会自动恢复所有安装步骤，需依据阶段日志修复后重跑。

## 已有其他网关时

为新部署使用独立名称与本地端口，不覆盖当前 `18796` 入口：

```powershell
npm run deploy -- --host my-vps --profile second --local-port 18797
npm run login -- --profile second
npm run doctor -- --profile second
```

可以显式传入 `--identity 本机密钥路径`、`--ssh-port 2222`、`--proxy-jump my-jump`。不传则遵循本机 SSH 配置。CLI 参数不接受密码或 OAuth Token。普通 SSH 可登录但禁止 TCP 转发的机器，隧道验收会失败，需要管理员确认转发策略。

## Claude Code 桌面版

先确保 `doctor` 显示 `loggedIn: true`。查看对应 `.local/profiles/名称/desktop-setup.md`，在 Desktop 中启用开发者模式并配置 Third-Party Inference。选择导入同目录 `desktop-config.json`；客户端未提供导入入口时，按说明填写本机 URL、Bearer Token 和网关模型 ID。令牌来自同目录 `gateway-token`，不输出到安装日志。配置字段依据[官方网关配置文档](https://claude.com/docs/third-party/claude-desktop/gateway)。

Desktop 使用独立的第三方推理配置；导出的 `claude-code.settings.json` 只供 CLI 使用，不能替代 Desktop 配置。本版不会自动覆盖现有 Desktop 活动配置。首次 Desktop 切换和账号授权需要用户参与；完成后仍需在 Desktop 内验证真实对话及工具往返。

以下 CLI 配置仅保留供诊断或兼容性验证，日常推理仍推荐上述桌面版入口：

```powershell
claude --settings .local/profiles/default/claude-code.settings.json
```

不建议通过 OMP、OpenCode 或其他第三方 Harness 使用本项目推理。仓库保留的历史兼容代码和接口不代表当前推荐或已验收的使用方式。Responses API 尚未实现；部署助手可执行安装，不代表它可直接把此网关作为推理供应商。

这是使用建议，当前不通过客户端名称强制阻止请求，也未实现设备绑定。使用官方桌面版仍会经过网关的提示词转换，不能据此保证与官方直连行为一致或避免账号限制；详见[系统提示词对比](docs/system-prompt-comparison.md)。

## 验证和日常使用

拒绝响应的协议字段、网关日志查询及历史观测限制见[拒绝响应与日志排查](docs/refusal-diagnostics.md)。

`doctor` 只检查隧道、网关、鉴权、模型列表和官方 CLI 登录布尔值，不调用模型。另行运行以下命令会发起 **1 次** Sonnet 真实请求，最多 1024 输出 token：

```powershell
npm run doctor -- --live
npm start
npm stop
```

真实请求失败时退出非零，不把网关停止提示当成成功。`inferenceTested` 和 `desktopTested` 分别标记；没有执行的验收不冒充通过。SSH 自动重连只恢复后续请求的通道，断开的模型请求不能续传。

## 运行限制与维护

小于 2 GiB 的 VPS 首次默认单路推理；资源限额根据内存生成。通过 `/etc/unbundle/gateway.env` 设置运行参数，参考 `config/gateway-limits.example.env`，然后在服务空闲时重启网关。重跑安装保留该配置和 OAuth 文件。

工具数量、累计 CLI 输出和整轮时限默认不额外限制；请求体仍默认 32 MiB，在场体积 64 MiB，单图 5 MiB，最多 100 张图片。普通文本与工具兼容不等于完整 API 透传；不支持精确思考预算、采样控制、PDF/音频/视频原生块等功能。详细接口限制见 `docs` 分支。

VPS 仍需满足官方服务访问条件和账户权限。本项目面向单用户自部署，尚未添加开源许可证。
