# Unbundle

化整为零，自由组合。云端推理，本地工具与审批。

把云服务器上的官方 Claude Code CLI 包装成 OpenAI Chat Completions 和 Anthropic Messages 兼容入口，让本地 Claude Desktop、OMP 或其他 Harness 使用 Claude Pro/Max 会话。

云端运行官方 CLI，本地保留工作区、工具与审批。本项目为非官方实验性适配器；单用户订阅登录、真实请求和本地工具往返已验证，长会话容量仍需持续观察。

```text
本地 Harness / OMP
  └─ OpenAI 兼容请求
      └─ frp STCP + 双向 TLS
          └─ 云端模型网关
              └─ 官方 Claude Code CLI
                  └─ Claude Pro/Max OAuth
```

工具仍由本地 Harness 执行。云端网关只把调用方工具映射为临时 MCP 工具，并把工具请求返回给调用方；它不会在云服务器上开放 Bash、Read、Write 或 Edit。

0.9.6 修复桌面状态查询漏掉同一 Relay 供应商原始模型名失败记录的问题；流式 HTTP 200 与推理成功分开解释。

0.9.7 固定 `claude-code-opus` 的云端上游为 `claude-opus-5-5[1m]`，避免旧 CLI 的 `opus` 别名仍指向 Opus 5；客户端上下文预算仍为 400k。`/status` 返回实际映射供只读核对。

0.9.8 固定 Sonnet 为 `claude-sonnet-5-5[1m]`，当时 Haiku 为 `claude-haiku-4-5`；现有客户端模型 ID 保持可用。

0.10.0 支持推理机与 frps 分离，并可通过本地 SOCKS 为 frp 包一层 VLESS；沿用双向 TLS、STCP 加密和本地工具执行边界。

0.10.1 升级已验收 CLI 至 `2.1.280`；上游拒绝 `2.1.277` 请求 Opus 5.5，要求最低 `2.1.280`。新版本通过回环模拟上游的工具、图片、动态指令、1h 缓存及思考强度验收；不把模拟验收视为订阅模型权限证明。

0.11.0 云端每小时自动检查官方 latest；校验发布签名和 SHA256，隔离验收协议后空闲切换二进制链接。失败保留当前版本，保留上一版本供回滚，不重启网关；`/status` 和桌面状态脚本显示 CLI 版本。详见 [自动更新](docs/cli-update.md)。

## 当前范围

0.11.10 增加[空输出预算止损](docs/empty-output-guard.md)：预算耗尽且无正文、无工具时明确结束，拦截相同失败请求重发和已知空回复自动续接，避免再次启动上游。

0.11.11 明确官方 CLI 追加的云端环境块与本地工具环境的区别；合并的纯运行余量标签继续保留在历史原位，不改写系统提示前缀。版本号与发布内容对齐。

0.11.12 修正账户会话额度耗尽被包装为 502 后反复重试的问题，返回明确终止提示；在上游可确认的重置时间前拦截新会话请求，详见[额度止损](docs/session-quota-guard.md)。

0.11.13 云端明确未登录返回 401，认证检查失败保留 503；JSON 和 SSE 共用错误分类，并保留诊断码。详见[错误处理](docs/gateway-errors.md)。

0.11.14 修正拒绝未完成上传时立即销毁连接造成的 Windows `ECONNRESET`，确保客户端先收到完整的超时或超限错误正文。

0.11.15 补齐客户端请求方向断开时的取消监听，避免中途插话后旧推理继续占用执行槽。

0.11.17 将 `claude-code-haiku` 升级为 `claude-haiku-5-5`，开放五档 effort；模型列表沿用部署的上下文预算声明（默认 400k），移除旧 Haiku 的 200k 限制。CLI 自动更新的模拟验收覆盖三个模型。官方型号及能力见 [Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview)。

- 单用户并发执行，默认三个推理进程与 8 个排队请求。
- `/v1/models`、`/v1/chat/completions`、`/v1/messages` 和 `/status`。
- 流式文本与 function tool calls。
- OMP 配置增量导入，修改前自动备份。
- frp STCP、载荷加密、双向 TLS 和独立 Bearer Token。
- Claude Code CLI 自己保存 OAuth；网关不读取或转发 OAuth Token。

