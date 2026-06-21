# 本地开发指南

## 环境要求

| 项目 | 要求 |
| --- | --- |
| Node.js | 18 或更高 |
| 包管理器 | npm |
| 操作系统 | 当前优先 Windows 10 / 11 |

## 安装依赖

```powershell
npm install
```

## 启动开发环境

```powershell
npm run dev
```

该命令启动 electron-vite 开发环境。主窗口加载工作台，悬浮速查窗加载 `/quick-lookup` 路由。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发运行 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `npm run test` | Vitest 测试 |
| `npm run build` | typecheck + electron-vite build |
| `npm run dist` | 构建 Windows NSIS 安装包 |

## 数据目录

默认数据位于 Electron `userData` 下的 `data/` 目录：

```text
<userData>/data/
├── projects/
├── setting-sets/
├── books/
└── hetusketch-index.sqlite
```
