# HetuSketch 设计系统

## 1. 视觉主题与氛围

> **设计令牌来源：** 设计令牌定义在 `src/renderer/assets/styles/tokens/`，CSS 变量在 `src/renderer/assets/styles/variables.css` 中导出。本文档引用公开别名；实际取值请查阅对应令牌源文件。

HetuSketch（河图速写创作助手）是一款面向小说创作者的桌面端工具，其界面采用 **VSCode 工作台范式**——多层空间分区、多标签编辑器、分屏视图和可拖拽窗格分隔线。设计语言服务于**长文本创作与逻辑校验**这一核心场景：界面应当退后，让文字内容成为视觉焦点；同时通过清晰的空间分区和语义色彩，帮助创作者在角色、世界观、伏笔和正文之间高效导航。

整体美学为**功能主义现代风格**——干净的表面、克制的边框、精密的分区与可拖拽操作。深色模式为默认基调，适合长时间写作；浅色模式提供等效亮色体验。两种模式均在 CSS 变量体系中完整定义，支持真正的明暗反转。

**与通用笔记/AI 对话工具的关键区别：**
- HetuSketch 的核心交互是**切换工作区面板**（角色库、世界观库、伏笔库、编辑器、AI 面板），而非连续对话
- AI 是**可选辅助**而非界面中心——所有核心功能（管理、编写、校验、检索）离线可用
- 文本编辑器是**一级工作区**，占据界面中心，而非次要输入框
- 逻辑校验结果是**结构化、分级反馈**（pass / notice / warning / critical），而非流式 AI 生成

**核心设计特征：**
- 工作台优先：界面是创作者的操作台，包含 7 个可拖拽排序的 ActivityBar 图标、多标签编辑器、分屏视图和窗格分隔线
- 双字体系统：UI 控制区使用 `var(--font-family-ui)`，编辑书写区使用 `var(--font-family-editor)` 以提供沉浸式写作体验
- 校验风险色语义：`var(--color-risk-pass)`（通过）、`var(--color-risk-notice)`（提示）、`var(--color-risk-warning)`（警告）、`var(--color-risk-critical)`（严重冲突）
- 内容实体识别色：角色 `var(--color-entity-character)`、世界观 `var(--color-entity-world)`、伏笔 `var(--color-entity-plot)`，用于列表图标、标签和关系图节点
- 多空间分区深度：ActivityBar（最外层）→ PrimarySidebar → Editor（核心）→ SecondarySidebar → BottomPanel → StatusBar
- 窗格分隔线：1px 可拖拽分隔条，hover 变色，双击重置
- 表面通过颜色分层而非阴影：`var(--color-background)` → `var(--color-surface)` → `var(--color-surface-raised)` → `var(--color-surface-overlay)`

## 2. 色彩体系与角色

> 令牌取值定义在 `src/renderer/assets/styles/tokens/colors.css`。本节说明每个令牌的用途；具体色值请查阅源文件。

### 用色哲学 —— 中性色用 Alpha，语义色用实色

色彩系统遵循一致的规则：

- **中性令牌**（文本、边框、次级填充、hover 背景）使用**黑/白 + alpha 通道**叠加。浅色模式在表面上叠加 `oklch(0 0 0 / x)`；深色模式叠加 `oklch(1 0 0 / x)`。这使得中性色自动适应所处表面的颜色，明暗反转只需翻转基础墨色。
- **语义令牌**（主色、校验风险色、实体识别色）使用**实色 `oklch` 色阶**——绝不使用 alpha——因为它们的色相必须在任何背景上保持一致。

取值时遵循：
1. 若角色是"表面的着色"（文本、分割线、柔和填充、hover），使用已有语义中性令牌（`--color-foreground*`、`--color-border*`、`--color-secondary`、`--color-ghost-*`）。不要创建 `oklch(0 0 0 / 0.x)` 字面量——令牌本身已编码了意图。
2. 若角色是"不受表面影响的确定色相"（校验等级、实体类型、危险操作），使用对应的实色令牌。

### 主色

- **主色**：`var(--color-primary)` —— 页面级主要操作、选中态、链接、组件强调色的导出主色。在 HetuSketch 中，主色用于启动校验、确认关键操作、当前面板选中指示。
- **主色前景**：`var(--color-primary-foreground)` —— `bg-primary` 表面上的对比文本
- **主色 Hover**：`var(--color-primary-hover)`

### 校验风险色（HetuSketch 专属）

逻辑校验引擎的核心反馈色系，在整个应用中保持一致语义：

| 风险等级 | 令牌 | 含义 |
|---------|------|------|
| 通过 | `var(--color-risk-pass)` | 未发现冲突，绿色系 |
| 提示 | `var(--color-risk-notice)` | 仅提示关联设定或弱风险，蓝色系 |
| 警告 | `var(--color-risk-warning)` | 可能存在逻辑冲突，需要用户复核，琥珀色系 |
| 严重 | `var(--color-risk-critical)` | 高置信度违反角色红线或世界观硬规则，红色系 |
| 未知 | `var(--color-risk-unknown)` | 上下文不足或 AI/检索失败无法判断，灰色系 |

各风险色提供完整调色板：`--color-risk-{level}`（基础）、`--color-risk-{level}-text`（文本）、`--color-risk-{level}-bg`（背景）、`--color-risk-{level}-border`（边框）、`--color-risk-{level}-hover`。用于校验结果行、Dashboard 状态徽标、侧边栏提醒计数。

### 内容实体识别色（HetuSketch 专属）

三大设定数据库的语义识别色，用于列表图标、标签、关系图节点和跨面板导航：

| 实体类型 | 令牌 | 色相 |
|---------|------|------|
| 角色 | `var(--color-entity-character)` | 暖紫/品红系 |
| 世界观 | `var(--color-entity-world)` | 青/钴蓝系 |
| 伏笔 | `var(--color-entity-plot)` | 琥珀/金橙色系 |

每种实体色提供 `--color-entity-{type}`（基础）、`--color-entity-{type}-text`、`--color-entity-{type}-bg`、`--color-entity-{type}-border`。关系图节点使用实体色作为节点填充；标签和徽标使用 `bg` 变体。

### 文本颜色

- **前景**：`var(--color-foreground)` —— 正文内容文本（编辑器中为小说正文，UI 中为面板标题）
- **前景次要**：`var(--color-foreground-secondary)` —— 辅助文本、描述标签、设定字段说明
- **前景弱化**：`var(--color-foreground-muted)` —— 占位符、禁用态、低强调文本、空状态提示
- **表面前景色**：`var(--color-surface-foreground)` / `var(--color-surface-raised-foreground)` / `var(--color-surface-overlay-foreground)` —— 各表面对比的文本
- **强调前景**：`var(--color-accent-foreground)` / `var(--color-secondary-foreground)` —— 强调/次级填充上的文本

### 表面与背景

- **背景**：`var(--color-background)` —— 工作台根级背景（深色默认 `#0A0A0A` / 浅色 `#F5F5F5`）
- **表面**：`var(--color-surface)` —— 编辑区域、树视图面板、侧边栏第一层
- **表面提升**：`var(--color-surface-raised)` —— 弹出面板、下拉菜单、悬浮卡片
- **表面叠加**：`var(--color-surface-overlay)` —— 对话框、模态面板、设置浮窗
- **次级**：`var(--color-secondary)` —— 次级操作背景、标签容器
- **次级 Hover / 激活**：`var(--color-secondary-hover)` / `var(--color-secondary-active)`
- **强调**：`var(--color-accent)` —— 透明按钮 hover/激活背景
- **Ghost Hover / 激活**：`var(--color-ghost-hover)` / `var(--color-ghost-active)` —— ghost 按钮 hover 填充

