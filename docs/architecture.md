# 河图速写创作助手技术选型与系统架构

## 1. 文档范围与架构目标

本文对应 `.trae/specs/build-hetusketch-system/tasks.md` 中 Task 1，依据《河图速写创作助手 PRD》与已批准 Spec，确定 HetuSketch MVP 的技术选型、系统架构、进程边界、数据流、安全边界与性能落地方式。

MVP 核心目标：

- 优先交付 Windows 10/11 桌面应用，后续保留跨平台能力。
- 基础功能完全离线可用：作品管理、设定管理、全文搜索、规则校验不依赖网络。
- 用户数据本地优先，JSON/Markdown 文件作为事实数据源，SQLite 作为索引与查询加速层。
- AI 能力为可选增强：仅在用户配置并主动调用时访问 LLM/Embedding API。
- 满足 PRD 非功能目标：启动时间 < 3 秒、搜索 < 500ms、基础校验 < 1 秒、单作品至少 1000 条设定、空闲内存 < 300MB。

## 2. 桌面方案评估与 MVP 技术栈

### 2.1 方案对比

| 方案 | 优势 | 劣势 / 风险 | 对 HetuSketch 的适配度 |
| --- | --- | --- | --- |
| Electron | 生态成熟，React/Vite/Node.js 集成顺畅；文件系统、SQLite、托盘、全局快捷键、置顶窗口能力完整；Windows 打包资料丰富；适合快速 MVP | 运行时体积和内存占用高于 Tauri/Qt；需要严格设计 IPC 安全边界 | 高。PRD 明确需要 Windows 桌面、文件监听、SQLite、托盘、全局悬浮窗，Electron 能最快落地 |
| Tauri | 安装包小、内存占用低；安全模型更收敛；前端技术栈可复用 Web 生态 | Rust 后端学习和开发成本更高；Windows 托盘、全局快捷键、复杂多窗口、SQLite/向量库集成需要更多工程验证；生态成熟度低于 Electron | 中。适合后续追求轻量化，但不利于从零快速实现 MVP |
| Qt | 原生桌面能力强，性能稳定，复杂窗口和系统集成成熟；可用 C++/Python 生态 | Web 前端生态复用度低；团队需要额外维护 Qt UI 技术栈；AI/API、Markdown/RichText、现代组件生态开发效率不如 Web | 中低。适合重原生应用，不适合本项目快速迭代和 Web UI 组件化诉求 |

### 2.2 MVP 结论

MVP 采用 **Electron + TypeScript** 作为桌面运行时。

选择理由：

1. 与 PRD 技术建议一致，能最快支撑 Windows `.exe`、系统托盘、全局快捷键、主窗口 + 悬浮窗、多窗口置顶等桌面能力。
2. Node.js 生态便于接入本地文件系统、SQLite/FTS5、文件监听、压缩导入导出、HTTP AI API 适配。
3. 可复用 React/Vite 前端生态，提高从零搭建到 MVP 的交付效率。
4. 后续如需优化内存和安装包体积，可在核心服务层边界稳定后评估迁移 Tauri，但不作为 MVP 目标。

MVP 桌面栈：

- Electron：主进程、窗口管理、托盘、全局快捷键、安全 IPC。
- electron-builder 或同类工具：Windows 安装包构建。
- Node.js 服务层：文件系统、SQLite、索引同步、AI API 适配。

## 3. 前端方案评估与 UI 技术栈

### 3.1 方案对比

| 方案 | 优势 | 劣势 / 风险 | 对 HetuSketch 的适配度 |
| --- | --- | --- | --- |
| React | 生态最大；TypeScript 支持成熟；复杂表单、富文本、虚拟列表、Canvas/关系图、状态管理方案丰富；与 Electron/Vite 集成成熟 | 灵活度高导致架构约束需自行制定；大型状态管理需要规范 | 高。适合设定卡片、检索、校验结果、设置页、悬浮窗等复杂桌面 UI |
| Vue | 上手快、模板直观；生态成熟；适合表单和管理后台 | 与部分复杂编辑器/图组件/桌面级工程模板的组合选择略少于 React；团队未来扩展时生态广度略弱 | 中高。可以实现 MVP，但与 Spec 推荐栈不完全一致 |
| Svelte | 编译产物轻、性能好、代码简洁 | 大型桌面应用生态和团队协作规范相对弱；复杂企业级组件、富文本和图编辑生态较少 | 中。适合轻量应用，但 MVP 风险高于 React |

