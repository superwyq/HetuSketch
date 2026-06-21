# HetuSketch 设计令牌参考手册

> **设计规范来源**：本文档为设计令牌的工程参考手册，令牌的语义与设计原则以 `docs/DESIGN.md` 为权威标准。所有取值以 `src/renderer/assets/styles/tokens/` 下的源文件为准。

## 1. 概述

HetuSketch 渲染端样式基于一套语义化设计令牌（Design Tokens）体系。所有颜色、字体、阴影、圆角通过 CSS 自定义属性（CSS Variables）统一管理，确保：

- **单一来源**：令牌定义集中在 `tokens/` 目录，`styles.css` 中所有样式通过 `var(--*)` 引用，不使用硬编码色值。
- **明暗反转**：深色模式为默认基调（`:root`），浅色模式通过 `.theme-light` 类覆盖。明暗反转只需翻转中性令牌的墨色方向。
- **语义一致**：实体识别色（角色/世界观/伏笔）与校验风险色（pass/notice/warning/critical/unknown）作为 HetuSketch 核心设计语义，在两种模式下保持色相一致。

### 用色哲学 —— 中性色用 Alpha，语义色用实色

- **中性令牌**（文本、边框、次级填充、hover 背景）使用黑/白 + alpha 通道叠加。深色模式叠加 `oklch(1 0 0 / x)`（白墨），浅色模式叠加 `oklch(0 0 0 / x)`（黑墨）。中性色自动适应所处表面，明暗反转只需翻转基础墨色。
- **语义令牌**（主色、校验风险色、实体识别色、语义状态色）使用实色 `oklch` 色阶——绝不使用 alpha——因为它们的色相必须在任何背景上保持一致。

## 2. 令牌源文件组织

令牌源文件位于 `src/renderer/assets/styles/tokens/`，按类别拆分：

| 文件 | 内容 |
| --- | --- |
| `colors.css` | 颜色令牌（主色、表面层、风险色、实体色、工作台分区色、边框、Sash、语义状态色、基础色阶） |
| `typography.css` | 字体令牌（UI 字体族、编辑字体族、字号、字重、行高、段落间距） |
| `shadows.css` | 阴影令牌（7 级） |
| `radii.css` | 圆角令牌（6 级） |

**入口文件**：`src/renderer/assets/styles/variables.css` 通过 `@import` 按顺序导入所有 tokens 文件：

```css
@import './tokens/colors.css';
@import './tokens/typography.css';
@import './tokens/shadows.css';
@import './tokens/radii.css';
```

在 `src/renderer/src/main.tsx` 中，`variables.css` 先于 `styles.css` 加载，确保令牌在所有样式之前可用。

## 3. 颜色令牌

源文件：`src/renderer/assets/styles/tokens/colors.css`

深色模式为 `:root` 默认，浅色模式通过 `.theme-light` 覆盖。下表"深色"列为 `:root` 取值，"浅色"列为 `.theme-light` 覆盖值；标注"不变"表示浅色模式不覆盖（语义色保持色相一致）。

