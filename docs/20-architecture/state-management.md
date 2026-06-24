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
| `selectedProject` | 当前选中的作品；剧情画布用它推导 `bookId/projectId`。 |
| `searchKeyword` | 全局搜索关键词 |
| `mainPinned` | 主窗口置顶状态 |
| `sidebarFont` / `editorFont` | 功能栏和编辑区字体设置 |
| `systemFonts` | 系统字体列表，最多 300 个 |
| `aiConfig` | AI 公开配置，不包含明文 Key |
| `aiCapabilities` | LLM / Embedding 可用状态 |
| `ragState` | 当前作品向量索引状态 |
| `sidebarRevision` | 侧边栏刷新信号；剧情画布保存、正文写入、线索 resolved 更新后触发刷新。 |
| `tabNameMap` | 条目/章节 ID 到显示标题的映射 |

## 剧情画布页面会话状态

当前剧情画布未新增独立 Zustand store，`PlotboardPage.tsx` 使用 React state 管理页面内编辑态：

| 状态 | 说明 | 持久化位置 |
| --- | --- | --- |
| `plotboard` | 当前加载的画布副本 | 保存后写入 `books/<bookId>/plotboards/<chapterId>.plotboard.json` |
| `materials` / `chapters` | 素材库和章节列表快照 | 来自 entries/chapters API，不随画布保存 |
| `selectedCardIds` / `selectedLinkId` | 当前选中卡片或连线 | 页面会话态 |
| `past` / `future` | 撤销/重做栈，最多保留约 40 步 | 页面会话态 |
| `dragState` / `panState` / `selectionBox` | 拖拽、平移、框选中的临时状态 | 页面会话态 |
| `linkSourceCardId` | 连线创建起点 | 页面会话态 |
| `dirty` / `saving` | 未保存和保存中状态 | 页面会话态；保存成功后清除 |
| `generationMode` / `generationInstruction` | 当前生成模式和用户说明 | 页面会话态 |
| `generationOutput` / `generationResult` / `pendingDiffs` | 生成正文、结果和待结算 State Diff | 正文写入章节；Diff 经确认后写入状态快照 |
| `validationResult` | 最近一次画布校验结果 | 页面会话态 |
| `highlightCardId` | 校验回跳或因果传播高亮 | 页面会话态 |

## 剧情画布状态分层

| 层级 | 位置 | 示例 | 生命周期 |
| --- | --- | --- | --- |
| 事实状态 | JSON / Markdown | `cards`、`links`、`stateTemplates`、`viewport`、章节正文、状态快照 | 保存后长期存在 |
| 编辑状态 | React state | 选中态、拖拽态、撤销/重做、生成进度、校验面板 | 页面会话内存在 |
| 派生状态 | SQLite / 内存计算 | 剧情卡索引、时间线索引、线索使用索引、冲突数量、因果传播目标 | 可重建 |

## 快捷键与编辑状态

| 快捷键 | 行为 |
| --- | --- |
| `Ctrl+S` / `Cmd+S` | 保存当前剧情画布。 |
| `Ctrl+Z` / `Cmd+Z` | 撤销最近一次画布变更。 |
| `Ctrl+Y` 或 `Ctrl+Shift+Z` | 重做。 |
| `Delete` / `Backspace` | 非输入框焦点下删除选中卡片或连线。 |

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

- 剧情画布编辑态随页面卸载丢失；保存前离开页面需要依赖 UI 的“未保存”提示与用户主动保存。
- 撤销/重做栈只在页面会话内存在，不写入磁盘。
- 部分工作台迭代状态仍由渲染端 localStorage 保存，后续应逐步迁移到主进程文件事实源与 SQLite 索引体系。