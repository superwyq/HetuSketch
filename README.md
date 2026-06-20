# 河图速写助手 HetuSketch

> 让每一个伏笔都有回响，让每一个设定都有归处。

河图速写助手（HetuSketch）是一款面向小说创作者的桌面端设定管理与逻辑校验工具。它的核心定位是 **"逻辑监工"而非"代笔枪手"**：不替作者写故事，而是帮助作者记录、管理、检索和校验创作过程中的角色、世界观、情节线索与伏笔，降低长篇创作中的记忆负担和逻辑冲突风险。

本项目优先适配 Windows PC 平台，采用本地优先的数据存储方式，并支持用户接入自定义 AI 大模型 API，在保持数据主权的前提下获得更智能的语义校验、设定补全和伏笔提醒能力。

应用采用 **VSCode 风格的创作工作台** 界面，提供活动栏、可折叠侧边栏、多 Tab 可分割编辑器、底部面板与状态栏，让作者在统一的桌面环境中完成设定管理、正文创作与逻辑校验。

---

## 目录

- [项目简介](#项目简介)
- [开发背景](#开发背景)
- [目标用户](#目标用户)
- [主要功能特性](#主要功能特性)
- [独特优势](#独特优势)
- [安装与配置指南](#安装与配置指南)
- [项目结构](#项目结构)
- [数据存储说明](#数据存储说明)
- [AI 能力说明](#ai-能力说明)
- [开发状态](#开发状态)

---

## 项目简介

### 功能概述

HetuSketch 旨在为小说创作者提供一个集 **设定管理、快速检索、逻辑校验、伏笔追踪、AI 增强分析** 于一体的创作辅助工作台。

它可以帮助用户：

- 建立"设定集 → 作品 → 数据库 → 创作正文"四级创作链路；
- 结构化管理角色、人设、世界观、情节线索数据库；
- 在多 Tab 可分割编辑器中创作正文，支持章节三级树（书 > 分卷 > 章节）；
- 快速检索角色设定、世界规则和伏笔信息；
- 检查文本是否违反角色行为红线或世界观硬规则；
- 追踪未回收伏笔，降低剧情遗漏风险；
- 通过可选 AI API 获得语义级冲突检测和智能设定建议；
- 在 Windows 桌面环境中通过悬浮窗快速查阅设定；
- 自定义功能栏与编辑区字体、主题颜色。

### 产品定位

HetuSketch 的产品定位是：

> 面向小说创作者的本地优先型设定管理与逻辑校验工具。

它强调作者主导创作，AI 仅作为辅助增强能力存在。基础功能不依赖网络和云端服务，用户的创作数据默认保存在本地。

---

## 开发背景

长篇小说、同人创作、剧本创作和复杂世界观项目通常会遇到以下问题：

| 创作痛点 | 典型表现 | HetuSketch 的解决方式 |
| --- | --- | --- |
| 记忆负担重 | 作者需要反复翻阅前文确认角色、地点、规则 | 设定入库、全文检索、悬浮速查 |
| 人设崩塌 | 角色行为与既有人设矛盾 | 人设红线校验、角色行为冲突预警 |
| 世界观冲突 | 后文描写违反前文规则 | 世界观规则校验、规则红线管理 |
| 伏笔遗忘 | 前文线索后期未回收 | 伏笔状态追踪、关联提醒 |
| AI 生成不稳定 | 通用 AI 工具缺乏长期设定记忆 | 本地知识库 + RAG 检索增强 + 用户自定义 API |
| 数据不可控 | 云端工具存在迁移、隐私和锁定风险 | 本地文件存储、可导入导出、数据归属用户 |
| 工具分散 | 设定、正文、校验散落在不同软件 | VSCode 风一体化工作台，多 Tab 分割编辑 |

因此，HetuSketch 不追求替代作者进行内容创作，而是专注于成为创作过程中的"逻辑守门人"。

---

## 目标用户

### 核心用户群体

| 用户类型 | 特征 | 核心诉求 |
| --- | --- | --- |
| 小说新手作家 | 尚未形成稳定创作流程，依赖记忆管理设定 | 降低设定管理门槛，建立规范创作习惯 |
| 长篇小说作者 | 作品篇幅长、角色多、设定复杂 | 维护前后逻辑一致性，追踪伏笔和规则 |
| 同人文作者 | 需要遵循原作角色和世界观 | 快速对照原作设定，避免偏离原作框架 |
| 剧本 / 群像创作者 | 人物关系复杂，剧情线交错 | 梳理角色关系、剧情线索和冲突点 |
| 世界观设定爱好者 | 关注文化、历史、地理、组织、能力体系 | 结构化管理世界设定并支持关联检索 |

### 典型使用场景

1. **原创长篇创作**  
   作者在构建世界观、推进剧情和塑造角色时，将关键设定录入数据库，并在多 Tab 编辑器中创作正文，随时进行快速检索和逻辑校验。

2. **同人创作**  
   作者录入原作角色、能力边界、组织关系和世界规则，在创作同人剧情时随时对照，避免角色 OOC 或设定冲突。

3. **伏笔与线索管理**  
   作者记录已埋设的伏笔、预期回收章节和当前状态，后续写作时可以集中查看未回收线索。

4. **外部写作软件辅助**  
   作者在 Word、记事本、浏览器或其他写作软件中创作时，通过桌面悬浮窗快速查询角色和设定。

---

## 主要功能特性

### 1. 创作工作台（VSCode 风外壳）

HetuSketch 的主界面采用类 VSCode 的工作台布局，由以下区域组成：

- **标题栏（TitleBar）**：品牌标识、全局命令中心（搜索框）、作品选择器、速查/置顶/设置按钮、主题切换、窗口控制按钮。
- **活动栏（ActivityBar）**：左侧 48px 宽的图标导航栏，可拖拽重排、右键重置顺序。包含全局搜索、角色数据管理、世界观设定管理、限时数据库管理、文本管理、书目管理、系统设置七个活动项。
- **主侧边栏（PrimarySidebar）**：根据当前活动展示对应的树形视图（章节树、角色树、世界观树、伏笔列表、书目列表、设置项），支持文件夹管理、拖拽排序、就地重命名、右键菜单。
- **编辑器工作区（EditorWorkbench）**：中央多 Tab 编辑器区域，支持单列、双列、1+2 三种分割模式，Tab 可拖拽重排、双击重命名、鼠标滚轮横向滚动。
- **辅助侧边栏（SecondarySidebar）**：右侧 AI Chat / Outline / Timeline 辅助视图面板。
- **底部面板（BottomPanel）**：AI 提示、角色条目、世界观设定、线索条目、输出五个 Tab。
- **状态栏（StatusBar）**：底部 22px 状态条，显示当前作品、光标位置、字数、面板/侧栏状态、编码信息。
- **拖拽分隔条（Sash）**：主侧栏、辅助侧栏、底部面板均可通过 Sash 拖拽调整大小，双击复位，Alt+方向键微调。

支持的快捷键：

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+B` | 切换主侧边栏显隐 |
| `Ctrl+J` | 切换底部面板显隐 |
| `Ctrl+\` | 切换编辑器分割模式（单列 → 双列 → 1+2） |
| `Ctrl+Shift+H` | 全局快捷键，切换悬浮速查窗 |

### 2. 设定集与作品管理

#### 2.1 设定集（SettingSet）

设定集是最高层级组织单位，用于跨作品共享全局设定。

- 创建设定集（名称、简介、封面链接）；
- 查看设定集结构与全局标签数量；
- 删除设定集；
- 将作品关联到设定集（在书目管理中绑定）。

#### 2.2 作品管理（Project）

- 创建作品（名称、类型 original/fanfiction、简介）；
- 编辑、删除作品；
- 导出作品为 ZIP；
- 从文件夹或 ZIP 导入作品；
- 设为当前作品；
- 作品卡片展示类型、简介、字数、章节数、完成度。

#### 2.3 书目管理（Book）

书目是作品下的创作单元，支持"书 > 分卷 > 章节"三级结构。

- 创建书目并绑定设定集；
- 管理分卷（Volume）与章节（Chapter）；
- 章节状态管理：not_started / drafting / done / revision / locked；
- 章节字数自动统计（CJK 字符 + ASCII 单词）。

### 3. 设定数据库

设定数据库统一管理三类设定条目，通过同一组件复用：

#### 3.1 角色数据管理（Character）

字段包括：姓名、角色定位（主角/配角/反派/其他）、外貌、性格标签、能力、背景、行为红线、人际关系、自定义字段。

核心能力：

- 卡片视图、列表视图、关系网视图三种展示模式；
- 关系网视图用力导向图谱可视化角色关系，支持缩放、拖拽、框选、聚焦模式；
- 结构化人物关系构建器（选择目标、关系类型、双向/单向）；
- AI 辅助补全设定字段；
- 多维筛选（角色定位）与全局搜索过滤；
- 导出筛选结果为 JSON。

#### 3.2 世界观设定管理（World）

字段包括：条目名称、类别（地理/势力/魔法/科技/历史/文化/其他）、详细描述、规则红线、关联角色、关联情节、自定义字段。

核心能力：

- 卡片视图、列表视图、关系网视图；
- 按类别筛选与搜索；
- AI 辅助补全。

#### 3.3 限时数据库管理（Plot / 伏笔线索）

字段包括：线索名称、埋设章节、线索描述、预期回收章节、状态（open/resolved/abandoned）、关联角色。

核心能力：

- 按状态筛选（未回收/已回收/废弃）；
- 一键标记已回收；
- 伏笔关联提醒。

### 4. 文本编辑器（WritingStudio）

创作正文的工作台，集成章节管理与 Markdown 编辑。

- 章节三级树：书 > 分卷 > 章节，支持拖拽重排、就地重命名；
- 三种编辑模式：编辑 / 预览 / 双栏分屏；
- 简易 Markdown 渲染（h1-3、blockquote、li、code、br）；
- 查找与替换（当前/全部）；
- 多范围逻辑校验：当前章节 / 当前分卷 / 当前作品；
- 章节状态切换；
- 自动确保默认书目与分卷。

### 5. 快速检索与悬浮窗

#### 5.1 全局搜索

- 标题栏命令中心常驻搜索框，220ms 防抖；
- 输入关键词实时展示匹配结果（角色、世界观、线索、作品）；
- 点击结果跳转至详情页；
- 独立搜索结果页支持完整列表展示。

#### 5.2 全局悬浮速查窗

面向 Windows 桌面写作场景提供置顶悬浮窗口。

- 通过系统托盘或 `Ctrl+Shift+H` 唤出 / 隐藏；
- 窗口可置顶显示；
- 内置搜索框和最近访问设定列表（8 条）；
- 可在 Word、浏览器、记事本等外部写作工具上方快速查阅设定。

### 6. 逻辑校验引擎

逻辑校验是 HetuSketch 的核心差异化功能。系统支持基础规则匹配，并可在用户配置 AI API 后启用语义级增强校验。

#### 6.1 基础规则校验（本地）

- **人设红线校验**：检测文本是否违反角色行为红线（基于关键词、CJK n-gram 匹配）；
- **世界观规则校验**：检测文本是否违反世界观硬规则；
- **伏笔关联提醒**：提醒未回收伏笔。

#### 6.2 AI 增强校验

- 基于 RAG 检索（hybrid 模式，FTS5 + 向量召回）增强上下文；
- LLM 语义级判断冲突；
- 合并基础规则与 AI 发现，输出统一结构化结果；
- 支持降级：LLM 未配置或失败时返回基础结果 + 检索证据。

#### 6.3 独立校验页

- 粘贴待校验文本（10–50000 字）；
- 基础校验与 AI 增强校验按钮；
- 展示校验统计（状态/警告数/伏笔提醒数/检查角色数）与 finding 列表。

### 7. 自定义 AI API 与 RAG 增强

HetuSketch 的 AI 能力是可选增强模块。用户可以完全关闭 AI，仅使用离线基础功能。

#### 7.1 自定义 LLM / Embedding API

- 服务商协议：OpenAI 兼容（`/chat/completions`、`/embeddings`）、Anthropic 兼容（`/messages`）；
- API Base URL、API Key、默认模型名称、超时时间；
- 连接测试；
- API Key 使用 AES-256-GCM 加密存储，不暴露给渲染端；
- LLM 与 Embedding 可独立配置与启停。

#### 7.2 RAG 向量知识库

- 通过 Embedding API 将设定条目分块向量化（900 字符 / 120 重叠）；
- 向量存储在本地 SQLite；
- 支持 FTS / Vector / Hybrid 三种检索模式；
- 索引状态追踪：ready / dirty / building / degraded / empty；
- 条目变更自动标记索引 dirty。

#### 7.3 自定义系统提示词

- 全局默认提示词；
- 4 个场景提示词：logic_check / setting_completion / foreshadowing / rag_qa。

#### 7.4 技能与 HTTP 工具

- 5 个内置技能开关：basic_rule_check / rag_search / setting_completion / foreshadowing / http_tools；
- 用户注册 HTTP 回调工具（JSON Schema 参数、域名白名单、超时限制）；
- 敏感 header 自动过滤（authorization / api-key / token / secret 等）。

### 8. 个性化配置

#### 8.1 主题

- 浅色 / 深色主题切换，持久化到 localStorage。

#### 8.2 字体定制

- 功能栏字体（族 / 字号 / 颜色）；
- 编辑区字体（族 / 字号 / 颜色）；
- 系统字体列表自动枚举（Windows PowerShell / macOS fc-list / Linux fc-list）；
- 字体设置持久化，实时预览。

#### 8.3 桌面交互

- 主窗口置顶开关；
- 悬浮速查窗显示 / 隐藏 / 置顶。

---

## 独特优势

### 1. 不代笔，只校验

与 NovelAI、通用聊天机器人或 AI 续写工具不同，HetuSketch 不以生成正文为核心目标，而是辅助作者保持逻辑一致性。

### 2. 用户掌控数据

所有设定数据默认保存在本地，用户可以直接备份、迁移或使用 Git 管理版本。

### 3. 离线可用

基础设定管理、搜索和规则校验无需联网即可使用。

### 4. AI 可选增强

用户可以自由选择是否接入 AI API，不配置 AI 也不影响核心功能。

### 5. 一体化工作台

VSCode 风工作台将设定管理、正文创作、逻辑校验、AI 辅助整合在统一界面，支持多 Tab 分割编辑，减少工具切换成本。

### 6. 适配桌面创作习惯

Windows 桌面应用和全局悬浮窗设计，让用户可以在外部写作软件旁边快速查阅设定。

### 7. 面向长篇创作

设定集、作品、书目、章节四级结构与角色、世界观、伏笔、规则红线体系围绕长篇创作中的一致性问题设计。

---

## 安装与配置指南

> 当前项目处于开发阶段。以下安装方式适用于开发者本地运行和调试。正式安装包发布后，可直接下载 `.exe` 安装程序使用。

### 环境要求

| 项目 | 要求 |
| --- | --- |
| 操作系统 | Windows 10 / Windows 11 x64 |
| Node.js | 18.x 或更高版本 |
| 包管理器 | npm（项目默认使用 npm，也兼容 pnpm / yarn） |
| 桌面框架 | Electron 33 |
| 前端框架 | React 18 + TypeScript 5.7 |
| UI 组件库 | Ant Design 5 |
| 本地索引 | better-sqlite3 + SQLite FTS5 |
| 文件监听 | chokidar 5 |
| 构建工具 | electron-vite 3 + Vite 6 |
| 可选 AI 能力 | OpenAI 兼容 API、Anthropic 兼容 API 或本地模型网关 |
| 可选 Embedding | OpenAI Embedding 或其他兼容服务 |

### 获取项目

```bash
git clone <repository-url>
cd HetuSketch
```

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

启动后，应用将以开发模式运行。主窗口加载工作台界面，悬浮速查窗加载 `/quick-lookup` 路由。

### 类型检查

```bash
npm run typecheck
```

该命令分别对 `tsconfig.node.json`（主进程 / preload / 配置）、`tsconfig.web.json`（渲染端）、`tsconfig.vitest.json`（测试）执行 `tsc --noEmit`。

### 代码检查

```bash
npm run lint
```

使用 ESLint 9 扁平配置，集成 `@typescript-eslint`、`react-hooks`、`react-refresh` 插件。

### 运行测试

```bash
npm test
```

使用 Vitest + jsdom + Testing Library。原生模块（electron、better-sqlite3、adm-zip、chokidar）在测试中被 mock 替换。如需测试原生模块逻辑：

```bash
npm run test:native
```

### 构建桌面应用

```bash
npm run build
```

该命令先执行 typecheck，再通过 electron-vite 构建 main / preload / renderer 三段产物到 `out/` 目录。

### 打包安装程序

```bash
npm run dist
```

使用 electron-builder 生成 Windows NSIS 安装包，输出到 `release/` 目录。支持自定义安装目录。

---

## 基础配置方法

### 1. 创建作品

首次进入应用后：

1. 在活动栏点击"书目管理"图标；
2. 在主编辑器区打开"书目管理"页面；
3. 点击"新建作品"，填写名称、类型和简介；
4. 创建后点击"设为当前"。

### 2. 录入基础设定

1. 在活动栏切换到"角色数据管理"或"世界观设定管理"；
2. 在主侧边栏的树形视图中查看与管理条目；
3. 点击"新增"填写角色性格、能力、背景和行为红线；
4. 创建世界观条目并填写规则红线；
5. 在"限时数据库管理"中录入伏笔线索。

### 3. 创作正文

1. 在活动栏点击"文本管理"图标；
2. 主侧边栏展示章节树（书 > 分卷 > 章节）；
3. 点击章节在编辑器中打开；
4. 使用顶部工具栏切换编辑/预览/分屏模式；
5. 使用查找替换与逻辑校验功能。

### 4. 使用逻辑校验

1. 在文本编辑器中选择校验范围（章节/分卷/作品）；
2. 点击"逻辑校验"按钮；
3. 或在独立校验页粘贴待检查文本；
4. 查看冲突提示与建议。

### 5. 配置 AI API（可选）

进入"系统设置 → AI 供应商"：

- LLM 配置：provider、baseUrl、model、apiKey、timeout；
- Embedding 配置：同上；
- 点击"测试连接"验证；
- 点击"构建向量索引"启用 RAG。

### 6. 个性化外观（可选）

进入"系统设置 → 通用"：

- 主题切换（浅色/深色）；
- 功能栏字体（族/字号/颜色）；
- 编辑区字体（族/字号/颜色）。

---

## 项目结构

```text
HetuSketch/
├── build/                          # 打包资源（图标等）
├── docs/                           # 项目文档
│   ├── architecture.md             # 技术架构文档
│   ├── api.md                      # IPC API 接口说明
│   ├── data-format.md              # 数据格式说明
│   ├── ui-layout.md                # UI 排版与工作台布局文档
│   ├── agents.md                   # 智能体调用与协作方案
│   ├── implementation.md           # 实现说明
│   ├── validation.md               # 校验逻辑说明
│   ├── iteration-1-summary.md      # 第一次迭代总结
│   └── iteration-2-advanced-features.md  # 第二次迭代高级功能
├── src/
│   ├── main/                       # Electron 主进程
│   │   ├── index.ts                # 主进程入口：窗口、托盘、快捷键、IPC 注册
│   │   ├── services/               # 主进程服务层
│   │   │   ├── storageService.ts   # 业务门面：聚合所有子服务
│   │   │   ├── projectFileStore.ts # 作品文件系统读写、导入导出
│   │   │   ├── indexDatabase.ts    # SQLite 索引、FTS5、向量块
│   │   │   ├── indexService.ts     # 文件扫描、监听、增量同步
│   │   │   ├── aiService.ts        # AI 配置、LLM、Embedding、RAG
│   │   │   ├── bookService.ts      # 书目 manifest CRUD、设定集绑定
│   │   │   ├── chapterService.ts   # 卷与章节 CRUD、目录树装配
│   │   │   ├── settingSetService.ts# 设定集 manifest CRUD
│   │   │   ├── fontService.ts      # 跨平台系统字体枚举
│   │   │   ├── entrySerialization.ts # JSON/Markdown 序列化
│   │   │   ├── storagePaths.ts     # 路径计算与安全校验
│   │   │   ├── storageService.test.ts
│   │   │   ├── entrySerialization.test.ts
│   │   │   └── storagePaths.test.ts
│   │   └── test/                   # 测试 mock（electron/sqlite/chokidar/adm-zip）
│   ├── preload/
│   │   └── index.ts                # contextBridge 暴露 window.hetuSketch
│   ├── renderer/                   # React 渲染端
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.tsx             # 工作台外壳：TitleBar/ActivityBar/Sidebar/Editor/Panel
│   │       ├── main.tsx            # React 入口
│   │       ├── styles.css          # 全局样式与工作台布局
│   │       ├── iterationStore.ts   # localStorage 章节树与设定集
│   │       ├── store/
│   │       │   └── appStore.ts     # Zustand 全局状态
│   │       ├── pages/              # 页面模块
│   │       │   ├── DashboardPage.tsx
│   │       │   ├── ProjectsPage.tsx
│   │       │   ├── EntriesPage.tsx       # 角色/世界观/伏笔复用
│   │       │   ├── WritingStudioPage.tsx # 文本编辑器
│   │       │   ├── ChecksPage.tsx        # 逻辑校验
│   │       │   ├── SettingsPage.tsx      # 系统设置
│   │       │   ├── SettingSetsPage.tsx   # 设定集管理
│   │       │   ├── QuickLookupPage.tsx   # 悬浮速查窗
│   │       │   └── PlaceholderPage.tsx
│   │       ├── components/
│   │       │   └── RelationshipCanvas.tsx # 角色关系力导向图谱
│   │       ├── App.test.tsx
│   │       └── vite-env.d.ts
│   └── shared/                     # 跨进程共享类型
│       ├── ipc.ts                  # IPC channel 常量与 HetuSketchApi 接口
│       └── storageTypes.ts         # 全部领域模型与 DTO
├── electron.vite.config.ts         # electron-vite 三段构建配置
├── eslint.config.js                # ESLint 9 扁平配置
├── tsconfig.json                   # 根 tsconfig（project references）
├── tsconfig.node.json              # 主进程/preload TS 配置
├── tsconfig.web.json               # 渲染端 TS 配置
├── tsconfig.vitest.json            # 测试 TS 配置
├── vitest.config.ts                # Vitest 配置（含原生模块 mock）
└── package.json
```

---

## 数据存储说明

HetuSketch 的数据策略遵循以下原则：

- 用户数据默认存储在本地；
- 设定文件尽量保持人类可读（JSON / Markdown）；
- SQLite 仅作为索引和查询加速层，可随时从文件重建；
- API Key 使用 AES-256-GCM 加密保存；
- 导出数据不包含 API Key；
- AI 请求仅发送必要上下文，不主动上传完整作品数据。

### 数据目录结构

```text
<electron userData>/data/
├── hetusketch-index.sqlite         # SQLite 索引数据库
├── projects/                       # 作品事实数据
│   └── <projectId>/
│       ├── project.json
│       ├── characters/<entryId>.json|.md
│       ├── worlds/<entryId>.json|.md
│       ├── plots/<entryId>.json|.md
│       └── assets/
├── setting-sets/                   # 设定集
│   └── <setId>/
│       ├── setting-set.json
│       ├── characters/
│       ├── worlds/
│       └── assets/
└── books/                          # 书目
    └── <bookId>/
        ├── book.json
        ├── volumes/<volId>.json
        ├── chapters/<chId>.md
        ├── chapters/<chId>.json    # 章节元数据
        ├── characters/
        ├── worlds/
        └── assets/
```

### SQLite 索引表

| 表 | 作用 |
| --- | --- |
| `projects` | 作品元数据 |
| `entries` | 条目摘要、类型、文件路径、可搜索文本 |
| `relations` | 条目间关系 |
| `recent_access` | 最近访问记录 |
| `file_index` | 文件 mtime、size、sha256，用于增量同步 |
| `app_config` | AI 配置、提示词、技能等 |
| `http_tools` | 用户注册 HTTP 工具 |
| `vector_chunks` | RAG 分块与 embedding |
| `vector_index_state` | 向量索引状态 |
| `search_index` | FTS5 全文检索虚拟表 |

---

## AI 能力说明

AI 能力是增强功能，不是必要依赖。

| 能力 | 是否必需 | 说明 |
| --- | --- | --- |
| 基础设定管理 | 否 | 不依赖 AI |
| 全局搜索 | 否 | 基于本地 FTS5 索引 |
| 基础逻辑校验 | 否 | 基于规则与关键词匹配 |
| AI 语义校验 | 是 | 需要配置 LLM API |
| AI 设定补全 | 是 | 需要配置 LLM API |
| RAG 检索增强 | 是 | 需要配置 Embedding API |
| 伏笔语义提醒 | 是 | 需要配置 LLM API |

关闭 AI 后，软件仍可作为本地设定管理和基础逻辑校验工具使用。所有 AI 方法在 LLM/Embedding 未配置或调用失败时返回 `degraded` 或 `error` 响应，并附带检索证据，不阻断主流程。

---

## 开发状态

当前项目状态：**开发阶段**，已形成完整的 Electron 本地桌面应用架构。

### 已实现

- VSCode 风工作台外壳（活动栏、主/辅侧边栏、多 Tab 可分割编辑器、底部面板、状态栏、Sash 拖拽）；
- 设定集、作品、书目、章节四级创作链路；
- 角色、世界观、伏笔三类设定条目管理（卡片/列表/关系网视图）；
- 角色关系力导向图谱可视化；
- 文本编辑器（章节树、Markdown 编辑/预览/分屏、查找替换）；
- 基础逻辑校验（人设红线、世界观规则、伏笔提醒）；
- AI 增强校验与 RAG 检索（FTS / Vector / Hybrid）；
- AI 设定补全与伏笔提醒；
- 自定义 LLM / Embedding API 配置（OpenAI / Anthropic 兼容）；
- 自定义提示词、技能开关、HTTP 工具；
- 全局搜索（FTS5）与悬浮速查窗；
- 作品导入导出（ZIP / 文件夹）；
- 主题切换与字体定制；
- 系统托盘与全局快捷键。

### 后续规划

- 统一 IPC schema 校验（zod / valibot）；
- 将 localStorage 迭代状态（章节树、设定集）迁移到主进程文件事实源；
- 导入冲突策略（覆盖 / 重命名 / 取消）；
- 向量索引性能优化（sqlite-vec / hnswlib-node）；
- API Key 迁移到系统凭据管理器；
- 数据库 schema 版本化迁移；
- 后台任务队列（导入导出、全量索引、向量构建）；
- 关系图数据服务化；
- 多工作区与外部路径项目支持；
- 插件化 AI 能力；
- 跨平台适配验证（macOS / Linux）。

---

## 许可证

当前暂未指定开源许可证。正式发布前建议补充 `LICENSE` 文件，明确项目使用、修改和分发规则。