### 3.1 主色与表面层

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-primary` | `oklch(0.62 0.17 255)` | 不变 | 主操作、选中态、链接、组件强调导出主色 |
| `--color-primary-foreground` | `oklch(0.98 0 0)` | 不变 | `bg-primary` 表面上的对比文本 |
| `--color-primary-hover` | `oklch(0.58 0.18 255)` | 不变 | 主色 hover 态 |
| `--color-background` | `#0a0a0a` | `#f5f5f5` | 工作台根级背景 |
| `--color-foreground` | `oklch(1 0 0 / 0.95)` | `oklch(0 0 0 / 0.95)` | 正文内容文本 |
| `--color-foreground-secondary` | `oklch(1 0 0 / 0.70)` | `oklch(0 0 0 / 0.70)` | 辅助文本、描述标签 |
| `--color-foreground-muted` | `oklch(1 0 0 / 0.45)` | `oklch(0 0 0 / 0.45)` | 占位符、禁用态、低强调文本 |
| `--color-surface` | `oklch(0.16 0 0)` | `oklch(0.98 0 0)` | 编辑区域、树视图面板、侧边栏第一层 |
| `--color-surface-foreground` | `oklch(1 0 0 / 0.95)` | `oklch(0 0 0 / 0.95)` | surface 表面对比文本 |
| `--color-surface-raised` | `oklch(0.20 0 0)` | `oklch(1 0 0)` | 弹出面板、下拉菜单、悬浮卡片 |
| `--color-surface-raised-foreground` | `oklch(1 0 0 / 0.95)` | `oklch(0 0 0 / 0.95)` | raised 表面对比文本 |
| `--color-surface-overlay` | `oklch(0.24 0 0)` | `oklch(1 0 0)` | 对话框、模态面板、设置浮窗 |
| `--color-surface-overlay-foreground` | `oklch(1 0 0 / 0.95)` | `oklch(0 0 0 / 0.95)` | overlay 表面对比文本 |
| `--color-secondary` | `oklch(1 0 0 / 0.08)` | `oklch(0 0 0 / 0.05)` | 次级操作背景、标签容器 |
| `--color-secondary-foreground` | `oklch(1 0 0 / 0.90)` | `oklch(0 0 0 / 0.90)` | 次级填充上的文本 |
| `--color-secondary-hover` | `oklch(1 0 0 / 0.12)` | `oklch(0 0 0 / 0.08)` | 次级背景 hover |
| `--color-secondary-active` | `oklch(1 0 0 / 0.16)` | `oklch(0 0 0 / 0.10)` | 次级背景激活 |
| `--color-accent` | `oklch(1 0 0 / 0.08)` | `oklch(0 0 0 / 0.05)` | 透明按钮 hover/激活背景 |
| `--color-accent-foreground` | `oklch(1 0 0 / 0.95)` | `oklch(0 0 0 / 0.95)` | 强调填充上的文本 |
| `--color-ghost-hover` | `oklch(1 0 0 / 0.06)` | `oklch(0 0 0 / 0.04)` | ghost 按钮 hover 填充 |
| `--color-ghost-active` | `oklch(1 0 0 / 0.10)` | `oklch(0 0 0 / 0.07)` | ghost 按钮激活填充 |

使用示例：

```css
.editor-area { background: var(--color-background); }
.tree-row { color: var(--color-foreground); }
.dropdown-menu { background: var(--color-surface-raised); }
```

### 3.2 工作台分区色

VSCode 风工作台的每个空间分区拥有独立的色彩令牌，禁止跨分区复用。

#### 活动栏（ActivityBar）

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-activitybar` | `oklch(0.13 0 0)` | `oklch(0.95 0 0)` | 48px 左侧图标栏背景 |
| `--color-activitybar-foreground` | `oklch(1 0 0 / 0.60)` | `oklch(0 0 0 / 0.60)` | 图标默认颜色 |
| `--color-activitybar-active` | `oklch(1 0 0 / 0.08)` | `oklch(0 0 0 / 0.06)` | 当前激活图标填充 |
| `--color-activitybar-active-foreground` | `oklch(1 0 0 / 1.00)` | `oklch(0 0 0 / 1.00)` | 激活图标前景 |
| `--color-activitybar-border` | `oklch(1 0 0 / 0.08)` | `oklch(0 0 0 / 0.08)` | 右侧分割线 |

#### 主侧边栏（PrimarySidebar）

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-sidebar-primary` | `oklch(0.16 0 0)` | `oklch(0.98 0 0)` | 主侧边栏背景 |
| `--color-sidebar-primary-foreground` | `oklch(1 0 0 / 0.90)` | `oklch(0 0 0 / 0.90)` | 主侧边栏文本 |
| `--color-sidebar-primary-active` | `oklch(1 0 0 / 0.10)` | `oklch(0 0 0 / 0.06)` | 选中项背景 |
| `--color-sidebar-primary-active-foreground` | `oklch(1 0 0 / 1.00)` | `oklch(0 0 0 / 1.00)` | 选中项文本 |
| `--color-sidebar-primary-border` | `oklch(1 0 0 / 0.10)` | `oklch(0 0 0 / 0.10)` | 右侧边框 |

