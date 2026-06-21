# 常见问题排查

## better-sqlite3 错误

现象：启动或测试时报原生模块 ABI 错误。

处理：

```powershell
npm run eb:rebuild
```

或重新安装依赖。

## FTS 搜索无结果

- 确认条目文件存在且格式可解析。
- 执行索引重建：`window.hetuSketch.index.rebuild(projectId)`。
- 检查 `hetusketch-index.sqlite` 是否可写。

## AI 连接失败

- 确认 LLM / Embedding 已启用。
- 检查 Base URL、模型名、API Key。
- 注意错误信息不会回显密钥。

## RAG 无结果或状态 dirty

- 确认 Embedding 配置可用。
- 重新执行 `rag.build(projectId)`。
- 如果未配置 Embedding，会降级为 FTS。

## 构建失败

按顺序定位：

```powershell
npm run typecheck
npm run lint
npm run test
```

先修复类型或 lint 错误，再运行 build。
