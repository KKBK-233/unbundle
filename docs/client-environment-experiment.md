# 客户端环境与最小网关头实验

本分支研究如何减少模型面对的环境冲突。缓存修复在其他任务完成，本实验不调整缓存策略。

## 两个开关

- `GATEWAY_PROMPT_PROFILE=standard|minimal`：默认 standard。minimal 移除路由、服务器、原生压缩归档等说明；保留客户端 system/developer 指令、历史 JSON 解释、动态指令规则和工具政策。只在出现运行状态块时补充简短解释。
- `GATEWAY_PROMPT_TRACE=1`：开启实验日志，默认关闭。目前仅支持逐轮独立 CLI；与原生会话同时开启会在启动时拒绝，防止误以为两个执行路径都已验证。

客户端提供的环境信息原样保留。minimal **尚未删除或替换官方 CLI 自动追加的 Linux 环境块**，不能标记为已经消除环境冲突。实际工作目录、平台检测、官方 CLI 文件和认证流程未改动。

## 复盘日志

日志位于 `$GATEWAY_STATE/prompt-experiment/`，每轮一个 JSON 文件，目录 0700、文件 0600；最多 64 份、合计 4 MiB、保留 24 小时，写入时清理。超过事件上限只增加丢弃计数；慢盘最多排队八份日志，额外请求报告 `write_skipped`。写入失败只报告 `write_failed`，不改变回复。

记录的内容：

- 实验模式、请求关联号、CLI 版本、模型和 effort。
- 网关构造的固定头全文、客户端指令与历史的长度/哈希、工具政策。
- 上游消息开始、工具类型、结束原因、重试及按消息去重的用量。
- 流式正文与思考事件的字节数，以及 gateway、relay、VPS、Windows、Linux、网关、中继、服务器等关键词次数。

不保存客户端指令全文、工具参数、正文/思考全文、签名、请求头或认证数据。关键词出现不等于模型困惑，更不证明浪费了多少推理；无关键词也不证明没有环境冲突。无流式文本时关键词统计不完整。需要结合本地桌面会话的可见回复和实际工具结果复盘。

这些运行日志观察的是**网关构造输入和 CLI 返回事件**，不是正式订阅上游抓包。下述合成探针才能直接验证当前 CLI 最终发送的环境块；它不能替代真实模型行为测试。

## 零额度环境探针

在 VPS 的本分支独立目录执行：

```sh
node model-gateway/prompt-environment-probe.mjs --self-test --output=/独立实验结果目录
```

使用真实官方 CLI、临时 HOME/配置目录、虚构认证值和回环模拟上游。共四次合成 Messages 请求，比较 standard/minimal 的 Windows 路径、多工具调用及结果续接。不会连接正式推理上游，不执行真实文件工具，也不读取生产 OAuth。`environment-probe.json` 只含合成请求的系统提示、历史、工具名称和 CLI 额外环境块，不包含账号 metadata 或请求头。实验关闭 ToolSearch 以固定协议往返，不声称验证了实际工具发现行为。

## 已完成的探索

2026-11-02 在官方 CLI 2.1.316 上，以下五种候选设置分别与基线比较，均未去掉或替换最终请求里的 Linux 环境块：

- `CLAUDE_CODE_HIDE_CWD=1`
- `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=1`
- `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`
- `CLAUDE_CODE_HOST_PLATFORM=win32`
- `CLAUDE_RUNNER_CLIENT_PLATFORM=win32`

这些是二进制中观察到的候选字符串，不代表受支持配置，也没有接入正式执行器。环境块除路径、平台、Shell 外还包含其他官方运行说明；后续若找到替换入口，应仅处理确认属于工具环境的字段，不能整块删去其他规则。

## 行为对比方法

额度允许后，用新的、等价的短会话分别测试 standard/minimal，固定模型、effort、任务和工具集合，避免旧历史携带网关讨论。任务描述只要求读文件、局部编辑、续接和路径切换，不询问模型是否在网关。对比首次工具成功率、错误路径、重复读取、工具搜索次数、输出用量与可见回复。先约定真实请求预算再运行；目前尚无行为实验结论。