#### 辅助侧边栏（SecondarySidebar）

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-sidebar-secondary` | `oklch(0.18 0 0)` | `oklch(0.96 0 0)` | 辅助侧边栏背景 |
| `--color-sidebar-secondary-foreground` | `oklch(1 0 0 / 0.90)` | `oklch(0 0 0 / 0.90)` | 辅助侧边栏文本 |
| `--color-sidebar-secondary-border` | `oklch(1 0 0 / 0.10)` | `oklch(0 0 0 / 0.10)` | 左侧边框 |

#### 底部面板（BottomPanel）

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-panel-bottom` | `oklch(0.15 0 0)` | `oklch(0.97 0 0)` | 底部面板背景 |
| `--color-panel-bottom-foreground` | `oklch(1 0 0 / 0.90)` | `oklch(0 0 0 / 0.90)` | 底部面板文本 |
| `--color-panel-bottom-active` | `oklch(1 0 0 / 0.10)` | `oklch(0 0 0 / 0.06)` | 标签选中态 |

#### 标题栏（TitleBar）

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-titlebar` | `oklch(0.15 0 0)` | `oklch(0.97 0 0)` | 标题栏背景 |
| `--color-titlebar-foreground` | `oklch(1 0 0 / 0.80)` | `oklch(0 0 0 / 0.80)` | 标题栏文本 |

#### 状态栏（StatusBar）

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-statusbar` | `oklch(0.14 0 0)` | `oklch(0.94 0 0)` | 状态栏背景 |
| `--color-statusbar-foreground` | `oklch(1 0 0 / 0.80)` | `oklch(0 0 0 / 0.80)` | 状态栏文本 |

使用示例：

```css
.activity-bar { background: var(--color-activitybar); color: var(--color-activitybar-foreground); }
.primary-sidebar { background: var(--color-sidebar-primary); border-right: 0.5px solid var(--color-sidebar-primary-border); }
```

### 3.3 边框语义

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-border` | `oklch(1 0 0 / 0.12)` | `oklch(0 0 0 / 0.12)` | 标准边框 |
| `--color-border-muted` | `oklch(1 0 0 / 0.08)` | `oklch(0 0 0 / 0.08)` | 弱化边框 |
| `--color-border-subtle` | `oklch(1 0 0 / 0.05)` | `oklch(0 0 0 / 0.05)` | 极弱边框（分割线） |
| `--color-border-hover` | `oklch(1 0 0 / 0.20)` | `oklch(0 0 0 / 0.20)` | hover 边框 |
| `--color-border-active` | `oklch(1 0 0 / 0.30)` | `oklch(0 0 0 / 0.30)` | 激活边框 |
| `--color-input` | `oklch(1 0 0 / 0.15)` | `oklch(0 0 0 / 0.15)` | 输入框边框 |
| `--color-ring` | `oklch(0.62 0.17 255 / 0.50)` | 不变 | 聚焦环（主色半透明） |

使用示例：

```css
.feature-card { border: 1px solid var(--color-border); }
input:focus { outline: 2px solid var(--color-ring); }
```

### 3.4 Sash 专用

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-sash` | `oklch(1 0 0 / 0.06)` | `oklch(0 0 0 / 0.06)` | 分隔条默认背景 |
| `--color-sash-hover` | `oklch(0.62 0.17 255 / 0.60)` | 不变 | 分隔条 hover 背景（主色半透明） |

使用示例：

```css
.workbench-sash { background: var(--color-sash); }
.workbench-sash:hover { background: var(--color-sash-hover); }
```

### 3.5 实体识别色

