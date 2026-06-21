# 测试策略

## 自动化命令

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

## 测试范围

| 文件 | 覆盖内容 |
| --- | --- |
| `src/main/services/storageService.test.ts` | 作品、条目、搜索、导入导出、AI 降级、RAG、HTTP 工具等主服务行为。 |
| `src/main/services/entrySerialization.test.ts` | JSON/Markdown 条目序列化、解析和可搜索文本提取。 |
| `src/main/services/storagePaths.test.ts` | 路径计算和路径安全。 |
| `src/renderer/src/App.test.tsx` | React 应用壳基础渲染。 |

## 手动冒烟路径

1. 启动应用，确认主窗口显示工作台。
2. 创建作品并设为当前作品。
3. 创建角色、世界观、伏笔条目。
4. 搜索角色或规则关键词。
5. 在写作页创建章节并编辑 Markdown。
6. 运行基础逻辑校验。
7. 打开悬浮速查窗并验证搜索。
8. 在设置中保存 AI 配置，确认不回显明文 Key。
9. 导出作品 ZIP，再导入验证。
