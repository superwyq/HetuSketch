# AI 流式交互

## 使用场景

- AI 增强校验。
- RAG 问答。
- 设定补全。
- 伏笔提醒。
- 剧情画布正文生成。

## 交互模型

1. 用户点击 AI 相关按钮。
2. UI 创建或复用 `requestId`。
3. Preload 监听 `chunk/end/error` 临时通道。
4. 主进程逐块发送 `AiStreamChunk`。
5. UI 展示实时状态、证据和最终结果。
6. 结束后移除监听器。

## 剧情画布生成交互

- 入口：`PlotboardPage` 工具栏“生成正文”。
- 模式：单卡、选区、全章、续写、重写。
- 选卡要求：单卡、选区、续写、重写必须至少选中一张剧情卡。
- 流式通道：`plotboards:generate:stream:chunk/end/error:<requestId>`。
- 进度展示：生成面板显示 Progress 与 Markdown 输出。
- 写入规则：生成完成后调用 `writeGeneratedMarkdown` 写入章节，默认保留旧正文快照。
- Diff 展示：`stateDiffs` 在生成面板中逐条编辑状态、目标值、原因和处理状态。
- 取消规则：当前 UI 取消会停止接收和写入后续结果；主进程暂未提供独立中止通道。

## 降级展示

- `degraded`：显示本地结果与“AI 增强不可用”提示；剧情画布会使用本地确定性叙事编译器生成 Markdown。
- `partial`：展示可用部分和缺失原因。
- `error`：展示错误摘要，不暴露 API Key 或敏感请求内容。

## 设计约束

- AI 结果必须标注为建议，不自动覆盖设定事实。
- 剧情画布生成可写入章节正文，但状态快照必须经用户确认 State Diff 后才更新。
- 结构化 evidence 或 finding 应可点击跳转相关条目或剧情卡。
- 长文本上下文被裁剪时应提示用户缩小范围。