三大设定数据库的语义识别色，用于列表图标、标签、关系图节点和跨面板导航。基础色为实色，`-text`/`-bg`/`-border` 变体在浅色模式下文本色加深以保持对比度。

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-entity-character` | `oklch(0.65 0.18 350)` | 不变 | 角色基础色（暖紫/品红） |
| `--color-entity-character-text` | `oklch(0.72 0.17 350)` | `oklch(0.52 0.17 350)` | 角色文本色 |
| `--color-entity-character-bg` | `oklch(0.65 0.18 350 / 0.12)` | 不变 | 角色背景色（标签/徽标） |
| `--color-entity-character-border` | `oklch(0.65 0.18 350 / 0.30)` | 不变 | 角色边框色 |
| `--color-entity-world` | `oklch(0.65 0.15 220)` | 不变 | 世界观基础色（青/钴蓝） |
| `--color-entity-world-text` | `oklch(0.72 0.14 220)` | `oklch(0.52 0.14 220)` | 世界观文本色 |
| `--color-entity-world-bg` | `oklch(0.65 0.15 220 / 0.12)` | 不变 | 世界观背景色 |
| `--color-entity-world-border` | `oklch(0.65 0.15 220 / 0.30)` | 不变 | 世界观边框色 |
| `--color-entity-plot` | `oklch(0.70 0.15 70)` | 不变 | 伏笔基础色（琥珀/金橙） |
| `--color-entity-plot-text` | `oklch(0.77 0.14 70)` | `oklch(0.55 0.14 70)` | 伏笔文本色 |
| `--color-entity-plot-bg` | `oklch(0.70 0.15 70 / 0.12)` | 不变 | 伏笔背景色 |
| `--color-entity-plot-border` | `oklch(0.70 0.15 70 / 0.30)` | 不变 | 伏笔边框色 |

使用示例：

```css
/* ActivityBar 激活指示色 */
.activity-bar-button[data-entity-type="character"]::before { background: var(--color-entity-character); }
/* 关系图节点填充 */
.graph-node.type-character { fill: var(--color-entity-character); }
/* 实体标签 */
.tag-character { background: var(--color-entity-character-bg); color: var(--color-entity-character-text); }
```

### 3.6 校验风险色

逻辑校验引擎的核心反馈色系，各风险色提供完整调色板：基础（`-base`）、文本（`-text`）、背景（`-bg`）、边框（`-border`）、hover（`-hover`）。用于校验结果行、Dashboard 状态徽标、侧边栏提醒计数。

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-risk-pass` | `oklch(0.65 0.17 145)` | 不变 | 通过（绿色系） |
| `--color-risk-pass-text` | `oklch(0.72 0.15 145)` | `oklch(0.50 0.15 145)` | 通过文本 |
| `--color-risk-pass-bg` | `oklch(0.65 0.17 145 / 0.12)` | 不变 | 通过背景 |
| `--color-risk-pass-border` | `oklch(0.65 0.17 145 / 0.30)` | 不变 | 通过边框 |
| `--color-risk-pass-hover` | `oklch(0.60 0.17 145)` | 不变 | 通过 hover |
| `--color-risk-notice` | `oklch(0.62 0.15 240)` | 不变 | 提示（蓝色系） |
| `--color-risk-notice-text` | `oklch(0.70 0.14 240)` | `oklch(0.48 0.14 240)` | 提示文本 |
| `--color-risk-notice-bg` | `oklch(0.62 0.15 240 / 0.12)` | 不变 | 提示背景 |
| `--color-risk-notice-border` | `oklch(0.62 0.15 240 / 0.30)` | 不变 | 提示边框 |
| `--color-risk-notice-hover` | `oklch(0.57 0.15 240)` | 不变 | 提示 hover |
| `--color-risk-warning` | `oklch(0.72 0.16 75)` | 不变 | 警告（琥珀色系） |
| `--color-risk-warning-text` | `oklch(0.78 0.15 75)` | `oklch(0.55 0.15 75)` | 警告文本 |
| `--color-risk-warning-bg` | `oklch(0.72 0.16 75 / 0.12)` | 不变 | 警告背景 |
| `--color-risk-warning-border` | `oklch(0.72 0.16 75 / 0.30)` | 不变 | 警告边框 |
| `--color-risk-warning-hover` | `oklch(0.67 0.16 75)` | 不变 | 警告 hover |
| `--color-risk-critical` | `oklch(0.60 0.20 25)` | 不变 | 严重（红色系） |
| `--color-risk-critical-text` | `oklch(0.68 0.19 25)` | `oklch(0.48 0.19 25)` | 严重文本 |
| `--color-risk-critical-bg` | `oklch(0.60 0.20 25 / 0.12)` | 不变 | 严重背景 |
| `--color-risk-critical-border` | `oklch(0.60 0.20 25 / 0.30)` | 不变 | 严重边框 |
| `--color-risk-critical-hover` | `oklch(0.55 0.20 25)` | 不变 | 严重 hover |
| `--color-risk-unknown` | `oklch(0.65 0.005 250)` | 不变 | 未知（灰色系） |
| `--color-risk-unknown-text` | `oklch(0.72 0.005 250)` | `oklch(0.50 0.005 250)` | 未知文本 |
| `--color-risk-unknown-bg` | `oklch(0.65 0.005 250 / 0.12)` | 不变 | 未知背景 |
| `--color-risk-unknown-border` | `oklch(0.65 0.005 250 / 0.30)` | 不变 | 未知边框 |
| `--color-risk-unknown-hover` | `oklch(0.60 0.005 250)` | 不变 | 未知 hover |

使用示例：