### 工作台分区色（HetuSketch 专属）

VSCode 风格工作台的每个空间分区拥有独立的色彩令牌：

- **ActivityBar 背景**：`var(--color-activitybar)` —— 48px 左侧图标栏
- **ActivityBar 前景**：`var(--color-activitybar-foreground)` —— 图标颜色
- **ActivityBar 选中**：`var(--color-activitybar-active)` —— 当前激活图标填充
- **ActivityBar 选中前景**：`var(--color-activitybar-active-foreground)`
- **ActivityBar 边框**：`var(--color-activitybar-border)` —— 右侧分割线
- **PrimarySidebar 背景**：`var(--color-sidebar-primary)`
- **PrimarySidebar 前景**：`var(--color-sidebar-primary-foreground)`
- **PrimarySidebar 选中**：`var(--color-sidebar-primary-active)` / `var(--color-sidebar-primary-active-foreground)`
- **PrimarySidebar 边框**：`var(--color-sidebar-primary-border)`
- **SecondarySidebar 背景**：`var(--color-sidebar-secondary)` —— AI 聊天/大纲右面板
- **SecondarySidebar 前景**：`var(--color-sidebar-secondary-foreground)`
- **SecondarySidebar 边框**：`var(--color-sidebar-secondary-border)`
- **BottomPanel 背景**：`var(--color-panel-bottom)` —— 底部面板
- **BottomPanel 前景**：`var(--color-panel-bottom-foreground)`
- **BottomPanel 标签选中**：`var(--color-panel-bottom-active)`
- **标题栏/状态栏背景**：`var(--color-titlebar)` / `var(--color-statusbar)` —— 32px/22px 窄条
- **标题栏/状态栏前景**：`var(--color-titlebar-foreground)` / `var(--color-statusbar-foreground)`

### 边框与分割线

- **边框**：`var(--color-border)` —— 组件边框、分隔线
- **边框弱化**：`var(--color-border-muted)` —— 密集列表内部、树视图项之间、表格单元格分隔
- **边框微妙**：`var(--color-border-subtle)` —— 嵌套面板、非交互容器上的极静边框
- **边框 Hover / 激活**：`var(--color-border-hover)` / `var(--color-border-active)`
- **窗格分隔线**：`var(--color-sash)` —— 可拖拽分隔条的默认颜色；hover 时变为 `var(--color-sash-hover)`
- **输入框边框**：`var(--color-input)` —— 输入字段边框
- **聚焦环**：`var(--color-ring)` —— 聚焦指示

### 边框使用规则

- 使用语义边框工具类（`border-border`、`border-border-muted`、`border-border-subtle`、`border-input`、`border-sash`）替代硬编码颜色。
- 窗格分隔线必须使用 `var(--color-sash)` 作为默认颜色，hover 时使用 `var(--color-sash-hover)`，不可使用 `var(--color-border)`。
- ActivityBar 与 PrimarySidebar 之间使用 `var(--color-activitybar-border)`，PrimarySidebar 与 Editor 之间使用 `var(--color-sidebar-primary-border)`。
- 0.5px 发丝分割线使用显式令牌属性，如 `[border-bottom:0.5px_solid_var(--color-border-muted)]`。
- 不可使用透明度修饰的边框类（如 `border-border/50`），使用语义边框令牌。

### 语义状态色

- **危险操作**：`var(--color-destructive)` —— 删除、重置、废弃伏笔
- **危险 Hover**：`var(--color-destructive-hover)`
- **成功**：`var(--color-success)` —— 保存成功、校验通过、伏笔已回收
- **警告**：`var(--color-warning)` —— 索引过期、配置不完整、网络异常
- **信息**：`var(--color-info)` —— 帮助提示、更新通知

每种状态色提供完整调色板（base / text / bg / border / hover）用于 Toast、横幅、标签徽标等丰富状态表面。

### 链接

链接继承 `var(--color-primary)` 作为颜色，hover 时添加下划线。不存在独立的 `--color-link` 令牌——主色即链接色。

### 图表与关系图色

关系力图谱使用实体识别色作为节点主要填充：角色节点用 `var(--color-entity-character)`，世界观节点用 `var(--color-entity-world)`，伏笔节点用 `var(--color-entity-plot)`。边连线使用 `var(--color-border-muted)`，hover/选中边使用 `var(--color-border)`。

通用数据可视化可使用基础色阶（`--color-blue-*`、`--color-green-*`、`--color-amber-*` 等）。

### 基础色彩族

可用基础色阶（每个含 11 个色度，`*-50` 至 `*-950`）：neutral / stone / zinc / slate / gray / red / orange / amber / yellow / lime / green / emerald / teal / cyan / sky / blue / indigo / violet / purple / fuchsia / pink / rose。优先使用语义令牌构建 UI 表面。

## 3. 字体系统

> 令牌取值定义在 `src/renderer/assets/styles/tokens/typography.css`。

### HetuSketch 双字体体系

与通用 UI 应用不同，HetuSketch 采用**双字体体系**，区分"工具控制界面"和"沉浸式书写区域"：

- **UI 字体**：`var(--font-family-ui)` —— 所有面板标题、按钮、标签、树视图、侧边栏、状态栏。使用系统 UI 字体栈以保证工具界面的清晰度和一致性。
- **编辑字体**：`var(--font-family-editor)` —— Markdown 正文编辑区域。用户可自定义（字体族、字号、颜色），默认提供等宽或衬线选项，支持沉浸式长文本创作。

### 字号体系

| 角色 | 令牌 | 约值 | 用途 |
|------|------|------|------|
| Body XS | `var(--font-size-body-xs)` | 12px | 标签、徽标、时间戳、元数据、伏笔状态标记 |
| Body SM | `var(--font-size-body-sm)` | 13px | 树视图项、面板内导航、次级标签、图例说明 |
| Body MD | `var(--font-size-body-md)` | 14px | 标准 UI 文本、表单输入、描述、设定字段标签 |
| Body LG | `var(--font-size-body-lg)` | 16px | 强调正文、面板内子标题 |
| Heading XS | `var(--font-size-heading-xs)` | 18px | 面板内小节标题 |
| Heading SM | `var(--font-size-heading-sm)` | 20px | 子面板标题、分组标题 |
| Heading MD | `var(--font-size-heading-md)` | 24px | 面板主标题、对话框标题 |
| Heading LG | `var(--font-size-heading-lg)` | 32px | 页面标题 |
| Heading XL | `var(--font-size-heading-xl)` | 40px | 引导/欢迎页标题 |

编辑器区域字号由用户自定义 `var(--font-size-editor)` 控制，默认 16px。编辑器中 Markdown 标题（h1-h3）缩放不受 UI 标题令牌约束。

### 字重体系

三个语义字重作为令牌公开：

| 字重 | 令牌 | 用途 |
|------|------|------|
| Regular | `var(--font-weight-regular)` (400) | 正文编辑区、设定描述文本、次要标签 |
| Medium | `var(--font-weight-medium)` (500) | 树视图标签、面板标题、表单标签、导航 |
| Bold | `var(--font-weight-bold)` (700) | 面板主标题、对话框标题、强调状态 |

