# 内部 API

内部 API 指主进程服务之间的 TypeScript 调用契约，不直接暴露给渲染端。

## 服务依赖

```text
main/index.ts
└── StorageService
    ├── ProjectFileStore
    ├── BookService
    ├── ChapterService
    ├── SettingSetService
    ├── PlotboardService
    ├── IndexService
    ├── IndexDatabase
    ├── AiService
    └── FontService
```

## 入口服务

`StorageService` 是主进程业务门面。IPC handler 不应越过它直接访问底层数据库或文件服务。

## 事实源 API

| 服务 | 职责 |
| --- | --- |
| `ProjectFileStore` | 项目与条目文件读写、导入导出、路径安全。 |
| `BookService` | 书目 CRUD、设定集绑定。 |
| `ChapterService` | 分卷/章节 CRUD、章节树和字数统计。 |
| `SettingSetService` | 设定集 CRUD。 |
| `PlotboardService` | 画布 JSON、章节状态快照、正文快照、剧情生成、Diff 结算、画布校验和大纲导出。 |

## 剧情画布内部方法

| 服务方法 | 职责 |
| --- | --- |
| `StorageService.createPlotboard(input)` | 创建或返回章节已有画布，并扫描书目索引。 |
| `StorageService.openPlotboard(bookId, chapterId)` | 读取章节画布。 |
| `StorageService.savePlotboard(plotboard)` | 保存画布并扫描书目索引。 |
| `StorageService.saveStateSnapshot(bookId, snapshot)` | 保存状态快照并扫描书目索引。 |
| `StorageService.syncPlotboardIndex(bookId)` | 扫描书目，重建画布和状态快照索引。 |
| `StorageService.exportPlotboardOutline(bookId, chapterId)` | 返回 Markdown 大纲文本。 |
| `StorageService.saveChapterBodySnapshot(bookId, chapterId)` | 保存当前章节正文快照。 |
| `StorageService.writeGeneratedMarkdown(input)` | 写入生成正文并更新章节状态。 |
| `StorageService.buildPlotboardAiContext(input)` | 编译剧情画布生成上下文。 |
| `StorageService.generatePlotboardMarkdown(input)` | 生成 Markdown 和 State Diff。 |
| `StorageService.streamPlotboardGeneration(input)` | 以 AsyncGenerator 形式返回生成 chunk 和最终结果。 |
| `StorageService.settlePlotboardDiffs(input)` | 将确认/修改后的 Diff 写入状态快照。 |
| `StorageService.validatePlotboard(input)` | 执行画布逻辑校验。 |

## 索引 API

| 服务 | 职责 |
| --- | --- |
| `IndexService` | 扫描、监听、同步文件到 SQLite，包含 `.plotboard.json` 和 `.state-snapshot.json`。 |
| `IndexDatabase` | 表结构、FTS5、最近访问、配置、向量块、剧情画布派生索引。 |

## AI API

`AiService` 不应直接暴露给渲染端，所有调用经 `StorageService` 或主进程 IPC 包装。剧情画布由 `PlotboardService` 组装上下文后调用 `AiService.generateText`，失败时在服务内降级。