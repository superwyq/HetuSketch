# 文档管理架构

> 本文档定义 AI 写作助手项目的文档体系结构、编写规范与维护流程。所有技术文档与源码同仓库管理，遵循 Docs-as-Code 原则。

---

## 1. 设计原则

1. **Docs-as-Code**：文档使用 Markdown 编写，与代码同仓库、同分支、同 PR 评审。
2. **分层递进**：按"需求 → 架构 → 设计 → 模块 → 接口 → 运维"分层，避免信息平铺。
3. **编号排序**：目录使用 `10-`、`20-` 前缀，强制信息层级在文件系统中可见。
4. **模板化**：同类文档使用统一模板，便于 AI 辅助生成与人工维护。
5. **双向关联**：代码中通过注释 `@see docs/...` 链接到对应文档，文档中通过相对路径引用代码。

---

## 2. 目录结构

```
docs/
├── 00-meta/                    # 元文档：关于文档的文档
│   ├── README.md              # 本文档体系的阅读指南
│   ├── style-guide.md         # 写作规范、术语表、命名约定
│   └── glossary.md            # 项目专用术语
│
├── 10-requirements/           # 需求层：为什么做
│   ├── product-vision.md      # 产品愿景、目标用户、核心场景
│   ├── user-stories/          # 用户故事（按角色分）
│   └── feature-specs/         # 功能规格说明书
│       ├── editor-spec.md
│       ├── character-manager-spec.md
│       ├── ai-assistant-spec.md
│       └── relation-graph-spec.md
│
├── 20-architecture/           # 架构层：怎么做（全局视角）
│   ├── system-overview.md     # 系统架构图、技术栈、分层说明
│   ├── data-model.md          # 核心数据模型（ER 图、类型定义）
│   ├── state-management.md    # 全局状态设计（Zustand store 结构）
│   ├── ipc-contract.md        # 主进程 ↔ 渲染进程通信协议
│   ├── ai-integration.md      # AI 层架构（复用 aiCore 的方案）
│   └── decisions/             # 架构决策记录（ADR）
│       ├── ADR-001-why-electron.md
│       ├── ADR-002-why-tiptap.md
│       └── ADR-003-why-sqlite.md
│
├── 30-design/                 # 设计层：长什么样、怎么交互
│   ├── design-system.md       # Design Tokens、色彩、字体、间距
│   ├── component-library.md   # 组件清单（基于 shadcn/ui 的扩展）
│   ├── layout/                # 界面布局文档
│   │   ├── overall-layout.md
│   │   ├── editor-layout.md
│   │   ├── sidebar-layout.md
│   │   └── panel-layout.md
│   ├── interactions/          # 交互规范
│   │   ├── navigation.md
│   │   ├── drag-and-drop.md
│   │   ├── inline-editing.md
│   │   └── ai-streaming.md
│   └── visuals/
│       └── icons-usage.md     # Lucide 图标使用规范
│
├── 40-modules/                # 模块层：每个模块的详细设计
│   ├── README.md              # 模块划分总览图
│   ├── moduleA/               # 具体模块的文档
│   │   ├── README.md
│   │   ├── architecture.md
│   │   ├── data-flow.md
│   │   └── api.md
│   └── moduleB/
├── 50-api/                    # 接口层：对外暴露的契约
│   ├── internal-api.md        # 模块间调用接口
│   ├── ipc-api.md             # 主进程 IPC 通道清单
│   ├── ai-provider-api.md     # AI 模型调用封装接口
│   └── database-schema.md     # SQLite 表结构、迁移脚本
│
├── 60-operations/             # 运维层：怎么跑起来、怎么维护
│   ├── development.md         # 本地开发环境搭建
│   ├── build-and-package.md   # 打包、签名、发布流程
│   ├── testing.md             # 测试策略
│   └── troubleshooting.md     # 常见问题排查手册
│
├── 70-changelog/              # 变更层：项目演进记录
│   ├── CHANGELOG.md
│   ├── migration-guides/
│   └── decision-log.md
│
└── assets/                    # 公共资源
    ├── diagrams/              # 架构图、流程图
    ├── screenshots/           # 界面截图
    └── prototypes/            # 原型文件
```

---

## 3. 各层职责说明

| 层级 | 目录 | 回答的问题 | 目标读者 |
|-----|------|---------|---------|
| 元文档 | `00-meta/` | 文档怎么写、术语什么意思 | 所有贡献者 |
| 需求层 | `10-requirements/` | 为什么做、用户是谁、场景是什么 | 产品经理、开发者 |
| 架构层 | `20-architecture/` | 系统怎么分层、数据怎么流转、技术怎么选型 | 开发者、架构师 |
| 设计层 | `30-design/` | 界面长什么样、怎么交互、视觉规范是什么 | 前端开发者、设计师 |
| 模块层 | `40-modules/` | 每个模块内部怎么实现、对外暴露什么 | 模块开发者 |
| 接口层 | `50-api/` | 模块间怎么调用、IPC 通道有哪些、数据库表结构 | 全栈开发者 |
| 运维层 | `60-operations/` | 怎么本地运行、怎么打包、怎么排查问题 | 开发者、运维 |
| 变更层 | `70-changelog/` | 版本改了什么、为什么改、怎么迁移 | 所有用户、开发者 |

