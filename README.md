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

0.5.3 修复配置导入、流式工具重建和参数校验，并增加真实 CLI 的上游契约探针。审计中哪些判断成立、哪些需要收窄，见 [审计复核](docs/audit-0.5.3.md)。

0.6.0 接通思考强度：OMP → `reasoning_effort` → 官方 CLI `--effort`，不增加思考内容展示。

0.6.1 修复首次真实订阅请求发现的缓存 TTL 冲突：默认 5m 断点同时设置官方 CLI 的 `FORCE_PROMPT_CACHING_5M=1`，避免订阅模式在其后追加 1h 断点。选择 1h 时同步设置 `CLAUDE_CODE_PROMPT_CACHE_TTL`；`off` 只关闭网关自身断点，CLI 仍自行管理缓存。

### 兼容边界

- 仅接受开头连续的 `system/developer` 指令；中途插入返回 `400 UNSUPPORTED_MESSAGE_LAYOUT`。
- 支持 `tool_choice: auto/none`、`n: 1`、`parallel_tool_calls: true`、`store: false` 和 `stream_options.include_usage`。
- `max_tokens` 或 `max_completion_tokens` 二选一，支持 256 到服务端上限（默认 8192），实际传给 CLI。`store: false` 表示网关不提供响应存储功能，不代表上游的留存政策。
- `temperature`、`top_p`、`stop`、`response_format` 等未实现参数返回 `400 UNSUPPORTED_PARAMETER`，不再静默忽略。值为 `null` 视为未设置。
- OMP 的 `contextWindow: 64000` 是暂定压缩阈值，不代表 Claude 模型的真实上下文上限。提高前需要长对话验收。

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

CA 私钥和本地客户端私钥保留本地，不要把整个 `.local` 上传。脚本使用 `restorecon` 与 `firewall-cmd`，当前实际部署验证平台为启用 SELinux 的 openEuler；其他发行版应先检查脚本。端口检查和防火墙规则读取生成配置的 `bindPort`。准备完毕后，在服务器应用目录执行：

```bash
sudo bash deploy/install-frp.sh
sudo bash deploy/install-model-gateway.sh
sudo bash deploy/model-login.sh
```

只需向公网开放 frps 的 TCP 端口。模型网关只监听 `127.0.0.1:18796`，由 STCP visitor 访问。

安装和服务启动只接受已验收的 Claude CLI `2.1.277`，版本清单在 `model-gateway/cli-compat.mjs`。升级 CLI 先做隔离协议验收，再更新清单。

认证目录继续使用 `/home/harness/state/runtime-home/.claude`，运行 HOME 使用 `/home/harness/model-gateway/runtime-home`。安装脚本会创建两处目录；登录脚本与服务入口采用相同认证路径，无需移动旧 OAuth 文件。自定义 `CLAUDE_CONFIG_DIR` 时还需同步登录命令及 systemd 的可写路径。

## 使用

```powershell
# 只检查隧道和登录状态
.\omp-cloud.ps1 --check

# 启动 OMP
.\omp-cloud.ps1
```

其他 Harness 可连接 `http://127.0.0.1:18796/v1`，Bearer Token 位于 `.local/model-gateway/cloud-token`。

OMP 云端供应商 ID 保留 `velella-cloud`，兼容已有配置；模型为 `claude-code-sonnet`、`claude-code-opus`、`claude-code-haiku`。从目标项目目录调用仓库中的 `omp-cloud.ps1`，即可让本地工具操作该项目。

### 选择思考强度

Sonnet、Opus 支持 `low`、`medium`、`high`、`xhigh`、`max`，新导入的 OMP 配置默认 `medium`。Haiku 暂不提供 effort 控制。启动时例如：

```powershell
.\omp-cloud.ps1 --thinking high
```

已有配置先运行 `npm run import:omp -- --update-thinking`。该命令先核对令牌和入口，再备份并更新本 provider 的模型能力，保留默认模型和其他 provider。迁移目录时可用 `GATEWAY_TOKEN_FILE` 指向原来的 `cloud-token`；不要为此重建令牌。

其他 Harness 发送顶层 `reasoning_effort`；未设置、`null` 或 `auto` 使用 CLI 默认。`off/none/minimal` 不作隐式转换，返回 `400 UNSUPPORTED_REASONING_EFFORT`。OMP 的可选档位由模型的 `thinking.efforts` 声明，不提供关闭思考选项。强度只影响 CLI 参数，不写入用户提示词，不返回 `reasoning_content`。

该映射与 CLI 2.1.277 配套验收：真实 OMP 五档、云端 Sonnet/Opus 共十种组合均通过回环模拟上游，实际发送的是 `output_config.effort`。这验证参数传递，不证明订阅权限、实际思考量或费用。模型能力说明见 [Claude Code 官方文档](https://code.claude.com/docs/en/model-config#adjust-effort-level)，客户端字段见 [OMP 模型文档](https://github.com/can1357/oh-my-pi/blob/main/docs/models.md)。

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

安装 OMP 后，可执行 `node model-gateway/omp-probe.mjs`，在临时配置中验证真实 OMP 的两轮工具往返，不使用模型 API。云端执行以下命令，用官方 CLI 连接回环模拟上游；使用临时端口，不停正式服务：

```bash
cd /home/harness/app
sudo -u harness /usr/local/bin/velella-node model-gateway/cloud-probe.mjs --self-test
sudo -u harness /usr/local/bin/velella-node model-gateway/effort-cloud-probe.mjs
```

探针验证精确工具集合、稳定的缓存前缀、输出上限和缓存断点，报告环境信息是否进入提示词。当前 CLI 会在缓存断点后追加含 cwd 的环境消息；每轮随机请求目录未进入受控提示词。模拟上游不能证明真实缓存命中、计费或 Pro/Max OAuth 可用。

## 发布状态

仓库名称和包名统一为 `claude-code-relay`；部署服务名沿用 `velella-*` 以兼容已安装服务。仓库当前公开，尚未添加开源许可证；待办见 [OPEN_SOURCE_REVIEW.md](OPEN_SOURCE_REVIEW.md)。