### 3.2 MVP 结论

MVP 采用 **React + TypeScript + Vite** 作为 UI 技术栈。

配套建议：

- UI 组件库：优先 Ant Design。理由是表单、表格、树、抽屉、Modal、主题能力完整，适合桌面管理型工具。若后续追求更强设计定制，可再评估 MUI。
- 状态管理：Zustand。用于作品选择、搜索状态、设置状态、异步加载状态等中等复杂度场景，避免 MVP 阶段引入 Redux Toolkit 的样板成本。
- 路由：React Router，用于主窗口内 Dashboard、角色、世界观、伏笔、校验、设置页面切换。
- 富文本：MVP 可选择轻量 Markdown 编辑/预览或 TipTap。因 PRD 强调 JSON/Markdown 可读，优先保持内容可序列化、可导出。
- 图关系/Canvas：MVP 可预留接口，后续使用 React Flow 或 AntV G6 展示人际关系、世界观关系、剧情树。

## 4. 存储、索引、向量库与 AI API 适配方案

### 4.1 文件系统：事实数据源

MVP 采用 **用户作品目录下的 JSON/Markdown 文件作为唯一事实数据源**。

建议目录结构：

```text
<workspace>/<project-id-or-name>/
├── project.json
├── characters/
│   └── <character-id>.json 或 .md
├── worlds/
│   └── <world-entry-id>.json 或 .md
├── plots/
│   └── <plot-id>.json 或 .md
└── assets/
```

职责：

- 保存作品、角色、人设红线、世界观规则、伏笔、关系、自定义字段等用户内容。
- 支持外部编辑器打开、Git 版本管理、zip/JSON/Markdown 导入导出。
- 文件变更由监听器同步到 SQLite 索引。

取舍：

- 优点：数据透明、无厂商锁定、离线可用、易导入导出。
- 风险：全文检索和复杂筛选性能不足，因此不直接承担查询层职责。

### 4.2 SQLite + FTS5：查询与全文索引层

MVP 采用 **SQLite + FTS5** 作为本地高性能索引层。

职责：

- `projects` / `entries` / `relations` / `recent_access` 等元数据表用于列表、筛选、最近访问、Dashboard 统计。
- FTS5 虚拟表索引 `name`、`summary`、`content`、`tags`、`red_lines`、`rules` 等字段，实现全局搜索和悬浮窗搜索。
- 保存文件路径、文件 hash/mtime、索引状态，用于启动扫描和增量同步。

数据一致性策略：

1. 写入路径：业务服务先写文件系统，成功后更新 SQLite 索引。
2. 启动扫描：应用启动或切换作品时扫描作品目录，对比 mtime/hash，补齐新增、修改、删除。
3. 运行时监听：使用 chokidar 监听作品目录，外部修改触发增量重建索引。
4. 索引可重建：SQLite 仅为派生索引，损坏或不一致时可从文件系统全量重建。

取舍：

- 优点：嵌入式、无需服务端、FTS5 性能足以支撑单作品 1000+ 设定条目。
- 风险：SQLite Node 驱动和 FTS5 编译支持需在 Electron 打包阶段验证；MVP 应优先选择稳定、Electron 兼容的 SQLite 依赖。

### 4.3 向量库：RAG 增强索引

MVP 采用 **本地轻量向量索引**，优先级如下：

1. 首选：SQLite 向量扩展方案（如 sqlite-vss/sqlite-vec，需验证 Electron Windows 打包可用性）。
2. 备选：hnswlib-node 或同类本地 ANN 库，将向量持久化文件与 SQLite 元数据通过 `chunk_id` / `entry_id` 关联。
3. 降级：MVP 初期可先保留向量索引接口和构建状态，在依赖兼容性未验证前使用关键词 + FTS5 召回作为 AI 上下文来源。

向量索引职责：

- 对角色、世界观、伏笔进行文本分块。
- 调用用户配置的 Embedding API 生成向量。
- 保存 `entry_id`、`chunk_id`、文本片段、embedding 模型、维度、更新时间、脏标记。
- 为 AI 校验、RAG 问答、语义伏笔提醒召回 TopK 相关设定。