### 行高

| 令牌 | 约值 | 用途 |
|------|------|------|
| `var(--line-height-body-xs)` | 18px | Body XS / 紧凑标签 |
| `var(--line-height-body-sm)` | 20px | Body SM (13px) |
| `var(--line-height-body-md)` | 20px | Body MD (14px) |
| `var(--line-height-body-lg)` | 24px | Body LG (16px) |
| `var(--line-height-heading-xs)` | 24px | Heading XS (18px) |
| `var(--line-height-heading-sm)` | 28px | Heading SM (20px) |
| `var(--line-height-heading-md)` | 32px | Heading MD (24px) |
| `var(--line-height-heading-lg)` | 40px | Heading LG (32px) |

编辑器行高由用户自定义 `var(--line-height-editor)` 控制，默认 1.6（约 25.6px）。

### 段落间距

`var(--paragraph-spacing-body-{xs|sm|md|lg})` 和 `var(--paragraph-spacing-heading-{xs|sm|md|lg|xl})` 设定段落与标题之间的垂直节奏。

### 原则

- **UI 区与编辑区字体分离**：工具控制界面使用 UI 字体族；Markdown 编辑区使用用户配置的编辑字体族。这是 HetuSketch 区别于通用应用的核心字体策略。
- **Medium (500) 是中枢**：Regular 用于内容和描述，Medium 用于结构性标签和导航，Bold 用于页面级强调。
- **一致性行高节奏**：Body 约 1.4–1.5×，Heading 更紧凑（约 1.0–1.3×）。

## 4. 组件样式

### 按钮

**基础**
- 布局：内联 flex，居中，`gap-2`，不换行
- 圆角 / 字体 / 动效：`rounded-md`、`font-normal`、`transition-all`
- 禁用：禁止指针事件，`opacity-40`
- 加载中：`data-loading=true`，`cursor-progress`，`opacity-40`，内容前显示旋转器
- 聚焦：聚焦环颜色来自 `var(--color-ring)`

**默认**
- 背景：来自按钮基元的强动作填充
- 文本：深色模式下为近白/浅色，浅色模式下为近黑/深色
- 阴影：`shadow-xs`
- Hover：`hover` 变体
- 用途：主要 CTA（"校验"、"保存"、"创建"、Dialog 确认）

**轮廓**
- 背景：透明
- 文本：`var(--color-foreground)`
- 边框：1px solid `var(--color-border)`
- 阴影：无
- Hover：填充 `var(--color-accent)`
- 用途：需要可见边界的次级/取消操作

**次级**
- 背景：`var(--color-secondary)`
- 文本：`var(--color-secondary-foreground)`
- 圆角：`var(--radius-lg)`
- 阴影：无
- Hover：`var(--color-secondary-hover)`
- 用途：次级操作（"取消"、"返回"、"导出"、"关闭面板"）

**Ghost**
- 背景：透明
- 文本：中性前景色
- 阴影：无
- Hover：填充 `var(--color-accent)`，文本 `var(--color-accent-foreground)`
- 激活：`var(--color-ghost-active)`
- 用途：工具栏操作、面板内联操作、图标按钮、ActivityBar 项

**危险**
- 背景：`var(--color-destructive)`
- 文本：白色
- 阴影：`shadow-xs`
- Hover：`var(--color-destructive-hover)`
- 用途：危险操作（"删除角色"、"移除"、"重置"、"废弃伏笔"）

**链接**
- 背景：无
- 文本：中性前景色
- Hover：中性弱化文本 + 下划线
- 用途：内联文本链接、导航快捷方式

**尺寸**

| 尺寸 | 用途 |
|------|------|
| `default` | 标准按钮 |
| `sm` | 密集控件、面板内联操作 |
| `lg` | 高强调操作 |
| `icon` | 标准图标按钮（32×32） |
| `icon-sm` | 密集图标按钮（24×24） |
| `icon-lg` | 大图标按钮（40×40） |

**药丸** —— 形状修饰符，非颜色变体
- 圆角：`var(--radius-round)`
- 用途：标签筛选、伏笔状态标记、风险等级徽标、内容类型切换器

**图标按钮与低强调操作**

图标按钮使用共享 Button 基元：`variant="ghost"` + `size="icon"` 或 `size="icon-sm"`。必须提供 `aria-label`；当图标含义不明显时添加 Tooltip。

**色彩层次 —— 先问一个问题：此图标是用户在这个页面/面板的主要操作吗？**

- **是** → 使用 ghost 变体默认文本色（不覆盖 `text-*`）。图标本身就是操作。
- **否，是辅助快捷操作** → 用 `text-foreground-muted hover:text-foreground` 弱化，使其在静止时退后，hover 时显现。

| 场景 | 颜色 |
|------|------|
| 面板工具栏主要操作 | ghost 变体默认色，不覆盖 |
| 辅助/工具类入口 | `text-foreground-muted hover:text-foreground` |
| 开关处于激活态 | 激活时 `text-foreground`；否则弱化 |
| 行级危险操作 | `text-foreground-muted hover:text-destructive` |

**经验法则：** 若一个区域有 3+ 图标按钮，最多一个处于 ghost 默认色。其余为辅助操作——弱化它们，否则眼睛没有锚点。

**行级操作模式**
- 树视图、设定列表、校验列表中的行级低强调操作用默认保持安静（`text-foreground-muted`，无静态填充或阴影），仅在 hover/聚焦/激活时获得强调。
- 危险行级操作不应常驻红色。保持触发器低强调，用 `ConfirmDialog` + 危险确认按钮处理实际危险决策。
- 收藏/星标操作可使用琥珀色激活色，但仅用于收藏语义。

### ActivityBar

ActivityBar 是 HetuSketch 工作台的最左侧 48px 图标栏，承载 7 个可拖拽排序的活动入口（搜索、角色、世界观、伏笔、编辑器、项目、设置）。该组件位于 `src/renderer/components/ActivityBar/`。

**容器**
- 宽度：48px 固定（`w-[48px]`）
- 高度：填充工作台高度，扣除标题栏
- 背景：`var(--color-activitybar)`
- 右侧边框：1px solid `var(--color-activitybar-border)`
- 布局：flex 列，顶部对齐，`gap-1`

**图标按钮（每个活动入口）**
- 尺寸：48×48（`size-[48px]`），图标 20×20
- 默认前景：`var(--color-activitybar-foreground)`，opacity 0.6
- 激活前景：`var(--color-activitybar-active-foreground)`，opacity 1.0
- 激活指示：左侧 2px 竖条，`var(--color-primary)` 或 `var(--color-entity-{type})` 
- Hover：填充 `var(--color-activitybar-active)`，前景 opacity 变为 ~0.85
- 拖拽手柄：图标项可纵向拖拽重排

**规则**
- 当前激活活动必须始终显示左侧指示条，颜色对应其内容类型（角色 = 角色色，世界观 = 世界观色，伏笔 = 伏笔色，编辑器/项目/设置 = 主色）
- 搜索入口（顶部）和设置入口（底部附近）固定不可拖拽
- 拖拽期间，插入位置用 2px 半透明指示线标识
- 不可使用 `var(--color-primary)` 为所有图标统一着色——实体类型必须使用各自的实体识别色

### 侧边栏（PrimarySidebar）

PrimarySidebar 位于 ActivityBar 右侧，宽度可调（默认 260px），承载当前活动对应的树视图或列表。

