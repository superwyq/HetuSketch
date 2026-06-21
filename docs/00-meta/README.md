# 文档阅读指南

HetuSketch 文档遵循 Docs-as-Code：文档与代码同仓库维护，技术变更应同步更新对应文档。

## 文档分层

| 层级 | 目录 | 关注点 |
| --- | --- | --- |
| 元文档 | `00-meta/` | 写作规范、术语、文档维护方式 |
| 需求层 | `10-requirements/` | 产品目标、用户场景、功能规格 |
| 架构层 | `20-architecture/` | 全局架构、数据模型、状态、IPC、AI 集成 |
| 设计层 | `30-design/` | 视觉规范、组件、布局、交互 |
| 模块层 | `40-modules/` | 各模块职责、依赖、数据流、接口 |
| 接口层 | `50-api/` | IPC、内部接口、AI Provider、数据库 schema |
| 运维层 | `60-operations/` | 开发、构建、测试、排障 |
| 变更层 | `70-changelog/` | 版本变更、迁移、决策日志 |

## 维护规则

- 新功能：先补需求或模块文档，再实现。
- 架构/接口变更：同步更新 `20-architecture/` 与 `50-api/`。
- UI/样式变更：同步更新 `30-design/`。
- 重大技术选型：在 `20-architecture/decisions/` 新增 ADR。
- 新术语：补充 `00-meta/glossary.md`。
