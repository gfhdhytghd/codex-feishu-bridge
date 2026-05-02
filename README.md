# Codex 飞书桥

把本机 Codex 接入飞书，让你可以在飞书会话里远程驱动 Codex 处理代码、查看日志、运行命令和交付文件。

本项目当前面向一个明确场景：**Codex + 飞书/Lark**。文档不再覆盖其他运行时或其他 IM 平台。

> 说明：项目派生自上游 MIT 项目，仓库内部仍可能保留少量兼容旧配置的变量名或目录名，例如 `~/.claude-to-im/`。这些属于历史兼容路径，不代表当前对外支持其他运行时。

## 配置指南

### 前置要求

- Node.js 20+
- 已安装并登录 Codex CLI
- 一个飞书或 Lark 自建应用
- 当前机器可以访问飞书开放平台

Codex 登录可用以下任一方式完成：

```bash
codex auth login
```

或在环境变量中提供 `OPENAI_API_KEY`、`CODEX_API_KEY`、`CTI_CODEX_API_KEY` 等凭据。

### 安装

推荐安装：

```bash
git clone https://github.com/viewer12/codex-feishu-bridge.git ~/code/codex-feishu-bridge
bash ~/code/codex-feishu-bridge/scripts/install-codex.sh
```

开发联动模式：

```bash
bash ~/code/codex-feishu-bridge/scripts/install-codex.sh --link
```

手动安装：

```bash
git clone https://github.com/viewer12/codex-feishu-bridge.git ~/.codex/skills/codex-to-im
cd ~/.codex/skills/codex-to-im
npm install
npm run build
```

如果你仍在旧路径 `~/.codex/skills/claude-to-im` 中使用本项目，也可以继续运行；新文档统一使用 `codex-feishu-bridge` 命名。

### 创建飞书应用

1. 打开飞书开放平台：`https://open.feishu.cn/app`
2. 创建自建应用
3. 在“凭证与基础信息”中复制 `App ID` 和 `App Secret`
4. 进入“权限管理”，添加消息收发、机器人、文件读写等权限
5. 进入“添加应用能力”，启用机器人
6. 进入“事件与回调”，选择长连接模式
7. 添加事件：`im.message.receive_v1`、`p2p_chat_create`
8. 创建版本并发布，确保应用已被管理员审核通过

权限批量配置和更细步骤见 [references/setup-guides.md](references/setup-guides.md) 的飞书部分。

### 配置本机

在 Codex 中执行：

```text
codex-to-im setup
```

如果当前环境不支持交互式配置，手动创建：

```bash
~/.claude-to-im/config.env
```

最小配置示例：

```env
CTI_RUNTIME=codex
CTI_ENABLED_CHANNELS=feishu
CTI_DEFAULT_WORKDIR=/Users/yourname
CTI_DEFAULT_MODE=code
CTI_RUN_MODE=background
CTI_PERMISSION_POLICY=smart

CTI_FEISHU_APP_ID=cli_xxxxxxxxxxxxx
CTI_FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CTI_FEISHU_DOMAIN=https://open.feishu.cn
CTI_FEISHU_ALLOWED_USERS=

CTI_CODEX_NETWORK_ACCESS=true
CTI_CODEX_SANDBOX_MODE=danger-full-access
```

完整模板见 [config.env.example](config.env.example)。

### 启动

在 Codex 中执行：

```text
codex-to-im start
```

也可以直接运行脚本：

```bash
bash scripts/daemon.sh start
```

macOS 默认会通过当前登录用户的 `launchd` LaunchAgent 后台运行，通常仍可访问同一个桌面图形会话。

如果需要前台调试：

```bash
bash scripts/daemon.sh foreground
```

或在配置中设置：

```env
CTI_RUN_MODE=foreground
```

### 验证

启动后，在飞书里给机器人发一条消息，例如：

```text
现在在哪个目录？运行 pwd 看一下
```

如果正常，飞书会收到 Codex 的回复和工具调用状态。

常用检查命令：

```bash
bash scripts/daemon.sh status
bash scripts/daemon.sh logs 100
bash scripts/doctor.sh
```

### 常用命令