**容器**
- 宽度：默认 260px，用户可通过 sash 拖拽调整（最小 170px，最大 500px）
- 背景：`var(--color-sidebar-primary)`
- 文本：`var(--color-sidebar-primary-foreground)`
- 右侧边框：0.5px solid `var(--color-border)`

**树视图（设定集 > 作品 > 书目 > 章节 / 角色列表 / 世界系列表 / 伏笔列表）**
- 项高度：32px（`h-8`）
- 左侧缩进：每级 16px（`pl-4` 递进）
- 字体：`var(--font-size-body-sm)` · `var(--font-weight-regular)`
- 文本色：`var(--color-sidebar-primary-foreground)`
- 选中项：`var(--color-sidebar-primary-active)` 背景，`var(--color-sidebar-primary-active-foreground)` 文本
- Hover：`var(--color-sidebar-primary-active)` 背景
- 聚焦环：`var(--color-ring)`
- 图标色：继承内容实体识别色（角色列表项图标 = `var(--color-entity-character)`，世界观 = `var(--color-entity-world)`，伏笔 = `var(--color-entity-plot)`）
- 展开箭头：16×16，`var(--color-foreground-muted)`

**章节状态指示点**
- 未开始：`var(--color-foreground-muted)`，opacity 0.3
- 草稿中：`var(--color-risk-warning)`，实心圆
- 已完成：`var(--color-risk-pass)`，实心圆
- 修订中：`var(--color-info)`，实心圆
- 已锁定：`var(--color-foreground-secondary)`，锁图标

**规则**
- 树视图不可硬编码内边距——使用 Sidebar 容器统一管理
- 不可将实体色用于树视图文本，仅用于图标和状态指示点
- 不可将 PrimarySidebar 背景色用于其他面板——每个分区使用各自专属令牌

### SecondarySidebar

SecondarySidebar 位于 Editor 右侧，承载 AI 对话/大纲辅助面板，默认隐藏，通过 ActivityBar 中的 AI 入口切换。

**容器**
- 宽度：默认 320px，可拖拽调整（最小 220px，最大 500px）
- 背景：`var(--color-sidebar-secondary)`
- 文本：`var(--color-sidebar-secondary-foreground)`
- 左侧边框：0.5px solid `var(--color-border)`

**AI 对话面板**
- 消息气泡：用户消息使用 `var(--color-secondary)` 背景 + `var(--radius-lg)` 圆角，右对齐；AI 消息使用透明背景 + 左侧边框 `var(--color-border-subtle)`
- 文本：`var(--font-size-body-sm)` · `var(--font-weight-regular)` · `var(--color-sidebar-secondary-foreground)`
- 输入框：底部固定，`var(--color-background)` 背景，1px `var(--color-input)` 边框
- 校验结果摘要：以风险等级色为左边框 3px 指示条

### BottomPanel

BottomPanel 位于工作台底部，是可折叠的多标签面板，承载 AI 提示词、角色条目速查、世界观条目速查、伏笔条目速查、输出终端等视图。

**容器**
- 高度：默认 200px，用户可通过 sash 拖拽调整（最小 80px，最大 500px）
- 背景：`var(--color-panel-bottom)`
- 文本：`var(--color-panel-bottom-foreground)`
- 上边框：1px solid `var(--color-border)`

**标签栏**
- 高度：32px
- 标签文本：`var(--font-size-body-sm)` · `var(--font-weight-medium)`
- 默认标签：`var(--color-panel-bottom-foreground)`，opacity 0.7
- 选中标签：`var(--color-panel-bottom-active)` 背景，opacity 1.0，底部 2px `var(--color-primary)` 指示条
- Hover：比默认多 ~0.15 opacity

**规则**
- 面板内容使用 `var(--font-size-body-sm)` · `var(--font-weight-regular)`
- 不可在 BottomPanel 内使用卡片包裹，其内容区为扁平工作表面

### 编辑器工作区（Editor Workbench）

HetuSketch 的核心区域，是 Markdown 正文编辑和设定内容查看的一级工作区。

**标签栏**
- 高度：36px（`h-9`）
- 背景：`var(--color-surface)`
- 激活标签：`var(--color-background)` 背景 + 无底部边框（与内容区融合）
- 非激活标签：`var(--color-surface)` 背景 + 底部 1px `var(--color-border)`
- Hover：`var(--color-accent)` 填充
- 标签文本：`var(--font-size-body-sm)` · `var(--font-weight-regular)` · `var(--color-foreground)`
- 关闭按钮：12×12，`var(--color-foreground-muted)`，hover 变 `var(--color-foreground)`
- 新建标签 + 按钮：24×24，`var(--color-foreground-muted)`

**编辑区**
- 背景：`var(--color-background)`
- 文本：编辑字体族 `var(--font-family-editor)`，字号 `var(--font-size-editor)`（默认 16px），行高 `var(--line-height-editor)`（默认 1.6）
- 文本色：`var(--color-foreground)` —— 正文是界面中最丰富多彩的元素
- 内边距：`px-8 py-6`（约 64px 左右，48px 上下），为长文本创作留出充足呼吸空间
- Markdown 标题（h1-h3）：使用编辑字体族，字重 `var(--font-weight-bold)`，颜色 `var(--color-foreground)`
- 引用块：左侧 3px `var(--color-border)`，`var(--color-foreground-secondary)` 文本
- 代码块：编辑器等宽字体，`var(--color-secondary)` 背景，`var(--radius-md)` 圆角

**分屏视图**
- 支持单栏、左右双栏、1+2 网格三种布局
- 分隔线：1px solid `var(--color-border)`，可拖拽调整比例
- 空状态：居中图标（`var(--color-foreground-muted)`，opacity 0.3）+ "打开文件开始写作" 文本

### 校验面板

校验面板是逻辑校验结果的展示容器，可从编辑区域工具栏或右键菜单触发。

**结果摘要条**
- 顶部固定，`var(--color-surface)` 背景
- 总体风险等级徽标：使用对应的 `var(--color-risk-{level})` 药丸
- 统计数据：发现数 / 阻断数 / 提示数，`var(--font-size-body-sm)` · `var(--color-foreground-secondary)`

**校验结果行**
- 左边框 3px 指示条，颜色对应风险等级
- 行背景：`var(--color-background)` 默认，hover `var(--color-accent)`
- 冲突类型图标：16×16，使用对应实体识别色
- 标题：`var(--font-size-body-sm)` · `var(--font-weight-medium)`
- 原因/建议：`var(--font-size-body-xs)` · `var(--color-foreground-secondary)`
- 文本片段引用：`var(--color-secondary)` 背景 + `var(--radius-sm)` 圆角 + `var(--font-family-ui)` 字体
- 展开详情：内联展开，显示相关设定证据和文本对应位置
- 操作按钮组：右侧 ghost 图标按钮（"打开相关设定"、"查看角色"、"忽略"等）

**空状态**
- 校验通过无冲突：绿色对勾图标 + "未发现逻辑冲突" 文本
- 无校验结果：灰色图标 + "选择校验范围后开始" 文本

### 设定数据库卡片与列表

角色、世界观、伏笔三项设定数据库使用同一套组件。