---

## 4. 文档模板

### 4.1 模块文档模板（`40-modules/{module}/README.md`）

每个模块目录下必须包含以下文件，AI 生成新模块时应套用此模板：

```markdown
# {ModuleName} 模块

## 职责
一句话描述该模块的核心职责，以及它在系统中的位置。

## 依赖
- **上游模块**：`file-manager`（文档加载）、`ai-assistant`（续写请求）
- **下游模块**：`settings`（字体/主题配置）

## 核心文件

| 文件 | 职责 |
|-----|------|
| `Editor.tsx` | 主编辑器组件 |
| `useEditor.ts` | 编辑器状态管理 Hook |
| `extensions/` | TipTap 扩展目录 |

## 数据流
使用mermaid绘制数据流图

## 对外接口
列出具体的对外接口

## 已知问题
- 该模块现有的问题。
```

### 4.2 架构决策记录模板（ADR）

所有重大技术选型必须在 `20-architecture/decisions/` 中留下 ADR：

```markdown
# ADR-{序号}: {决策标题}

## 状态
已接受（Accepted）/ 已否决（Rejected）/ 已废弃（Superseded by ADR-XXX）

## 背景
描述当前面临的问题或需求。

## 考虑的选项

| 方案 | 优点 | 缺点 |
|-----|------|------|
| 方案 A | ... | ... |
| 方案 B | ... | ... |

## 决策
最终选择哪个方案，以及核心理由（不超过 3 条）。

## 后果
- 正面影响：...
- 负面影响：...
- 需要后续跟进的事项：...
```

### 4.3 术语表模板（`00-meta/glossary.md`）

项目内所有业务术语必须在此统一，避免同一概念多种叫法：

```markdown
# 术语表

| 术语 | 英文 | 定义 |
|-----|------|------|
| 章节卡 | Chapter Card | 左侧大纲中的章节条目，可拖拽排序 |
| 续写流 | Continuation Stream | AI 从光标位置继续生成文本的流式输出 |
| 角色卡 | Character Card | 角色管理面板中的角色信息卡片 |
| 世界观节点 | World Node | 关系图谱中的世界观设定节点 |
| 代派 | Provider | 指 AI 模型提供商（OpenAI、DeepSeek 等） |
```

---

## 5. AI 协作工作流

文档不是一次性写完的，而是在开发过程中持续维护。以下是 AI 辅助生成文档的典型场景：

### 场景 1：开发新功能前（生成初始文档）

> 提示词示例：
> "我要开发'角色关系图谱'功能，请根据 `docs/templates/module-readme.md` 生成 `docs/40-modules/relation-graph/` 下的初始文档，包括 `README.md`、`architecture.md`、`data-flow.md`。"

### 场景 2：代码变更后（同步更新文档）

> 提示词示例：
> "我刚刚修改了 `src/modules/editor/Editor.tsx`，增加了 AI 批注功能，请更新 `docs/40-modules/editor/README.md` 和 `api.md`，补充新的对外接口。"

### 场景 3：技术选型时（生成 ADR）

> 提示词示例：
> "我正在考虑是否把数据库从 SQLite 换成 IndexedDB，请生成一份 ADR 草稿放在 `docs/20-architecture/decisions/ADR-004-database-choice.md`。"

---

## 6. 代码与文档的关联约定

为保持文档与代码的同步，建立以下双向链接机制：

| 代码位置 | 对应文档位置 | 关联方式 |
|---------|------------|---------|
| `src/modules/*/index.ts` | `docs/40-modules/*/` | 模块入口文件顶部注释：`// @see docs/40-modules/editor/` |
| `src/store/*.ts` | `docs/20-architecture/state-management.md` | 状态定义处注释：`// @see docs/20-architecture/state-management.md#zustand-store` |
| `electron/main/ipc.ts` | `docs/50-api/ipc-api.md` | IPC 通道注册处注释：`// @see docs/50-api/ipc-api.md#file-operations` |
| `src/components/ui/*.tsx` | `docs/30-design/component-library.md` | shadcn 组件目录注释 |

---

## 7. 维护检查清单

每次提交涉及架构或接口变更的 PR 时，必须检查：

- [ ] 是否新增或修改了 `docs/40-modules/` 下的模块文档？
- [ ] 是否更新了 `docs/50-api/` 中的接口定义？
- [ ] 如果是技术选型变更，是否新增了 ADR？
- [ ] 代码中是否添加了 `@see docs/...` 注释？
- [ ] 术语表中是否引入了新的业务概念？

---

> 本文档由 AI 辅助生成，后续随项目演进持续迭代。
