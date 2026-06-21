# 组件库规范

当前 UI 基于 React + Ant Design，并在全局样式中形成 HetuSketch 工作台组件语义。

## 工作台组件

| 组件 | 职责 |
| --- | --- |
| TitleBar | 品牌、命令中心、作品选择、速查、置顶、设置、主题、窗口控制。 |
| ActivityBar | 左侧活动入口，支持拖拽排序与实体色激活指示。 |
| PrimarySidebar | 当前活动对应的树或列表。 |
| EditorWorkbench | 多 Tab、多分割编辑区域。 |
| SecondarySidebar | AI Chat / Outline / Timeline 辅助视图。 |
| BottomPanel | AI 提示、角色、世界观、线索、输出等底部视图。 |
| StatusBar | 当前作品、光标、字数、面板状态、编码等状态信息。 |
| Sash | 可拖拽分隔条。 |

## 页面组件

| 页面 | 职责 |
| --- | --- |
| DashboardPage | 总览、统计、最近访问和能力入口。 |
| ProjectsPage | 作品创建、编辑、删除、导入导出。 |
| EntriesPage | 角色、世界观、伏笔复用管理页。 |
| WritingStudioPage | 章节树、Markdown 编辑、预览、校验。 |
| SettingsPage | 主题、字体、AI、提示词、技能、HTTP 工具配置。 |
| QuickLookupPage | 悬浮速查窗内容。 |

## 组件规则

- 设定条目列表中的类型图标使用实体识别色。
- 校验结果使用风险等级色。
- 危险操作使用确认弹窗，不让行级删除按钮常驻红色。
- 图标按钮必须有明确语义，主要操作与辅助操作区分视觉权重。
