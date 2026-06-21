# 图标使用规范

当前图标主要来自 Ant Design Icons。

## ActivityBar 图标

| 活动 | 图标 | 激活色 |
| --- | --- | --- |
| 搜索 | `SearchOutlined` | `--color-primary` |
| 角色 | `TeamOutlined` | `--color-entity-character` |
| 世界观 | `GlobalOutlined` | `--color-entity-world` |
| 伏笔 | `BranchesOutlined` | `--color-entity-plot` |
| 文本管理 | `EditOutlined` | `--color-primary` |
| 书目管理 | `FolderOpenOutlined` | `--color-primary` |
| 设置 | `SettingOutlined` | `--color-primary` |

## 规则

- 实体图标使用实体识别色，仅用于图标、标签或节点，不用于普通文本。
- 风险状态使用风险色，不用通用成功/错误色替代。
- 图标按钮需要有 `aria-label` 或明确文本说明。
- 危险操作图标默认低强调，hover 或确认态再使用危险色。