本分支不创建 PR、不合入 dev/main；切换现有入口必须由用户明确授权。首次部署实验应使用独立目录、状态和端口，共用同一个账号的官方登录管理；仍只服务现有固定本机。

## 首次验收结果

真实 CLI 2.1.316 的模拟上游验收完成四次请求：两种头各执行多工具调用和一次工具结果续接。合成样例中固定网关说明从 1,401 字节减至 258 字节，整个 system 文件从 1,574 字节减至 424 字节；历史和工具集合保持相同。两种头均仍收到一份官方 Linux 环境块。该结果只证明协议传递与提示词构造，不证明真实模型减少了无效思考。

补充慢盘队列测试后，本地全量测试为 441 项：438 通过、3 跳过、0 失败。VPS 生产仍为 dev 的 2.0.4，实验独立存放于 `/home/harness/experiments/client-environment-2f1ce35/`；没有切换生产服务或启动真实模型推理。

VPS 清理了软件包下载缓存和七天以前的普通系统日志，释放 1,162,539,008 字节；清理后可用 8,124,608,512 字节。网关专用日志、账号状态、当前程序和回滚版本保留。

## GLM 全入口实验

用户明确授权后，可将当前服务切到本分支并使用以下配置：

```ini
GATEWAY_EXPERIMENT_UPSTREAM=glm
GATEWAY_GLM_KEY_FILE=/独立密钥文件
GATEWAY_PROMPT_PROFILE=minimal
GATEWAY_PROMPT_TRACE=1
GATEWAY_PROMPT_TRACE_CONTENT=1
GATEWAY_SESSION_RELAY=0
```

三个现有型号入口统一映射到 `glm-5.3`，保留客户端型号 ID 兼容现有桌面配置；`/status` 显示真实 `upstreamProvider` 和映射，模型显示名明确为 GLM。API Key 文件必须是 0600 普通文件，失败不回退 Claude。CLI 使用 `glm-runtime-home/.claude` 独立配置，不访问生产订阅登录目录。`authMode=api_key`、`checked=false` 只表示密钥配置存在，实际可用性通过验收请求判断。

`GATEWAY_PROMPT_TRACE_CONTENT=1` 仅允许在 GLM 实验中开启。在原有日志上增加 GLM **实际返回**的 thinking/text、工具参数、交接和本轮工具回执；聚合回退与流式记录按消息去重，不包含签名和请求头。已配置的 API Key、网关令牌及常见认证字段脱敏，但这不是任意敏感信息的万能识别器。全文日志保持服务账号私有权限。

详细模式每轮采集最多 256 KiB 原始内容，超过处明确标记截断，最多 256 条内容记录；单文件硬上限 2 MiB，最多 128 份、总计 64 MiB、保留 72 小时。每十五秒原子保存进度，结束后覆盖为最终版本；普通 journal 只记录元数据。保留限制在每次写入时执行。模型未返回的思考不猜测、不补写。

生产切换使用单独 systemd drop-in 指向独立实验程序目录，原程序与订阅配置留在原处。切换期间暂停 CLI 自动更新，以固定实验版本；恢复脚本撤销实验 drop-in 并恢复定时器原状态，恢复前必须确认没有活动请求。


### 实验日志定期维护

`deploy/glm-experiment-maintenance.py --state /home/harness/model-gateway` 配合十五分钟 systemd 定时器，补齐空闲期间的日志过期清理。它只扫描 `prompt-experiment` 中的规范命名文件，以及 `glm-runtime-home/.cache/claude-cli-nodejs` 中的调试日志；拒绝符号链接，不读取认证目录。详细日志仍为 64 MiB / 128 份 / 72 小时，CLI 调试日志为 16 MiB / 128 份 / 72 小时，后者在定时维护时收敛，运行期间允许暂时超过限制。已有网关 journal namespace 单独限制为磁盘 128 MiB、内存 32 MiB、七天。

### GLM 真实验收观察