**卡片视图**
- 背景：`var(--color-surface)`
- 边框：1px solid `var(--color-border)`
- 圆角：`var(--radius-lg)`
- 内边距：`p-4`
- 标题：`var(--font-size-body-lg)` · `var(--font-weight-medium)`
- 标签/徽标：使用对应实体色 `var(--color-entity-{type}-bg)` + `var(--color-entity-{type}-text)`
- 字段标签：`var(--font-size-body-xs)` · `var(--color-foreground-muted)` · `uppercase`
- 字段值：`var(--font-size-body-sm)` · `var(--color-foreground)`
- 红线字段：左侧 2px `var(--color-destructive)` 指示条

**列表视图**
- 行高度：36px（`h-9`）
- 类型图标列：24px，使用实体识别色
- 标题列：`var(--font-size-body-sm)` · `var(--font-weight-medium)`
- 次级列（状态/角色/章节）：`var(--font-size-body-xs)` · `var(--color-foreground-secondary)`
- 行分隔：`border-b border-border-muted`
- 选中行：`var(--color-accent)` 背景
- Hover：`var(--color-accent)` 背景

### 关系力图谱

角色关系力图谱是 HetuSketch 的特色可视化组件。

**画布**
- 背景：`var(--color-background)`
- 缩放控件：右下固定，ghost 图标按钮组 + 缩放百分比显示
- 节点 >220 时性能节流：简化渲染，禁用动画

**节点**
- 默认填充：`var(--color-entity-character)`（角色）/ `var(--color-entity-world)`（世界观）/ `var(--color-entity-plot)`（伏笔）
- 选中节点：边框加粗至 2px `var(--color-primary)`
- Hover 节点：填充色提亮 ~15%，显示 tooltip
- 聚焦模式：非聚焦节点 opacity 0.2
- 节点标签：`var(--font-size-body-xs)` · `var(--font-weight-medium)` · `var(--color-foreground)`

**连线**
- 默认：1px `var(--color-border-muted)`
- Hover/选中：1.5px `var(--color-border)`
- 箭头：6×6，颜色继承连线

### 对话框

**外壳**
- 表面：`var(--color-surface-overlay)`
- 圆角：`var(--radius-2xl)`
- 边框：1px `var(--color-border-subtle)`
- 内边距 / 间距：`p-6`，`gap-4`
- 阴影：`shadow-xl`
- 动效：淡入 + 缩放过渡，`duration-200`

**布局**
- 覆盖层：固定全窗口遮罩，`z-[80]`，`bg-black/50`
- 内容：固定居中，`top-[50%] left-[50%]`，平移 `-50%`
- 宽度：全宽 + `max-w-[calc(100%-2rem)]`（窄窗口兜底）
  - `size="sm"` → `sm:max-w-sm`（384px）—— 单字段输入、重命名、简短确认
  - `size="default"` → `sm:max-w-lg`（512px）—— 标准表单
  - `size="lg"` → `sm:max-w-xl`（576px）—— 多项表单、配置面板
- 不可用 `className="sm:max-w-*"` 覆盖对话框宽度——选 `size` 属性。

**结构**
- 头部：flex 列，`gap-2`，移动端居中，`sm` 起左对齐
- 标题：`text-lg leading-none font-semibold`
- 描述：`text-foreground-muted text-sm`
- 底部：移动端 `flex-col-reverse`，桌面端 `sm:justify-end` 行布局
- 关闭按钮：默认显示，绝对定位 `top-4 right-4`，低透明度，hover 提高

**操作**
- 取消/次级操作用 `Button variant="outline"`
- 主要操作用 `Button variant="default"`
- 危险确认操作用 `Button variant="destructive"`

**使用 Dialog 的场景**
- 居中确认、聚焦表单流、设定编辑浮窗、阻塞式决策
- 短至中等长度的内容，不应看起来附着于页面边缘
- 用户必须先完成或关闭交互才能返回页面的场景

### 页面侧边面板（PageSidePanel）

用于页面级管理表面，如作品设置、导入导出面板、创建向导面板。

- 背景遮罩：固定 `inset-0`，`z-[60]`，`bg-black/50`，`0.15s` 淡入
- 面板：固定 `top-3 bottom-3`，`right-3` 或 `left-3`，`z-[70]`
- 尺寸/外壳：`w-[420px]`，`rounded-2xl`，`var(--color-surface-overlay)`，`shadow-xl`，`overflow-hidden`
- 动效：从所选侧水平滑入 + 弹性过渡
- 头部：`px-6 pt-6 pb-3`，可选头部内容 + ghost 关闭按钮
- 正文：共享滚动条，`space-y-4 px-6 py-4`
- 底部：可选，`px-6 pt-3 pb-6`，用于固定操作组

**Do not:**
- 用 PageSidePanel 展示树视图或长列表——使用 PrimarySidebar 或主编辑区
- 在 PageSidePanel 正文中嵌套卡片——使用 `PageSidePanelSection` + `PageSidePanelItem` 分组模式

### 输入框

- 背景：`var(--color-background)`
- 边框：1px solid `var(--color-input)`
- 圆角：`var(--radius-md)`
- 阴影：无——输入框在静止状态保持扁平；阴影保留给 hover 反馈和浮动元素
- 聚焦环：`focus-visible:ring-2 focus-visible:ring-ring/50`
- 字体：`var(--font-family-ui)`，`var(--font-size-body-sm)` 至 `var(--font-size-body-md)`，`var(--font-weight-regular)`
- 占位符：`var(--color-foreground-muted)`

**搜索字段（全局搜索栏、侧边栏搜索）**
- 背景：`var(--color-background)`
- 圆角：`var(--radius-lg)` 至 `var(--radius-xl)`
- 左侧搜索图标：16×16，`var(--color-foreground-muted)`
- 清除按钮：16×16 ghost 图标，仅在有输入时显示
- 防抖：220ms（全局搜索）

**文本区域（编辑器中的多行输入、设定字段长文本）**
- 最小高度：`min-h-[120px]`
- 圆角：`var(--radius-lg)`
- 编辑器字体：`var(--font-family-editor)`（仅编辑区）
- 设定描述字段：`var(--font-family-ui)`，`var(--font-size-body-sm)`

### 开关

| 尺寸 | 轨道 | 滑块 | 用途 |
|------|------|------|------|
| `sm` | 36×20 | 18×18 | 密集设置行 |
| `md`（默认） | 44×22 | 19×19 | 标准开关 |

- 关闭态轨道：`var(--color-border)` 或灰半透明
- 开启态轨道：`var(--color-primary)`
- 聚焦环：`focus-visible:ring-[3px] focus-visible:ring-ring/50`
- 不带标签的裸开关仅在周围行拥有间距和辅助文本时使用

### 下拉菜单与弹出框

使用共享 Popover 基元作为触发器绑定的浮动容器。

- 背景：`var(--color-surface-raised)`
- 文本：`var(--color-foreground)`
- 边框：0.5px 发丝线 `var(--color-border)`
- 圆角：`var(--radius-lg)`
- 内边距：`p-1.5`（紧凑菜单）
- 宽度：内容驱动（`w-fit`），最小 128px（`min-w-[128px]`）
- 阴影：`shadow-lg`
- 菜单项高度：32px（`h-8`），`rounded-md`，`px-2.5`，`text-sm`
- 选中操作后关闭弹出框

### 状态栏

工作台底部 22px 窄条。

