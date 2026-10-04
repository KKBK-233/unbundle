# 云服务器迁移

安装脚本支持启用 firewalld 的 openEuler 和启用 UFW 的 Ubuntu。没有运行中的受支持防火墙时，脚本提示手动放行 frps 端口，不自动启用防火墙。

## 顺序

1. 检查目标机器的 CPU 架构、内存、磁盘和端口占用。首次安装可用已验收基线 2.1.280；运行后启用 [CLI 自动更新](cli-update.md)。旧版 2.1.277 的协议模拟通过，但上游已拒绝其访问 Opus 5.5，因此不再长期固定版本。
2. 创建独立的 `harness` 服务账户。部署代码、Node、CLI 和 frp；不复制旧 Claude 认证目录。
3. 通过 SSH 传输网关令牌、frp 令牌、STCP 密钥及运行所需证书。CA 私钥留在本地；这些文件不得提交 Git、写入日志或发到聊天。
4. 保持模型网关只监听 `127.0.0.1:18796`。公网仅放行配置中的 frps TCP 端口；继续使用双向 TLS 和加密 STCP。
5. 在新机运行本地模拟上游探针，核对工具往返、缓存断点和输出上限。检查公网 TLS 隧道的 `/v1/models` 和 `/status`。
6. 备份本地配置，修改 `.local/cloud.json` 的 SSH 信息和 `visitor.toml` 的 `serverAddr`。重启本次模型隧道，确认请求到达新机，再停用旧网关与发布端。
7. 在新机执行 `bash /home/harness/app/deploy/model-login.sh`，由用户在浏览器完成官方登录。登录成功与账号通过身份验证是两个状态；收到验证要求后由账号持有人继续官方流程。

## 独立中继与 VLESS 外层

`cloud.json` 的 `host` 是推理机，`frpHost` 可指定另一台 frps 中继。两端 frpc 通过 VLESS 接入时，设置 `frpProxyURL` 为本机 SOCKS 地址，例如 `socks5://127.0.0.1:18470`；frpc 请求中继回环的 `127.0.0.1:18469`，frps 同样只监听回环。两端的 SOCKS 出站必须明确路由到该 frps 所在机器，不能让私有地址绕过 VLESS 直连。

复用已有 VLESS 服务端、frp 证书/令牌/STCP 密钥，以及云端已有 sing-box 二进制。客户端配置只需 UUID、服务端公钥和连接参数，服务端私钥留在中继机；Claude OAuth 仍通过新机官方登录生成。双向 TLS、STCP 载荷加密和网关独立鉴权保持开启。

新机安装 `model-vless.service` 时核对 `ExecStart` 的现有二进制路径，并为 frpc 增加该服务的启动依赖。代理路径下客户端与服务端均关闭 `transport.tcpMux`，两端必须一致；控制与工作连接分开建立。Windows `cloud.json` 可设置 `vlessBin`、`vlessConfig`，由原有 `start-local-frp.ps1` 同时维护两进程；不会修改用户其他 VPN 的配置。桌面状态查询增加 `--relay USER@RELAY` 即可通过中继 SSH 查询推理机，不复制 SSH 私钥。

`cloud.json` 设置 `sshRelay`、`user`、`identity` 和 `sshPort` 后，可从 Windows 运行 `deploy/model-login.ps1`，通过中继打开推理机上的官方登录。用户在自己的浏览器授权；网关从认证状态布尔值检查完成情况。

磁盘较小时删除本次已校验的安装包。请求子进程仍关闭自行更新，由独立更新器校验、验收并管理版本清理；保留当前、上一版本和仍有进程使用的旧版。使用独立服务日志空间限制，防止阶段日志长期占满磁盘。服务器只保存会话所需配置和元数据，模型请求临时文件仍在正常结束时清理。提示和工具保持稳定顺序，传输配置变化不参与提示词。

本次部署为三个新服务设置 `LogNamespace=claude-relay`，独立 journald 上限 128 MiB、最长保存 7 天；用 `journalctl --namespace=claude-relay -u velella-model-gateway` 查看。桌面脚本自动读取服务的日志命名空间，原有默认空间部署仍可查询。

## 小内存机器

1 核、1 GiB 可先做单会话验证，但必须实测 Claude 子进程峰值。交换空间只能缓冲内存压力，不能代替物理内存；服务空闲内存不代表长上下文推理期间的峰值。不要在这类机器上增加并发。

服务器时区按运维需要选择；IP 地理库只能提供估计位置，不能确定用户工作地点，也不能证明身份验证会通过。

旧机停用服务后保留代码和凭据文件供核对；删除文件、撤销登录及关闭整台服务器分别处理，避免影响同机其他服务。
