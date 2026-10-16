# Unbundle

**化整为零，自由组合。单用户自部署，云端推理，本地工具与审批。**

Unbundle 是实验性 CLI 适配器：在自己控制的服务器上运行官方 Claude Code CLI，通过加密隧道连接本地 Harness。本地工作区、工具执行与审批由调用方掌握，云端网关负责推理请求和协议桥接。

## 使用范围

- 每套部署面向同一账号持有人，使用自己的账号和设备；同一用户可以运行并发任务。
- 不提供多租户、账号池、订阅共享、额度转售或公共中转站支持。
- 不提供代管他人登录凭据的功能；官方 CLI 管理自身登录状态，网关不读取或转发 OAuth Token。
- 按上游服务允许的认证方式和使用范围运行，自部署不改变上游的使用规则。

上述内容说明项目支持范围，不是运行时访问限制或新的许可证条款。项目仍处于实验阶段，尚未添加开源许可证。

## 说明文档

安装前请阅读 [完整说明](https://github.com/KKBK-233/unbundle/blob/docs/README.md)，确认环境要求、部署步骤和兼容边界。

`main` 保存程序、配置模板和部署脚本；[docs 分支](https://github.com/KKBK-233/unbundle/tree/docs) 集中维护详细文档。

部署服务名、供应商 ID 和诊断标记沿用原值，以兼容已有安装和配置。

<!-- termiters:research:start -->
## 隐写机制跟踪

由公开逆向报告与本仓库代码对照生成，过滤状态属于静态代码分析，未经真实流量复现。日期与引入版本沿用报告口径；旧版报告不代表当前 CLI 仍生成同类标记。

| 隐写机制 | 过滤状态 | 触发条件 | 发现／引入时间（报告口径） |
| --- | --- | --- | --- |
| 系统提示日期句撇号隐写：按 API 基础 URL 主机分类改写 Today's 中的撇号（普通 '、已知域名 ’、实验室关键词 ʼ、两者皆是 ʹ），把宿主分类位藏进看似正常的英文句子<br>报告分析版本：Claude Code 2.1.196 [报告](https://thereallo.dev/blog/claude-code-prompt-steganography) | 未过滤<br>适配器不解析或改写CLI内部生成的系统提示：engine.mjs把systemPrompt原样写入promptFile交CLI读取，cli-events.mjs仅按事件原样拼接并转发文本。CLI内部生成路径不可见，但网关侧无撇号过滤；若信号出现在网关构造文本或输出文本中，会原样保留。<br>代码：model-gateway/engine.mjs:109、model-gateway/cli-events.mjs:57；提交 d0db277435b6 | 入口是构建 agent 上下文时的日期函数；共同前置条件是设置了 ANTHROPIC&#95;BASE&#95;URL 且主机不是 api.anthropic.com，未设置或官方域名会提前返回使日期保持普通形态。进入后按主机名是否匹配 XOR(密钥 91)+base64 解码出的域名清单、是否包含解码出的 AI 实验室关键词（deepseek/moonshot/minimax 等）选择撇号形态；域名清单混淆与解码函数属该判定的辅助逻辑 | 发现：报告未说明；引入：报告未说明 |
| 系统提示日期分隔符隐写：当系统时区为中国大陆时区时，把日期字符串中的 - 全部替换为 /，在提示正文中承载一个地域/时区标记位<br>报告分析版本：Claude Code 2.1.196 [报告](https://thereallo.dev/blog/claude-code-prompt-steganography) | 未过滤<br>适配器未对日期分隔符做过滤或还原：compileContext生成的systemPrompt直接写入promptFile，CLI内部若把日期中的'-'改为'/'，网关不检查也不改写；cli-events.mjs只原样拼接转发文本。覆盖边界是网关不触及CLI内部系统提示生成路径。<br>代码：model-gateway/engine.mjs:109、model-gateway/cli-events.mjs:57；提交 d0db277435b6 | 需先通过入口（ANTHROPIC&#95;BASE&#95;URL 已设置且主机非官方 api.anthropic.com，否则提前返回），再判断系统时区是否为 Asia/Shanghai 或 Asia/Urumqi；命中则 2026-06-30 被改写为 2026/06/30 | 发现：报告未说明；引入：报告未说明 |

<!-- termiters:research:end -->