2026-11-02 已验证三个兼容型号均映射到 `glm-5.3`，短文本、流式输出、原生 ToolSearch 发现、MCP 工具交接和结果续接可用。一次开启 ToolSearch 的请求在 120 秒后超时，但复测成功，不能据此断言 ToolSearch 不兼容。

32 工具合成样例要求只读三行、编辑后不回读。一次 GLM 在同一个上游消息中生成了四个独立调用：读、编辑、读、读；网关记录与实际交接一致。这属于观察到的模型行为偏差，不能把协议通过等同于模型总能遵循操作顺序。此测试使用模拟工具回执，没有在 Windows 上执行真实编辑。详细日志保存实际返回的思考字段，不能据此推断模型内部的全部处理过程。


### 当前部署状态（2026-11-02）

用户授权扩大 GLM 测试后，现有 `velella-model-gateway.service` 已切换到 `/home/harness/experiments/glm-live-d75d61e`，保留 `127.0.0.1:18796` 和原网关令牌。本地原隧道鉴权查询已确认三个入口实际均为 GLM-5.3。原 `/home/harness/app` 的 dev 2.0.4 程序和订阅配置保留。

当前配置为 minimal + 详细内容日志 + `GATEWAY_TOOL_SEARCH=0`：直接注册客户端工具，不使用云端原生 ToolSearch。复测中，启用 ToolSearch 的 32 工具样例曾一次生成十三组读/编辑调用；关闭后同一样例只生成一次读和一次编辑。样本量有限，只作为本次实验的配置选择，不代表已经证明根因或消除了所有循环。

真实验收包括普通回复、流式结束、多工具发现、Windows 路径参数、工具交接和续接。330,016 字节的工具回执正常传递，日志最多采集 262,144 字节，并标记截断。切换后的现有端口再次完成文本、工具和续接三轮请求；日志实际出现 thinking、text、tool_arguments、tool_handoff、tool_result，目录 0700、文件 0600。没有在样本日志或服务 journal 中发现配置的 GLM 密钥和网关令牌。Windows 文件编辑使用模拟回执验证，真实桌面工具操作仍由用户测试。

详细日志位于 `/home/harness/model-gateway/prompt-experiment/`，每个请求一份 JSON。定期维护服务 `unbundle-glm-log-maintenance.timer` 已启用。独立 GLM 密钥保存于 `/home/harness/experiments/secrets/glm-api-key`，权限 0600；不读取生产 OAuth。CLI 自动更新定时器已暂停，固定 2.1.316。实验不会消除 CLI 自带的 Linux 环境说明。

回滚脚本为 `/home/harness/experiments/glm-live-control/rollback.py`，root 在确认空闲后执行。它校验实验 drop-in 未被改动，撤销实验入口、恢复原程序，并恢复原 CLI 自动更新状态；实验日志维护继续运行。部署记录和验收摘要也保存在该私有控制目录。未创建 PR，未合并 dev/main。

本地最终测试：445 项，442 通过、3 跳过、0 失败；日志维护脚本另外通过数量、容量、年龄及文件白名单检查。


## GLM 云端环境事实修正（2.1.1）

第二个真实样本与第一个的 systemHash、toolsHash 相同，差别是历史从约 29 KiB 增长到约 127 KiB，上一轮环境争论也进入历史。第二轮耗时 293.6 秒、输出 17,432 token，再次调用 pwd/uname 确认环境；这些统计不能全部解释为环境冲突造成的浪费。

`GATEWAY_EXPERIMENT_CLIENT_ENV=1` 仅用于 GLM API Key 实验，当前限定已验证的 CLI 2.1.316。每轮创建一个带随机令牌的回环 HTTP 适配器，转发到固定智谱入口；没有读取、提取或转发 Claude OAuth。订阅路径不启用此功能。

适配器只匹配 CLI 自行追加的独立 system 环境块，并验证工作目录恰好是本轮云端 cwd、平台为 Linux、git 状态为 false。只移除五项云端机器事实（cwd、git、平台、Shell、OS）及本块自动追加的重复模型声明，保留其下载文件规则、日期和其他内容；客户端系统指令、历史、工具参数/回执以及 GLM 响应不改写。缺失、重复、格式变化会显式报错，不静默扩大匹配范围。此方案让原客户端环境成为唯一工具环境来源，不伪造 Windows 工作目录，也不假装已经解决所有模型身份指令冲突。