```css
.check-row.level-critical { background: var(--color-risk-critical-bg); border-left: 3px solid var(--color-risk-critical); }
.status-badge.pass { color: var(--color-risk-pass-text); }
```

### 3.7 语义状态色

通用语义状态色，结构与风险色类似。基础色为实色，`-bg`/`-border` 使用 alpha，`-text` 在浅色模式下加深。

| 令牌 | 深色值 | 浅色值 | 用途 |
| --- | --- | --- | --- |
| `--color-destructive` | `oklch(0.60 0.20 25)` | 不变 | 破坏性操作（删除） |
| `--color-destructive-hover` | `oklch(0.55 0.20 25)` | 不变 | 破坏性 hover |
| `--color-destructive-text` | `oklch(0.68 0.19 25)` | `oklch(0.48 0.19 25)` | 破坏性文本 |
| `--color-destructive-bg` | `oklch(0.60 0.20 25 / 0.12)` | 不变 | 破坏性背景 |
| `--color-destructive-border` | `oklch(0.60 0.20 25 / 0.30)` | 不变 | 破坏性边框 |
| `--color-success` | `oklch(0.65 0.17 145)` | 不变 | 成功 |
| `--color-success-text` | `oklch(0.72 0.15 145)` | `oklch(0.50 0.15 145)` | 成功文本 |
| `--color-success-bg` | `oklch(0.65 0.17 145 / 0.12)` | 不变 | 成功背景 |
| `--color-success-border` | `oklch(0.65 0.17 145 / 0.30)` | 不变 | 成功边框 |
| `--color-success-hover` | `oklch(0.60 0.17 145)` | 不变 | 成功 hover |
| `--color-warning` | `oklch(0.72 0.16 75)` | 不变 | 警告 |
| `--color-warning-text` | `oklch(0.78 0.15 75)` | `oklch(0.55 0.15 75)` | 警告文本 |
| `--color-warning-bg` | `oklch(0.72 0.16 75 / 0.12)` | 不变 | 警告背景 |
| `--color-warning-border` | `oklch(0.72 0.16 75 / 0.30)` | 不变 | 警告边框 |
| `--color-warning-hover` | `oklch(0.67 0.16 75)` | 不变 | 警告 hover |
| `--color-info` | `oklch(0.62 0.15 240)` | 不变 | 信息 |
| `--color-info-text` | `oklch(0.70 0.14 240)` | `oklch(0.48 0.14 240)` | 信息文本 |
| `--color-info-bg` | `oklch(0.62 0.15 240 / 0.12)` | 不变 | 信息背景 |
| `--color-info-border` | `oklch(0.62 0.15 240 / 0.30)` | 不变 | 信息边框 |
| `--color-info-hover` | `oklch(0.57 0.15 240)` | 不变 | 信息 hover |

使用示例：

```css
.btn-danger { background: var(--color-destructive); color: var(--color-primary-foreground); }
.alert-success { background: var(--color-success-bg); color: var(--color-success-text); border: 1px solid var(--color-success-border); }
```

### 3.8 基础色阶

基础色阶为参考调色板，用于图表/数据可视化，两种模式下取值相同（不随主题翻转）。共 22 个色族 × 11 个色阶（50–950）。

**色族列表**：`neutral`、`stone`、`zinc`、`slate`、`gray`、`red`、`orange`、`amber`、`yellow`、`lime`、`green`、`emerald`、`teal`、`cyan`、`sky`、`blue`、`indigo`、`violet`、`purple`、`fuchsia`、`pink`、`rose`。

**命名规则**：`--color-{family}-{step}`，step 取值 `50` / `100` / `200` / `300` / `400` / `500` / `600` / `700` / `800` / `900` / `950`。

以 `neutral` 为例：

| 令牌 | 取值 |
| --- | --- |
| `--color-neutral-50` | `oklch(0.985 0 0)` |
| `--color-neutral-100` | `oklch(0.970 0 0)` |
| `--color-neutral-200` | `oklch(0.922 0 0)` |
| `--color-neutral-300` | `oklch(0.870 0 0)` |
| `--color-neutral-400` | `oklch(0.708 0 0)` |
| `--color-neutral-500` | `oklch(0.556 0 0)` |
| `--color-neutral-600` | `oklch(0.439 0 0)` |
| `--color-neutral-700` | `oklch(0.371 0 0)` |
| `--color-neutral-800` | `oklch(0.269 0 0)` |
| `--color-neutral-900` | `oklch(0.205 0 0)` |
| `--color-neutral-950` | `oklch(0.145 0 0)` |

