# 术语表

| 术语 | 英文 | 定义 |
| --- | --- | --- |
| 设定集 | Setting Set | 可跨书目复用的全局角色与世界观设定集合。 |
| 作品 | Project | 用户创作项目，包含角色、世界观、伏笔等设定条目。 |
| 书目 | Book | 作品下的正文创作单元，支持绑定设定集。 |
| 分卷 | Volume | 书目下的章节分组。 |
| 章节 | Chapter | 实际正文内容，Markdown 为事实源，JSON 保存元数据。 |
| 设定条目 | Entry | 角色、世界观、伏笔三类结构化内容的统称。 |
| 角色红线 | Character Red Line | 角色不可违背的人设规则，基础校验会读取。 |
| 世界观规则 | World Rule | 世界观硬规则，基础校验会读取。 |
| 伏笔 | Plot / Foreshadowing | 已埋设、待回收或废弃的线索。 |
| 逻辑校验 | Logic Validation | 根据角色红线、世界规则与伏笔状态检查文本一致性。 |
| 悬浮速查 | Quick Lookup | 独立置顶窗口，用于在外部写作软件旁快速检索设定。 |
| RAG | Retrieval-Augmented Generation | 通过 FTS/向量检索召回设定，再辅助 AI 判断或问答。 |
| IPC | Inter-Process Communication | Electron 主进程与渲染进程之间的通信契约。 |
| 事实源 | Source of Truth | 项目真实数据所在位置；HetuSketch 以 JSON/Markdown 文件为事实源，SQLite 为可重建索引。 |
