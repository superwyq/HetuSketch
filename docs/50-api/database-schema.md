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
| `plotboard_cards_index` | 剧情卡派生索引。 |
| `plotboard_time_index` | 剧情卡时间线派生索引。 |
| `state_snapshot_index` | 章节状态快照派生索引。 |
| `plot_thread_usage_index` | 线索在剧情卡中的使用派生索引。 |
| `search_index` | FTS5 全文检索虚拟表。 |

## 剧情画布索引表

### `plotboard_cards_index`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `plotboard_id` | TEXT NOT NULL | 画布 ID。 |
| `book_id` | TEXT NOT NULL | 书目 ID。 |
| `chapter_id` | TEXT NOT NULL | 章节 ID。 |
| `card_id` | TEXT NOT NULL | 剧情卡 ID。 |
| `card_type` | TEXT NOT NULL | `event`、`dialogue`、`battle`、`clue_setup` 等。 |
| `title` | TEXT NOT NULL | 卡片标题。 |
| `fact` | TEXT NOT NULL | 客观事件事实。 |
| `character_ids` | TEXT NOT NULL DEFAULT `'[]'` | JSON 字符串数组。 |
| `world_entry_ids` | TEXT NOT NULL DEFAULT `'[]'` | JSON 字符串数组。 |
| `plot_entry_ids` | TEXT NOT NULL DEFAULT `'[]'` | JSON 字符串数组。 |
| `updated_at` | TEXT NOT NULL | 卡片或画布更新时间。 |
| `file_path` | TEXT NOT NULL | 对应 `.plotboard.json` 路径。 |

主键：`(plotboard_id, card_id)`；索引：`idx_plotboard_cards_book_chapter(book_id, chapter_id)`。

### `plotboard_time_index`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `plotboard_id` | TEXT NOT NULL | 画布 ID。 |
| `book_id` | TEXT NOT NULL | 书目 ID。 |
| `chapter_id` | TEXT NOT NULL | 章节 ID。 |
| `card_id` | TEXT NOT NULL | 剧情卡 ID。 |
| `timecode` | TEXT NOT NULL DEFAULT `''` | 故事内时间。 |
| `pov_character_id` | TEXT NOT NULL DEFAULT `''` | POV 角色 ID。 |
| `location_world_entry_id` | TEXT NOT NULL DEFAULT `''` | 地点世界观条目 ID。 |
| `character_ids` | TEXT NOT NULL DEFAULT `'[]'` | 出场角色 JSON 字符串数组。 |
| `sort_x` | REAL NOT NULL DEFAULT 0 | 画布 X 坐标。 |
| `sort_y` | REAL NOT NULL DEFAULT 0 | 画布 Y 坐标。 |

主键：`(plotboard_id, card_id)`；索引：`idx_plotboard_time_lookup(book_id, chapter_id, timecode)`。

### `state_snapshot_index`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `book_id` | TEXT NOT NULL | 书目 ID。 |
| `chapter_id` | TEXT NOT NULL | 章节 ID。 |
| `owner_type` | TEXT NOT NULL | `character`、`world`、`plot`、`chapter`。 |
| `owner_id` | TEXT NOT NULL | 状态对象 ID。 |
| `field_name` | TEXT NOT NULL | 状态字段名。 |
| `value_json` | TEXT NOT NULL | 字段值 JSON。 |
| `snapshot_timecode` | TEXT NOT NULL DEFAULT `''` | 快照时间锚。 |
| `updated_at` | TEXT NOT NULL | 快照更新时间。 |
| `file_path` | TEXT NOT NULL | 对应 `.state-snapshot.json` 路径。 |

主键：`(book_id, chapter_id, owner_type, owner_id, field_name)`；索引：`idx_state_snapshot_lookup(book_id, chapter_id, owner_type, owner_id)`。

### `plot_thread_usage_index`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `plotboard_id` | TEXT NOT NULL | 画布 ID。 |
| `book_id` | TEXT NOT NULL | 书目 ID。 |
| `chapter_id` | TEXT NOT NULL | 章节 ID。 |
| `card_id` | TEXT NOT NULL | 剧情卡 ID。 |
| `plot_entry_id` | TEXT NOT NULL | 线索条目 ID。 |
| `usage_type` | TEXT NOT NULL | 当前实现写入卡片类型，如 `clue_setup`、`clue_reinforce`、`clue_payoff`；卡片内的 `plotClueUsages` 仍是事实源。 |
| `timecode` | TEXT NOT NULL DEFAULT `''` | 剧情卡时间。 |

主键：`(plotboard_id, card_id, plot_entry_id)`；索引：`idx_plot_thread_usage_lookup(plot_entry_id, book_id, chapter_id)`。

## 索引同步策略

1. 写 JSON/Markdown 事实源。
2. 调用 `IndexService.scanBook(bookId)` 或 `IndexService.syncFile(filePath)`。
3. 对 `.plotboard.json` 调用 `IndexDatabase.upsertPlotboard(plotboard, filePath)`。
4. 对 `.state-snapshot.json` 调用 `IndexDatabase.upsertStateSnapshot(snapshot, bookId, filePath)`。
5. 更新 `file_index`，必要时标记向量索引 dirty。

## 当前边界

- `migrate()` 以建表和补表为主，缺少显式 schema migrations 表。
- 向量 embedding 以 JSON 存储，大规模数据需评估 sqlite-vec / ANN。
- 剧情画布索引是派生数据；不要把它作为画布或快照事实源。