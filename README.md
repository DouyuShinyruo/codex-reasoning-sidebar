# codex-reasoning-sidebar

> Codex 实时思维链侧边栏插件：在 Codex 内置浏览器的侧边栏中，流式显示当前窗口的思考过程。

![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue.svg)
![Node](https://img.shields.io/badge/node-18%2B-blue)
![Platform](https://img.shields.io/badge/platform-Windows-blue)

`codex-reasoning-sidebar` 是一个运行在本地的小型 Codex 插件。它监听 Codex 会话文件，把最近活跃会话里的思维链（reasoning）、回复、工具调用和用户消息实时推送到浏览器页面，以打字机效果逐字展示。整个过程只在本机运行，不调用任何云端 API。

## 功能

- 自动跟随最近活跃的 Codex 会话，切换窗口后自动切换数据源（含已加载 idle 会话之间的切换）
- 打开页面即可看到当前会话的最近历史（晚打开的窗口也会自动追补，秒级显示而非逐字回放）
- 悬浮窗模式：无边框、置顶、可拖动的桌面小窗，贴屏幕右缘显示
- 打字机式流式展示思维链，点击正文可立即显示完整内容
- 按类型过滤：思考 / 回复 / 工具调用 / 用户消息（默认全部开启）
- 主题跟随系统（自动 / 浅色 / 深色可手动切换，选择会记住）
- 工具调用索引条：顶栏「调用」开关，点击调用条目跳转并高亮对应位置
- 页内查找：`Ctrl+F` 打开（无可见按钮），`Enter` / `Shift+Enter` 跳转下一个 / 上一个，`Esc` 关闭
  支持三个 VSCode 风格开关：`Aa` 区分大小写（`Alt+C`）、`ab|` 全字匹配（`Alt+W`）、`.*` 正则表达式（`Alt+R`）
- 支持暂停、继续与清空，方便随时回看
- 内置 30 秒去重，避免同一思考因会话文件重复写入而显示多次
- 自动清理过期条目，页面最多保留最近 300 条记录
- 纯本地读取 `%USERPROFILE%\.codex\sessions`，不调用 API、不产生额外费用
- 零第三方依赖，仅使用 Node.js 内置模块，安装简单

## 安装

### 前置要求

- Windows 10 / 11
- Node.js 18 或更高版本
- Codex 桌面版（内置浏览器）

### 安装插件

在插件目录下运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

安装脚本会：

1. 把插件复制到 `%USERPROFILE%\plugins\codex-reasoning-sidebar`
2. 在个人插件市场注册 `codex-reasoning-sidebar`
3. 通过 Codex CLI 安装并启用插件

安装完成后，重新打开一个 Codex 窗口，对 Codex 说“打开思维链侧边栏”即可。

## 使用

### 启动服务

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-codex-reasoning-sidebar.ps1
```

服务默认监听 `http://127.0.0.1:8792`。

### 打开页面

在 Codex 内置浏览器中打开：

```text
http://127.0.0.1:8792/
```

页面顶部会显示当前正在监听的会话 ID。新开 Codex 窗口并开始对话后，侧边栏会自动切换并开始流式展示。

### 悬浮窗模式（可选）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-codex-reasoning-sidebar-float.ps1
```

脚本会自动启动本地服务（若未运行）、安装 Electron 运行时（仅首次，约 130MB，安装在
`%LOCALAPPDATA%\codex-reasoning-sidebar`），然后打开一个无边框、置顶的悬浮窗，默认停靠在屏幕右缘。
悬浮窗与内置浏览器页面使用同一个服务，可以同时开。运行时只需 Node.js，无 Python 依赖。

- 拖动标题栏移动窗口；**四条边和四个角都可以直接拖拽缩放**（原生支持）
- 尺寸与位置自动记住，重启后恢复
- 标题栏图钉按钮控制**是否置顶**（默认置顶，选择会记住）
- 右上角 ✕ 按钮关闭悬浮窗；重复启动会聚焦已有窗口

### 停止服务

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop-codex-reasoning-sidebar.ps1
```

> 注意：必须通过 `http://` 访问页面，直接双击打开本地 `index.html` 无法建立 SSE 实时连接。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8792` | HTTP / SSE 服务端口 |
| `CODEX_HOME` | `%USERPROFILE%\.codex` | Codex 会话文件所在目录 |
| `CODEX_REASONING_URL` | `http://127.0.0.1:8792/` | 悬浮窗加载的页面地址 |
| `REPLAY_TAIL_KB` | `64` | 启动/切换会话时回放的历史长度（KB），`0` 表示回放全部历史 |
| `FOCUS_LOCK_MS` | `30000` | 聚焦 idle 会话后保持跟随的时长（毫秒） |

示例（临时修改端口）：

```powershell
$env:PORT = 9000
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-codex-reasoning-sidebar.ps1
```

修改端口后，浏览器访问 `http://127.0.0.1:9000/`。

## 工作原理

```text
Codex 会话文件（rollout-*.jsonl）
        │ 每秒扫描，按文件实际写入（大小变化）判断活跃会话
        ▼
server.mjs（本地 HTTP + SSE 服务）
        │ 解析 reasoning / assistant / tool / user 事件
        │ 30 秒窗口去重
        │ 从 session_meta 读取会话 ID 与项目名
        ▼
内置浏览器侧边栏 / 悬浮窗（public/index.html）
        │ 打字机流式渲染
        ▼
实时展示当前窗口的思维链
```

服务器只监听 `127.0.0.1`，不会对外网开放。页面通过 Server-Sent Events（SSE）接收实时数据。

## 目录结构

```text
codex-reasoning-sidebar-plugin/
├── .codex-plugin/plugin.json             # Codex 插件清单
├── skills/codex-reasoning-sidebar/       # 插件内置 skill 说明
├── public/index.html            # 侧边栏页面
├── server.mjs                   # 本地 HTTP + SSE 服务
├── float-main.mjs               # 悬浮窗宿主（Electron 主进程）
├── float-preload.cjs            # 悬浮窗 preload（暴露关闭接口）
├── install.ps1                  # 安装脚本
├── start-codex-reasoning-sidebar.ps1     # 启动脚本
├── start-codex-reasoning-sidebar-float.ps1     # 悬浮窗启动脚本
├── stop-codex-reasoning-sidebar.ps1      # 停止脚本
├── README.md                             # 项目说明
├── CHANGELOG.md                          # 更新记录
└── LICENSE                               # GPL-3.0 许可证
```

## 隐私与安全

- 所有数据处理均在本机完成，不上传任何会话内容
- 服务只绑定本机回环地址 `127.0.0.1`
- 项目不读取、不存储浏览器之外的任何用户文件
- 页面仅通过 `localhost` 访问，未使用第三方统计或跟踪服务

## 许可证

本项目使用 [GNU General Public License v3.0](LICENSE)（GPL-3.0）。

- 允许：个人学习、研究、本地使用、修改、非商业分发
- 禁止：未经授权将本项目或其衍生作品用于商业用途
- 商用需求请先联系作者获取授权

## 合规与免责声明

- 本项目是独立开发的第三方工具，与 OpenAI 无隶属关系，未经 OpenAI 官方认可
- “Codex” 等相关名称仅用于描述兼容对象
- 本项目仅供个人学习和本地使用，使用者应遵守所在地区法律法规及 Codex 服务条款
- 项目不包含任何第三方闭源代码；除 Node.js 标准库外无其他运行时依赖

## 常见问题

### 页面显示“连接断开，重连中...”

确认服务已启动，并已通过 `http://127.0.0.1:8792/` 访问页面。

### 看不到新会话的内容

新开 Codex 窗口后，等待几秒让会话文件开始写入；页面会自动切换到最近活跃的会话。

### 端口被占用

通过 `PORT` 环境变量指定其他端口，例如 `PORT=9000`，然后重启服务。

### 内容重复显示

服务器内置了 30 秒去重窗口。若仍出现重复，请确认没有多个服务实例同时运行。

## 更新记录

参见 [CHANGELOG.md](CHANGELOG.md)。
