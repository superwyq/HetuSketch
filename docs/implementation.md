# HetuSketch 系统实现说明

本文基于当前代码实现编写，用于补充 `docs/architecture.md` 与 `docs/agents.md` 的落地说明，不修改 `.trae/specs` 任务状态。

## 1. 实现范围

当前工程已实现 HetuSketch MVP 的主干闭环：

- Electron 桌面应用基础：主窗口、悬浮速查窗口、系统托盘、全局快捷键、窗口置顶。
- React 渲染端：侧边栏、顶部搜索、Dashboard、作品/条目/校验/设置等页面入口。
- 安全 IPC：渲染端通过 preload 暴露的 `window.hetuSketch` 白名单 API 调用主进程服务，渲染端不直接访问 Node.js、文件系统、SQLite 或 AI Key。
- 本地存储：作品目录与 `project.json`、角色/世界观/伏笔条目文件作为事实数据源。
- SQLite 索引：使用 `better-sqlite3` 建立项目、条目、关系、最近访问、配置、HTTP 工具、向量分块和 FTS5 全文检索表。
- 文件同步：启动扫描、单文件同步、项目重建索引和 chokidar 文件监听。
- 业务能力：作品 CRUD 与导入导出、角色/世界观/伏笔 CRUD、编辑 UI、分类/状态筛选、伏笔一键回收、全局搜索、最近访问、Dashboard 统计、基础规则校验。
- AI/RAG 增强：OpenAI 兼容与 Anthropic 风格配置、API Key 本地加密保存、连接测试、提示词、技能、HTTP 工具配置、Embedding 向量索引、RAG 查询、AI 增强校验、设定补全、伏笔提醒和 RAG 问答降级路径。

## 2. 代码结构

```text
src/
├── main/
│   ├── index.ts                         # Electron 主进程、窗口/托盘/快捷键、IPC handler
│   ├── services/
│   │   ├── storageService.ts             # 业务编排入口：项目、条目、搜索、校验、AI/RAG
│   │   ├── projectFileStore.ts           # 文件事实源读写、导入导出、路径安全
│   │   ├── entrySerialization.ts         # JSON/Markdown 条目序列化与可搜索文本提取
│   │   ├── indexDatabase.ts              # SQLite schema、FTS5、最近访问、配置、向量分块
│   │   ├── indexService.ts               # 启动扫描、文件同步、文件监听
│   │   ├── aiService.ts                  # AI 配置、密钥加密、LLM/Embedding、RAG/Agent 能力
│   │   └── storagePaths.ts               # 本地数据路径和路径边界校验
│   └── test/electronMock.ts              # 测试环境 Electron mock
├── preload/index.ts                      # window.hetuSketch IPC 桥
├── renderer/src/                         # React UI、页面、Zustand 状态
└── shared/
    ├── ipc.ts                            # IPC channel 与渲染端 API 类型
    └── storageTypes.ts                   # 共享数据结构
```

## 3. 运行时架构

```text
Renderer(React)
  ↓ window.hetuSketch 白名单 API
Preload(contextBridge + ipcRenderer.invoke)
  ↓ IPC_CHANNELS
Main Process(ipcMain.handle)
  ↓ 参数收敛与服务调用
StorageService / AiService / IndexService
  ↓
文件事实源 + SQLite/FTS5/向量分块 + 可选外部 AI API
```

安全边界与 `docs/architecture.md` 保持一致：