其余色族取值请查阅 `src/renderer/assets/styles/tokens/colors.css` 源文件。使用示例：

```css
.chart-series-1 { fill: var(--color-blue-500); }
.chart-series-2 { fill: var(--color-amber-500); }
```

## 4. 字体令牌

源文件：`src/renderer/assets/styles/tokens/typography.css`

HetuSketch 采用双字体系统：UI 字体用于工具/控制表面，编辑字体用于沉浸式长文本写作。

### 4.1 字体族

| 令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--font-family-ui` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif` | UI 字体族（活动栏、侧边栏、按钮、标签等工具/控制表面） |
| `--font-family-editor` | `'LXGW WenKai', '霞鹜文楷', 'Source Han Serif SC', 'Noto Serif CJK SC', serif` | 编辑字体族（编辑器正文，可由用户覆盖） |

### 4.2 字号

| 令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--font-size-body-xs` | `12px` | 辅助文本、徽标 |
| `--font-size-body-sm` | `13px` | 树视图项、次要文本 |
| `--font-size-body-md` | `14px` | 正文（Ant Design 默认） |
| `--font-size-body-lg` | `16px` | 卡片标题、强调正文 |
| `--font-size-heading-xs` | `18px` | 小标题 |
| `--font-size-heading-sm` | `20px` | 区块标题 |
| `--font-size-heading-md` | `24px` | 页面标题 |
| `--font-size-heading-lg` | `32px` | 大标题 |
| `--font-size-heading-xl` | `40px` | 英雄区标题 |
| `--font-size-editor` | `16px` | 编辑器正文字号（用户可覆盖） |

### 4.3 字重

| 令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--font-weight-regular` | `400` | 常规文本 |
| `--font-weight-medium` | `500` | 标题、强调文本 |
| `--font-weight-bold` | `700` | 粗体强调 |

### 4.4 行高

| 令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--line-height-body-xs` | `18px` | 辅助文本行高 |
| `--line-height-body-sm` | `20px` | 次要文本行高 |
| `--line-height-body-md` | `20px` | 正文行高 |
| `--line-height-body-lg` | `24px` | 强调正文行高 |
| `--line-height-heading-xs` | `24px` | 小标题行高 |
| `--line-height-heading-sm` | `28px` | 区块标题行高 |
| `--line-height-heading-md` | `32px` | 页面标题行高 |
| `--line-height-heading-lg` | `40px` | 大标题行高 |
| `--line-height-editor` | `1.6` | 编辑器正文行高（用户可覆盖） |

### 4.5 段落间距

| 令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--paragraph-spacing-body-xs` | `4px` | 辅助文本段落间距 |
| `--paragraph-spacing-body-sm` | `6px` | 次要文本段落间距 |
| `--paragraph-spacing-body-md` | `8px` | 正文段落间距 |
| `--paragraph-spacing-body-lg` | `12px` | 强调正文段落间距 |
| `--paragraph-spacing-heading-xs` | `12px` | 小标题段落间距 |
| `--paragraph-spacing-heading-sm` | `16px` | 区块标题段落间距 |
| `--paragraph-spacing-heading-md` | `20px` | 页面标题段落间距 |
| `--paragraph-spacing-heading-lg` | `24px` | 大标题段落间距 |
| `--paragraph-spacing-heading-xl` | `32px` | 英雄区标题段落间距 |

使用示例：

```css
.markdown-editor { font-family: var(--font-family-editor); font-size: var(--font-size-editor); line-height: var(--line-height-editor); }
.tree-row { font-family: var(--font-family-ui); font-size: var(--font-size-body-sm); font-weight: var(--font-weight-regular); }
```

## 5. 阴影令牌

源文件：`src/renderer/assets/styles/tokens/shadows.css`

7 级阴影，保留用于交互反馈（hover）和浮动元素——不用于静态深度（静态深度通过表面颜色分层表达）。

