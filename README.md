# Claude Code Relay

**让 OMP 管工具和审批，让 Claude Code 提供推理。**

这是一个独立的本地模型适配器，不依赖 Goose，也不重新实现完整 agent harness。当前使用 Claude Code 调用 DeepSeek，向 OMP 提供有限兼容的 Chat Completions 接口。

> 实验版：不是透明模型 API 代理，不是真正的逐 token 流式输出，也不支持 Claude 套餐登录。真实 DeepSeek Key 的效果尚未验收。

```text
OMP（工作区、工具、审批）
  ↓ HTTP /v1/chat/completions
Claude Code Relay（仅回环监听）
  ↓ 隔离配置的 Claude Code CLI
DeepSeek（推理）
  ↓ 工具调用被截获，不在适配器执行
OMP 执行工具 → 回传结果 → 下一轮推理
```

## 快速开始（Windows）

需要 Node.js 24+、npm、已安装并可启动的 OMP，以及你自己的 DeepSeek API Key。Claude Code 通过锁定版本的 npm 依赖安装，不包含在仓库内；使用它仍须遵守相应提供方的条款。

```powershell
git clone https://github.com/KKBK-233/claude-code-relay.git
cd claude-code-relay
npm ci
npm run import:omp
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\model-gateway\start.ps1
```

启动脚本会隐藏输入 DeepSeek Key；已有 `DEEPSEEK_API_KEY` 时直接使用，不将真实 Key 写入 OMP 配置。保持此终端运行。

在**你要操作的项目目录**另开终端，调用本仓库中的 OMP 启动脚本：

```powershell
# 将路径替换为你实际克隆的位置；不要切换到适配器目录再操作目标项目。
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\path\to\claude-code-relay\model-gateway\omp.ps1
```

OMP 模型名称：`claude-code-relay/claude-code-deepseek`。本机接口：`http://127.0.0.1:18795/v1`。

启动脚本仅为本次 OMP 进程追加 `NO_PROXY=127.0.0.1,localhost`，保留已有值，不修改系统代理或审批配置。退出服务终端即停止服务。

## 配置与迁移

- `npm run import:omp` 在 `~/.omp/agent/models.yml` 中增量新增供应商，并在同目录备份原配置；不会修改默认模型、其他供应商或旧适配器入口。
- 同名入口已存在时，不静默覆盖；本地令牌丢失或不匹配会报错，需要先核对原配置与备份。
- OMP `apiKey` 是随机生成的本地访问令牌，不是 DeepSeek Key。令牌保存在 `.local/model-gateway/token`，不要上传或分享。
- `.local/` 还可能包含 Claude Code 的本地配置、请求状态和集成测试目录，均被 Git 忽略。这种目录隔离**不是操作系统沙箱**，不代表敏感数据完全不落盘。
- 默认模型上游是 `https://api.deepseek.com/anthropic`，模型为 `deepseek-flash`；本项目不迁移云端凭据或启用云端服务。
- `OMP_MODELS_FILE` 可指定导入配置路径；`OMP_CLI` 可指定 OMP 可执行文件；`CLAUDE_CODE_CLI` 可指定 Claude Code 可执行文件。使用自定义配置文件时，需自行确保 OMP 加载同一配置。
- 同一端口不能同时运行新旧适配器；遇到占用请先停止旧服务，不要直接结束不明进程。

## 能力与边界

| 项目 | 当前行为 |
| --- | --- |
| 工具与审批 | OMP 负责；适配器只截获调用并返回 `tool_calls` |
| HTTP 接口 | `GET /v1/models`、`POST /v1/chat/completions` |
| 安全边界 | 仅 `127.0.0.1`、Bearer 认证、拒绝带 Origin 的请求、单活跃请求 |
| 对话历史 | 每次新建 Claude Code 会话，将完整 messages 编码为 JSON 材料；不是原生消息透传 |
| 流式输出 | SSE 等待期间发心跳，一轮结束后返回内容；不是逐 token 输出 |
| 工具调用 | 单次串行调用，支持 `tool_choice: auto/none`；不执行 MCP 工具实际动作 |
| 不支持 | 图片、音频、并行工具、严格结构化输出、Claude 套餐登录、云端推理接入 |
| 计量 | 无准确 token/费用计量，未完整映射 temperature/max_tokens 等参数 |
| 上下文 | 64000 是客户端声明上限，不是实测模型容量 |
| 平台 | Windows 本地验证；其他平台不能因代码有路径分支就视为验收通过 |

客户端项目内容、对话和工具结果将作为推理输入交给 Claude Code/DeepSeek。不要向不受信任的上游提供敏感工作区内容。不同角色的消息经 JSON 包装后，指令层级与长上下文行为可能不同于原生模型 API。

## 验证

```powershell
npm test             # HTTP 与配置导入回归，无需 Key 或 OMP
npm run test:engine  # 真实 Claude Code + 回环模拟模型；无需真实 Key
npm run test:omp     # 真实 OMP + 模拟输出，执行一次只读工具
npm run test:e2e     # 真实 OMP → 真实 Claude Code → OMP 只读工具 → 继续回答
```

后两项需先导入模型、安装 OMP，并确保端口 18795 空闲。测试仅在新建测试目录中使用 `read`；测试子进程设置自动审批，不修改用户的持久审批配置。模型上游始终为回环模拟接口，不消耗 DeepSeek 额度；通过测试不代表真实 DeepSeek 模型表现或生产安全已经验收。

## 目录

- `model-gateway/engine.mjs`：启动 Claude Code，映射与截获 MCP 工具调用。
- `model-gateway/server.mjs`：本地 HTTP/SSE、认证、请求互斥与取消。
- `model-gateway/import-omp.mjs`：备份、增量导入与保留已有配置。
- `model-gateway/config.mjs`：名称、路径和可执行文件定位。
- `model-gateway/start.ps1` / `omp.ps1`：Windows 启动入口。

本项目是非官方适配器，与 Anthropic、DeepSeek、OMP 或 Goose 不存在官方隶属关系。仓库不分发第三方二进制、个人配置、令牌或历史会话。
