# 数据库 Schema

SQLite 数据库文件：`<userData>/data/hetusketch-index.sqlite`。

## 数据库职责

SQLite 是派生索引和配置存储，不是用户创作内容的唯一事实源。损坏或删除后可从 JSON/Markdown 文件重建。

## 表清单

| 表 | 职责 |
| --- | --- |
| `projects` | 作品元数据、根目录、manifest 路径。 |
| `entries` | 条目摘要、类型、标签、文件路径、可搜索文本。 |
| `relations` | 条目之间的关系边。 |
| `recent_access` | 最近访问记录。 |
| `file_index` | 文件 hash、mtime、size 和索引状态。 |
| `app_config` | AI 配置、提示词、技能等。 |
| `http_tools` | 用户注册 HTTP 工具配置。 |
| `vector_chunks` | RAG 分块文本、embedding JSON、模型名。 |
| `vector_index_state` | 每个作品的向量索引状态。 |
| `search_index` | FTS5 全文检索虚拟表。 |

## 索引同步策略

1. 写文件事实源。
2. 调用 `IndexService.syncFile(filePath)`。
3. 解析条目并 upsert SQLite。
4. 更新 FTS5 文档。
5. 标记向量索引 dirty。

## 当前边界

- `migrate()` 以建表和补表为主，缺少显式 schema migrations 表。
- 向量 embedding 以 JSON 存储，大规模数据需评估 sqlite-vec / ANN。
