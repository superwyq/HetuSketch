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

## 索引 API

| 服务 | 职责 |
| --- | --- |
| `IndexService` | 扫描、监听、同步文件到 SQLite。 |
| `IndexDatabase` | 表结构、FTS5、最近访问、配置、向量块。 |

## AI API

`AiService` 不应直接暴露给渲染端，所有调用经 `StorageService` 或主进程 IPC 包装。
