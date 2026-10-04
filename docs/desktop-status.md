# 桌面状态查询

Windows 安装 Python 3 和 OpenSSH 后运行：

```powershell
python deploy/relay-status.py --target root@YOUR_SERVER --identity "$env:USERPROFILE/.ssh/id_rsa"
```

可把这条命令放进桌面的 `.cmd` 文件。窗口显示后按 R 刷新、B 打开官方额度网页、回车退出。`--once` 输出一次后退出；`--limit 10 --hours 24` 控制最近请求范围；`--port` 指定 SSH 端口。

## 数据来源

- **资源**：SSH 读取服务器 CPU 一秒采样、可用内存、Swap、根分区、三个服务状态和网关内存。
- **阶段耗时**：云端 journal 最近 24 小时、最多 5000 行中最后 5 个请求的阶段元数据。未结束仅表示日志尚无结束记录，不能单凭此判定进程仍在运行。
- **长响应进展**：最多每 30 秒在真实事件到达时记录一次，并在结束日志中保存最后快照。展示参数字节数、待完成工具块与已观察重试数；零次重试只表示没有收到相应 CLI 事件，不能排除未上报的回退或重新发送。等待期间没有事件时不会伪造进展。
- **缓存**：本机 `~/.cc-switch/cc-switch.db` 只读查询 `claude-code-*` 模型，以及时间范围内同一应用、同一供应商的请求；这样失败时保留原始模型名的记录也能显示。如果范围内没有映射模型记录，就无法自动识别该供应商。每轮工具调用也会产生请求，不能等同于独立聊天。`input_token_semantics=2` 的分母是未缓存输入 + 缓存读取 + 缓存写入；值为 1 时使用总输入；未知口径、零用量和失败记录不计入加权比例。流式 HTTP 200 不保证推理完成，零用量不能证明没有消耗订阅额度。进行中的请求完成后才进入数据库。
- **订阅额度**：在云端以 harness 用户打开官方 CLI，执行内置 `/usage`，不调用模型，不读取或转发 OAuth 凭据。官方返回加载失败、登录未初始化或界面变化时明确显示不可用，不估算剩余比例。

## 运行边界

沿用部署的 `/home/harness/model-gateway/runtime-home`、`CLAUDE_CONFIG_DIR=/home/harness/state/runtime-home/.claude` 和 `/usr/local/bin/velella-claude`。首次终端使用需完成 CLI 初始化；额度采集目前按 2.1.277 的屏幕阅读器输出匹配。

查询进程单独关闭自动更新、遥测和错误上报，不设置 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`；在当前 CLI 实测中，该总开关会导致 `/usage` 返回加载失败。此设置仅作用于临时查询，不修改网关的生产环境变量。

额度查询临时启动一个 CLI，会额外占用少量 CPU 和内存；报告的资源快照取自启动前。终端查询禁用工具、MCP 和用户设置，仅确认指定运行目录的信任提示。CLI 可能更新自身终端配置；脚本不修改认证、业务代码或服务配置，不重启服务。查询最多等待 28 秒，结束时只清理本次独立进程组，并用锁避免重复启动额度采集。

不会接受未知 SSH 主机指纹或回退密码登录；须先正常配置密钥及 `known_hosts`。数据库与 SSH 任一查询失败，不妨碍其他可用信息显示。

官方命令参考：[Claude Code /usage](https://code.claude.com/docs/en/commands)。网页入口：[Settings → Usage](https://claude.ai/settings/usage)，登录与云端相同的订阅账号。
