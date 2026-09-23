# Changelog

## [Unreleased]

### Added

- 悬浮窗模式：`float-sidebar.pyw` / `start-codex-reasoning-sidebar-float.ps1`，无边框置顶可拖动窗口，自动拉起本地服务
- 悬浮窗右下角缩放手柄：拖动调整宽高，尺寸会被记住
- 工具调用索引条与页内查找（`Ctrl+F`）：点击/搜索可定位并高亮对应条目
- 浅色主题：默认跟随系统，可手动切换 自动 / 浅色 / 深色，选择会记住
- 会话信息现在显示项目名 + 短会话 ID（从 `session_meta` 解析）

### Fixed

- 四种消息类型（思考 / 回复 / 工具 / 我）默认全部勾选
- 会话自动跟随改为基于文件实际写入（大小变化）而非仅 mtime，多窗口切换更可靠
- 切换会话时不再从头回放整段历史，只回放最近约 64KB，切换即时生效
- 修正会话 ID 提取错误的问题（此前正则会匹配到时间戳片段）
- 修复停止脚本使用保留变量 `$pid` 导致无法停止服务的问题
- `REPLAY_TAIL_KB` 环境变量：控制启动/切换会话时回放多少历史（默认 64KB，`0` 为全部）

### Changed

- 许可证由 MIT 调整为 Creative Commons Attribution-NonCommercial 4.0 International（非商业使用）`n- 许可证由 CC BY-NC 4.0 调整为 GPL-3.0（GNU General Public License v3）

## [0.1.0] - 2026-07-31

### Added

- 首个正式版本
- 本地 HTTP + SSE 服务，自动跟随最近活跃的 Codex 会话
- 打字机式流式渲染，支持点击正文立即显示全文
- 支持按类型过滤：思考、回复、工具调用、用户消息
- 支持暂停、继续与清空
- 内置 30 秒去重与 300 条记录上限
- 提供 PowerShell 安装、启动、停止脚本
