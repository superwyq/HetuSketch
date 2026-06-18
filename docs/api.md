# HetuSketch API / IPC 接口说明

本文说明当前 preload 暴露给渲染端的 IPC API。类型定义以 `src/shared/ipc.ts` 与 `src/shared/storageTypes.ts` 为准。

## 1. 调用边界

渲染端通过 `window.hetuSketch` 调用主进程能力：

```ts
const projects = await window.hetuSketch.projects.list();
const result = await window.hetuSketch.validation.basic({ projectId, text });
```

实现链路：

- `src/preload/index.ts` 使用 `contextBridge.exposeInMainWorld('hetuSketch', api)` 暴露 API。
- 每个 API 通过 `ipcRenderer.invoke(IPC_CHANNELS.xxx, ...)` 调用。
- `src/main/index.ts` 使用 `ipcMain.handle` 注册 handler。
- 主进程调用 `StorageService`、`AiService`、`IndexService`。

渲染端不直接接触：文件系统、SQLite、Electron 主进程对象、明文 API Key。

## 2. Channel 清单

| API | IPC Channel | 入参 | 返回 |
| --- | --- | --- | --- |
| `app.getInfo()` | `app:info` | 无 | `AppInfo` |
| `app.ping()` | `app:ping` | 无 | `{ ok: true; timestamp: number }` |
| `search.preview(keyword)` | `search:preview` | `string`，主进程裁剪到 80 字符 | `SearchResultItem[]`，最多 8 条 |
| `search.global(query)` | `search:global` | `SearchQuery` | `SearchResultItem[]` |
| `search.recent(projectId?, limit?)` | `recent:list` | 可选项目 ID、limit | `RecentAccessItem[]` |
| `dashboard.stats(projectId?)` | `dashboard:stats` | 可选项目 ID | `DashboardStats` |
| `projects.list()` | `projects:list` | 无 | `ProjectManifest[]` |
| `projects.get(projectId)` | `projects:get` | `string` | `ProjectManifest` |
| `projects.create(input)` | `projects:create` | `ProjectCreateInput` | `ProjectManifest` |
| `projects.update(input)` | `projects:update` | `ProjectUpdateInput` | `ProjectManifest` |
| `projects.delete(projectId)` | `projects:delete` | `string` | `void` |
| `projects.export(projectId)` | `projects:export` | `string`，主进程弹出保存对话框 | `ProjectExportResult | undefined` |
| `projects.importFolder()` | `projects:import-folder` | 无，主进程弹出目录选择 | `ProjectImportResult | undefined` |
| `projects.importZip()` | `projects:import-zip` | 无，主进程弹出 zip 文件选择 | `ProjectImportResult | undefined` |
| `entries.list(query)` | `entries:list` | `EntryListQuery` | `SearchResultItem[]` |
| `entries.get(projectId,type,entryId)` | `entries:get` | `string, EntryType, string` | `ProjectEntry` |
| `entries.create(input)` | `entries:create` | `EntryCreateInput` | `ProjectEntry` |
| `entries.update(input)` | `entries:update` | `EntryUpdateInput` | `ProjectEntry` |
| `entries.delete(projectId,type,entryId)` | `entries:delete` | `string, EntryType, string` | `void` |
| `validation.basic(request)` | `validation:basic` | `ValidationRequest` | `ValidationResult` |
| `validation.enhanced(request)` | `validation:enhanced` | `AiValidationRequest` | `AiAgentResponse<AiValidationResult>` |
| `ai.getConfig()` | `ai:config:get` | 无 | `AiConfig`，不含明文 Key |
| `ai.saveConfig(input)` | `ai:config:save` | `AiConfigSaveInput` | `AiConfig` |
| `ai.testConnection(kind)` | `ai:connection:test` | `'llm' \| 'embedding'` | `{ ok, message, provider?, model? }` |
| `ai.getPrompts()` | `ai:prompts:get` | 无 | `AiPromptConfig` |
| `ai.savePrompts(input)` | `ai:prompts:save` | `AiPromptSaveInput` | `AiPromptConfig` |
| `ai.listSkills()` | `ai:skills:list` | 无 | `AiSkillConfig[]` |
| `ai.saveSkills(input)` | `ai:skills:save` | `AiSkillSaveInput[]` | `AiSkillConfig[]` |
| `ai.listHttpTools()` | `ai:http-tools:list` | 无 | `HttpToolConfig[]` |
| `ai.saveHttpTool(input)` | `ai:http-tools:save` | `HttpToolSaveInput` | `HttpToolConfig` |
| `ai.deleteHttpTool(toolId)` | `ai:http-tools:delete` | `string` | `void` |
| `ai.completeSetting(request)` | `ai:setting:complete` | `SettingCompletionRequest` | `AiAgentResponse<SettingCompletionResult>` |
| `ai.foreshadowing(projectId,text,requestId?)` | `ai:foreshadowing` | `string, string, string?`，文本裁剪到 50000 字符 | `AiAgentResponse<{ reminders: ValidationFinding[] }>` |
| `rag.build(projectId)` | `rag:build` | `string` | `RagBuildResult`，包含 `status/dirty/updatedAt` |
| `rag.state(projectId)` | `rag:state` | `string` | `VectorIndexState` |
| `rag.query(request)` | `rag:query` | `RagQueryRequest` | `RagQueryResult` |
| `rag.answer(request)` | `rag:answer` | `RagQueryRequest` | `AiAgentResponse<{ answer; citations }>` |
| `index.rebuild(projectId?)` | `index:rebuild` | 可选项目 ID | `IndexSyncSummary` |
| `desktop.toggleFloating()` | `desktop:floating:toggle` | 无 | `{ visible; pinned }` |
| `desktop.showFloating()` | `desktop:floating:show` | 无 | `{ visible; pinned }` |
| `desktop.hideFloating()` | `desktop:floating:hide` | 无 | `{ visible; pinned }` |
| `desktop.setFloatingPinned(pinned)` | `desktop:floating:pin` | `boolean` | `{ visible; pinned }` |
| `desktop.setMainPinned(pinned)` | `desktop:main:pin` | `boolean` | `{ pinned }` |