- 高度：22px（`h-[22px]`）
- 背景：`var(--color-statusbar)`
- 文本：`var(--color-statusbar-foreground)`，opacity 0.8
- 字体：`var(--font-size-body-xs)` · `var(--font-weight-regular)`
- 左侧：项目名称、当前章节
- 右侧：光标位置（行:列）、字数统计、面板状态指示
- 项目间分隔：`mx-2` + 微细竖线

### 标题栏

工作台顶部 32px 窄条（Windows/Linux 原生标题栏）或 22px（macOS 交通灯区域）。

- 高度：32px（`h-8`）Windows / 22px macOS
- 背景：`var(--color-titlebar)`
- 文本：`var(--color-titlebar-foreground)`
- 内容：品牌名称 + 全局搜索 + 项目选择器 + 主题切换 + 窗口控制按钮
- 全局搜索：200px 宽输入框，220ms 防抖，搜索结果以浮动面板展示

## 5. 布局原则

### 工作台整体结构（CSS Grid）

HetuSketch 采用 CSS Grid 布局，7 个命名区域：

```
+----------+----------+----------------------+-----------+----+
|                    TitleBar (32px)                         |
+----------+----------+----------------------+-----------+----+
|          |          |                      |           |    |
| Activity | Primary  |   Editor Workbench   | Secondary |    |
| Bar      | Sidebar  |   (TabBar + Editor   | Sidebar   |    |
| (48px)   | (>=170px)|    + Sash splits)    | (>=220px) |    |
|          |          |                      |           |    |
+----------+----------+----------------------+-----------+----+
|                    BottomPanel (>=80px)                    |
+----------+----------+----------------------+-----------+----+
|                    StatusBar (22px)                        |
+----------+----------+----------------------+-----------+----+
```

### 区域宽度/高度约束

| 区域 | 默认尺寸 | 最小 | 最大 |
|------|---------|------|------|
| ActivityBar | 48px | 48px（固定） | 48px（固定） |
| PrimarySidebar | 260px | 170px | 500px |
| SecondarySidebar | 320px（隐藏） | 220px | 500px |
| BottomPanel | 200px | 80px | 主区域高度的 40% |
| StatusBar | 22px | 22px（固定） | 22px（固定） |
| TitleBar | 32px (Win) / 22px (Mac) | 固定 | 固定 |

### Sash 分隔线

- 宽度：4px 交互区域，视觉上为 1px 线
- 默认颜色：`var(--color-sash)`
- Hover 颜色：`var(--color-sash-hover)` 或 `var(--color-primary)`
- 光标：对应方向的 `col-resize` 或 `row-resize`
- 双击重置：双击 sash 恢复默认区域尺寸
- Sash 不可使用 `var(--color-border)`——它有专用的 `--color-sash` 令牌

### 编辑器内布局

**标签栏**
- 高度：36px，与 Editor 顶部齐平
- 每个标签最小宽度 100px，最大 200px，超长截断
- 标签关闭按钮在 hover 时显示

**编辑内容区**
- Markdown 正文左右最大宽度：`max-w-[720px]`，居中显示
- 设定编辑/查看：全宽，使用响应式字段网格
- 分屏模式：每个窗格最小 200px，可通过 sash 调整

### 面板内间距

| 上下文 | 内边距 |
|--------|--------|
| 面板头部（PageHeader 等效） | `pl-5 pr-3`，`h-8`，`mt-3 mb-2` |
| 面板正文内容 | `px-4 py-3` |
| 树视图内部 | 项 `h-8`，左缩进每级 `pl-4` |
| 表单/设置区域 | `p-6`，字段间距 `gap-4` |
| 分组间距 | `gap-6` 至 `gap-8` |

### 悬浮窗（快速查找）

全局快捷键 `Ctrl+Shift+H` 触发的悬浮快速查找窗口。

- 尺寸：420×560px
- 始终置顶
- 背景：`var(--color-surface-overlay)`
- 圆角：`var(--radius-2xl)`
- 边框：1px `var(--color-border-subtle)`
- 阴影：`shadow-xl`
- 内容：搜索栏 + 设定条目列表 + 最近访问 8 项

### 响应式行为

HetuSketch 是桌面 Electron 应用，响应式策略聚焦于**窗口缩放**而非设备切换：

- **宽窗口（>1400px）**：全部区域可见，SecondarySidebar 可展开
- **标准窗口（1024–1400px）**：PrimarySidebar + Editor 为主，SecondarySidebar 默认隐藏
- **窄窗口（800–1024px）**：PrimarySidebar 可折叠为图标模式（仅 ActivityBar + Editor）
- **最小窗口（760px）**：单列 Editor，ActivityBar 隐藏或叠加，通过窗口左上角汉堡菜单切换视图

窗口尺寸由 `electron-builder` 配置控制，最小窗口 760×500。不允许在此尺寸下隐藏关键功能。

### 空闲/加载状态

- **编辑器空状态**：居中展示品牌图标 + "创建或打开作品开始写作"
- **设定列表空状态**：对应实体图标（角色/世界观/伏笔）+ "暂无条目" + 新建按钮
- **校验空状态**："选择校验范围后开始" + 校验范围拾取器
- **加载骨架屏**：浅色脉冲块替代内容区域，圆角 `var(--radius-md)`

## 6. 深度与层级

HetuSketch 使用**多层表面颜色**建立结构层级，用**阴影**保留给交互反馈和浮动元素。

### 表面颜色层

| 层级 | 令牌 | 用途 |
|------|------|------|
| 底层（Level 0） | `var(--color-background)` | 工作台根背景、编辑区域 |
| 表面层（Level 1） | `var(--color-surface)` | 面板、侧边栏、标签栏 |
| 提升层（Level 2） | `var(--color-surface-raised)` | 弹出框、下拉菜单 |
| 叠加层（Level 3） | `var(--color-surface-overlay)` | 对话框、模态面板、设置浮窗 |
| ActivityBar | `var(--color-activitybar)` | 最左侧图标栏——与侧边栏区分 |
| BottomPanel | `var(--color-panel-bottom)` | 底部面板——独立于主区 |
| 模态遮罩 | 对话框/画板/PageSidePanel 共享 `bg-black/50` | 模态背后的暗化遮罩 |

**深度哲学**：表面颜色分层是主要深度机制——`var(--color-border)` 分隔同色表面，深色模式下渐进式变亮的中性色构建自然堆叠。阴影保留给**交互反馈**（hover 状态添加轻微抬升）和**浮动元素**（弹出框、居中对话框、PageSidePanel 使用中到重度抬升）。这使界面在静止时感觉平坦，交互时响应迅速。

## 7. 阴影 / 模糊 / 透明度 / 边框 / 描边

### 阴影

**盒阴影（7 级）：**

| 令牌 | 用途 |
|------|------|
| `var(--shadow-2xs)` | 微妙分割、按压态 |
| `var(--shadow-xs)` | **按钮 hover**——主要交互反馈 |
| `var(--shadow-sm)` | 卡片、小型浮动元素 |
| `var(--shadow-md)` | 下拉菜单、弹出框 |
| `var(--shadow-lg)` | 大浮动面板、悬浮快速查找窗 |
| `var(--shadow-xl)` | 对话框、PageSidePanel、全屏覆盖 |
| `var(--shadow-2xl)` | 引导卡片、峰值强调 |

### 模糊

当组件有意需要模糊时，直接使用 Tailwind blur/backdrop-blur 工具类。当前没有公开的 `--blur-*` 设计令牌。

### 透明度

