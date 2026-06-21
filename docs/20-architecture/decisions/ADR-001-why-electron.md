# ADR-001: 选择 Electron 构建桌面应用

## 状态

已接受（Accepted）

## 背景

HetuSketch 需要支持 Windows 桌面创作场景，包括主窗口、悬浮速查窗口、系统托盘、全局快捷键、本地文件与 SQLite 访问。

## 考虑的选项

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| Electron | 前端生态成熟；支持多窗口、托盘、快捷键；易集成本地 Node 服务 | 包体较大，需关注安全配置 |
| Tauri | 包体小，安全模型强 | Rust 侧开发成本更高，既有 React/Electron 生态复用弱 |
| 纯 Web | 部署简单 | 无法直接满足本地文件、托盘、全局快捷键、悬浮窗需求 |

## 决策

选择 Electron 33 + electron-vite。

理由：

1. 满足本地优先和桌面交互需求。
2. 与 React/TypeScript 技术栈整合成熟。
3. 便于主进程承载文件、SQLite、AI/RAG 服务。

## 后果

- 正面影响：桌面能力完整，开发效率高。
- 负面影响：需要严格配置 `contextIsolation`、`nodeIntegration: false`、`sandbox` 等安全边界。
- 后续跟进：持续关注打包体积、启动性能和跨平台行为差异。