当前处理文本、用户附件和工具返回的内联图片。助手图片、音频、多用户和公共服务尚未实现。

0.5.0 支持一轮多个工具调用、逐消息输入块、可配置缓存断点与实际用量回传。每次请求仍启动独立 CLI；缓存是否命中由上游决定。方案来源、边界和验证方式见 [社区方案取舍](docs/community-design.md)。

0.5.3 修复配置导入、流式工具重建和参数校验，并增加真实 CLI 的上游契约探针。审计中哪些判断成立、哪些需要收窄，见 [审计复核](docs/audit-0.5.3.md)。

0.6.0 接通思考强度：OMP → `reasoning_effort` → 官方 CLI `--effort`，不增加思考内容展示。

0.6.1 修复首次真实订阅请求发现的缓存 TTL 冲突：默认 5m 断点同时设置官方 CLI 的 `FORCE_PROMPT_CACHING_5M=1`，避免订阅模式在其后追加 1h 断点。选择 1h 时同步设置 `CLAUDE_CODE_PROMPT_CACHE_TTL`；`off` 只关闭网关自身断点，CLI 仍自行管理缓存。

0.6.4 允许客户端使用 1..8192 的输出上限进行连通性检查。云端运行 `cloud-probe.mjs --self-test --small-output` 可验证真实 CLI 向回环模拟上游原样传递 1 token 上限，不调用真实模型。

0.6.5 把上游明确的 `max_tokens` 截断转换成 OpenAI `finish_reason: length`，保留已经生成的文本并停止 CLI 自动续写；不把 CLI 生成的 API 错误说明当作模型回复。截断的工具消息仍拒绝返回。

0.6.6 区分默认输出预算和允许的上限：云端默认接受客户端显式设置的 1..128000 token；未指定时仍用 8192。可用 `cloud-probe.mjs --self-test --output-tokens=128000` 验证真实 CLI 向模拟上游的预算传递。

0.6.7 接受 Claude Desktop/CC Switch 保留的中途 `system/developer` 消息。正文只进入系统提示一次，历史原位保留角色和引用；诊断仅统计角色、条数与字节，不记录正文。可用 `cloud-probe.mjs --self-test --instruction-updates` 验证真实 CLI 的最终上游请求。

0.7.0 将中途纯 `<total_tokens>数字 tokens left</total_tokens>` 识别为运行状态并原位留在历史，追加这类状态不再改写系统前缀。混合规则仍按真正指令处理。新增 Anthropic 原生入口，`output_config.effort` 原样传到 CLI，缓存写入/读取独立计数。云端默认记录阶段耗时，`GATEWAY_TIMING_DIAGNOSTICS=0` 可关闭；日志包含关联号、阶段、毫秒数和结果，不包含正文。`cloud-probe.mjs --self-test --instruction-updates --anthropic` 可检查真实 CLI 的最终请求、跨轮缓存前缀和 high/low 档位，全程使用回环模拟上游。

### Claude Desktop / CC Switch

网关更新到 0.7.0 后，将现有供应商的上游格式改成 **Anthropic Messages**，地址使用 `http://127.0.0.1:18796`，保留已有密钥、代理模式和模型映射。这样 `output_config.effort` 不会被 CC Switch 的 OpenAI 模型白名单过滤。OMP 的原有 OpenAI 入口继续可用。

原生入口支持文本、user 消息和工具结果的内联图片、工具调用/结果、流式输出、`thinking: {type: "adaptive"}` 和明确的 `output_config.effort`。不支持精确 `budget_tokens`、强制关闭思考或内置服务器工具；无法兑现的参数返回 400。`metadata` 作为调用方元数据接受，不冒充云端 CLI 的认证或会话身份。

0.7.1 对齐此前 CC Switch 转换路径：移除顶层系统文本块开头由前端生成的 `x-anthropic-billing-header` 元数据行，防止旋转标记破坏前缀缓存。正文内的引用不删改，网关不生成或伪造上游 billing header。

协议标记处理维持上述边界；Unicode 标记与模型文本水印继续保留。外部逆向报告的版本范围、当前已验证行为和后续审计项见[协议标记与隐写边界](docs/protocol-markers.md)。

