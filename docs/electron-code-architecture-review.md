# Electron 项目代码评估报告

## 总体评分
- 架构设计：6.5/10
- 代码整洁度：6.0/10
- 性能：6.5/10
- 安全性：7.0/10
- 可维护性：5.5/10
- **综合评分：6.4/10**

## 主要优点（列出 3~5 项做得好的地方）
- Electron 安全基础配置较好：[主窗口与悬浮窗](file:///g:/AAA_blog/HetuSketch/src/main/index.ts#L37-L50) 均启用了 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`，符合 Electron 20+ 的基础安全要求。
- IPC API 有集中类型契约：[IPC_CHANNELS 与 HetuSketchApi](file:///g:/AAA_blog/HetuSketch/src/shared/ipc.ts#L45-L260) 将通道名和渲染层可调用 API 显式建模，优于直接在渲染层散落字符串通道。
- preload 暴露面相对可控：[contextBridge.exposeInMainWorld](file:///g:/AAA_blog/HetuSketch/src/preload/index.ts#L4-L197) 只暴露业务 API，没有暴露 `ipcRenderer`、`fs`、`process` 等高危对象。
- AI 能力分层较清晰：业务层 [AiService](file:///g:/AAA_blog/HetuSketch/src/main/services/aiService.ts#L134-L143)、Provider 适配层 [providerAdapter](file:///g:/AAA_blog/HetuSketch/src/main/services/aiCore/providerAdapter.ts#L75-L287)、共享类型 [storageTypes](file:///g:/AAA_blog/HetuSketch/src/shared/storageTypes.ts#L388-L669) 基本形成了配置、请求构建、响应解析、RAG 数据结构的边界。
- 工程化基础完整：[package.json](file:///g:/AAA_blog/HetuSketch/package.json#L11-L20) 提供了 `typecheck`、`lint`、`test`、`build`、`dist` 脚本；[eslint.config.js](file:///g:/AAA_blog/HetuSketch/eslint.config.js#L25-L43) 已接入 TypeScript、React Hooks、React Refresh 规则。

## 关键问题（按严重性从高到低排序）
### 严重（必须立即修复）
- 主进程入口承担过多职责，`registerIpcHandlers` 集中注册约 77 个 handler/listener，窗口管理、桌面集成、输入校验、存储转发、AI 流式转发全部堆叠在同一文件中。位置：[src/main/index.ts](file:///g:/AAA_blog/HetuSketch/src/main/index.ts#L247-L468)。修复建议：按领域拆为 `main/windows/*`、`main/ipc/*`、`main/ipc/validators.ts`、`main/desktop/*`；每个模块导出 `registerXxxIpc(storageService)`，主入口只负责生命周期编排。
- 写作章节数据存在“双轨存储”架构：主进程已经有 `BookService`/`ChapterService` 与 IPC 能力，但渲染层写作工作台仍通过 [iterationStore.ts](file:///g:/AAA_blog/HetuSketch/src/renderer/src/iterationStore.ts#L27-L304) 直接写 `localStorage`；[WritingStudioPage](file:///g:/AAA_blog/HetuSketch/src/renderer/src/pages/WritingStudioPage.tsx#L7-L154) 调用 `ensureDefaultBook/listChapters/upsertChapter/removeChapter`，绕过主进程持久化、索引、备份与导入导出链路。修复建议：废弃 `iterationStore` 的章节持久化职责，统一改为 `window.hetuSketch.books/chapters` IPC；迁移时增加一次性 localStorage 数据导入逻辑。
- 自定义 HTTP 工具存在 SSRF/内网访问风险。虽然 [assertHttpUrl](file:///g:/AAA_blog/HetuSketch/src/main/services/aiService.ts#L1208-L1214) 限制了 HTTP/HTTPS，但没有限制 localhost、内网 IP、metadata 地址、重定向目标；[executeHttpTool](file:///g:/AAA_blog/HetuSketch/src/main/services/aiService.ts#L944-L963) 会由模型工具调用触发请求。修复建议：默认禁用工具已做对，但启用后仍应增加 allowlist、禁止 `localhost/127.0.0.1/::1/10.0.0.0/8/172.16.0.0/12/192.168.0.0/16/169.254.169.254`、禁止自动跟随跨域重定向、记录审计日志，并要求用户逐次确认高风险目标。
- 渲染层直接使用 `dangerouslySetInnerHTML` 渲染 Markdown。当前 [renderMarkdown](file:///g:/AAA_blog/HetuSketch/src/renderer/src/pages/WritingStudioPage.tsx#L503-L512) 先转义再替换，短期降低了 XSS 风险，但自研正则 Markdown 渲染很脆弱，后续一旦增加链接、图片、HTML 透传就容易引入注入。位置：[WritingStudioPage](file:///g:/AAA_blog/HetuSketch/src/renderer/src/pages/WritingStudioPage.tsx#L228-L228)。修复建议：使用成熟 Markdown 渲染器并接入 DOMPurify/rehype-sanitize；禁止 HTML 透传；将预览组件独立封装并加 XSS 用例。

### 中等（建议近期优化）
- preload 中 4 个 AI 流式方法存在重复实现，均手写 `requestId`、动态通道、`on/end/error` 监听、cleanup。位置：[src/preload/index.ts](file:///g:/AAA_blog/HetuSketch/src/preload/index.ts#L75-L154)。修复建议：提取一个 `createStreamInvoker(channel, sendArgs, onChunk)` 内部函数，统一使用 `ipcRenderer.once` 监听 end/error，减少重复与遗漏。
- 流式 IPC 监听使用 `removeAllListeners(dynamicChannel)`，如果同一 `requestId` 被复用，会清理同通道上的其他监听。位置：[src/preload/index.ts](file:///g:/AAA_blog/HetuSketch/src/preload/index.ts#L82-L149)。修复建议：保存具体 listener 引用并使用 `removeListener(channel, listener)`；同时在 renderer/preload 侧强制生成不可覆盖的 requestId，不信任调用者传入的 requestId。
- `openAppWindow` 生产环境通过 `executeJavaScript` 操作 History，增加了 CSP 和安全审计复杂度。位置：[src/main/index.ts](file:///g:/AAA_blog/HetuSketch/src/main/index.ts#L218-L229)。修复建议：统一使用 HashRouter 路径加载，例如 `loadFile(..., { hash: normalizedHash })`；或通过安全 IPC/初始化参数传递路由，不注入脚本。
- App 根组件过大，承载布局、ActivityBar、TitleBar、Sidebar、EditorWorkbench、拖拽、标签页、本地持久化和路由映射。位置：[src/renderer/src/App.tsx](file:///g:/AAA_blog/HetuSketch/src/renderer/src/App.tsx#L138-L611)。修复建议：拆分为 `WorkbenchShell`、`layoutStore`、`activityStore`、`EditorTabsProvider`、`SidebarTree` 等模块；把 localStorage 读写封装到专用 store。
- `StorageService` 仍是“上帝服务”倾向，既聚合项目/条目/书籍/章节，又转发 AI/RAG/Agent/导入导出/基础校验。位置：[src/main/services/storageService.ts](file:///g:/AAA_blog/HetuSketch/src/main/services/storageService.ts#L72-L410)。修复建议：保留门面可以，但把 AI、RAG、Validation、Project、Entry、Book/Chapter 的 IPC handler 直接依赖各自 service，避免所有调用都经由 StorageService。
- AI 配置加密为 AES-GCM 是加分项，但密钥派生仅来自用户名、主机名和固定 scope。位置：[src/main/services/aiService.ts](file:///g:/AAA_blog/HetuSketch/src/main/services/aiService.ts#L1184-L1206)。修复建议：生产版优先使用 Electron `safeStorage` 或系统凭据库；保留当前方案只能作为 fallback，并在配置迁移中标记加密版本。
- Provider 适配层代码风格与项目主体不一致，缺少分号且注释密度明显偏高。位置：[src/main/services/aiCore/providerAdapter.ts](file:///g:/AAA_blog/HetuSketch/src/main/services/aiCore/providerAdapter.ts#L1-L287)。修复建议：统一格式化规则，引入 Prettier 或 ESLint stylistic，避免单个文件形成“外来风格孤岛”。
- 部分 UI 仍使用 `window.prompt` 创建资源，交互、校验和可测试性较弱。位置：[App.tsx](file:///g:/AAA_blog/HetuSketch/src/renderer/src/App.tsx#L661-L661)、[WritingStudioPage.tsx](file:///g:/AAA_blog/HetuSketch/src/renderer/src/pages/WritingStudioPage.tsx#L106-L106)、[RelationshipCanvas.tsx](file:///g:/AAA_blog/HetuSketch/src/renderer/src/components/RelationshipCanvas.tsx#L169-L169)。修复建议：统一改为 Ant Design Modal/Form，并复用项目的输入校验与错误提示模式。

### 轻微（可逐步改进）
- 渲染入口存在开发期日志和 ESLint 禁用注释。位置：[main.tsx](file:///g:/AAA_blog/HetuSketch/src/renderer/src/main.tsx#L1-L64)。修复建议：按环境封装 logger，生产构建关闭调试日志；对 ESLint disable 添加具体原因或通过拆分组件消除。
- `SettingsPage`、`EntriesPage`、`WritingStudioPage` 都偏长，表单状态、列表状态、AI 状态混合在页面组件中。位置：[SettingsPage](file:///g:/AAA_blog/HetuSketch/src/renderer/src/pages/SettingsPage.tsx#L45-L325)、[EntriesPage](file:///g:/AAA_blog/HetuSketch/src/renderer/src/pages/EntriesPage.tsx#L44-L346)、[WritingStudioPage](file:///g:/AAA_blog/HetuSketch/src/renderer/src/pages/WritingStudioPage.tsx#L22-L513)。修复建议：按业务动作提取 hooks，如 `useAiSettings`、`useEntryList`、`useWritingChapters`、`useAiStreamingPanel`。
- 测试覆盖集中在存储路径、序列化、部分 App 渲染，缺少 IPC contract、preload API、AI provider adapter、RAG 降级、流式通道清理测试。位置：[vitest.config.ts](file:///g:/AAA_blog/HetuSketch/vitest.config.ts#L19-L35) 与现有测试文件列表。修复建议：增加 main/preload 单元测试和契约测试，至少覆盖每类 IPC 的入参校验与错误返回。
- `electron.vite.config.ts` 已做 vendor 拆包，但 lazy 页面仍可能因 Ant Design 全量使用导致页面 chunk 偏大。位置：[electron.vite.config.ts](file:///g:/AAA_blog/HetuSketch/electron.vite.config.ts#L31-L57)。修复建议：定期输出 bundle report，识别超大页面组件和重复依赖。

## 详细的改进建议（分维度）
### 架构优化
- 主进程采用“薄入口 + 模块化注册”结构：`index.ts` 只保留 `app.whenReady`、窗口创建、生命周期关闭；IPC 按 `projectsIpc.ts`、`entriesIpc.ts`、`booksIpc.ts`、`aiIpc.ts`、`desktopIpc.ts` 拆分。
- 统一数据源：章节、书目、设定、项目都应走主进程服务和 SQLite/文件索引，不应让 renderer 通过 localStorage 维护核心业务数据。`iterationStore.ts` 可保留为临时 UI 草稿缓存，但不能作为真实持久化层。
- 将 IPC 入参校验抽为 schema/validator 层。当前 [asObject/asRequiredString/asValidationRequest](file:///g:/AAA_blog/HetuSketch/src/main/index.ts#L500-L587) 分散在主入口底部，建议迁移为 `shared/contracts` 或 `main/ipc/validators`，并为每个 channel 声明 request/response 类型。
- 将 AI 能力拆为 `AiConfigService`、`RagService`、`AgentService`、`ToolService`、`ProviderClient`。现在 [AiService](file:///g:/AAA_blog/HetuSketch/src/main/services/aiService.ts#L134-L1134) 覆盖配置、Agent、HTTP 工具、RAG、LLM 调用、Embedding、流式解析编排，后续会快速膨胀。
- Renderer 侧引入“页面容器 + 领域 hooks + 纯展示组件”的模式：页面负责组合，hooks 负责数据加载/命令，组件只负责渲染。优先拆 `App.tsx`、`SettingsPage.tsx`、`EntriesPage.tsx`。

### 代码整洁改进
- 建立最大文件长度和最大函数复杂度阈值。例如页面组件超过 300 行必须拆分，service 超过 500 行必须按领域拆模块。
- 统一代码风格：当前项目多数 TS 使用分号，但 `providerAdapter.ts` 无分号且注释风格不同。建议用 Prettier 或 ESLint stylistic 在 CI 中强制格式化。
- 移除重复流式 IPC 样板：preload 和 main 中 4 类 AI stream 都可用通用 helper 降低重复。
- 将 `window.prompt`、直接 `console.log/error`、临时 localStorage 清理逻辑纳入“垃圾代码清单”，逐步替换为统一 Modal、logger、migration。
- 错误处理分层：main service 抛业务错误，IPC 层包装为稳定错误结构；renderer 不直接依赖错误 message 文案做逻辑判断。

### 性能调优
- 保留已有优化：主窗口 `ready-to-show` 后初始化 storage、悬浮窗懒创建、页面 lazy load、vendor chunk 拆分都是合理方向。位置：[启动初始化](file:///g:/AAA_blog/HetuSketch/src/main/index.ts#L52-L60)、[悬浮窗懒创建](file:///g:/AAA_blog/HetuSketch/src/main/index.ts#L482-L493)、[页面懒加载](file:///g:/AAA_blog/HetuSketch/src/renderer/src/App.tsx#L33-L39)。
- RAG 向量构建目前逐 chunk 串行请求 Embedding。位置：[buildVectorIndex](file:///g:/AAA_blog/HetuSketch/src/main/services/aiService.ts#L388-L428)。建议加入小并发队列、失败重试策略和增量 dirty chunk 构建，避免大项目构建时间线性放大。
- `RelationshipCanvas` 每帧 `setNodes` 做力导向模拟，节点多时已经有 `nodes.length > 220` 限制。位置：[RelationshipCanvas](file:///g:/AAA_blog/HetuSketch/src/renderer/src/components/RelationshipCanvas.tsx#L85-L97)。建议进一步用 `useReducer`/Web Worker/Canvas 绘制，避免复杂 SVG + React state 高频更新。
- `EntriesPage` 先 list 再对每条 entry 并发 get。位置：[EntriesPage](file:///g:/AAA_blog/HetuSketch/src/renderer/src/pages/EntriesPage.tsx#L88-L103)。建议为列表页提供包含摘要字段的批量 API，详情抽屉打开时再读取完整正文。
- 对 Ant Design 和图标库做 bundle 分析，避免所有页面共享过大的 UI chunk。

### 安全加固
- 继续保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`，并补充 CSP。当前未看到 renderer HTML/CSP 配置，建议在 [index.html](file:///g:/AAA_blog/HetuSketch/src/renderer/index.html) 添加严格 CSP，开发/生产分别配置。
- 对 `openAppWindow(path)` 加白名单路由校验，禁止任意 path 注入路由状态；生产环境去掉 [executeJavaScript](file:///g:/AAA_blog/HetuSketch/src/main/index.ts#L224-L228)。
- HTTP 工具必须做 SSRF 防护、重定向限制、目标 allowlist、执行审计和用户确认；工具返回内容也应限制 MIME 和大小。
- API Key 存储迁移到 `safeStorage`/系统凭据库；当前 AES-GCM 方案建议仅作为兼容 fallback。
- Markdown 预览采用成熟 sanitizer，不允许任意 HTML；对图片、链接、协议做白名单限制。
- `setWindowOpenHandler` 已拦截新窗口并转外部浏览器。位置：[src/main/index.ts](file:///g:/AAA_blog/HetuSketch/src/main/index.ts#L68-L76)。建议同时监听 `will-navigate`，阻止主窗口被导航到外部 URL。

### 工程化提升
- 在 CI 中强制执行 `npm run typecheck && npm run lint && npm run test`，并要求新增 IPC/AI 功能必须附带测试。
- 增加契约测试：从 `IPC_CHANNELS` 枚举自动检查 preload 是否暴露对应方法、main 是否注册对应 handler/listener，防止通道漂移。
- 增加安全测试：SSRF URL 阻断、Markdown XSS、AI Key 不回传 renderer、外部导航阻断。
- 增加架构文档与代码目录一致性检查：docs 中已有 architecture/ipc/state 文档，建议每次 PR 修改主进程 IPC 或存储模型时同步更新对应文档。
- 使用 bundle analyzer 和性能基线，记录启动时间、主窗口 ready-to-show、storage 初始化耗时、RAG 构建耗时，防止性能退化。

## 防范垃圾代码堆积的具体措施（针对团队）
- 制定编码规范并强制执行（如 ESLint + husky）
- 定期进行代码审查（每周一次）
- 引入架构评审门槛（如 PR 合并前必须通过架构检查）
- 建立技术债务跟踪表，每迭代清理一次
- 额外建议：建立“Electron 安全检查清单”，每次新增 BrowserWindow、preload API、IPC channel、外部 URL/HTTP 调用时必须逐项确认。
- 额外建议：设定文件复杂度红线，超过阈值必须拆分；禁止将临时 localStorage、window.prompt、console 调试日志作为最终实现合入主干。
- 额外建议：为 AI/RAG/工具调用建立风险分级，涉及外部网络、模型工具调用、用户密钥的改动必须经过安全评审。
