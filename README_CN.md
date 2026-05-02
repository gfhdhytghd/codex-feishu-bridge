# Codex-Claude-to-IM Skill

把 Codex 或 Claude Code 桥接到 Telegram、Discord、飞书/Lark，让你直接在 IM 里和本地编程代理协作。

[English](README.md)

> 本仓库派生自 [op7418/Claude-to-IM-skill](https://github.com/op7418/Claude-to-IM-skill)，原项目采用 MIT License 发布。这里保留了原始 MIT 许可证声明，并补充了便于直接复用的打包、文档和兼容性修改。

## 从这里开始

先选你的使用方式：

- **我是 Codex 用户**
  看 [给 Codex 用户](#给-codex-用户)
- **我是 Claude Code 用户**
  看 [给 Claude Code 用户](#给-claude-code-用户)
- **我想看两者差异**
  看 [运行模式](#运行模式)
- **我只想看平台配置**
  看 [平台配置](#平台配置)
- **我要二次开发**
  看 [开发](#开发)

## 仓库包含什么

- `SKILL.md` 技能定义
- `src/` 完整源码
- `scripts/` 运行与安装脚本
- `references/` 配置与排障文档
- 测试、构建和打包配置

## 给 Codex 用户

### 1. 安装

推荐方式：

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/code/Codex-Claude-to-IM-skill
bash ~/code/Codex-Claude-to-IM-skill/scripts/install-codex.sh
```

开发联动模式：

```bash
bash ~/code/Codex-Claude-to-IM-skill/scripts/install-codex.sh --link
```

手动安装：

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/.codex/skills/claude-to-im
cd ~/.codex/skills/claude-to-im
npm install
npm run build
```

### 2. 配置

在 Codex 里执行：

```text
codex-to-im setup
```

如果当前环境不支持交互式配置，就手动创建：

```bash
~/.claude-to-im/config.env
```

模板来自：

```bash
config.env.example
```

### 3. 启动

在 Codex 里执行：

```text
codex-to-im start
```

如果你希望以后普通 `start` 默认就在当前前台 Terminal 会话里运行，而不是后台 supervisor，在 `~/.claude-to-im/config.env` 里加入：

```env
CTI_RUN_MODE=foreground
```

### Codex 用户说明

- `CTI_RUNTIME=codex` 表示强制使用 Codex
- Codex 桥接会话默认开启网络访问；如果你希望 Codex 运行时完全离线，可设置 `CTI_CODEX_NETWORK_ACCESS=false`
- 这个分支里的 Codex 桥接会话默认使用 `CTI_CODEX_SANDBOX_MODE=danger-full-access`，这样在可信个人机器上可以使用浏览器 / AppleScript / 桌面自动化能力
- IM 发起的 Codex 会话默认跳过 Git 仓库信任检查
- macOS 下，默认后台模式会以当前登录用户 `gui/<uid>` 下的 `launchd` LaunchAgent 运行，所以通常仍处于桌面图形会话里
- macOS 下，launchd 会自动转发 `~/.codex/config.toml` 里 `env_key` 指向的第三方 Provider 密钥
- 这意味着你现有的 Codex 第三方 API 配置通常可以直接复用

### Codex 运行时风险说明

- 这个分支明确偏向“可信个人机器上的易用性”，不是偏向最强隔离。
- `CTI_CODEX_SANDBOX_MODE=danger-full-access` 会让 Telegram 驱动的 Codex 会话拥有较强的本机文件、浏览器、AppleScript 和系统命令访问能力。
- Codex 运行时底层使用的是非交互式 `codex exec`，不是完整交互式 TUI，因此 IM 侧逐工具审批提示并不能被当作稳定可靠的安全边界。
- 启动通知会把主机名、用户名、工作目录等本机运行时信息发到 IM 聊天里，所以只应在你信任的会话或频道中启用 bridge。
- 如果你更看重安全性，请把 `CTI_CODEX_SANDBOX_MODE` 改成 `workspace-write` 或 `read-only`，并且不要把机器人暴露给你自己之外的账号。

## 给 Claude Code 用户

### 1. 安装

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/.claude/skills/claude-to-im
cd ~/.claude/skills/claude-to-im
npm install
npm run build
```

### 2. 配置

在 Claude Code 里执行：

```text
/claude-to-im setup
```

如果当前环境不支持交互式配置，就手动创建：

```bash
~/.claude-to-im/config.env
```

模板来自：

```bash
config.env.example
```

### 3. 启动

在 Claude Code 里执行：

```text
/claude-to-im start
```

## 共享使用流程

配置并启动后：

1. 给 Telegram、Discord 或飞书机器人发消息
2. 守护进程会创建或恢复代理会话
3. 响应内容、工具调用和权限确认会回到聊天里

另外，bridge 每次启动成功后，现在会尽量主动向已知 IM 目标推送一条状态消息。消息里会包含连接状态、设备/主机信息、当前 runtime（`Claude Code` 或 `Codex`）、模型标识、运行模式、已启用通道、PID、run ID 和工作目录，便于你快速确认它到底连到了哪台机器、哪一种终端会话。

当前启动通知的目标来源是：

- 已存在且仍然 active 的 channel binding
- 已配置的 Telegram `CTI_TG_CHAT_ID`
- 已配置的 Discord `CTI_DISCORD_ALLOWED_CHANNELS`

如果某个平台当前还没有可靠的推送目标，bridge 会跳过这条启动通知，不会因此让整个启动失败。

## 命令别名语义

命令前缀会显式决定本次桥接使用哪个 runtime，不取决于你当前正在哪个工具里：

- `codex-to-im ...`：本次命令强制使用 Codex runtime
- `claude-to-im ...`：本次命令强制使用 Claude runtime
- 像 `start bridge` 这种不带前缀的自然语言，继续沿用 `~/.claude-to-im/config.env` 里的 `CTI_RUNTIME`

例如：

```text
codex-to-im start
claude-to-im start
```

这意味着：

- 在 Codex 里执行 `claude-to-im start`，也应该启动 Claude runtime 的桥接
- 在 Claude Code 里执行 `codex-to-im start`，也应该启动 Codex runtime 的桥接

## 工具审批策略

在 `~/.claude-to-im/config.env` 里配置 `CTI_PERMISSION_POLICY`：

- `always`：每次工具调用都需要 IM 审批。这是默认值，兼容旧行为。
- `smart`：桥接会自动放行低风险操作，只在工具或操作看起来敏感时才请求审批。
- `never`：所有工具调用都自动放行。只建议在强信任、强隔离环境里使用。

旧配置里的 `CTI_AUTO_APPROVE=true` 仍然可用，它等价于 `CTI_PERMISSION_POLICY=never`。

示例：

```env
CTI_PERMISSION_POLICY=smart
```

### `smart` 模式规则

当前内置规则如下：

- 自动放行只读工具，例如 `Read`、`Grep`、`Glob`、`LS`
- 只有在目标文件都位于 `CTI_DEFAULT_WORKDIR` 内、且不涉及 `~/.ssh`、`~/.codex`、`~/.claude`、`~/.aws`、`/etc`、shell 配置文件、密钥文件等敏感路径时，才自动放行文件编辑
- 自动放行低风险 shell 查看类命令，例如 `pwd`、`ls`、`rg`、`git status`、`git diff` 和常见本地 test/build 检查命令
- 对明显只是只读抓取的网络请求自动放行，例如不带请求体、不上传本地文件、不携带显式鉴权信息的 `GET` / `HEAD` 请求
- 对发往已接入 IM 平台本身的网络回发自动放行，例如 Telegram / Discord / 飞书消息回传接口；但如果包含明显的本地文件上传，仍会要求审批
- 对会修改文件、调整权限、控制系统、访问受保护 macOS 状态、安装软件、上传本地数据、向外部服务发送带鉴权请求、修改 Git 仓库或远端状态的 shell 命令，强制要求审批
- 对 IM 回发类 MCP 工具和明显只读的 MCP 工具自动放行；其他会改外部状态或用途不明确的 MCP 工具要求审批
- 对 `WebFetch` 只有在带请求体、Cookie、认证信息、自定义请求头或非只读方法时才要求审批

### 运行时说明

- Claude 运行时支持完整的 `smart` 细粒度审批，会按具体工具调用决定是否在 IM 中打断审批。
- Codex 运行时当前在 SDK 里只有会话级审批能力，没有逐工具回调。因此 `smart` 在 Codex 运行时会退化成更保守的审批提示，而不是选择性自动放行。

## 命令

在 Codex 或 Claude Code 中可使用：

| 命令 | 用途 |
|---|---|
| `codex-to-im setup` | 配置桥接，并默认把 runtime 设为 Codex |
| `codex-to-im start` | 以 Codex runtime 启动桥接 |
| `claude-to-im setup` | 配置桥接，并默认把 runtime 设为 Claude |
| `claude-to-im start` | 以 Claude runtime 启动桥接 |
| `codex-to-im stop` / `claude-to-im stop` | 停止当前桥接 |
| `codex-to-im status` / `claude-to-im status` | 查看状态 |
| `codex-to-im logs 200` / `claude-to-im logs 200` | 查看日志 |
| `codex-to-im reconfigure` / `claude-to-im reconfigure` | 修改已有配置 |
| `codex-to-im doctor` / `claude-to-im doctor` | 运行诊断 |

在 macOS 上，默认推荐仍然是普通后台 supervisor，因为这里的后台通常是挂在当前登录用户 GUI 会话下的 `launchd` LaunchAgent，而不是没有桌面权限的系统守护进程。

如果你仍然希望桥接绑定到当前 Terminal 进程，便于调试，或想尽量贴近你手动启动 CLI 的环境，可使用：

```bash
bash scripts/daemon.sh foreground
```

或者：

```bash
bash scripts/daemon.sh start --foreground
```

在 macOS 上，前台模式并不是获取浏览器 / AppleScript / 桌面访问能力的硬性前提。很多情况下，launchd 管理的后台 bridge 也能访问同一个桌面会话。前台模式主要是为了调试方便，或者你明确想避开 launchd。

如果你不想每次都手动带 `--foreground`，可以在 `~/.claude-to-im/config.env` 里设置：

```env
CTI_RUN_MODE=foreground
```

这样之后普通的 `claude-to-im start` 或 `bash scripts/daemon.sh start` 也会直接以前台模式启动。

前台模式的取舍：

- 必须保持那个 Terminal 窗口一直开着，关掉窗口 bridge 就会停止。
- 前台模式仍然适合调试，或者需要精确复现你手动启动 CLI 时的环境时使用。
- 但在 macOS 上，如果普通后台 bridge 已经是 `gui/<uid>` 下的 LaunchAgent，就不必把前台模式当成 Chrome / AppleScript 正常工作的必要条件。

Claude Code 用户也可以使用 slash command 形式：

```text
/claude-to-im setup
/claude-to-im start
/claude-to-im stop
```

## 运行模式

通过 `~/.claude-to-im/config.env` 中的 `CTI_RUNTIME` 设置：

- `codex`：使用 Codex SDK 和 Codex CLI
- `claude`：使用 Claude Agent SDK 和 Claude Code CLI
- `auto`：优先 Claude，失败时回退到 Codex

## 前置要求

- Node.js 20+
- 至少一个运行时已安装：
  - `codex` 或 `auto` 需要 Codex CLI
  - `claude` 或 `auto` 需要 Claude Code CLI
- 至少一个 IM 平台机器人凭据

常见可选项：

- 已经可用的 Codex 登录或 `~/.codex/config.toml` 中的 Provider 配置
- `OPENAI_API_KEY`、`CODEX_API_KEY` 或自定义 Provider 需要的环境变量

## 最小配置示例

```env
CTI_RUNTIME=codex
CTI_ENABLED_CHANNELS=telegram
CTI_DEFAULT_WORKDIR=/Users/yourname
CTI_DEFAULT_MODE=code
CTI_RUN_MODE=background
CTI_PERMISSION_POLICY=smart
CTI_TG_BOT_TOKEN=123456:your_bot_token
CTI_TG_CHAT_ID=123456789
```

完整模板：

- [config.env.example](config.env.example)

## 平台配置

### Telegram

1. 用 `@BotFather` 创建机器人
2. 复制 Bot Token
3. 至少给机器人发一条消息
4. 获取 Chat ID 或 Allowed User IDs

### Discord

1. 在 Discord Developer Portal 创建应用
2. 创建或重置 Bot Token
3. 打开 Message Content Intent
4. 邀请机器人进服务器
5. 配置允许的用户或频道

### 飞书 / Lark

1. 创建自建应用
2. 获取 App ID 和 App Secret
3. 添加必需权限
4. 启用机器人能力
5. 配置长连接事件
6. 发布应用版本

详细说明：

- [references/setup-guides.md](references/setup-guides.md)
- [references/usage.md](references/usage.md)
- [references/troubleshooting.md](references/troubleshooting.md)

## 运维

运行数据默认在：

```text
~/.claude-to-im/
├── config.env
├── data/
├── logs/bridge.log
└── runtime/status.json
```

常用命令：

```bash
bash scripts/daemon.sh status
bash scripts/daemon.sh logs 100
bash scripts/doctor.sh
```

## 故障排查

### 终端里的 Codex 正常，但 IM 里不正常

重启桥接，让服务重新加载环境变量：

```bash
bash scripts/daemon.sh stop
bash scripts/daemon.sh start
```

### 桥接启动了，但代理请求失败

优先检查：

- `bash scripts/doctor.sh`
- 运行时 CLI 在终端是否正常
- Provider 需要的环境变量是否存在
- `~/.codex/config.toml` 或 Claude 登录状态是否有效

### 提示没有配置文件

请创建：

```bash
~/.claude-to-im/config.env
```

模板来自：

```bash
config.env.example
```

### 查看日志

```bash
~/.claude-to-im/logs/bridge.log
```

## 开发

安装依赖：

```bash
npm install
```

运行测试：

```bash
npm test
```

构建：

```bash
npm run build
```

开发模式运行：

```bash
npm run dev
```

## 上游与许可证

原始上游项目：

- [op7418/Claude-to-IM-skill](https://github.com/op7418/Claude-to-IM-skill)

本仓库是在该 MIT 项目的基础上进行再分发和修改。原始版权声明和许可证文本保留在 [LICENSE](LICENSE) 中，同时补充了本仓库修改部分的版权声明。

安全相关：

- Bot Token 存在 `~/.claude-to-im/config.env`
- 建议该文件权限保持为 `600`
- 日志会对常见密钥模式自动脱敏

详见：

- [SECURITY.md](SECURITY.md)
- [LICENSE](LICENSE)
