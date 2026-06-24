# plotboard 数据流程

## 数据来源

| 数据 | 来源 | 用途 |
| --- | --- | --- |
| 当前作品与章节 | `useAppStore.selectedProject`、路由 `?chapter=<chapterId>`、`chapters.listTree` | 打开/创建章节绑定画布，返回章节。 |
| 角色素材 | `entries.list({ type: 'character' })` / `entries.get` | 出场角色绑定、POV、AI 行为约束、红线校验。 |
| 世界观素材 | `entries.list({ type: 'world' })` / `entries.get` | 地点、规则、势力/能力体系绑定和世界规则校验。 |
| 线索素材 | `entries.list({ type: 'plot' })` | 伏笔埋设、强化、回收追踪和 resolved 更新提示。 |
| 章节素材 | `chapters.listTree(bookId)` | 跨章节引用、插叙快照辅助、素材绑定。 |
| 模板素材 | `PlotboardPage.tsx` 内置常量 | 三幕式、推理揭示链、群像交叉线快速插入。 |
| 剧情画布 | `books/<bookId>/plotboards/<chapterId>.plotboard.json` | 卡片、连线、状态模板、视口事实源。 |
| 状态快照 | `books/<bookId>/states/<chapterId>.state-snapshot.json` | L2 章节状态读取和结算写入。 |
| 章节正文 | `books/<bookId>/chapters/<chapterId>.md` | AI 生成写入、重写过期标记、正文校验定位。 |

## 打开与保存流程

```mermaid
sequenceDiagram
  participant U as 用户
  participant Studio as 写作工作台
  participant UI as PlotboardPage
  participant API as window.hetuSketch.plotboards
  participant Main as StorageService / PlotboardService
  participant FS as 本地 JSON/Markdown
  participant DB as SQLite 索引

  U->>Studio: 点击章节“剧情画布”
  Studio->>UI: 跳转 /workspace/plotboard?chapter=<id>
  UI->>API: open(bookId, chapterId)
  alt 文件不存在
    API-->>UI: reject
    UI->>API: create({ bookId, chapterId, projectId })
    Main->>FS: 写入空 Plotboard JSON
    Main->>DB: scanBook(bookId)
  else 文件存在
    Main->>FS: 读取 Plotboard JSON
  end
  UI->>UI: 加载素材、章节树、初始化编辑态
  U->>UI: 编辑卡片/连线/视口/状态增量
  U->>UI: Ctrl+S 或点击保存
  UI->>API: save(plotboard)
  Main->>FS: 写入 <chapterId>.plotboard.json
  Main->>DB: scanBook(bookId)
  Main-->>UI: 保存后的 Plotboard
```

## 素材绑定流程

1. 左侧素材库通过 `entries.list`、`chapters.listTree` 和内置模板加载素材摘要。
2. 用户点击素材：若已选中单卡，则绑定到该卡；否则在默认位置创建带素材引用的新卡。
3. 用户拖拽素材到空白画布：创建带该素材引用的剧情卡。
4. 用户拖拽素材到已有卡片：只追加引用 ID，不复制素材内容。
5. 世界观地理条目或卡片未设地点时，会询问是否同时设为 `locationWorldEntryId`。
6. 线索绑定时要求选择 `setup`、`reinforce` 或 `payoff`，写入 `plotClueUsages` 并调整卡片类型。

## AI 生成与正文写入流程

```mermaid
flowchart TD
  Start[用户选择生成模式并点击生成正文] --> Check{单卡/选区/续写/重写是否选卡?}
  Check -- 否 --> Warn[提示先选择剧情卡]
  Check -- 是 --> Stream[streamGenerate]
  Stream --> Compile[buildAiContext]
  Compile --> Cards[按 timecode / y / x 与 sequence/causal 连线排序]
  Compile --> Materials[读取角色/世界观/线索详情]
  Compile --> States[读取或创建章节状态快照\n读取插叙快照\n收集 L3 sceneDeltas]
  Compile --> AI{LLM 可用?}
  AI -- 是 --> LLM[调用 AiService.generateText]
  AI -- 否 --> Local[本地确定性叙事编译]
  LLM --> Result[markdown + stateDiffs + warnings]
  Local --> Result
  Result --> Write[writeGeneratedMarkdown]
  Write --> Snapshot[保存旧章节正文快照]
  Snapshot --> Chapter[写入章节 Markdown 并置为 drafting]
  Result --> Diff[展示 State Diff 建议]
  Diff --> Settle[用户确认/修改/拒绝后 settleDiffs]
  Settle --> StateFile[仅写入 accepted/modified 到状态快照]
```

## 校验流程

```mermaid
flowchart LR
  UI[点击逻辑校验] --> Request[PlotboardValidationRequest\nbookId/chapterId/markdown?]
  Request --> Load[读取画布、素材、章节树、上一章快照]
  Load --> Timeline[时间线冲突]
  Load --> State[角色状态冲突]
  Load --> Rule[行为红线/世界规则]
  Load --> Plot[伏笔顺序/重复回收]
  Load --> Continuity[章节衔接]
  Request --> Markdown[Markdown 段落索引]
  Timeline --> Result[PlotboardValidationResult]
  State --> Result
  Rule --> Result
  Plot --> Result
  Continuity --> Result
  Markdown --> Result
  Result --> Panel[校验面板、卡片跳转、线索 resolved 提示]
```

## 索引同步时机

| 时机 | 同步内容 |
| --- | --- |
| `plotboards.create` | 创建空画布文件后扫描书目。 |
| `plotboards.save` | 保存剧情卡、连线、视口和状态模板后扫描书目。 |
| `plotboards.saveSnapshot` / `settleDiffs` | 状态快照写入后扫描书目。 |
| `plotboards.syncIndex(bookId)` | 从该书目下所有画布和状态快照文件重建派生索引。 |
| 全局 `index.rebuild(projectId?)` | 同步项目/书目/条目/画布/状态快照等可重建索引。 |

## 失败与降级

- 打开画布失败且文件不存在：渲染端自动调用 `create`。
- 保存画布失败：保留页面内存草稿，提示用户重试。
- 索引同步失败：文件事实源仍可保留；通过 `syncIndex` 或全局重建恢复。
- LLM 未配置或调用失败：生成链路返回 `degraded`，使用本地编译正文，并保留 warning。
- AI/本地生成的 State Diff 不会自动写入快照；用户必须逐条确认、修改或拒绝。
- UI 取消生成：停止展示后续结果，不写入章节；当前主进程生成任务不提供强制中止。