详细日志和普通元数据日志增加 `cli_environment_adjusted`，只记移除字段数、前后字节数与哈希。响应 SSE、429 等上游状态和取消信号保持传递。适配器在请求结束/取消时关闭；CLI 原二进制不修改。

模拟验收入口：`node model-gateway/prompt-environment-probe.mjs --self-test --client-environment --output=/独立目录`。它使用真实 CLI 与合成输入，检查最终请求不含云端 cwd，历史和规则保持完整，并验证工具调用及续接。


修正后的真实 CLI 模拟上游验收：standard/minimal 各测试工具调用与续接，共四次，最终请求均无云端 cwd。GLM 候选服务另外通过文本、工具及续接三轮；初始 Windows 目录与会话内目录更新两例均只返回一次正确的 Read（offset=1、limit=3），没有发起环境探查命令。两个短任务不能用于量化此前复杂审计任务的 token 浪费。

适配器保留实际 CLI 的 User-Agent，只替换出口认证；未知 CLI 版本在服务启动时拒绝启用修正。回环入口不监听公网，取消时关闭正在进行的上游请求。


### 2.1.1 上线验收

2026-11-02 已将现有 GLM 实验入口切换到 `/home/harness/experiments/glm-env-a89103c`，启用 `GATEWAY_EXPERIMENT_CLIENT_ENV=1`。上线后初始目录和动态更新目录各一次真实 GLM 请求，均返回正确 Windows 路径的单次 Read；日志均记录移除五个机器字段和一个自动模型声明。服务依旧使用原 18796 端口、最小头、直接注册工具及有容量限制的详细日志。

可回退到上一版 GLM 的脚本位于 `/home/harness/experiments/client-env-release-a89103c/rollback.py`；回到原 Claude 部署的既有脚本仍有效。二者均检查空闲状态。旧对话历史中的环境争论没有被擦除，验证新行为应优先使用新会话。Claude 订阅路径尚未应用此修正。

第二次现象没有新增系统/工具定义：systemHash、toolsHash 相同，工具仍为 194 个；历史由 25 条变成 32 条，字节数由 29,452 增至 129,738，运行状态快照由 5 次变成 6 次。后续另一个无完成用量的请求明确记录为 cancelled，不是 refusal。

最终本地测试 449 项：446 通过、3 跳过、0 失败。真实 CLI 的四次最终版本合成协议测试全部通过；候选 GLM 文本/工具/续接及 Windows 目录测试通过。所有合成工具测试均未写入实际 Windows 工作文件。

## 自动更新停用与附加消息复核（2026-11-02）

按用户要求，现有 VPS 的 CLI 固定在 2.1.316，不再按实验结束时间自动恢复更新。`velella-cli-update.timer` 为 disabled / inactive；timer 和对应 service 都增加 `90-owner-disabled.conf`，以 `ConditionPathExists=!/etc/unbundle/cli-auto-update.disabled` 阻止启动。CLI 子进程原有的 `DISABLE_AUTOUPDATER=1` 继续生效。`systemd-analyze condition` 已验证禁用条件不满足；没有执行更新程序、重启网关或改动官方 CLI 二进制。

原 Claude 回滚记录和上一版 GLM 的回滚快照均已更新为不恢复定时器。部署配置哈希保持有效。策略备份在 VPS `/home/harness/experiments/cli-update-disabled-20261102`。以后只有用户明确要求升级时，才移除标记及对应条件、重新启用更新；这是当前 VPS 的运行策略，不改变新安装的默认行为。

### 本次复核的实际范围