- `BrowserWindow` 启用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`。
- 渲染端只接触 `AiConfig` 的公开结构，`apiKeySet` 表示是否已配置密钥，不回传明文 Key。
- 文件读写路径经 `assertSafeSegment` 与 `assertInside` 约束，作品 ID 和条目 ID 只允许字母、数字、下划线和连字符。
- 导入 zip 时拒绝绝对路径和路径穿越条目。
- 用户未启用 AI 或未配置 Key 时，AI/RAG 能力返回 degraded/降级结果，不影响离线搜索与基础校验。

## 4. 本地存储与索引实现

默认数据根目录来自 Electron `app.getPath('userData')`，代码中形成：

```text
<userData>/data/
├── projects/
│   └── <projectId>/
│       ├── project.json
│       ├── characters/
│       ├── worlds/
│       ├── plots/
│       └── assets/
└── hetusketch-index.sqlite
```

写入链路：

1. UI 通过 IPC 调用 `projects.create` 或 `entries.create/update`。
2. `StorageService` 校验并构造业务对象。
3. `ProjectFileStore` 写入 `project.json`、`characters/*.json|md`、`worlds/*.json|md` 或 `plots/*.json|md`。
4. `IndexService.syncFile` 解析文件并更新 SQLite 元数据、FTS5 文档和文件索引。
5. 搜索、列表、Dashboard 主要读取 SQLite；详情读取事实文件。

索引库是派生数据，可通过 `index.rebuild(projectId?)` 从文件事实源重建。

## 5. 基础逻辑校验

`StorageService.validateContent` 执行离线校验：

- 角色红线：读取 `CharacterEntry.redLines`，按角色名和红线文本提取关键词/N-gram，在待校验文本中寻找命中片段。
- 世界观规则：读取 `WorldEntry.rules`，返回 `world-rule` 类型 warning。
- 伏笔提醒：默认读取 `status === 'open'` 的 `PlotEntry`，根据标题、摘要、内容和关联角色匹配，返回 `plot-reminder` 类型 info。

返回 `ValidationResult`，其中 `ok` 只由 warning 数量决定；伏笔提醒不会使 `ok=false`。

## 6. AI、RAG 与 Agent 落地

AI 能力集中在 `AiService`：

- `getConfig/saveConfig`：保存 LLM 与 Embedding 配置。密钥以 AES-256-GCM 加密后写入 SQLite `app_config`，公开配置只返回 `apiKeySet`。
- `testConnection`：按 `llm` 或 `embedding` 调用用户配置接口。
- `buildVectorIndex`：读取项目条目、分块、调用 Embedding API，保存到 `vector_chunks`，并在 `vector_index_state` 维护 `dirty/updatedAt/status`。
- `ragQuery`：支持 `fts`、`vector`、`hybrid` 三种检索模式；未配置 Embedding 时降级为关键词检索并返回 warning。
- `enhancedValidation`、`completeSetting`、`foreshadowingReminder`、`ragAnswer`：先复用本地结果和 RAG 上下文，再在 LLM 不可用时返回 degraded，保持离线核心能力可用。

该实现对应 `docs/agents.md` 中的智能体边界：基础规则与 RAG 可本地运行，LLM 调用只作为用户授权后的增强。

## 7. 桌面交互实现

`src/main/index.ts` 已实现：

- 主窗口：1280x820，最小 1080x720。
- 悬浮窗口：420x560，默认 `alwaysOnTop`，可显示/隐藏/置顶。
- 托盘：显示主窗口、切换悬浮速查、退出。
- 全局快捷键：`Ctrl+Shift+H` 切换悬浮速查。
- 外部链接：只允许 `http://` 和 `https://` 通过系统浏览器打开，窗口内创建新窗口被拒绝。

## 8. 已知实现边界

- 当前基础规则校验是关键词/N-gram 近似匹配，不做复杂语义推理；语义判断依赖可选 AI 增强。
- 向量检索当前由 SQLite 表保存 embedding JSON 并在本地计算相似度，未引入 sqlite-vss/sqlite-vec 扩展，便于 Windows/Electron MVP 打包验证。
- 导入导出已通过安全 IPC 暴露；路径选择保留在主进程 `dialog`，渲染端不接触任意文件路径写入能力。
- API Key 使用本地加密配置实现，未接入 Windows Credential Manager；公开 API 不回传明文密钥。

## 9. 验证入口

项目提供以下 npm 脚本：

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

其中 `npm run build` 会先执行 `npm run typecheck`，再执行 `electron-vite build`。
