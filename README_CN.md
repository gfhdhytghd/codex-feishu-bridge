# Codex-Claude-to-IM Skill

把 Codex 或 Claude Code 桥接到 Telegram、Discord、飞书/Lark，让你直接在 IM 里和本地编程代理协作。

[English](README.md)

这个仓库包含完整可发布的 Skill 内容：

- `SKILL.md` 技能定义
- `src/` 完整源码
- `scripts/` 平台脚本
- `references/` 配置与排障说明
- 测试、构建配置和安装脚本

## 这个 Skill 能做什么

它会启动一个后台守护进程，把 IM 消息转发到 Codex 或 Claude Code，再把响应、工具调用、权限请求和执行结果发回聊天。

```text
Telegram / Discord / 飞书
        <-> 机器人适配层
        <-> 后台守护进程
        <-> Codex SDK 或 Claude Agent SDK
        <-> 你的本地工作区
```

主要能力：

- 支持 Telegram、Discord、飞书/Lark
- 支持 `codex`、`claude`、`auto` 三种运行模式
- 在聊天里确认工具权限
- 守护进程重启后会话仍可恢复
- 响应和执行过程可流式返回
- 日志自动脱敏
- 支持 setup、start、stop、status、logs、reconfigure、doctor 全套运维命令
- 在 macOS 的 launchd 模式下，自动复用 `~/.codex/config.toml` 中 `env_key` 定义的第三方 Provider 密钥

## 仓库结构

```text
.
├── SKILL.md
├── README.md
├── README_CN.md
├── config.env.example
├── references/
├── scripts/
├── src/
├── package.json
└── tsconfig.json
```

## 前置要求

- Node.js 20+
- 至少一种运行时：
  - `CTI_RUNTIME=codex` 或 `auto` 时需要 Codex CLI
  - `CTI_RUNTIME=claude` 或 `auto` 时需要 Claude Code CLI
- 至少一个 IM 平台的机器人凭据

常见可选项：

- 已经可用的 Codex 登录状态，或 `~/.codex/config.toml` 中的 API Provider 配置
- `OPENAI_API_KEY`、`CODEX_API_KEY`，或者你自定义 Provider 所需的环境变量

## 安装方式

### 方式 1：安装到 Codex

先把仓库克隆到任意目录：

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/code/Codex-Claude-to-IM-skill
```

然后安装到 Codex skills 目录：

```bash
bash ~/code/Codex-Claude-to-IM-skill/scripts/install-codex.sh
```

如果你要边改边用，可以用软链接模式：

```bash
bash ~/code/Codex-Claude-to-IM-skill/scripts/install-codex.sh --link
```

安装目标目录是：

```bash
~/.codex/skills/claude-to-im
```

### 方式 2：安装到 Claude Code

直接克隆到 Claude skills 目录：

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/.claude/skills/claude-to-im
cd ~/.claude/skills/claude-to-im
npm install
npm run build
```

### 方式 3：手动安装到 Codex

```bash
git clone https://github.com/viewer12/Codex-Claude-to-IM-skill.git ~/.codex/skills/claude-to-im
cd ~/.codex/skills/claude-to-im
npm install
npm run build
```

## 快速开始

### 1. 配置

在 Codex 或 Claude Code 里执行：

```text
claude-to-im setup
```

在 Claude Code 中也可以用 slash command：

```text
/claude-to-im setup
```

如果当前环境不支持交互式配置，就手动创建：

```bash
~/.claude-to-im/config.env
```

模板在：

```bash
config.env.example
```

### 2. 启动桥接

```text
claude-to-im start
```

### 3. 给机器人发消息

守护进程启动后，直接去 Telegram、Discord 或飞书给机器人发消息。桥接会自动创建或恢复代理会话，并把结果回传到聊天。

## 可用命令

在 Codex 或 Claude Code 中可使用：

| 命令 | 用途 |
|---|---|
| `claude-to-im setup` | 配置平台凭据与运行时 |
| `claude-to-im start` | 启动后台守护进程 |
| `claude-to-im stop` | 停止守护进程 |
| `claude-to-im status` | 查看当前状态 |
| `claude-to-im logs` | 查看最近日志 |
| `claude-to-im logs 200` | 查看更多日志 |
| `claude-to-im reconfigure` | 修改已有配置 |
| `claude-to-im doctor` | 运行诊断 |

## 运行模式

通过 `~/.claude-to-im/config.env` 里的 `CTI_RUNTIME` 控制：

- `codex`：使用 Codex SDK 和 Codex CLI
- `claude`：使用 Claude Agent SDK 和 Claude Code CLI
- `auto`：优先 Claude，失败时回退到 Codex

对 Codex 特别说明：

- IM 会话默认跳过 Git 仓库信任检查
- macOS 下，launchd 启动的守护进程会自动转发 `~/.codex/config.toml` 里 `env_key` 指向的环境变量
- 这意味着第三方 API Provider 可以直接复用你现有的 Codex CLI 配置，不需要再在桥接里重复配置一份

## 最小配置示例

```env
CTI_RUNTIME=codex
CTI_ENABLED_CHANNELS=telegram
CTI_DEFAULT_WORKDIR=/Users/yourname/project
CTI_DEFAULT_MODE=code
CTI_TG_BOT_TOKEN=123456:your_bot_token
CTI_TG_CHAT_ID=123456789
```

完整模板见 [config.env.example](config.env.example)。

## 平台配置概览

### Telegram

1. 用 `@BotFather` 创建机器人
2. 拿到 Bot Token
3. 至少给机器人发一条消息
4. 获取 Chat ID 或 Allowed User IDs

### Discord

1. 在 Discord Developer Portal 创建应用
2. 创建或重置 Bot Token
3. 打开 Message Content Intent
4. 把机器人邀请到服务器
5. 配置允许的用户或频道

### 飞书 / Lark

1. 创建自建应用
2. 获取 App ID 和 App Secret
3. 添加必需权限
4. 启用机器人能力
5. 配置长连接事件
6. 发布应用版本

更详细的分步骤说明见：

- [references/setup-guides.md](references/setup-guides.md)
- [references/troubleshooting.md](references/troubleshooting.md)
- [references/usage.md](references/usage.md)

## 本地开发

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

## 运维与数据目录

守护进程运行数据默认保存在：

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

### 桥接启动了，但 Codex 执行失败

优先检查：

- `bash scripts/doctor.sh`
- 你的 Codex CLI 在终端里是否能直接工作
- Provider 需要的环境变量是否存在于 shell 或 launchd 环境中
- `~/.codex/config.toml` 是否指向了有效的模型提供方

### 终端里的 Codex 正常，但 IM 里不正常

在 macOS 上，如果你刚修改过 Provider 相关环境变量，请重启桥接，让 launchd 重新加载：

```bash
bash scripts/daemon.sh stop
bash scripts/daemon.sh start
```

### 提示没有配置文件

请基于下面的模板创建：

```bash
~/.claude-to-im/config.env
```

模板文件是：

```bash
config.env.example
```

### 查看日志

日志文件：

```bash
~/.claude-to-im/logs/bridge.log
```

## 安全说明

- Bot Token 保存在 `~/.claude-to-im/config.env`
- 建议保持该文件权限为 `600`
- 日志会对常见密钥模式自动脱敏
- 在公开使用机器人前，先确认 allowed users / channels 配置无误

详见 [SECURITY.md](SECURITY.md)。

## 许可证

MIT，见 [LICENSE](LICENSE)。
