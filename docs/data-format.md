# HetuSketch 数据格式说明

本文描述当前实现使用的本地文件、SQLite 索引和主要数据结构。事实数据源以作品目录中的 JSON/Markdown 文件为准，SQLite 为可重建索引层。

## 1. 数据目录

默认数据目录：

```text
<electron userData>/data/
├── projects/
│   └── <projectId>/
│       ├── project.json
│       ├── characters/
│       │   └── <entryId>.json 或 <entryId>.md
│       ├── worlds/
│       │   └── <entryId>.json 或 <entryId>.md
│       ├── plots/
│       │   └── <entryId>.json 或 <entryId>.md
│       └── assets/
└── hetusketch-index.sqlite
```

ID 规则：`projectId` 和 `entryId` 必须匹配 `^[a-zA-Z0-9_-]{1,96}$`。默认自动生成的条目 ID 使用 UUID；项目 ID 在未显式传入时由作品名 slug + 随机片段生成。

## 2. project.json

```json
{
  "id": "my-book",
  "name": "我的长篇",
  "type": "original",
  "summary": "东方玄幻故事",
  "createdAt": "2026-06-18T00:00:00.000Z",
  "updatedAt": "2026-06-18T00:00:00.000Z",
  "schemaVersion": 1
}
```

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 作品 ID，同时作为目录名 |
| `name` | `string` | 作品名 |
| `type` | `'original' \| 'fanfiction'` | 原创/同人 |
| `summary` | `string` | 简介 |
| `createdAt` / `updatedAt` | ISO 字符串 | 创建/更新时间 |
| `schemaVersion` | `1` | 当前 schema 版本 |

## 3. 条目通用字段

所有角色、世界观、伏笔条目共享 `BaseEntry`：

```json
{
  "id": "char-zhangsan",
  "projectId": "my-book",
  "type": "character",
  "title": "张三",
  "summary": "重情义的主角",
  "content": "张三来自边城，重视朋友。",
  "tags": ["主角"],
  "relations": [
    { "targetId": "world-magic", "targetType": "world", "label": "受规则约束" }
  ],
  "customFields": { "年龄": "18" },
  "createdAt": "2026-06-18T00:00:00.000Z",
  "updatedAt": "2026-06-18T00:00:00.000Z",
  "format": "json"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 条目 ID |
| `projectId` | `string` | 所属作品 ID |
| `type` | `'character' \| 'world' \| 'plot'` | 条目类型 |
| `title` | `string` | 标题/名称 |
| `summary` | `string` | 摘要，默认空字符串 |
| `content` | `string` | 正文内容，Markdown 条目正文也映射到此字段 |
| `tags` | `string[]` | 标签 |
| `relations` | `EntryRelation[]` | 关联条目 |
| `customFields` | `Record<string,string>` | 自定义字段 |
| `format` | `'json' \| 'markdown'` | 文件格式 |

## 4. 角色 CharacterEntry

路径：`characters/<entryId>.json` 或 `characters/<entryId>.md`

```json
{
  "id": "char-zhangsan",
  "projectId": "my-book",
  "type": "character",
  "title": "张三",
  "summary": "重情义的主角",
  "content": "张三重视朋友。",
  "tags": ["主角"],
  "relations": [],
  "customFields": {},
  "createdAt": "2026-06-18T00:00:00.000Z",
  "updatedAt": "2026-06-18T00:00:00.000Z",
  "format": "json",
  "role": "protagonist",
  "appearance": "黑衣少年",
  "personalityTags": ["冷静", "重情义"],
  "abilities": "星盘推演",
  "background": "来自边城",
  "redLines": ["绝不背叛朋友"]
}
```

角色特有字段：

- `role`: `'protagonist' | 'supporting' | 'antagonist' | 'other'`，默认 `other`。
- `appearance`: 外貌。
- `personalityTags`: 性格标签。
- `abilities`: 能力设定。
- `background`: 背景故事。
- `redLines`: 人设红线，基础校验会读取。

## 5. 世界观 WorldEntry

路径：`worlds/<entryId>.json` 或 `worlds/<entryId>.md`

```json
{
  "id": "world-magic",
  "projectId": "my-book",
  "type": "world",
  "title": "魔法规则",
  "summary": "不可复活死者",
  "content": "魔法只能转移生命力，不能凭空创造灵魂。",
  "tags": ["魔法"],
  "relations": [],
  "customFields": {},
  "createdAt": "2026-06-18T00:00:00.000Z",
  "updatedAt": "2026-06-18T00:00:00.000Z",
  "format": "json",
  "category": "magic",
  "rules": ["魔法不能复活死者"]
}
```

世界观特有字段：

- `category`: `'geography' | 'faction' | 'magic' | 'technology' | 'history' | 'culture' | 'other'`，默认 `other`。
- `rules`: 世界观硬规则，基础校验会读取。

## 6. 伏笔 PlotEntry

路径：`plots/<entryId>.json` 或 `plots/<entryId>.md`

```json
{
  "id": "plot-jade",
  "projectId": "my-book",
  "type": "plot",
  "title": "玉佩伏笔",
  "summary": "终章揭示身世",
  "content": "玉佩会在终章揭示主角身世。",
  "tags": ["伏笔"],
  "relations": [],
  "customFields": {},
  "createdAt": "2026-06-18T00:00:00.000Z",
  "updatedAt": "2026-06-18T00:00:00.000Z",
  "format": "json",
  "setupChapter": "第 1 章",
  "expectedPayoffChapter": "终章",
  "status": "open",
  "relatedCharacters": ["char-zhangsan"]
}
```

伏笔特有字段：

- `setupChapter`: 埋设章节。
- `expectedPayoffChapter`: 预期回收章节。
- `status`: `'open' | 'resolved' | 'abandoned'`，默认 `open`。
- `relatedCharacters`: 关联角色 ID。

## 7. Markdown 条目格式

Markdown 条目使用 JSON Frontmatter + 正文：

```markdown
---
{
  "id": "world-magic",
  "projectId": "my-book",
  "type": "world",
  "title": "魔法规则",
  "summary": "不可复活死者",
  "tags": ["魔法"],
  "relations": [],
  "customFields": {},
  "createdAt": "2026-06-18T00:00:00.000Z",
  "updatedAt": "2026-06-18T00:00:00.000Z",
  "format": "markdown",
  "category": "magic",
  "rules": ["魔法不能复活死者"]
}
---