取舍：

- 不引入外部向量数据库，避免增加用户部署成本和联网依赖。
- 向量库是 AI 增强能力的一部分，未配置 Embedding 时不影响基础功能。

### 4.4 AI API 适配方案

MVP 建立统一 AI 适配器层，屏蔽不同供应商协议差异。

适配对象：

- OpenAI 兼容 Chat Completions / Responses 风格接口：支持自定义 Base URL、API Key、模型名。
- Anthropic 风格 Messages 接口：支持 Base URL、API Key、模型名。
- Embedding 接口：支持 OpenAI 兼容或用户自定义 Base URL。

适配器职责：

- 统一请求模型：`messages`、`systemPrompt`、`temperature`、`timeoutMs`、`maxTokens`。
- 统一响应模型：结构化校验结果、错误类型、原始响应摘要、耗时。
- 支持连接测试、超时、用户取消、代理配置。
- 仅由主进程/服务层持有 API Key，渲染进程不得直接读取密钥。

AI 调用原则：

- 默认关闭，用户显式配置并启用后才可调用。
- 每次调用前在 UI 明示将发送的必要上下文类型。
- 只发送完成任务所需的文本片段、红线、规则、召回设定，不上传整个作品目录。
- API Key 使用系统凭据管理器或本地加密存储，导出作品时排除密钥和敏感配置。

## 5. MVP 最终技术栈

| 层面 | MVP 选择 | 说明 |
| --- | --- | --- |
| 桌面运行时 | Electron + TypeScript | 主进程、预加载桥、多窗口、托盘、快捷键、打包 |
| 前端框架 | React + TypeScript + Vite | 主窗口与悬浮窗 UI |
| UI 组件 | Ant Design | 桌面级表单、列表、树、主题 |
| 状态管理 | Zustand | 轻量管理 UI 与应用状态 |
| 路由 | React Router | 主工作区页面切换 |
| 事实存储 | JSON/Markdown 文件系统 | 用户可读、可版本管理、可导入导出 |
| 索引查询 | SQLite + FTS5 | 元数据、全文搜索、Dashboard 统计 |
| 文件监听 | chokidar | 启动扫描 + 增量同步 |
| 向量检索 | sqlite-vss/sqlite-vec 优先，hnswlib 备选 | 本地 RAG 索引，不依赖外部向量数据库 |
| AI 适配 | OpenAI 兼容 + Anthropic 风格 + Embedding 适配器 | 用户自定义 Base URL、Key、模型 |
| 密钥安全 | 系统凭据管理器优先，本地加密降级 | 渲染端不接触明文 Key |
| 打包 | electron-builder | Windows 安装包 |

## 6. 模块架构

```text
HetuSketch
├── Renderer UI（React）
│   ├── 主窗口：侧边栏 / 顶部搜索 / Dashboard / 设定管理 / 校验 / 设置
│   ├── 悬浮窗：搜索 / 最近访问 / 条目速查
│   └── UI 状态：主题、选中作品、加载态、错误态
├── Preload Bridge
│   └── 安全 IPC API：仅暴露白名单方法，不暴露 Node.js 能力
├── Main Process（Electron）
│   ├── WindowManager：主窗口、悬浮窗、置顶、尺寸位置
│   ├── TrayManager：托盘菜单、显示隐藏
│   ├── ShortcutManager：全局快捷键
│   └── IPC Router：参数校验、权限边界、服务调用
├── Local Service Layer（Node.js）
│   ├── ProjectService：作品 CRUD、导入导出
│   ├── EntryService：角色 / 世界观 / 伏笔 CRUD
│   ├── SearchService：SQLite FTS5 查询、最近访问
│   ├── ValidationService：基础规则校验、结果结构化
│   ├── IndexService：启动扫描、文件监听、索引重建
│   ├── RagService：文本分块、Embedding、向量召回
│   ├── AiService：LLM 适配、提示词渲染、超时取消
│   └── SettingsService：配置、密钥引用、代理设置
└── Local Storage
    ├── 作品 JSON/Markdown 文件
    ├── SQLite 索引库
    ├── 向量索引文件或 SQLite 扩展表
    └── 本地配置与安全凭据
```

模块边界：

