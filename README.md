# Claude Code Relay

把云服务器上的官方 Claude Code CLI 包装成 OpenAI Chat Completions 兼容入口，让本地 OMP 或其他 Harness 使用 Claude Pro/Max 会话。

云端运行官方 CLI，本地保留工作区、工具与审批。本项目为非官方实验性适配器；真实端到端测试使用 DeepSeek API，Claude Pro/Max 登录和额度尚未验收。

```text
本地 Harness / OMP
  └─ OpenAI 兼容请求
      └─ frp STCP + 双向 TLS
          └─ 云端模型网关
              └─ 官方 Claude Code CLI
                  └─ Claude Pro/Max OAuth
```

工具仍由本地 Harness 执行。云端网关只把调用方工具映射为临时 MCP 工具，并把工具请求返回给调用方；它不会在云服务器上开放 Bash、Read、Write 或 Edit。

## 当前范围

- 单用户、单请求串行执行。
- `/v1/models`、`/v1/chat/completions` 和 `/status`。
- 流式文本与 function tool calls。
- OMP 配置增量导入，修改前自动备份。
- frp STCP、载荷加密、双向 TLS 和独立 Bearer Token。
- Claude Code CLI 自己保存 OAuth；网关不读取或转发 OAuth Token。

当前只处理文本消息。图片、音频、多用户、并行会话和公共服务不在首版范围内。

0.5.0 支持一轮多个工具调用、逐消息输入块、可配置缓存断点与实际用量回传。每次请求仍启动独立 CLI；缓存是否命中由上游决定。方案来源、边界和验证方式见 [社区方案取舍](docs/community-design.md)。

## 目录

| 路径 | 用途 |
| --- | --- |
| `model-gateway/` | OpenAI 兼容网关、Claude Code 适配、OMP 导入和测试 |
| `src/frp.mjs` | frp 双向 TLS 配置生成 |
| `deploy/` | Linux systemd 与证书安装脚本 |
| `config/cloud.example.json` | 本地云服务器配置示例 |
| `omp-cloud.ps1` | Windows 一键启动隧道和 OMP |

运行态文件统一写入 `.local/`，该目录已从 Git 排除。

## 本地准备

要求：本地 Windows、Node.js 22+、Python 3、`cryptography`、frp 0.71 和 OMP；云端 Linux 需单独安装官方 Claude Code。仓库不包含第三方二进制。

```powershell
git clone https://github.com/KKBK-233/claude-code-relay.git
cd claude-code-relay
npm ci
New-Item -ItemType Directory -Force .local | Out-Null
Copy-Item config/cloud.example.json .local/cloud.json
```

先编辑 `.local/cloud.json` 的服务器地址和 frp 端口，再生成配置：

```powershell
python deploy/create-frp-pki.py
python deploy/create-model-client-cert.py
npm run prepare:cloud
npm run import:omp
```

当前启动脚本使用固定路径 `.local/frp/frp_0.71.0_windows_amd64/frpc.exe`；将下载的 frp 解压到该位置。生成目录包含私钥、令牌和部署配置，不能提交。

## 云端部署

部署脚本是针对已准备好环境的模板，并非完整服务器安装器。它使用 `harness` 系统用户、`/home/harness/app` 应用目录和 `/home/harness/model-gateway` 状态目录，需要先创建用户并准备以下路径：

- Node.js：`/home/harness/app/node/bin/node`。
- 官方 Claude Code：`/home/harness/.local/bin/claude`。
- Linux frp：`/home/harness/app/.local/frp/frp_0.71.0_linux_amd64/`。
- 私有部署配置：`.local/frp/` 的服务器配置、令牌、CA 公证书、服务器证书与私钥；`.local/model-gateway/` 的 `cloud-token`、`cloud-frpc.toml`、`cloud.crt`、`cloud.key`。

CA 私钥和本地客户端私钥保留本地，不要把整个 `.local` 上传。脚本使用 `restorecon` 与 `firewall-cmd`，当前实际部署验证平台为启用 SELinux 的 openEuler；其他发行版应先检查脚本。安装脚本的端口检查和防火墙规则固定为 TCP 18469，使用其他端口时需同步调整。准备完毕后，在服务器应用目录执行：

```bash
sudo bash deploy/install-frp.sh
sudo bash deploy/install-model-gateway.sh
sudo bash deploy/model-login.sh
```

只需向公网开放 frps 的 TCP 端口。模型网关只监听 `127.0.0.1:18796`，由 STCP visitor 访问。

## 使用

```powershell
# 只检查隧道和登录状态
.\omp-cloud.ps1 --check

# 启动 OMP
.\omp-cloud.ps1
```

其他 Harness 可连接 `http://127.0.0.1:18796/v1`，Bearer Token 位于 `.local/model-gateway/cloud-token`。

OMP 云端供应商 ID 保留 `velella-cloud`，兼容已有配置；模型为 `claude-code-sonnet`、`claude-code-opus`、`claude-code-haiku`。从目标项目目录调用仓库中的 `omp-cloud.ps1`，即可让本地工具操作该项目。

## 从 0.1.0 迁移

- 原 `model-gateway/start.ps1`、`omp.ps1` 和本地 DeepSeek 服务入口已被云端路线替换；新版使用根目录 `omp-cloud.ps1`。
- 原端口 `18795` 与 OMP 供应商 `claude-code-relay/claude-code-deepseek` 不再由新版提供。停止旧服务，完成云端部署后选择 `velella-cloud/claude-code-sonnet`。
- 旧 OMP 配置与 `.local` 文件不会由 Git 更新自动删除。`import:omp` 仅新增云端供应商，保留原入口供核对；它不迁移旧令牌或 DeepSeek Key。
- 已有云端部署继续使用原证书、令牌、服务名和 provider ID，无需为了项目改名重新生成。
- DeepSeek 的真实测试结果见 [复测报告](docs/deepseek-comparison.md)。专用测试适配器未作为常驻服务发布。
- 旧版代码保留在 Git 历史提交 `37daed4`。

## 验证

```powershell
npm test
npm run check:transport
```

`npm test` 不调用真实 Claude。`check:transport` 需要隧道和云端服务已经运行。

## 发布状态

仓库名称和包名统一为 `claude-code-relay`；部署服务名沿用 `velella-*` 以兼容已安装服务。当前没有开源许可证，仓库可见性保持不变。公开发布前参照 [OPEN_SOURCE_REVIEW.md](OPEN_SOURCE_REVIEW.md) 决定许可证。
