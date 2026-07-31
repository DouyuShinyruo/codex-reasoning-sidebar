# reasoning-sidebar

Codex 实时思维链侧边栏插件：在 Codex 内置浏览器侧边栏中流式显示当前窗口的思考过程。

## 功能

- 自动跟随最近活动的 Codex 会话，切换窗口自动切换数据源
- 打字机式流式显示思维链
- 支持过滤：思考 / 回复 / 工具调用 / 用户消息
- 支持暂停与清空，点击正文可立即显示全文
- 内置去重，避免同一思考被会话文件双写导致重复显示
- 纯本地读取会话文件，不调用 API，不产生额外费用

## 安装

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

安装完成后新开一个 Codex 窗口，说"打开思维链侧边栏"即可。

## 使用

1. 启动服务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\start-reasoning-sidebar.ps1
```

2. 在 Codex 内置浏览器打开 `http://127.0.0.1:8792/`

3. 停止服务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop-reasoning-sidebar.ps1
```

注意：必须通过 HTTP 访问，直接打开本地 HTML 文件时无法使用实时推送。

## 目录结构

```text
reasoning-sidebar-plugin/
├── .codex-plugin/plugin.json   # 插件清单
├── skills/reasoning-sidebar/   # Codex skill 说明
├── public/index.html           # 侧边栏页面
├── server.mjs                  # HTTP + SSE 服务
├── install.ps1                 # 安装脚本
├── start-reasoning-sidebar.ps1 # 启动脚本
└── stop-reasoning-sidebar.ps1  # 停止脚本
```