| 命令 | 用途 |
|---|---|
| `codex-to-im setup` | 配置 Codex 飞书桥 |
| `codex-to-im start` | 启动桥接 |
| `codex-to-im stop` | 停止桥接 |
| `codex-to-im status` | 查看状态 |
| `codex-to-im logs 200` | 查看最近 200 行日志 |
| `codex-to-im reconfigure` | 修改已有配置 |
| `codex-to-im doctor` | 运行诊断 |

### 常见问题

#### 飞书里没有响应

优先检查：

```bash
bash scripts/doctor.sh
bash scripts/daemon.sh logs 200
```

重点确认：

- 飞书应用版本已发布并通过审核
- 长连接事件已启用
- `im.message.receive_v1` 事件已添加
- `CTI_FEISHU_APP_ID` 和 `CTI_FEISHU_APP_SECRET` 正确
- `CTI_FEISHU_ALLOWED_USERS` 没有误把当前用户排除

#### Codex 在终端正常，飞书里不正常

重启桥接，让后台进程重新读取环境变量：

```bash
bash scripts/daemon.sh stop
bash scripts/daemon.sh start
```

并确认后台进程能读取你的 Codex 登录状态或 API 环境变量。

#### 需要发送文件或图片到当前飞书会话

项目内置了飞书发送辅助脚本：

```bash
node scripts/feishu-send.mjs text "消息内容"
node scripts/feishu-send.mjs file /path/to/file
node scripts/feishu-send.mjs image /path/to/image.png
```

脚本会读取 `~/.claude-to-im/config.env` 和当前飞书会话 binding。

## 技术说明

### 架构

```text
Feishu/Lark
    ↓ 长连接事件
Bridge daemon
    ↓ 会话路由 / 权限策略 / 消息渲染
Codex runtime
    ↓ 工具调用 / 文件读写 / 命令执行
本机项目目录
```

核心组件：

- `src/main.ts`：守护进程入口
- `src/channels/`：飞书通道和消息收发
- `src/runtime/`：Codex 会话调用
- `src/lib/`：配置、权限、状态、日志等共享逻辑
- `scripts/daemon.sh`：启动、停止、状态、日志入口
- `scripts/doctor.sh`：本机诊断
- `scripts/install-codex.sh`：安装到 Codex skills

### 运行数据

运行数据默认保存在：

```text
~/.claude-to-im/
├── config.env
├── data/
├── logs/bridge.log
└── runtime/status.json
```

当前仍使用这个历史目录以兼容已有安装和脚本。不要把 `config.env` 提交到 Git。

### 权限策略

通过 `CTI_PERMISSION_POLICY` 控制工具审批：

- `always`：每次工具调用都要求 IM 审批
- `smart`：低风险只读、工作目录内编辑等操作自动放行，敏感操作要求审批
- `never`：全部自动放行，仅适合强信任环境

Codex runtime 当前主要暴露会话级审批能力，因此 `smart` 会比逐工具审批更保守。

### Codex 运行参数

常用配置：

```env
CTI_CODEX_NETWORK_ACCESS=true
CTI_CODEX_SANDBOX_MODE=danger-full-access
CTI_CODEX_REASONING_EFFORT=
CTI_CODEX_PASS_MODEL=false
CTI_DEFAULT_MODEL=
```

`danger-full-access` 适合可信个人机器上的远程自动化，但会显著降低隔离强度。更保守的选择是：

```env
CTI_CODEX_SANDBOX_MODE=workspace-write
```

或：

```env
CTI_CODEX_SANDBOX_MODE=read-only
```

### 构建与测试

```bash
npm install
npm run build
npm test
npm run typecheck
```

开发模式：

```bash
npm run dev
```

### 安全注意事项

- `~/.claude-to-im/config.env` 应保持 `600` 权限
- 飞书应用只发布给可信用户或可信群聊
- 不要把机器人加入不受控群聊
- `danger-full-access` 会让飞书侧驱动的 Codex 具备较高本机访问能力
- 日志会尽量脱敏，但仍应避免在聊天里直接发送长期有效密钥

更多安全说明见 [SECURITY.md](SECURITY.md)。

### 许可证

本项目基于上游 MIT 项目修改和再分发，原始版权声明和许可证文本保留在 [LICENSE](LICENSE) 中。
