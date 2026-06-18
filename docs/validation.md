# HetuSketch 运行验证说明

本文说明当前工程的验证命令、测试覆盖范围和手动验证路径。

## 1. 自动化验证命令

在项目根目录执行：

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

命令含义：

| 命令 | 说明 |
| --- | --- |
| `npm run typecheck` | 分别检查 `tsconfig.node.json`、`tsconfig.web.json`、`tsconfig.vitest.json` |
| `npm run lint` | 使用 ESLint 检查全仓库 TypeScript/React 代码 |
| `npm run test` | 使用 Vitest 执行单元/集成测试 |
| `npm run build` | 先执行 typecheck，再执行 `electron-vite build` 生成 out 产物 |

## 2. 当前测试覆盖

测试文件：

- `src/main/services/storageService.test.ts`
  - 创建作品目录、保存 JSON 条目、FTS5 搜索。
  - Markdown 条目存储、zip 导出、文件夹导入、索引重建。
  - AI 配置不暴露明文密钥、AI 关闭时增强校验降级。
  - Mock Embedding 构建向量索引、RAG 向量查询、向量索引 dirty/ready 状态、LLM 不可用时 RAG 回答降级。
  - 提示词、技能、HTTP 工具配置与 URL/header 安全约束。
  - 条目 CRUD、最近访问、Dashboard 统计、基础校验。
- `src/main/services/entrySerialization.test.ts`
  - JSON/Markdown 条目序列化和解析。
  - 旧/缺省字段归一化。
  - 可搜索文本提取覆盖标题、内容、红线、规则、关系、自定义字段。
- `src/renderer/src/App.test.tsx`
  - 渲染主应用壳、侧边导航和顶部搜索入口。

## 3. 手动冒烟验证

开发运行：

```powershell
npm run dev
```

建议验证路径：

1. 启动应用，确认主窗口显示 HetuSketch、左侧导航和顶部搜索框。
2. 新建作品，使用作品列表中的编辑入口修改名称/简介，确认 Dashboard 数据刷新。
3. 新建角色，填写外观、能力、背景、关系、自定义字段和红线，例如“绝不背叛朋友”。
4. 新建世界观规则，例如“魔法不能复活死者”，用分类筛选确认只显示对应分类。
5. 新建伏笔，状态保持未回收/open；使用状态筛选和“标记已回收”按钮确认状态更新。
6. 在搜索框输入角色、规则或伏笔关键词，确认可命中。
7. 在校验页输入包含红线和世界观规则关键词的文本，确认返回 warning；输入伏笔关键词时确认出现 info 提醒。
8. 在作品页导出 zip，再通过导入目录/导入 Zip 验证安全 IPC 路径。
9. 使用托盘或 `Ctrl+Shift+H` 切换悬浮速查窗口，验证置顶显示、隐藏和搜索入口。
10. 在设置页保存 AI 配置，确认再次读取时只显示 `apiKeySet`，不会展示明文 Key；切换技能开关、HTTP 工具启用状态。
11. 构建 RAG 向量索引，确认 UI 展示 status、dirty、updatedAt、分块和 warnings；未配置或关闭 AI 时调用 AI 增强校验/RAG 回答，确认有 degraded 提示且本地基础结果仍可用。

## 4. 数据文件验证

可在 Electron 用户数据目录下检查：

```text
<userData>/data/projects/<projectId>/project.json
<userData>/data/projects/<projectId>/characters/*.json|md
<userData>/data/projects/<projectId>/worlds/*.json|md
<userData>/data/projects/<projectId>/plots/*.json|md
<userData>/data/hetusketch-index.sqlite
```

预期：

- `project.json` 与条目文件可用文本编辑器读取。
- 外部修改条目文件后，运行中的应用会通过文件监听同步索引；必要时可调用重建索引。
- `hetusketch-index.sqlite` 可删除后通过扫描作品目录重建，不应作为唯一事实源。

## 5. 失败排查

- `better-sqlite3` 相关错误：确认依赖已安装且 Node/Electron ABI 与当前环境兼容。
- FTS5 搜索无结果：先运行索引重建，确认条目文件格式可解析。
- AI 连接测试失败：确认 `enabled`、Base URL、模型名和 API Key；错误信息不会回显密钥。
- 构建失败：先单独运行 `npm run typecheck` 和 `npm run lint` 定位类型或规范问题。