使用 Tailwind 透明度工具类（`opacity-40`、`opacity-70` 等）或组件级状态类。

### 边框宽度

使用 Tailwind 边框宽度工具类（`border`、`border-0`、`border-2` 等）配合语义边框颜色令牌。

### 描边宽度

使用图标库默认值，除非组件有文档记录的 SVG `stroke-width` 覆盖理由。

## 8. 设计原则与禁区

### Do（应该做）

- 使用表面颜色分层建立空间分区——ActivityBar、PrimarySidebar、Editor、SecondarySidebar、BottomPanel 各使用专属令牌
- 校验结果使用风险等级色系：`var(--color-risk-pass)` / `var(--color-risk-notice)` / `var(--color-risk-warning)` / `var(--color-risk-critical)`
- 设定条目列表/图标使用实体识别色：`var(--color-entity-character)` / `var(--color-entity-world)` / `var(--color-entity-plot)`
- `var(--color-primary)` 用于页面级主要操作、选中态和链接，不用于设定实体区分
- 深色模式为默认体验：`var(--color-background)` 为 `#0A0A0A`，分层表面渐进变亮
- UI 控制区使用 `var(--font-family-ui)`，编辑书写区使用 `var(--font-family-editor)`
- `var(--font-weight-medium)` 用于面板标题、树视图标签、表单标签
- `var(--font-weight-bold)` 用于页面级强调（面板主标题、Dialog 标题）
- 工作台分区必须使用各自的专属表面和边框令牌——不可交叉使用
- Sash 分隔线使用 `var(--color-sash)` / `var(--color-sash-hover)`，不可用 `var(--color-border)`
- 使用语义状态色（`var(--color-success)`、`var(--color-warning)`、`var(--color-info)`、`var(--color-destructive)`）进行反馈，不可用于装饰
- 浮动元素（弹出框、对话框、PageSidePanel）使用 `var(--shadow-lg)` 至 `var(--shadow-xl)`
- 先使用共享组件基元；在添加新令牌之前确认是否没有现成的语义令牌

### Don't（不该做）

- **禁止用阴影表达静态层级**——阴影仅用于 hover 反馈和浮动元素。面板分区通过表面颜色分离。
- **禁止将实体色（`--color-entity-*`）用于非对应实体**——角色色仅用于角色相关元素，不可用于世界观或伏笔
- **禁止将 UI 字体用于编辑区，或编辑字体用于 UI 区**——双字体体系的边界必须严格遵守
- **禁止硬编码 hex / rgba / oklch 色值**——始终引用语义令牌以确保双模式自动切换
- **禁止在非危险操作上使用 `var(--color-destructive)`**——它仅保留给删除/错误/警告
- **禁止为每个面板引入页面级品牌色**——使用语义令牌或实体识别色
- **禁止混淆分区令牌**——`var(--color-sidebar-primary)` 不可用于 SecondarySidebar，反之亦然
- **禁止在树视图中将实体色用于纯文本**——实体色仅用于图标和状态指示
- **禁止在 BottomPanel 中使用卡片包裹**——其内容区为扁平工作表面
- **禁止字重低于 `var(--font-weight-regular)` 用于功能性 UI 文本**——thin/light/extralight 仅用于展示
- **禁止将 `var(--color-success)` / `var(--color-warning)` / `var(--color-info)` 用于装饰性目的**——它们承载语义
- **禁止对话框宽度用 `className` 硬编码覆盖**——使用 `size` 属性
- **禁止图标按钮常驻 `text-foreground`**——按"主要操作 vs 辅助快捷"区分默认色和弱化色
- **禁止 ActivityBar 图标全部使用 `var(--color-primary)`**——实体类型必须使用各自的实体识别色
- **禁止 Sash 使用 `var(--color-border)`**——Sash 有专用的 `--color-sash` / `--color-sash-hover` 令牌
- **禁止发明令牌外观变量**如 `--color-glass`、`--color-overlay`、`--blur-md`、`--opacity-50`、`--border-width-2` 等，除非它们在同一变更中被主题导出和本文档记录

## 9. 窗口缩放行为

HetuSketch 是桌面 Electron 应用，响应式策略不同于 Web 应用。聚焦于窗口尺寸缩放而非设备断点：

| 窗口宽度 | 关键变化 |
|---------|---------|
| >1400px | 全工作台：ActivityBar + PrimarySidebar + Editor + SecondarySidebar（可选展开） + BottomPanel + StatusBar |
| 1200–1400px | SecondarySidebar 默认隐藏，通过 AI 入口切换。PrimarySidebar 默认 240px |
| 1024–1200px | PrimarySidebar 默认 220px，分屏编辑器仅支持双栏 |
| 800–1024px | PrimarySidebar 可折叠为仅图标模式（窄至 36px），编辑器单栏 |
| 760–800px | 单 Editor 模式，ActivityBar 和 PrimarySidebar 通过叠加汉堡菜单切换，BottomPanel 最小 80px |

### 缩放策略
- PrimarySidebar：常驻 → 图标模式（窄至 36px）→ 叠加（汉堡菜单切换）
- SecondarySidebar：默认隐藏 → 按需叠加
- BottomPanel：保持可拖拽，最小 80px，标签栏始终可见
- 编辑器：分屏数量自适应（3→2→1），最小 200px/窗格
- 字体：编辑区字号由用户设置控制，UI 字号保持不变（不自适缩放）
- 间距：面板内边距不缩放——最小窗口下仍保持 `px-4` 基准
- 关系图：窗口缩小时自动调整力布局参数

## 10. 智能体提示词指南

### 快速令牌参考

| 角色 | 令牌 | 备注 |
|------|------|------|
| 根背景 | `var(--color-background)` | 深色 `#0A0A0A` / 浅色 `#F5F5F5` |
| 主要文本 | `var(--color-foreground)` | 正文内容主文本 |
| 次要/弱化文本 | `var(--color-foreground-secondary)` / `var(--color-foreground-muted)` | 辅助说明、占位符 |
| 主色 | `var(--color-primary)` | 页面级主要操作、选中态、链接 |
| 危险操作 | `var(--color-destructive)` | Hover: `var(--color-destructive-hover)` |
| 成功/警告/信息 | `var(--color-success)` / `var(--color-warning)` / `var(--color-info)` | 单令牌语义强调 |
| 风险-通过 | `var(--color-risk-pass)` | 校验无冲突，绿色系 |
| 风险-提示 | `var(--color-risk-notice)` | 仅提示关联设定或弱风险，蓝色系 |
| 风险-警告 | `var(--color-risk-warning)` | 可能存在逻辑冲突，琥珀色系 |
| 风险-严重 | `var(--color-risk-critical)` | 严重违反红线或硬规则，红色系 |
| 实体-角色 | `var(--color-entity-character)` | 角色图标、标签、关系图节点 |
| 实体-世界观 | `var(--color-entity-world)` | 世界观图标、标签、关系图节点 |
| 实体-伏笔 | `var(--color-entity-plot)` | 伏笔图标、标签、关系图节点 |
| 表面 | `var(--color-surface)` / `var(--color-surface-raised)` / `var(--color-surface-overlay)` | 分层内容容器 |
| ActivityBar | `var(--color-activitybar)` / `var(--color-activitybar-foreground)` | 最左侧图标栏 |
| PrimarySidebar | `var(--color-sidebar-primary)` / `var(--color-sidebar-primary-foreground)` | 左侧面板 |
| SecondarySidebar | `var(--color-sidebar-secondary)` / `var(--color-sidebar-secondary-foreground)` | 右侧 AI 面板 |
| BottomPanel | `var(--color-panel-bottom)` / `var(--color-panel-bottom-foreground)` | 底部面板 |
| 状态栏 | `var(--color-statusbar)` / `var(--color-statusbar-foreground)` | 底部 22px |
| 边框 | `var(--color-border)`（hover/active 变体可用） | 中性发丝线 |
| 安静边框 | `var(--color-border-muted)` / `var(--color-border-subtle)` | 密集分隔、嵌套面板 |
| Sash | `var(--color-sash)` / `var(--color-sash-hover)` | 可拖拽窗格分隔线 |
| 关系图 | 实体色节点 + `var(--color-border-muted)` 连线 | 力导向节点和边 |
| 阴影 | `var(--shadow-xs)` hover，`var(--shadow-md)` 浮动 | 7 级 |