检查了当前 2.1.316 二进制的环境完整块、环境增量、额外目录、worktree、scratchpad、模型附件以及语言和输出风格路径。当前网关逐轮启动 CLI，客户端历史序列化后传入；没有复用云端原生会话，也没有传入云端 `--add-dir` / worktree 参数。运行环境采用允许列表，设置来源禁用。因此，客户端目录变化不等于云端 CLI 的 cwd 变化，客户端 worktree 描述也不会直接启用云端 worktree。

使用实际部署代码、固定 CLI、独立临时 HOME 和回环模拟上游，完成五组工具调用及续接，共十次合成请求，未调用真实模型：

| 场景 | 结果 |
| --- | --- |
| 初始 Windows 目录 | 客户端指令完整，CLI 云端字段已移除 |
| 客户端目录更新 | 新目录指令及其顺序完整保留 |
| 客户端 worktree 和额外目录 | 客户端描述完整，没有新增云端目录 |
| 客户端临时目录 | 客户端路径完整，没有新增云端 scratchpad |
| 客户端语言和输出风格更新 | 指令完整，没有新增云端语言或风格块 |

每组续接还传入含 `# Environment update`、Linux 与假临时目录的合成文件回执，验证这些普通文件内容不会被适配器删除。验收检查最终生成的独立 system 消息，不以模型自述作为结论。模拟上游预设工具调用，因此这些结果证明转换和保留行为，不能证明 GLM 自主选择工具和路径必然正确。

报告保存在 VPS `/home/harness/experiments/attachment-audit-20261102/results.json`，只含合成内容。另有十八项针对适配器、上下文和运行状态的本地测试通过，涵盖 SSE、429/Retry-After、计数接口、鉴权及请求取消。本次未发现当前启用路径中的新协议故障，未扩大环境字段删除范围。

未启用的云端额外目录、scratchpad、原生长会话环境增量，仍不属于当前精确环境修正契约；本次没有通过修改 CLI 参数强行启用这些功能，也没有声称覆盖这些配置。若以后启用，先捕获最终请求，再单独扩展验收。

### 桌面版真实行为复测

保持现有入口，在新的 Claude Code 桌面会话执行以下正常任务，不要求模型解释自身身份或云端架构：

1. 只读取当前项目一个已有长文件的十行，报告文件路径和简短摘要；观察是否额外反复探查系统。
2. 在同一会话明确给出另一个已有文件的绝对路径，只读取前三行；观察工具参数是否准确跟随路径变化。这验证客户端路径指令，不冒充修改了云端 cwd。
3. 在项目下新建专用诊断文件，先检查路径不存在，再创建内容 `probe_value=0`；随后 Read 前一行、Edit 为 `probe_value=1`，编辑成功直接报告。仅清理本次新建的文件。已有诊断文件不得覆盖。

真实复测时按请求日志核对 `cli_environment_adjusted`、工具参数、工具回执、重复调用和实际回复；不能单靠探测命令输出或模型说“环境正常”判定全部上下文正常。详细日志原有的容量、数量与过期限制继续生效。

## 切回 Claude，保留实验分支（2026-11-02）

按用户要求，现有入口已从 GLM 切回 Claude，继续运行 `experiment/client-environment` 的代码；没有退回 dev/main 的旧程序。运行目录仍为 `/home/harness/experiments/glm-env-a89103c`，目录名称保留历史命名，实际 `upstreamProvider=claude`。该代码与切换时分支 HEAD `fa1c219` 相同，两者差异仅为实验文档。

保留 minimal 提示词、直接工具注册（ToolSearch 关闭）、逐轮 CLI 和摘要诊断日志。关闭 GLM 专用机器环境修正及详细正文日志；GLM 密钥文件不再配置到该服务。**这次切换不代表环境修正已迁移到 Claude：订阅路径没有启用 GLM 回环适配器，CLI 自动附加的云端环境说明仍可能出现。** OAuth 认证继续由官方 CLI 管理，没有读取、复制或导出认证文件。

验收确认 `loggedIn=true`、`checked=true`，模型映射恢复为 Sonnet/Opus 5.5 的 `[1m]` 上游与 Haiku 5.5，`/v1/models` 正常，CLI 仍为 2.1.316。没有发起真实模型请求，桌面实际推理待用户验证。自动更新定时器保持 disabled / inactive，持久禁用条件继续有效。