魔法只能转移生命力，不能凭空创造灵魂。
```

解析规则：

- 文件必须以 `---\n` 开头。
- Frontmatter 必须是可解析 JSON。
- 第二个 `---` 后的内容作为 `content`。
- 解析后 `format` 强制归一为 `markdown`。

## 8. SQLite 索引表

`hetusketch-index.sqlite` 当前包含：

| 表 | 作用 |
| --- | --- |
| `projects` | 作品元数据、根目录、manifest 路径 |
| `entries` | 条目摘要、类型、文件路径、可搜索文本 |
| `relations` | 条目间关系 |
| `recent_access` | 最近访问记录 |
| `file_index` | 文件 mtime、size、sha256、索引时间，用于同步 |
| `app_config` | AI 配置、提示词、技能等应用配置 |
| `http_tools` | 用户注册 HTTP 工具配置 |
| `vector_chunks` | RAG 分块、embedding JSON、模型名 |
| `vector_index_state` | 每个作品的向量索引 `status`、`dirty`、`updated_at`、分块/嵌入统计与 warnings |
| `search_index` | FTS5 虚拟表，全文搜索索引 |

SQLite 不作为事实源；损坏或不一致时可通过扫描作品目录重建。

## 9. AI 配置公开格式

渲染端可读取的 `AiConfig`：

```json
{
  "llm": {
    "enabled": true,
    "provider": "openai-compatible",
    "baseUrl": "https://api.example.com/v1",
    "model": "example-model",
    "timeoutMs": 30000,
    "apiKeySet": true
  },
  "embedding": {
    "enabled": false,
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "model": "text-embedding-3-small",
    "timeoutMs": 30000,
    "apiKeySet": false
  }
}
```

保存时 `AiConfigSaveInput` 可包含 `apiKey`，但读取时不会返回明文。明文密钥经加密后保存到 SQLite `app_config`。

## 10. RAG 向量索引状态

`VectorIndexState` 示例：

```json
{
  "projectId": "my-book",
  "status": "dirty",
  "dirty": true,
  "updatedAt": "2026-06-18T00:00:00.000Z",
  "chunkCount": 12,
  "embeddedCount": 12,
  "warnings": []
}
```

- `ready`：向量索引可用。
- `dirty`：条目文件发生新增、编辑或删除，建议重建。
- `building`：正在构建。
- `degraded`：Embedding 未配置或部分构建失败。
- `empty`：尚无可用分块。

## 11. 校验结果格式

```json
{
  "ok": false,
  "checkedAt": "2026-06-18T00:00:00.000Z",
  "summary": {
    "checkedCharacters": 1,
    "checkedWorldRules": 1,
    "checkedOpenPlots": 1,
    "warningCount": 2,
    "reminderCount": 1
  },
  "findings": [
    {
      "id": "uuid",
      "category": "character-red-line",
      "severity": "warning",
      "entryId": "char-zhangsan",
      "entryType": "character",
      "title": "张三",
      "rule": "绝不背叛朋友",
      "message": "文本可能触犯角色“张三”的人设红线：绝不背叛朋友",
      "suggestion": "请确认该行为是否有充分铺垫，或调整描写以避免违背既定人设。",
      "excerpt": "张三为了活命背叛朋友",
      "start": 0,
      "end": 2
    }
  ]
}
```

`category`：`character-red-line`、`world-rule`、`plot-reminder`。

`severity`：`warning` 或 `info`。当前 `ok=false` 仅由 warning 决定。

## 12. 备份与版本管理建议

由于事实数据源是普通 JSON/Markdown 文件，用户可直接：

- 用 Git 管理 `projects/<projectId>` 目录。
- 手动备份整个项目目录。
- 通过应用导出 zip 保存完整作品文件，不包含 API Key；导入目录或 zip 后会重建索引。