- UI 只负责展示和收集输入，不直接读写磁盘、数据库或网络。
- 所有本地 IO、数据库、AI 网络请求都由主进程背后的服务层执行。
- SQLite 是索引层，不是事实数据源；用户内容以文件系统为准。
- AI/RAG 是增强模块，必须可关闭，关闭后 SearchService 和 ValidationService 仍可独立工作。

## 7. 进程架构

```text
┌──────────────────────────────┐
│ Electron Main Process         │
│ - 窗口/托盘/快捷键             │
│ - IPC Router                  │
│ - 本地服务层                   │
│ - 文件/SQLite/AI 网络访问       │
└──────────────┬───────────────┘
               │ 安全 IPC
        ┌──────┴──────┐
        │             │
┌───────▼───────┐ ┌───▼──────────┐
│ 主窗口 Renderer │ │ 悬浮窗 Renderer │
│ React UI       │ │ React UI       │
│ 无 Node 权限    │ │ 无 Node 权限    │
└───────────────┘ └──────────────┘
```

Electron 安全配置原则：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`（若依赖允许）
- 使用 preload 暴露最小 API，例如 `window.hetuSketch.projects.list()`。
- IPC channel 白名单化，主进程对参数做 schema 校验。
- 禁止渲染进程拼接任意文件路径执行读写，只传作品 ID、条目 ID 等受控标识。

## 8. 核心数据流

### 8.1 创建或编辑设定

```text
React 表单提交
→ Preload IPC: entry.save(payload)
→ IPC Router 校验 payload 与权限
→ EntryService 写入 JSON/Markdown 文件
→ IndexService 更新 SQLite 元数据与 FTS5
→ 如启用 RAG：标记对应向量 chunk 为 dirty
→ 返回保存结果
→ UI 刷新列表 / 详情 / Dashboard
```

### 8.2 全局搜索与悬浮窗速查

```text
用户输入关键词
→ SearchService 查询 SQLite FTS5 + 最近访问
→ 返回 entry_id、类型、标题、摘要、高亮信息
→ UI 展示结果
→ 用户点击条目
→ EntryService 根据 entry_id 读取事实文件
→ UI 展示完整详情，并记录 recent_access
```

目标：常规 1000 条设定规模下，搜索链路在 500ms 内完成；输入联想使用 debounce，避免每个按键触发高频查询。

### 8.3 基础逻辑校验

```text
用户提交待校验文本
→ ValidationService 根据选择范围加载红线/世界观规则/未回收伏笔
→ 关键词、标签、正则、简单规则匹配
→ 生成结构化结果：通过 / 预警 / 命中位置 / 对应规则 / 解释
→ UI 标红冲突内容并展示建议
```

目标：不调用网络，不依赖 AI，1 秒内返回。

### 8.4 AI 增强校验

```text
用户启用 AI 并提交文本
→ 基础校验先执行，得到显式规则命中
→ RagService 使用 FTS5/向量召回相关设定 TopK
→ AiService 渲染场景提示词与必要上下文
→ LLM Adapter 调用 OpenAI 兼容或 Anthropic 风格接口
→ 解析为结构化冲突结果
→ UI 合并展示“基础校验结果 + AI 增强结果”
```

约束：AI 响应受网络影响，UI 必须显示加载态、取消入口和超时提示；建议默认 30 秒超时。

### 8.5 文件外部修改同步

```text
文件监听发现新增/修改/删除
→ IndexService 读取受影响文件
→ 更新 / 删除 SQLite 元数据与 FTS5
→ 标记向量索引 dirty
→ 通知相关窗口刷新搜索结果或详情状态
```

## 9. 安全边界

### 9.1 渲染进程边界

- 渲染进程不启用 Node.js，不直接访问 `fs`、SQLite、系统凭据、网络 AI API。
- 渲染进程只能调用 preload 暴露的白名单 API。
- 所有来自 UI 的路径、ID、配置都视为不可信输入，必须在主进程校验。

### 9.2 本地文件边界

- 作品目录由用户显式选择或由应用创建。
- 文件读写限制在已注册作品目录内，防止路径穿越。
- 导入 zip 时检查解压路径，拒绝 `../`、绝对路径和可执行脚本自动运行。
- 删除操作进入确认流程；索引库可重建，用户事实文件删除需谨慎提示。

### 9.3 密钥与配置边界

- API Key 不进入渲染端状态树、日志、导出包或错误上报。
- 优先存储在 Windows Credential Manager；如使用本地加密文件，密钥材料应绑定系统用户环境，避免硬编码盐值。
- 连接测试只返回成功/失败和必要错误摘要，不回显完整请求头。

### 9.4 AI 网络边界

- 未配置或未启用 AI 时，应用不得发起 LLM/Embedding 请求。
- AI 请求只发送当前任务必要文本和召回设定，不默认上传整个作品。
- 用户可配置代理和 Base URL，但需要限制协议为 HTTP/HTTPS，避免任意协议滥用。
- HTTP 工具调用能力在 MVP 中仅允许用户显式注册的 URL，并按工具级开关控制。

## 10. 性能指标落地方式

| PRD 指标 | 落地策略 | 验证方式 |
| --- | --- | --- |
| 主应用启动 < 3 秒 | 首屏只加载主窗口 UI、最近作品和轻量配置；SQLite/向量索引扫描延后或后台执行；避免启动时调用 AI 网络 | 记录 app ready 到主窗口 first render 时间；开发/打包环境分别测试 |
| 搜索响应 < 500ms | 使用 SQLite FTS5；搜索输入 debounce；限制首屏返回数量；详情按需读取文件；常用作品索引预热 | 构造 1000+ 条设定数据，测量关键词搜索 P50/P95 |
| 基础校验 < 1 秒 | 规则预编译；按作品缓存红线/规则摘要；仅对选择范围加载数据；长文本分段处理 | 使用典型 2k-5k 字段落与 1000 条规则压测 |
| AI 增强超时约 30 秒 | 适配器统一 timeout 和 AbortController；UI 展示加载、取消、重试；失败不影响基础结果 | 模拟慢接口、断网、401、429、5xx |
| 单作品至少 1000 条设定 | 文件分目录存储；SQLite 元数据分页；列表虚拟滚动；索引重建批处理事务 | 生成 1000/5000 条测试数据，验证列表、搜索、启动扫描 |
| 空闲内存 < 300MB | Electron 窗口数量控制；悬浮窗隐藏时释放重资源；避免一次性加载所有正文；向量索引按需打开 | 使用 Windows 任务管理器和 Electron 内存快照观察空闲态 |

额外工程措施：

- 列表页只加载摘要，详情页按需读取完整文件。
- FTS5、向量重建、导入导出等重任务放入异步任务队列，避免阻塞 UI。
- 大批量索引写入使用 SQLite transaction。
- 搜索和校验结果结构化返回，避免渲染端重复解析大文件。
- 监控关键耗时：启动、搜索、保存、索引同步、基础校验、AI 请求。

## 11. MVP 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Electron 内存超出 300MB | 不满足 PRD 空闲内存目标 | 控制窗口数量，懒加载页面和图组件；悬浮窗复用轻量 bundle；打包后持续测量 |
| SQLite/向量扩展 Windows 打包兼容性 | 影响搜索或 RAG | SQLite + FTS5 优先验证；向量库提供 sqlite 扩展与 hnswlib 备选；AI 可先使用 FTS5 召回降级 |
| 文件系统与 SQLite 索引不一致 | 搜索结果错误 | 文件为事实源；提供启动扫描、文件监听、手动重建索引 |
| AI Key 泄露 | 高安全风险 | Key 仅主进程可访问；不写日志；导出排除；凭据管理器优先 |
| 用户自定义 Base URL 或工具 URL 滥用 | 网络安全风险 | 协议限制、显式授权、工具级开关、请求超时、错误摘要脱敏 |

## 12. 结论

HetuSketch MVP 最终采用 **Electron + React + TypeScript + Vite + Ant Design + Zustand + 文件系统 JSON/Markdown + SQLite/FTS5 + 本地向量索引 + 可选 AI API 适配器** 的架构。

该方案优先保障 Windows 桌面能力、离线可用、本地数据主权和快速 MVP 交付；通过安全 IPC、文件事实源、SQLite 派生索引、AI 可选增强与性能监控，为后续实现作品管理、设定检索、逻辑校验、RAG 问答、悬浮速查窗和系统打包提供稳定基础。