本次切换备份及返回 GLM 的脚本位于 VPS `/home/harness/experiments/claude-branch-switch-fa1c219/`。`rollback.py` 先检查空闲和当前配置哈希，返回 GLM 后仍保持自动更新关闭。原始部署回滚记录也已同步更新当前配置哈希。未创建 PR，未合并 dev/main。

## 原生 CLI 环境渲染补丁（2.1.2，2026-11-04）

用户明确允许修改客户端代码后，实验增加独立的 CLI 本地修改版，不再通过 HTTP 代理修改已发送的请求。原版固定为 Linux x64 Claude Code 2.1.316，源 SHA256 为 `fd13c70000fec3f2116dfbcbb6121210b4a29328bf0e46210a59dd594a67d824`。

`deploy/patch-cli-environment.py` 只接受这个原版哈希，在新目录中生成 `claude-client-env` 和独立 `cli-release.json`。补丁只替换完整环境块的机器文本渲染函数，并失效该模块的预编译字节码和源码缓存，使它重新解析源代码。原始二进制其他字节不变。修改后的 SHA256 固定为 `789024e17d7b10262628ae7bd92824fcb32bb2478d0d6558af5b45f6de2665aa`。仓库只保存补丁工具，不保存 CLI 二进制。

最初仅修改 JavaScript 文本的候选可以启动，但请求仍含原始环境，模拟上游验收因此失败。失效对应模块缓存后，最终请求中移除了云端 cwd、Git 状态、额外目录、平台、Shell、系统版本和 scratchpad 路径。worktree 安全提醒、下载文件规则、代理和 gh 提示的原有条件保留；模型身份和日期继续由 CLI 生成。客户端指令、历史、工具定义及回执不修改。

补丁没有改认证、端点选择、请求头、cch、拒绝处理或响应解析代码，没有读取认证文件，也没有接入 HTTP 中间代理。**这是本地修改版 CLI，官方签名只适用于原版文件；不能声称修改后的二进制仍有官方签名或保证服务端接受。** 日常登录、刷新和请求发送仍由这个 CLI 的现有逻辑处理。

### 启动与验收边界

- 显式设置 `GATEWAY_NATIVE_CLIENT_ENV=1`，将 `CLAUDE_BIN` 和 `GATEWAY_CLI_RELEASE_FILE` 分别指向独立候选和补丁收据。
- 收据和二进制继续由 root 管理，既有启动检查校验完整 SHA256。`/status` 增加 `nativeClientEnvironment`、`cliModified` 和 `cliPatchId`，明确标识补丁。
- 只允许逐轮 Claude 模式，禁止原生会话续接、GLM 上游或叠加 GLM 环境适配器。云端工作区不能包含 `.git`。原生长会话的环境增量渲染不在这次补丁范围内。
- 完整环境块的代理或 gh 提示仍保留；当前部署没有启用这些云端能力，不声称补丁能覆盖所有未来 CLI 配置。
- CLI 自动更新继续停用。换版本必须重新定位并验收，不能沿用偏移或只改版本号。

隔离候选已完成五种客户端环境输入的工具调用与续接，共十次真实 CLI／模拟上游请求：初始目录、目录更新、worktree 与额外目录、临时目录、语言与输出风格；全部通过，未调用模型。工具回执中作为普通文件内容出现的 Linux/Environment 文本完整保留。安全提示保留测试与失败边界测试通过。全量 Node 测试 453 项，450 通过、3 跳过、0 失败，Python 补丁测试 3 项通过。

可重复验收命令：

```bash
GATEWAY_CLI_RELEASE_FILE=/独立候选/cli-release.json node model-gateway/prompt-environment-probe.mjs --self-test --native-client-environment --cli=/独立候选/claude-client-env --output=/独立结果目录
```

该验收只使用临时 HOME、合成内容、虚构认证值和回环模拟上游。正式订阅请求的接受情况和实际桌面行为仍需单独验证，模拟结果不代表账号或服务端保证。