0.7.2 修复 `/v1/messages?beta=true` 被误判为不存在的路径。推理改为双重时限：默认总时限 600 秒、连续无上游进展 180 秒；思考与工具参数片段算作进展，CLI 自身心跳不算。分别通过 `GATEWAY_TIMEOUT_MS`、`GATEWAY_IDLE_TIMEOUT_MS` 配置（毫秒，上限 1800000）。阶段日志区分 `total_timeout` 和 `idle_timeout`，避免有进展的长思考在固定三分钟时被中断。

0.9.0 允许主会话、分类器和子智能体并发；超过进程数的请求排队，不再因正在推理直接返回 429。新增文本停止串处理，支持 `stop_sequences`/`stop` 并立即结束本次进程。Sonnet/Opus 的模型列表声明 400k，上下文节省还需要客户端设置 400k 自动压缩阈值。配置与边界见[并发与上下文预算](docs/concurrency-context.md)。

0.9.3 接通图片输入与本地工具截图：接受 Anthropic `image`（`source.type: base64`）和 OpenAI `image_url` 的 `data:<media-type>;base64` 写法。图片作为原生块传给官方 CLI，历史文本仅保留原位引用；工具图片保留调用 ID、错误状态和顺序。官方 CLI 会丢弃图片上的缓存标记，因此每组图片后附固定文本结束块，用它承载断点，覆盖完整图片前缀；跨轮旧块不变。通过真实 CLI 连接回环模拟上游验收。严格校验 base64 补位，最多 100 张图片；远程地址、非 base64 来源、未支持的媒体类型和 assistant 图片返回 400。入站体上限 32MiB、单图原始数据上限 5MiB、在场请求体总量上限 64MiB，分别通过 `GATEWAY_MAX_REQUEST_BYTES`、`GATEWAY_MAX_IMAGE_BYTES`、`GATEWAY_MAX_INFLIGHT_BYTES` 配置；超额返回 413 或带 `retry-after` 的 429。默认排队上限为 8，避免大图长队列占满内存。字节准入控制不等于实际 RSS 上限，仍保留 systemd 内存限制。网关不剥离 EXIF，也不解码、缩放或保证图片文件有效性；实际图像解码交给官方 CLI/上游。`cloud-probe.mjs --self-test --images --anthropic` 覆盖两轮附件与工具截图传递，不调用真实模型。

0.9.5 增加长工具响应的进展诊断：记录最后事件、工具参数字节数、未完成工具块与已观察到的重试事件；桌面状态脚本同步展示这些计数，不记录正文。额度解析继续采用 0.9.4 的规则。

耗时日志的阶段时间均相对请求接收时间：`auth_ready` 为认证完成，`cli_spawned` 为进程启动，`upstream_message_start` 为观察到上游消息开始，`first_thinking`/`first_text`/`first_tool` 为对应内容首次到达，`cli_exit`/`cleanup_complete`/`response_complete` 为收尾。`finished` 汇总成功、取消、超时或失败。未出现的阶段表示未观察到，首个 SSE 外壳不计作首段模型文本。

### 兼容边界

- 开头和中途的 `system/developer` 指令均支持。中途指令以原始消息位置标记生效范围，系统优先于开发者，同级冲突按后续指令更新；用户、助手和工具内容内的伪角色保留为数据。该语义由系统提示表达，不能保证与原生多角色协议完全等价。新增真正指令会改变系统缓存前缀；追加普通历史或纯运行余量提示时既有前缀保持稳定。实际命中率还取决于上游缓存和客户端是否改写历史。
- 支持 `tool_choice: auto/none`、`n: 1`、`parallel_tool_calls: true`、`store: false` 和 `stream_options.include_usage`。
- 0.11.18 将单轮工具定义上限从 128 调整为 512，兼容桌面内置工具加 MCP 连接器的动态加载。超过上限返回 `400 TOOL_LIMIT_EXCEEDED`，提示实际数量和上限；请求体、在场字节及执行并发限制继续生效。工具仍由本地客户端执行，网关不截断工具集合。
- `max_tokens` 或 `max_completion_tokens` 二选一，云端默认接受 1..128000，未指定时仍使用 8192；`GATEWAY_MAX_OUTPUT_TOKENS` 可降低接受上限。实际模型的输出上限由官方 CLI 校验。允许客户端用极小输出上限进行连通性检查。`store: false` 表示网关不提供响应存储功能，不代表上游的留存政策。
- 支持 `stop` 与原生 `stop_sequences`，命中后不返回停止串及后续文本。`temperature`、`top_p`、`response_format` 等未实现参数返回 `400 UNSUPPORTED_PARAMETER`，不再静默忽略。值为 `null` 视为未设置。
- 图片在 user 和 tool 消息中接受，且必须是 base64 内联；`image/png`、`image/jpeg`、`image/gif`、`image/webp` 之外的类型返回 400。图片的 EXIF、GPS 坐标和设备信息由调用方决定是否包含，网关不读取也不剥离。截图与手机照片可能携带本地用户名或拍摄位置，这部分暴露面在客户端侧控制。
- OMP 的 `contextWindow: 64000` 是暂定压缩阈值，不代表 Claude 模型的真实上下文上限。提高前需要长对话验收。新建 provider 声明 `input: ['text', 'image']`；已存在的 provider 需要 `npm run import:omp -- --update-input` 才会补齐模态，升级只追加不移除用户自定义条目。

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
git clone --branch experimental https://github.com/KKBK-233/unbundle.git
cd unbundle
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