| 令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--shadow-2xs` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | 微妙分割、按压态 |
| `--shadow-xs` | `0 2px 4px 0 rgb(0 0 0 / 0.06)` | 按钮 hover |
| `--shadow-sm` | `0 2px 8px -2px rgb(0 0 0 / 0.08)` | 卡片、小型浮动 |
| `--shadow-md` | `0 4px 12px -2px rgb(0 0 0 / 0.10)` | 下拉菜单、弹出框 |
| `--shadow-lg` | `0 8px 24px -4px rgb(0 0 0 / 0.12)` | 大浮动面板、悬浮快速查找 |
| `--shadow-xl` | `0 16px 40px -8px rgb(0 0 0 / 0.16)` | 对话框、PageSidePanel、全屏覆盖 |
| `--shadow-2xl` | `0 24px 56px -12px rgb(0 0 0 / 0.20)` | 引导卡片、峰值强调 |

使用示例：

```css
.dropdown-menu { box-shadow: var(--shadow-md); }
.modal { box-shadow: var(--shadow-xl); }
```

## 6. 圆角令牌

源文件：`src/renderer/assets/styles/tokens/radii.css`

6 级圆角，两种模式下取值相同。

| 令牌 | 取值 | 用途 |
| --- | --- | --- |
| `--radius-sm` | `4px` | 密集元素（标签、徽标） |
| `--radius-md` | `6px` | 按钮、输入框基础 |
| `--radius-lg` | `8px` | 卡片 |
| `--radius-xl` | `12px` | 大型卡片 |
| `--radius-2xl` | `16px` | 对话框、浮动面板 |
| `--radius-round` | `9999px` | 药丸、徽标 |

使用示例：

```css
.btn { border-radius: var(--radius-md); }
.feature-card { border-radius: var(--radius-lg); }
.modal { border-radius: var(--radius-2xl); }
.badge { border-radius: var(--radius-round); }
```

## 7. 使用指南

### 7.1 何时使用 Alpha vs 实色

- **Alpha（中性令牌）**：文本、边框、次级填充、hover 背景。这些是"表面的着色"，应使用已有语义中性令牌（`--color-foreground*`、`--color-border*`、`--color-secondary`、`--color-ghost-*`），不要创建 `oklch(0 0 0 / 0.x)` 字面量——令牌本身已编码了意图。
- **实色（语义令牌）**：校验等级、实体类型、危险操作等"不受表面影响的确定色相"。使用对应的实色令牌（`--color-risk-*`、`--color-entity-*`、`--color-destructive` 等）。

### 7.2 如何选择表面层

表面通过颜色分层而非阴影表达深度，4 层递进：

1. `--color-background`：工作台根级背景（最底层）。
2. `--color-surface`：编辑区域、树视图面板、侧边栏第一层。
3. `--color-surface-raised`：弹出面板、下拉菜单、悬浮卡片。
4. `--color-surface-overlay`：对话框、模态面板、设置浮窗（最顶层）。

每层提供对应的 `-foreground` 文本令牌，确保文本对比度。

### 7.3 工作台分区色使用规范

- 每个分区（ActivityBar/PrimarySidebar/SecondarySidebar/BottomPanel/TitleBar/StatusBar）使用专属令牌，**禁止跨分区复用**。
- 分区内的选中态、hover 态使用该分区的 `-active` / `-foreground` 变体，不引入其他分区的令牌。

### 7.4 实体色与风险色使用规范

- 实体识别色（角色/世界观/伏笔）用于列表图标、标签、关系图节点和跨面板导航，确保同一实体在界面任何位置色相一致。
- 校验风险色（pass/notice/warning/critical/unknown）用于校验结果行、Dashboard 状态徽标、侧边栏提醒计数，语义在全应用保持一致。
- 使用 `-bg` / `-border` 变体构建带背景的标签和徽标，使用 `-text` 变体作为文本色，使用基础色作为图标/指示色。

### 7.5 阴影使用规范

- 阴影保留用于交互反馈（hover）和浮动元素，**不用于静态深度**。
- 静态层级关系通过表面颜色分层（`background` → `surface` → `raised` → `overlay`）表达。

### 7.6 引用规范

- 所有样式通过 `var(--*)` 引用令牌，不使用硬编码色值（`#xxx`、`rgb()`、`oklch()` 字面量）。
- 新增样式应优先复用已有令牌；如需新增令牌，在对应 tokens 源文件中定义，并同时提供深色/浅色取值。
- 主题变量（深色/浅色）只在 `tokens/colors.css` 中定义，`styles.css` 不包含 `:root` 或 `.theme-light` 下的颜色变量定义。
