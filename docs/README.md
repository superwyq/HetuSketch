# HetuSketch 技术文档中心

本文档目录按 `docs/docs-guidance.md` 的 Docs-as-Code 架构整理，面向产品、架构、开发、测试与运维协作。

## 阅读路径

1. **先了解项目**：[`00-meta/README.md`](./00-meta/README.md)、[`10-requirements/product-vision.md`](./10-requirements/product-vision.md)
2. **理解架构**：[`20-architecture/system-overview.md`](./20-architecture/system-overview.md)、[`20-architecture/data-model.md`](./20-architecture/data-model.md)、[`20-architecture/ipc-contract.md`](./20-architecture/ipc-contract.md)
3. **查看模块**：[`40-modules/README.md`](./40-modules/README.md)
4. **对接接口**：[`50-api/ipc-api.md`](./50-api/ipc-api.md)、[`50-api/database-schema.md`](./50-api/database-schema.md)
5. **本地开发与验证**：[`60-operations/development.md`](./60-operations/development.md)、[`60-operations/testing.md`](./60-operations/testing.md)

## 目录结构

```text
docs/
├── 00-meta/          # 文档规范、术语、阅读指南
├── 10-requirements/  # 产品愿景、核心场景、功能规格
├── 20-architecture/  # 系统架构、数据模型、状态管理、IPC、AI 集成、ADR
├── 30-design/        # 设计系统、组件与布局规范
├── 40-modules/       # 模块级设计文档
├── 50-api/           # IPC、内部 API、AI Provider、数据库 schema
├── 60-operations/    # 开发、构建、测试、排障
├── 70-changelog/     # 变更记录与决策日志
└── assets/           # 图表、截图、原型资源
```

## 旧文档说明

根目录下原有的 `architecture.md`、`api.md`、`data-format.md`、`DESIGN.md`、`ui-layout.md`、`implementation.md`、`validation.md`、`agents.md`、`design-tokens.md` 保留为历史资料或详细参考；新的分层文档以本目录结构为主入口。后续更新应优先写入对应分层目录。