首次安装的已验收基线是 Claude CLI `2.1.280`，版本清单在 `model-gateway/cli-compat.mjs`。自动更新后，网关依据 root 管理的验收记录核对版本和二进制哈希；不接受尚未通过协议探针的新版本。

认证目录继续使用 `/home/harness/state/runtime-home/.claude`，运行 HOME 使用 `/home/harness/model-gateway/runtime-home`。安装脚本会创建两处目录；登录脚本与服务入口采用相同认证路径，无需移动旧 OAuth 文件。自定义 `CLAUDE_CONFIG_DIR` 时还需同步登录命令及 systemd 的可写路径。

## 使用

```powershell
# 只检查隧道和登录状态
.\omp-cloud.ps1 --check

# 启动 OMP
.\omp-cloud.ps1
```

其他 Harness 可连接 `http://127.0.0.1:18796/v1`，Bearer Token 位于 `.local/model-gateway/cloud-token`。

### Windows 登录后自动启动隧道

完成私有配置后执行一次：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\install-local-frp-autostart.ps1
```

它注册当前用户的登录计划任务；没有注册权限时改用当前用户启动目录。隧道隐藏运行，不保存 Windows 密码，不启动 OMP，不调用模型。登录后直接在项目目录执行 `omp`，进入界面再选择云端模型即可。电脑尚未登录 Windows 时不会启动；云端服务仍由 systemd 开机启动。

后台维护器检测同一隧道的现有进程，避免与 `omp-cloud.ps1` 重复绑定端口；进程退出后等待十秒重新启动。单实例锁防止重复维护器。运行日志及上一份日志保存在 `.local/model-gateway/autostart-frp.*.log`。

OMP 云端供应商 ID 保留 `velella-cloud`，兼容已有配置；模型为 `claude-code-sonnet`、`claude-code-opus`、`claude-code-haiku`。从目标项目目录调用仓库中的 `omp-cloud.ps1`，即可让本地工具操作该项目。

### 选择思考强度

Sonnet、Opus、Haiku 5.5 支持 `low`、`medium`、`high`、`xhigh`、`max`，新导入的 OMP 配置默认 `medium`。启动时例如：

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

云端默认对自然请求进行[异常通道自动取证](docs/anomaly-capture.md)：疑似 thinking 标签外显或块类型冲突时落盘保存有界元数据，正常请求不写文件，不保存正文或签名值，也不打断输出。

Windows 桌面只读查询服务器资源、最近请求缓存和官方订阅额度，见[桌面状态查询](docs/desktop-status.md)。

云服务器更换与 Ubuntu 安装说明见 [迁移说明](docs/server-migration.md)。

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

项目名称为 **Unbundle**，仓库名称和包名统一为 `unbundle`。`main` 仅保留项目状态说明，实验实现位于 `experimental` 分支。部署服务名沿用 `velella-*`，供应商 ID 和诊断标记保留原值，以兼容已安装服务和已有配置。仓库当前公开，尚未添加开源许可证；待办见 [OPEN_SOURCE_REVIEW.md](OPEN_SOURCE_REVIEW.md)。