## 3. 核心接口示例

### 3.1 创建作品

```ts
await window.hetuSketch.projects.create({
  id: 'my-book',
  name: '我的长篇',
  type: 'original',
  summary: '东方玄幻故事'
});
```

约束：

- `name` 必填。
- `type` 只能是 `original` 或 `fanfiction`。
- 如果传入 `id`，必须符合安全片段规则：`^[a-zA-Z0-9_-]{1,96}$`。

### 3.2 创建角色条目

```ts
await window.hetuSketch.entries.create({
  projectId: 'my-book',
  type: 'character',
  title: '张三',
  content: '张三重视朋友。',
  role: 'protagonist',
  personalityTags: ['重情义'],
  redLines: ['绝不背叛朋友']
});
```

### 3.3 全局搜索

```ts
await window.hetuSketch.search.global({
  projectId: 'my-book',
  keyword: '河图',
  limit: 20
});
```

搜索由 SQLite FTS5 执行，命中范围包括项目摘要、标题、正文、标签、红线、规则和自定义字段等可搜索文本。

### 3.4 基础校验

```ts
await window.hetuSketch.validation.basic({
  projectId: 'my-book',
  text: '张三为了活命背叛朋友，并用魔法复活死者。',
  includePlotReminders: true
});
```

返回：

- `ok`: 是否无 warning。
- `summary`: 已检查角色数、世界规则数、未回收伏笔数、warning/reminder 统计。
- `findings`: 角色红线、世界规则、伏笔提醒列表。

### 3.5 AI 配置

```ts
await window.hetuSketch.ai.saveConfig({
  llm: {
    enabled: true,
    provider: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    model: 'example-model',
    apiKey: '用户输入的密钥'
  }
});
```

返回的 `AiConfig` 不包含 `apiKey`，只包含 `apiKeySet: true|false`。

### 3.6 RAG 查询

```ts
await window.hetuSketch.rag.query({
  projectId: 'my-book',
  query: '玉佩和主角身世有什么关系？',
  retrievalMode: 'hybrid',
  topK: 5,
  maxContextChars: 4000
});
```

`retrievalMode`：

- `fts`：仅本地 FTS5。
- `vector`：仅向量分块；未配置 Embedding 时降级。
- `hybrid`：FTS5 + 向量召回。

## 4. 错误与降级

- 参数不合法时，主进程 handler 抛出错误，渲染端 Promise reject。
- LLM/Embedding 未启用或未配置 Key 时，相关 AI/RAG 接口返回 `degraded` 或 `warnings`，不会阻断基础功能。
- `ai.testConnection` 捕获网络/API 错误并返回 `{ ok: false, message }`，不回显密钥。
- `ai.saveHttpTool` 仅允许 HTTP/HTTPS URL，并过滤 `authorization`、`cookie`、`set-cookie` 等敏感 header。

## 5. 导入导出与 RAG 状态

导入导出已通过安全 IPC 暴露：渲染端只触发 `projects.export/importFolder/importZip`，路径选择由主进程 `dialog` 完成，zip 解包继续执行路径穿越校验。RAG 向量索引状态通过 `rag.state(projectId)` 读取，`status` 取值为 `ready`、`dirty`、`building`、`degraded`、`empty`，并附带 `dirty`、`updatedAt`、`chunkCount`、`embeddedCount` 和 `warnings`。
