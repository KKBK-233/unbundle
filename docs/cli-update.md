# 云端官方 CLI 自动更新

`velella-cli-update.timer` 开机后约两分钟检查，后续每小时检查官方 latest。每次增加最多两分钟随机延迟。没有新版本或网关繁忙时跳过；不会发送真实模型对话。

首次安装的新管理代码会等网关无推理、无排队且无正在接收的入站体时重启一次加载；后续 CLI 版本切换不重启网关。若部署时仍有请求，管理字段会在下一次空闲维护或正常重启后出现。

更新顺序：官方发布清单签名 → SHA256 → 候选 CLI 版本 → 回环协议模拟 → 空闲检查 → 原子切换链接 → 健康检查。协议模拟覆盖实际 Opus/Sonnet/Haiku 模型 ID、工具往返、图片、动态指令、1h 缓存与十五种强度组合。验收失败保留原版；切换后健康检查失败恢复原链接和验收记录。健康检查核对 CLI 版本及升级前后的登录检查状态，不能仅凭返回 JSON 判定成功。

`/usr/local/bin/velella-claude` 指向 `/usr/local/lib/claude-relay/versions/VERSION`。保留当前、上一版本及仍有进程使用的文件，其他旧版删除。不会原地截断正在使用的二进制，不重启网关。新版本启动后仍可能改变官方内置环境提示；模拟验收只检查同一版本跨轮稳定性，不证明账号策略或计费行为。

安装时把 `deploy/update-cli.py` 复制到 root 管理的 `/usr/local/lib/claude-relay/update-cli.py`。更新服务必须从此处启动，不能以 root 执行服务用户可改写的脚本。创建 `versions` 和 `/usr/local/share/claude-relay` 目录后，将 service/timer 安装为 `velella-cli-update.service` 和 `velella-cli-update.timer`。

首次执行更新器并完成验收后，在网关 systemd 配置中设置：

```ini
[Service]
Environment=GATEWAY_CLI_RELEASE_FILE=/usr/local/share/claude-relay/cli-release.json
```

记录由 root 写入、权限 0644，包含验收版本、二进制哈希及协议版本。网关启动核对记录和实际文件；`/status` 只显示版本。没有验收记录时继续使用内置固定版本校验。请求子进程保留 `DISABLE_AUTOUPDATER=1`，避免绕过验收或积累另一套安装。

```bash
systemctl enable --now velella-cli-update.timer
systemctl start velella-cli-update.service
journalctl --namespace=claude-relay -u velella-cli-update.service -n 20
systemctl list-timers velella-cli-update.timer
```

`python3 /usr/local/lib/claude-relay/update-cli.py --check-only` 只查询是否有新版。更新失败记录阶段和错误类别，不记录提示、工具参数或 OAuth。首次从普通二进制接管后，原有手动 `.rollback` 文件需要由部署者确认不再使用后删除。
