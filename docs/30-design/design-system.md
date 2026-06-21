# 设计系统

设计系统详细规范见旧文档 `../DESIGN.md` 与 `../design-tokens.md`，本文件提供分层文档入口摘要。

## 设计目标

- 工作台优先：界面服务于长文本创作与设定管理。
- 深色模式为默认体验，浅色模式提供等效反转。
- AI 是辅助能力，不作为界面中心。
- 通过实体色和风险色建立 HetuSketch 专属语义。

## 核心语义

| 语义 | 令牌 |
| --- | --- |
| 角色 | `--color-entity-character` |
| 世界观 | `--color-entity-world` |
| 伏笔 | `--color-entity-plot` |
| 通过 | `--color-risk-pass` |
| 提示 | `--color-risk-notice` |
| 警告 | `--color-risk-warning` |
| 严重 | `--color-risk-critical` |
| 未知 | `--color-risk-unknown` |

## 令牌来源

| 类型 | 文件 |
| --- | --- |
| 颜色 | `src/renderer/assets/styles/tokens/colors.css` |
| 字体 | `src/renderer/assets/styles/tokens/typography.css` |
| 阴影 | `src/renderer/assets/styles/tokens/shadows.css` |
| 圆角 | `src/renderer/assets/styles/tokens/radii.css` |
| 入口 | `src/renderer/assets/styles/variables.css` |

## 基本规则

- 不硬编码颜色，使用 `var(--*)` 令牌。
- UI 控制区使用 `--font-family-ui`。
- 编辑书写区使用 `--font-family-editor`。
- 工作台分区使用专属颜色令牌，禁止跨分区复用。
- Sash 使用 `--color-sash` / `--color-sash-hover`。