### 2.1.2 实验部署记录

2026-11-05 03:17 UTC（洛杉矶时间 2026-11-04 19:17）已部署到现有实验入口。运行代码提交为 `dc4feaf`，目录为 `/home/harness/experiments/native-env-dc4feaf`；独立修改版 CLI 位于 `/home/harness/experiments/native-cli-dc4feaf/claude-client-env`，补丁收据位于同目录 `cli-release.json`。原版 `/usr/local/bin/velella-claude` 及其指向的 2.1.316 文件保留。

上线及后续只读核对均确认：`upstreamProvider=claude`、`loggedIn=true`、`checked=true`、`nativeClientEnvironment=true`、`cliModified=true`，补丁 ID 为 `unbundle-machine-environment-v1`。继续使用 minimal 提示词、直接工具注册和逐轮 CLI。旧 GLM HTTP 环境适配器关闭；`clientEnvironment=false` 表示该旧适配器关闭，不表示原生补丁关闭。CLI 更新定时器仍为 disabled / inactive，持久禁用标记继续有效。

正式补丁生成后，仓库探针另完成 standard/minimal 各两次合成请求，共四次通过；与前述十次矩阵合计十四次。整个补丁验收与部署没有发起真实模型请求，登录布尔值和模拟上游通过不能代替正式订阅推理验收。

部署结果保存在 VPS `/home/harness/experiments/native-env-release-dc4feaf/result.json`。同目录 `rollback.py` 检查空闲状态和当前配置哈希后，可恢复此次切换前同一实验分支的未修改 CLI 部署，且不重新启用自动更新。

桌面验收应使用新会话，执行源码片段读取、在本机临时目录创建新文件、Read 第一行后 Edit 的工具往返，观察是否仍出现云端 Linux 目录冲突。既有会话中的旧环境文本仍在历史内，不会被补丁删除。此前 Git Bash 经 `wsl ... bash -c` 传递多行脚本损坏是独立问题，本次没有修改 MaiBot 部署脚本。

### 修改版 CLI 的 GLM 实测（2026-11-04 洛杉矶时间）

用户要求先用 GLM 验证后，以隔离测试程序加载线上相同哈希的修改版 CLI，使用临时 HOME 和独立 GLM API Key 直接请求 `glm-5.3`。没有启用旧 HTTP 环境改写适配器，没有改线上服务配置；服务端对原生补丁与 GLM 组合的启动限制仍保留。本次只验证 CLI 与推理引擎，不代表该组合已开放为常驻服务模式。

共七次真实模型请求通过。第一组按顺序完成 Read 源码第 21–30 行、Write 临时摘要、Read 临时文件第一行、Edit 追加标记和最终报告；没有多余回读或 Bash 调用。第二组传入客户端工作目录更新，模型正确读取 `D:\synthetic\second\src\probe.py` 前三行并根据回执回答。工具回执来自确定性的合成客户端，不执行真实 Windows 文件操作，因此不替代桌面端到端验收。

CLI 返回事件累计记录输入 7,749 token、输出 1,667 token，缓存读取为零。七次请求均保存实际返回的思考文本、可见回复和工具交接，思考文本共 4,010 字节。预设 gateway/relay/VPS/Windows/Linux/网关/中继/服务器关键词在返回文本和思考文本中均未出现；这只是本轮可见日志的观测，不能保证所有任务都不会产生环境疑问。

七份详细日志合计 30,855 字节，无截断或丢弃；沿用单文件上限 2 MiB、总量 64 MiB、128 份、三天保留窗口的日志写入限制。本次已结束的隔离实验目录作为验收归档保留，不存在后台定时删除保证。日志校验未包含 API Key。VPS 归档为 `/home/harness/experiments/native-glm-live-20261105T032401Z/`，本地脱敏副本为 `.local/diagnostics/environment-experiment/native-glm-live-20261105T032401Z.json`，不进入 Git。

测试后只读检查确认线上仍为 Claude、CLI 2.1.316、原生补丁启用且登录正常。正式 Claude 推理与真实桌面工具执行仍待单独验收。
