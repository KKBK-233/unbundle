# 公开仓库复核

## 已完成

- 只保留“本地 Harness → 加密 frp → 云端网关 → 官方 Claude Code”路线。
- 移除 Goose 桌面客户端、DeepSeek 转发、本地 MCP 回连和桌面会话代码。
- 未复制 `.local`、Node 依赖、证书、私钥、令牌、OAuth 状态和服务器登录信息。
- 示例地址使用 RFC 5737 文档地址 `203.0.113.10`。
- 网关默认只监听回环地址，并限制单请求执行。
- 工具由调用方执行，云端不暴露文件或命令工具。

## 待决定

- 许可证：建议在 MIT 和 Apache-2.0 中选择后再添加 `LICENSE`。
- 项目名为 **Unbundle**，仓库名和包名统一为 `unbundle`；`velella-cloud` provider、服务名和诊断标记保留兼容。`main` 保存程序，`docs` 集中维护说明文档；代码公开不等于已授予开源许可证。
- 项目定位为单用户自部署，不提供多租户、账号池、订阅共享、额度转售或公共中转站支持；当前定位说明不是技术限制或新的许可证条款。
- 是否把部署模板中的 `harness` 用户和 `/home/harness` 路径改成可配置安装前缀。
- 是否补充 Linux 自动安装 Node.js、frp 和官方 Claude Code CLI 的流程。
- 是否支持 OMP 之外的 Harness 配置示例。

## 不应进入仓库

- `.local/` 下全部内容。
- `*.key`、`*.crt`、`*.pem`、Token、API Key、OAuth 文件和 Claude 配置目录。
- 真实服务器 IP、SSH 端口、用户名、主机名和部署日志。
- 原 Goose 仓库及其图标、品牌素材和修改记录。
