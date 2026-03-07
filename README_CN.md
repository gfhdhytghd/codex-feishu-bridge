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
claude-to-im setup
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
claude-to-im start
```

### Codex 用户说明

- `CTI_RUNTIME=codex` 表示强制使用 Codex
- IM 发起的 Codex 会话默认跳过 Git 仓库信任检查
- macOS 下，launchd 会自动转发 `~/.codex/config.toml` 里 `env_key` 指向的第三方 Provider 密钥
- 这意味着你现有的 Codex 第三方 API 配置通常可以直接复用

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

## 命令

在 Codex 或 Claude Code 中可使用：

| 命令 | 用途 |
|---|---|
| `claude-to-im setup` | 配置平台凭据与运行时 |
| `claude-to-im start` | 启动守护进程 |
| `claude-to-im stop` | 停止守护进程 |
| `claude-to-im status` | 查看状态 |
| `claude-to-im logs` | 查看最近日志 |
| `claude-to-im logs 200` | 查看更多日志 |
| `claude-to-im reconfigure` | 修改已有配置 |
| `claude-to-im doctor` | 运行诊断 |

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
CTI_DEFAULT_WORKDIR=/Users/yourname/project
CTI_DEFAULT_MODE=code
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