### UI 字体 vs 编辑字体

| 区域 | 令牌 | 用途 |
|------|------|------|
| UI 控制区 | `var(--font-family-ui)` | 面板标题、按钮、标签、树视图、侧边栏、状态栏 |
| 编辑书写区 | `var(--font-family-editor)` | Markdown 正文编辑区域 |
| 编辑区字号 | `var(--font-size-editor)` | 默认 16px，用户可自定义 |
| 编辑区行高 | `var(--line-height-editor)` | 默认 1.6，用户可自定义 |

### 示例组件提示词

- "创建工作台布局：CSS Grid 7 区域，ActivityBar（48px 固定）`var(--color-activitybar)` 背景 + 7 个可拖拽图标。PrimarySidebar（260px 默认）`var(--color-sidebar-primary)` 背景承载树视图。Editor 占满中央，`var(--color-background)` 背景 + 顶部 36px 标签栏 + 正文编辑区（`var(--font-family-editor)` 字体，`var(--font-size-editor)` 字号，`max-w-[720px]`）。SecondarySidebar（默认隐藏）`var(--color-sidebar-secondary)` 承载 AI 面板。BottomPanel 200px 可拖拽。StatusBar 22px `var(--color-statusbar)` 底部。"

- "设计角色列表树视图：PrimarySidebar 内，项高 32px，每级缩进 16px，`var(--font-size-body-sm)` `var(--font-weight-regular)`。角色图标使用 `var(--color-entity-character)`，选中项 `var(--color-sidebar-primary-active)` 背景。危险行操作 `text-foreground-muted hover:text-destructive`。"

- "设计校验结果面板：总体摘要条 `var(--color-surface)` 背景 + 风险等级药丸（使用对应 `var(--color-risk-{level})`）。结果行左侧 3px 指示条按风险等级着色，标题 `var(--font-size-body-sm)` `var(--font-weight-medium)`，原因/建议 `var(--font-size-body-xs)` `var(--color-foreground-secondary)`。文本片段引用 `var(--color-secondary)` 背景 `var(--radius-sm)` 圆角。操作按钮 ghost 图标右置。"

- "设计关系力图谱：`var(--color-background)` 画布，角色节点 `var(--color-entity-character)` 填充，世界观节点 `var(--color-entity-world)`，伏笔节点 `var(--color-entity-plot)`。连线 `var(--color-border-muted)`，hover `var(--color-border)`。节点 >220 时简化渲染。缩放控件右下 ghost 图标组。右下角底部面板独立，不参与图谱画布。"

- "设计编辑器标签栏：36px 高，`var(--color-surface)` 背景。激活标签 `var(--color-background)` 背景 + 无底部边框，文本 `var(--color-foreground)`。非激活标签底部 1px `var(--color-border)`。关闭按钮 12×12，`var(--color-foreground-muted)`，hover `var(--color-foreground)`。新建 + 按钮 24×24。"

- "创建设定数据库卡片视图：`var(--color-surface)` 背景，1px `var(--color-border)`，`var(--radius-lg)`，`p-4`。类型徽标使用实体色 `var(--color-entity-{type}-bg)` + `var(--color-entity-{type}-text)`。字段标签 `var(--font-size-body-xs)` `var(--color-foreground-muted)` `uppercase`。红线字段左侧 2px `var(--color-destructive)` 指示条。"

- "设计危险确认对话框：`var(--color-surface-overlay)` 背景，`rounded-2xl`，`border border-border-subtle`，`p-6`，`shadow-xl`，`bg-black/50` 遮罩。底部 outline 取消 + destructive 删除。用于删除角色/世界观条目/伏笔、废弃伏笔等操作。"

- "设计 ActivityBar 图标项：48×48 容器，图标 20×20。默认 `var(--color-activitybar-foreground)` opacity 0.6。激活 `var(--color-activitybar-active-foreground)` opacity 1.0 + 左侧 2px `var(--color-primary)` 或实体色指示条。Hover `var(--color-activitybar-active)` 填充。搜索和设置图标固定位置，其余可拖拽重排。"

- "行级低强调操作：树视图或校验列表行内图标按钮使用 `text-foreground-muted` 默认、无静态填充、tooltip/`aria-label`、仅 hover 强调、仅在持久状态时使用激活色。三个以上图标按钮时仅一个保留 ghost 默认色，其余弱化。"

### 迭代指南

1. 从语义令牌出发——绝不硬编码 hex / oklch / rgba 色值。
2. 静止态通过表面颜色叠层建立分区（ActivityBar → PrimarySidebar → Editor → SecondarySidebar → BottomPanel）；hover 用 `var(--shadow-xs)`，浮动元素用 `var(--shadow-md)+`。
3. 按钮 hover：遵循共享 Button 变体定义；仅 `default` 和 `destructive` 保持 base `shadow-xs`，outline/secondary/emphasis/ghost 保持扁平。
4. 图标按钮：主要操作使用 ghost 默认色，辅助快捷操作弱化为 `text-foreground-muted`。三以上图标时仅一个为主操作。
5. UI 区使用 UI 字体族；编辑书写区使用编辑字体族——双字体边界不可混淆。
6. 字重保持 `var(--font-weight-regular)` / `var(--font-weight-medium)` 用于 UI，`var(--font-weight-bold)` 用于页面级强调。
7. 圆角：`var(--radius-md)` 用于按钮和输入框基础，`var(--radius-lg)` 用于卡片，`var(--radius-2xl)` 用于对话框和浮动面板，`var(--radius-round)` 用于药丸和徽标。
8. 语义强调：`var(--color-destructive)` 用于危险，`var(--color-success)` 用于通过/成功，`var(--color-warning)` 用于警告，`var(--color-info)` 用于信息。
9. 校验反馈使用风险等级色系，不可用 `var(--color-success)` / `var(--color-destructive)` 替代风险色令牌。
10. 设定条目使用实体识别色区分类型，不可交叉使用，不可用于纯文本。
11. Sash 使用专用 `--color-sash` 令牌，不可用 `var(--color-border)` 替代。
12. 覆盖/浮动表面：使用共享 Dialog 覆盖或 `var(--color-surface-raised)` / `var(--color-surface-overlay)` + 语义边框 + 阴影。添加新令牌前确认没有合适的现成令牌。
13. 新标题：使用 `var(--font-size-heading-*)` 字号令牌配合匹配的 `var(--line-height-heading-*)`。
14. 工作台分区：每个空间分区使用专属颜色令牌，不可交叉污染。


