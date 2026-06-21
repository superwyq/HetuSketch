# 状态管理设计

## 主进程状态

主进程持有长期服务实例：

- `StorageService`
- `IndexDatabase`
- `IndexService`
- `AiService`
- `FontService`

主进程负责窗口、托盘、全局快捷键、IPC handler、文件系统、SQLite、AI 网络访问。

## 渲染端 Zustand 状态

`src/renderer/src/store/appStore.ts` 使用 Zustand 管理 UI 与能力状态。

| 状态 | 说明 |
| --- | --- |
| `themeMode` | 浅色/深色主题，持久化到 `hetusketch.workbench.theme.v1` |
| `selectedProject` | 当前选中的作品 |
| `searchKeyword` | 全局搜索关键词 |
| `mainPinned` | 主窗口置顶状态 |
| `sidebarFont` / `editorFont` | 功能栏和编辑区字体设置 |
| `systemFonts` | 系统字体列表，最多 300 个 |
| `aiConfig` | AI 公开配置，不包含明文 Key |
| `aiCapabilities` | LLM / Embedding 可用状态 |
| `ragState` | 当前作品向量索引状态 |
| `sidebarRevision` | 侧边栏刷新信号 |
| `tabNameMap` | 条目/章节 ID 到显示标题的映射 |

## localStorage 持久化

工作台布局由 `App.tsx` 持久化到 localStorage：

| Key | 内容 |
| --- | --- |
| `hetusketch.workbench.layout.v1` | 主侧栏、辅侧栏、底部面板尺寸与显隐 |
| `hetusketch.workbench.activity.v1` | 活动栏顺序 |
| `hetusketch.workbench.sidebarView.v1` | 当前侧边栏视图 |
| `hetusketch.workbench.tabs.v1` | 主编辑器 Tab |
| `hetusketch.workbench.secondaryGroups.v1` | 辅助编辑器组 |
| `hetusketch.workbench.sidebarFolders.v1` | 侧边栏文件夹结构 |
| `hetusketch.workbench.fonts.v1` | 字体设置 |

## 当前边界

部分迭代状态仍由渲染端 localStorage 保存，后续应逐步迁移到主进程文件事实源与 SQLite 索引体系。
