# HetuSketch UI 排版与工作台布局文档

本文档描述 HetuSketch 渲染端的 UI 排版结构、工作台布局、组件层级、样式约定与交互行为。实现以 `src/renderer/src/App.tsx`（工作台外壳）与 `src/renderer/src/styles.css`（全局样式）为准。

## 1. 设计理念

HetuSketch 主界面采用 **VSCode 风工作台（Workbench）** 布局，目标是将设定管理、正文创作、逻辑校验、AI 辅助整合在统一的桌面环境中，减少工具切换成本。

核心设计原则：

- **Grid 驱动布局**：整个工作台使用 CSS Grid 划分区域，尺寸通过 CSS 变量动态控制。
- **可折叠区域**：主侧边栏、辅助侧边栏、底部面板均可独立显隐。
- **可拖拽分隔**：区域之间通过 Sash 分隔条调整大小，双击复位。
- **多 Tab 编辑**：编辑器区域支持多 Tab 与单列/双列/1+2 三种分割模式。
- **持久化布局**：所有布局状态保存到 localStorage，重启后恢复。
- **主题与字体可定制**：浅色/深色主题切换，功能栏与编辑区字体独立配置。

## 2. 工作台整体布局

### 2.1 Grid 结构

工作台根容器为 `.workbench-shell`，采用 CSS Grid 布局：

```text
列: [活动栏 48px] [主侧边栏 动态] [Sash 4px] [编辑器 1fr] [Sash 4px] [辅助侧边栏 动态]
行: [标题栏 32px] [内容区 1fr] [Sash 4px] [底部面板 动态] [状态栏 22px]
```

> 标题栏高度按平台区分：Windows 为 32px，macOS 为 22px（通过 `--titlebar-height` 变量在运行时覆盖）。

对应 CSS：

```css
.workbench-shell {
  --titlebar-height: 32px;
  --activity-width: 48px;
  --status-height: 22px;
  --sash-size: 4px;
  display: grid;
  grid-template-columns: var(--activity-width) var(--primary-sidebar-width) var(--sash-size) minmax(0, 1fr) var(--sash-size) var(--secondary-sidebar-width);
  grid-template-rows: var(--titlebar-height) minmax(0, 1fr) var(--sash-size) var(--panel-height) var(--status-height);
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
```

### 2.2 区域映射

| 区域 | Grid 位置 | CSS 类 | 尺寸变量 | 默认值 |
| --- | --- | --- | --- | --- |
| 标题栏 | 列 1/-1, 行 1 | `.workbench-titlebar` | `--titlebar-height` | 32px（Windows）/ 22px（macOS） |
| 活动栏 | 列 1, 行 2/5 | `.activity-bar` | `--activity-width` | 48px |
| 主侧边栏 | 列 2, 行 2/5 | `.primary-sidebar` | `--primary-sidebar-width` | 260px（min 170px / max 500px，可折叠为 0） |
| 主 Sash | 列 3, 行 2/5 | `.workbench-sash.sash-vertical.primary-sash` | `--sash-size` | 4px |
| 编辑器区 | 列 4, 行 2 | `.editor-area` | 1fr | 自适应 |
| 辅 Sash | 列 5, 行 2/5 | `.workbench-sash.sash-vertical.secondary-sash` | `--sash-size` | 4px |
| 辅助侧边栏 | 列 6, 行 2/5 | `.secondary-sidebar` | `--secondary-sidebar-width` | 320px（min 220px / max 500px，可折叠为 0） |
| 水平 Sash | 列 1/-1, 行 3 | `.workbench-sash.sash-horizontal.panel-sash` | `--sash-size` | 4px |
| 底部面板 | 列 1/-1, 行 4 | `.bottom-panel` | `--panel-height` | 200px（min 80px / max 主区域 40%，可折叠为 0） |
| 状态栏 | 列 1/-1, 行 5 | `.status-bar` | `--status-height` | 22px |

### 2.3 布局可视化

```text
┌─────────────────────────────────────────────────────────────────┐
│                          TitleBar                                │ 32px
├────┬──────────────┬───┬──────────────────────────┬───┬──────────┤
│    │              │   │                          │   │          │
│    │              │   │                          │   │          │
│ A  │   Primary    │ S │   EditorWorkbench        │ S │Secondary │
│ c  │   Sidebar    │ a │   (多 Tab 可分割)         │ a │ Sidebar  │
│ t  │              │ s │                          │ s │          │
│ i  │              │ h │                          │ h │          │
│ v  │              │   │                          │   │          │
│ i  │              │   │                          │   │          │
│ t  │              │   │                          │   │          │
│ y  │              │   │                          │   │          │
│    │              │   │                          │   │          │
├────┴──────────────┴───┴──────────────────────────┴───┴──────────┤
│                          Sash (horizontal)                       │ 4px
├─────────────────────────────────────────────────────────────────┤
│                         BottomPanel                              │ 200px
├─────────────────────────────────────────────────────────────────┤
│                         StatusBar                                │ 22px
└─────────────────────────────────────────────────────────────────┘
```

## 3. 标题栏（TitleBar）

### 3.1 结构

`.workbench-titlebar` 占满整行（`grid-column: 1 / -1`），内部为三列 Grid：

```text
[品牌区 190-250px] [命令中心 260px-1fr] [操作区 260px+]
```

右侧预留 138px 给窗口控制按钮（绝对定位）。

### 3.2 组成部分

| 部分 | 说明 | CSS 类 |
| --- | --- | --- |
| 品牌标识 | "河" 图标 + HetuSketch + 河图速写 | `.workbench-brand` / `.workbench-brand-mark` |
| 命令中心 | AutoComplete 搜索框，220ms 防抖调用 `search.preview` | `.command-center` |
| 作品选择器 | Select 下拉，切换当前作品 | `.titlebar-project-select` |
| 速查按钮 | 调用 `desktop.toggleFloating()` | `.titlebar-actions` 内 Button |
| 置顶按钮 | 调用 `desktop.setMainPinned()`，置顶时为 primary 类型 | `.titlebar-actions` 内 Button |
| 设置按钮 | 导航到 `/settings` | `.titlebar-actions` 内 Button |
| 主题切换 | Switch，深色/浅色 | `.titlebar-actions` 内 Switch |
| 窗口控制 | 最小化 / 最大化 / 关闭 | `.window-controls` |

### 3.3 拖拽行为

标题栏设置 `-webkit-app-region: drag`，可拖拽移动窗口。其中的按钮、输入框、Select 设置 `-webkit-app-region: no-drag`，保持可交互。

## 4. 活动栏（ActivityBar）

### 4.1 结构

`.activity-bar` 位于最左侧（列 1，跨行 2-4），宽 48px，垂直排列图标按钮。

```text
┌────┐
│ 🔍 │  全局搜索 (search)
│ 👥 │  角色数据管理 (characters)
│ 🌍 │  世界观设定管理 (worlds)
│ 🌿 │  限时数据库管理 (plots) [Badge: 1]
│ ✏️ │  文本管理 (editor)
│ 📁 │  书目管理 (projects)
│    │
│    │  ← 弹性间距
│    │
│ 👤 │  账户（占位）
│ ⚙️ │  系统设置 (settings)
└────┘
```

### 4.2 活动项定义

| ID | 图标 | 标签 | 路由 |
| --- | --- | --- | --- |
| `search` | SearchOutlined | 全局搜索 | `/search` |
| `characters` | TeamOutlined | 角色数据管理 | `/data/characters` |
| `worlds` | GlobalOutlined | 世界观设定管理 | `/data/worlds` |
| `plots` | BranchesOutlined | 限时数据库管理 | `/data/plots` |
| `editor` | EditOutlined | 文本管理 | `/workspace/editor` |
| `projects` | FolderOpenOutlined | 书目管理 | `/projects` |
| `settings` | SettingOutlined | 系统设置 | `/settings` |

默认顺序：`search → characters → worlds → plots → editor → projects → settings`。`settings` 固定在底部。

### 4.3 交互

- **点击**：切换主侧边栏视图。若当前活动已激活且主侧边栏可见，则折叠主侧边栏。
- **拖拽**：可拖拽重排活动项顺序（settings 除外）。
- **右键**：重置活动栏顺序为默认。
- **激活态**：左侧显示 2px 竖条，颜色按内容类型区分：
  - `characters`（角色）→ `--color-entity-character`（暖紫）
  - `worlds`（世界观）→ `--color-entity-world`（青蓝）
  - `plots`（伏笔）→ `--color-entity-plot`（琥珀）
  - `search` / `editor` / `projects` / `settings` → `--color-primary`（主色）
  - 实现方式：ActivityBar 按钮添加 `data-entity-type` 属性（角色=`character`、世界观=`world`、伏笔=`plot`、其余=`primary`），CSS 通过属性选择器应用对应实体色作为 `::before` 伪元素竖条颜色。
- **Badge**：`plots` 活动默认显示数字 1 的 Badge。

### 4.4 持久化

活动栏顺序保存到 `localStorage` 的 `hetusketch.workbench.activity.v1`。当前侧边栏视图保存到 `hetusketch.workbench.sidebarView.v1`。

## 5. 主侧边栏（PrimarySidebar）

### 5.1 结构

`.primary-sidebar` 位于列 2，跨行 2-4。折叠时添加 `.is-collapsed` 类（`opacity: 0; pointer-events: none`）。

```text
┌──────────────────────────┐
│ [标题]      [刷新][菜单][折叠] │  sidebar-titlebar 32px
├──────────────────────────┤
│ 🔍 [筛选当前视图内容]        │  sidebar-filter
├──────────────────────────┤
│  TREE SECTION            │  sidebar-content
│  ▸ 节点1                  │
│  ▸ 节点2                  │
│    ▸ 子节点               │
│  ▸ 节点3                  │
│                          │
│  [打开搜索结果]（仅 search） │  sidebar-search-action
└──────────────────────────┘
```

### 5.2 标题映射

| 活动 ID | 侧边栏标题 |
| --- | --- |
| `search` | SEARCH |
| `characters` | CHARACTERS |
| `worlds` | WORLD SETTINGS |
| `plots` | PLOTS |
| `editor` | TEXT MANAGER |
| `projects` | BOOKS |
| `settings` | SETTINGS |

### 5.3 树形视图（按活动区分）

#### editor 活动 — 章节树

展示"书 > 分卷 > 章节"三级结构：

```text
▸ 当前书目
  ▸ 第一卷
    · 第 1 章
    · 第 2 章
  ▸ 第二卷
    · 第 3 章
```

- 数据来源：`iterationStore.listChapters(projectId)`
- 节点类型：`book` / `volume` / `chapter`
- 点击章节导航到 `/workspace/editor?chapter=<id>`
- 支持拖拽重排（before / after / inside 三种位置）
- 双击章节标题就地重命名

#### characters 活动 — 角色树

```text
▸ 角色数据库 · 当前设定集
  ▸ 自定义文件夹
    · 张三
    · 李四
  ▸ 未分类
    · 王五
```

- 数据来源：`entries.list({ type: 'character' })` + `entries.get()`
- 支持新建文件夹（Dropdown 菜单）
- 支持拖拽条目到文件夹
- 支持拖拽文件夹嵌套
- 支持文件夹重命名
- 点击条目导航到 `/data/characters?entry=<id>`

#### worlds 活动 — 世界观树

结构同角色树，类型为 `world`，导航到 `/data/worlds?entry=<id>`。

#### plots 活动 — 伏笔列表

```text
· 未回收伏笔    → /data/plots?status=open
· 已回收伏笔    → /data/plots?status=resolved
· 冲突提醒      → /data/plots
```

#### projects 活动 — 书目列表

```text
· 本地书目      → /projects
· 导入导出      → /projects
· 绑定设定集    → /projects
```

#### settings 活动 — 设置项

```text
· AI 配置       → /settings
· 提示词        → /settings
· HTTP 工具     → /settings
· 快捷键        → /settings
```

#### search 活动 — 搜索入口

```text
· 全局搜索      → /search
[打开搜索结果]   → /search?q=<keyword>
```

### 5.4 树节点组件（TreeNode）

每个树节点支持：

- **展开/折叠**：点击折叠箭头（▸ 旋转 90°）
- **选中态**：`.is-selected` 高亮背景
- **只读态**：`.is-readonly` 降低透明度，禁用重命名
- **拖拽**：条目（entry）和文件夹（folder，非只读）可拖拽
- **右键菜单**：Dropdown，提供"打开"和"在新页面打开"选项
- **双击重命名**：非只读节点双击进入编辑模式（Input），Enter 提交、Esc 取消
- **拖放高亮**：
  - `.can-drop-entry`：可接收条目拖放（虚线边框）
  - `.drop-before` / `.drop-after`：章节拖放位置指示（上下边框线）
  - `.drop-inside`：章节拖入分卷指示（背景高亮）

### 5.5 文件夹管理

角色与世界观侧边栏支持自定义文件夹结构：

- 数据结构：`SidebarFolderNode { id, name, entryIds, children }`
- 持久化：`hetusketch.workbench.sidebarFolders.v1`
- 操作：新建、重命名、嵌套移动、条目归类
- 内置节点：`<type>-root`（只读根）、`<type>-uncategorized`（只读未分类）

## 6. 编辑器工作区（EditorWorkbench）

### 6.1 结构

`.editor-area` 位于列 4、行 2，内部为 Grid 布局，支持三种分割模式：

```css
.editor-area.grid-1x1 { grid-template-columns: minmax(0, 1fr); }
.editor-area.grid-1x2 { grid-template-columns: minmax(0, 1fr) minmax(280px, 36%); }
.editor-area.grid-2x2 { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
.editor-area.grid-1-over-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: minmax(0, 1.1fr) minmax(0, 1fr); }
```

| 模式 | 类名 | 编辑器组数 | 布局 |
| --- | --- | --- | --- |
| 单列 | `grid-1x1` | 1 | 全屏单编辑器 |
| 双列 | `grid-1x2` | 2 | 主编辑器 + 1 辅助编辑器（右侧 36%） |
| 1+2 | `grid-1-over-2` | 3 | 主编辑器（上方跨列）+ 2 辅助编辑器（下方左右） |

切换顺序：`single → vertical → grid → single`（通过"分割"按钮或 `Ctrl+\`）。

### 6.2 编辑器组（EditorGroup）

每个编辑器组 `.editor-group` 结构：

```text
┌────────────────────────────────────────────────┐
│ [Tab1] [Tab2] [Tab3]              [分割][新建] │  editor-tabbar 36px
├────────────────────────────────────────────────┤
│                                                │
│                                                │
│              页面内容                           │  editor-content
│                                                │
│                                                │
└────────────────────────────────────────────────┘
```

#### Tab 栏（editor-tabbar）

- `.editor-tabs`：横向滚动容器，鼠标滚轮可横向滚动（ deltaY 转 scrollLeft）
- `.editor-tab`：单个 Tab，包含图标 + 标题 + 关闭按钮
- 激活态 `.is-active`：高亮背景
- 拖拽态 `.is-dragging`：半透明缩放
- 重命名态 `.is-renaming`：显示 Input 替代标题
- 脏标记 `.dirty-dot`：未保存指示（当前未启用）
- 双击 Tab 进入重命名模式
- Tab 可拖拽重排
- 滚动条：自定义 webkit 样式（4px 高，圆角）

#### Tab 标题生成规则

Tab 标题根据路径自动生成：

| 路径 | 标题 |
| --- | --- |
| `/dashboard` | 总览 |
| `/data/characters?entry=<id>` | 角色 · <条目名> |
| `/data/characters?folder=<id>` | 角色列表 · <文件夹名/未分类> |
| `/data/characters`（无参数） | 角色数据库 |
| `/data/worlds` | 同上，替换为"世界观" |
| `/data/plots` | 限时数据库 |
| `/workspace/editor?chapter=<id>` | 章节 · <章节名> |
| `/workspace/editor` | 文本编辑器 |
| `/projects` | 书目管理 |
| `/search` | 搜索结果 |
| `/settings` | 系统设置 |

条目名与章节名通过 `appStore.tabNameMap`（id→title 映射）动态更新。

### 6.3 主编辑器组

主编辑器组使用 React Router 的 `<Routes>` 渲染页面内容：

```text
/              → 重定向到 /workspace/editor
/dashboard     → DashboardPage
/data/characters → CharactersDataPage (EntriesPage type="character")
/data/worlds   → WorldSettingsDataPage (EntriesPage type="world")
/data/plots    → LimitedDatabasePage (EntriesPage type="plot")
/workspace/editor → TextEditorWorkspacePage (WritingStudioPage)
/projects      → ProjectsPage
/search        → SearchPage
/settings      → SettingsPage
```

旧路由（`/setting-sets`、`/characters`、`/worlds`、`/plots`、`/studio`、`/checks`）均重定向到对应新路由。

### 6.4 辅助编辑器组（SecondaryEditorGroup）

辅助编辑器组通过 `renderPageContent(path)` 函数渲染页面（不走 Router），支持在辅助窗口中打开任意页面。

- "打开"按钮提供 Dropdown 菜单，列出可打开的页面
- 每个辅助组独立维护 Tab 列表与活跃 Tab
- 状态持久化到 `hetusketch.workbench.secondaryGroups.v1`

### 6.5 Tab 持久化

主编辑器 Tab 列表保存到 `hetusketch.workbench.tabs.v1`。默认包含两个 Tab：

```json
[
  { "key": "/dashboard", "title": "总览", "path": "/dashboard", "dirty": false },
  { "key": "/workspace/editor", "title": "文本编辑器", "path": "/workspace/editor", "dirty": false }
]
```

## 7. 辅助侧边栏（SecondarySidebar）

`.secondary-sidebar` 位于列 6，跨行 2-4。默认折叠（`secondaryVisible: false`）。

当前内容为占位性质的 AI Chat 面板：

```text
┌──────────────────────────┐
│ AI CHAT            [折叠] │
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ 上下文助手            │ │
│ │ 默认展示 AI Chat /    │ │
│ │ Outline / Timeline   │ │
│ │ 等辅助视图...         │ │
│ │ [TextArea]           │ │
│ │ [发送到当前上下文]     │ │
│ └──────────────────────┘ │
│ OUTLINE                  │
│ · 当前章节               │
│ · 相关角色               │
│ · 世界观规则             │
│ · 未回收伏笔             │
└──────────────────────────┘
```

## 8. 底部面板（BottomPanel）

`.bottom-panel` 占满整行（列 1/-1，行 4）。折叠时添加 `.is-collapsed`。

### 8.1 结构

```text
┌─────────────────────────────────────────────────────────────┐
│ [AI 提示] [角色条目] [世界观设定] [线索条目] [输出]    [折叠] │  panel-tabbar
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    面板内容                                  │  panel-content
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Tab 内容

| Tab ID | 标签 | 内容 |
| --- | --- | --- |
| `ai` | AI 提示 | Card，显示"AI 建议、校验提示和采纳记录会显示在这里" |
| `characters` | 角色条目 | `EntriesPage type="character"` |
| `worlds` | 世界观设定 | `EntriesPage type="world"` |
| `plots` | 线索条目 | `EntriesPage type="plot"` |
| `output` | 输出 | `<pre>` 显示"Workbench ready. Layout restored from local storage." |

## 9. 状态栏（StatusBar）

`.status-bar` 占满整行（列 1/-1，行 5），高 22px。

```text
┌─────────────────────────────────────────────────────────────┐
│ $(main) │ 当前作品 │ Ln 1, Col 1 │ 字数 0    │ Panel 显示中 │ AI Chat 隐藏 │ Markdown │ UTF-8 │
└─────────────────────────────────────────────────────────────┘
```

- **左侧**：主菜单占位、当前作品名、光标位置、字数
- **右侧**：Panel 状态切换按钮、AI Chat 状态、Markdown 标记、UTF-8 标记

Panel 状态按钮可点击切换底部面板显隐，带 `.is-on` / `.is-off` 样式。

## 10. 拖拽分隔条（Sash）

### 10.1 结构

`.workbench-sash` 是可拖拽的分隔条，支持垂直（`sash-vertical`）和水平（`sash-horizontal`）两种方向。

| Sash | 方向 | 位置 | 控制变量 | 范围 |
| --- | --- | --- | --- | --- |
| `.primary-sash` | vertical | 列 3 | `--primary-sidebar-width` | 200-500px |
| `.secondary-sash` | vertical | 列 5 | `--secondary-sidebar-width` | 200-500px |
| `.panel-sash` | horizontal | 行 3 | `--panel-height` | 100-80% innerHeight |

### 10.2 交互

- **拖拽**：鼠标按下后监听 `mousemove`，通过 `requestAnimationFrame` 节流更新尺寸。拖拽时 `document.body` 添加 `.is-resizing` 类。
- **双击**：复位到默认尺寸（主侧栏 250px、辅侧栏 250px、底部面板 200px）。
- **键盘**：`Alt + 方向键` 微调（每次 10px）。
- **尺寸为 0 时**：对应区域自动折叠（`visible: false`）。

## 11. 主题系统

### 11.1 主题切换

通过 `appStore.themeMode` 控制（`light` / `dark`），持久化到 `hetusketch.workbench.theme.v1`。

- **深色模式为默认基调**：根容器 `.workbench-shell` 不添加任何主题类，直接使用 `:root` 下定义的深色令牌（`--color-background: #0A0A0A`）。
- **浅色模式**：根容器添加 `.theme-light` 类，覆盖 `:root` 中的中性令牌（背景翻转为 `#F5F5F5`，文本/边框的 alpha 墨色由白转黑）。
- 实现逻辑：`themeMode === 'light' ? 'theme-light' : ''`，不再使用 `theme-dark` 类。

### 11.2 CSS 变量

工作台颜色通过语义令牌定义，源文件为 `src/renderer/assets/styles/tokens/colors.css`。深色为默认（`:root`），浅色通过 `.theme-light` 覆盖。中性令牌使用 alpha 叠加（深色叠加白墨、浅色叠加黑墨），语义令牌使用实色 oklch（色相在两种模式下保持一致）。

#### 主色与表面层

| 令牌 | 用途 |
| --- | --- |
| `--color-background` | 工作台背景（深色 `#0A0A0A` / 浅色 `#F5F5F5`） |
| `--color-surface` / `--color-surface-raised` / `--color-surface-overlay` | 表面分层（4 层：背景 → surface → raised → overlay） |
| `--color-foreground` / `--color-foreground-secondary` / `--color-foreground-muted` | 文本层级（正文 / 次要 / 弱化） |
| `--color-primary` / `--color-accent` / `--color-secondary` | 主色与强调（主操作 / 透明 hover / 次级填充） |

#### 工作台分区色

| 令牌 | 用途 |
| --- | --- |
| `--color-activitybar` / `--color-activitybar-foreground` / `--color-activitybar-active` / `--color-activitybar-active-foreground` / `--color-activitybar-border` | 活动栏分区 |
| `--color-sidebar-primary` / `--color-sidebar-primary-foreground` / `--color-sidebar-primary-active` / `--color-sidebar-primary-active-foreground` / `--color-sidebar-primary-border` | 主侧边栏分区 |
| `--color-sidebar-secondary` / `--color-sidebar-secondary-foreground` / `--color-sidebar-secondary-border` | 辅助侧边栏分区 |
| `--color-panel-bottom` / `--color-panel-bottom-foreground` / `--color-panel-bottom-active` | 底部面板分区 |
| `--color-titlebar` / `--color-titlebar-foreground` | 标题栏分区 |
| `--color-statusbar` / `--color-statusbar-foreground` | 状态栏分区 |

#### 边框语义

| 令牌 | 用途 |
| --- | --- |
| `--color-border` / `--color-border-muted` / `--color-border-subtle` / `--color-border-hover` / `--color-border-active` | 边框层级（标准 / 弱化 / 极弱 / hover / 激活） |
| `--color-input` | 输入框边框 |
| `--color-ring` | 聚焦环（主色半透明） |

#### Sash 专用

| 令牌 | 用途 |
| --- | --- |
| `--color-sash` | 分隔条默认背景 |
| `--color-sash-hover` | 分隔条 hover 背景（主色半透明） |

#### 实体识别色

| 令牌 | 用途 |
| --- | --- |
| `--color-entity-character` / `--color-entity-world` / `--color-entity-plot` | 实体基础色（各含 `-text` / `-bg` / `-border` 变体） |

#### 校验风险色

| 令牌 | 用途 |
| --- | --- |
| `--color-risk-pass` / `--color-risk-notice` / `--color-risk-warning` / `--color-risk-critical` / `--color-risk-unknown` | 风险等级（各含 `-base` / `-text` / `-bg` / `-border` / `-hover` 变体） |

#### 语义状态色

| 令牌 | 用途 |
| --- | --- |
| `--color-destructive` / `--color-success` / `--color-warning` / `--color-info` | 语义状态（各含 `-base` / `-text` / `-bg` / `-border` / `-hover` 变体） |

> 完整令牌取值（深色/浅色）见 `docs/design-tokens.md` 与 `src/renderer/assets/styles/tokens/colors.css`。

### 11.3 字体变量

字体通过 CSS 变量注入。令牌源文件 `src/renderer/assets/styles/tokens/typography.css` 定义了双字体系统：

- **UI 字体族**：`--font-family-ui`（系统 UI 字体栈，应用于活动栏、侧边栏、按钮、标签等工具/控制表面）。
- **编辑字体族**：`--font-family-editor`（默认霞鹜文楷，应用于编辑器正文，提供沉浸式写作体验）。
- **编辑器专属**：`--font-size-editor`（默认 16px）、`--line-height-editor`（默认 1.6），可由用户覆盖。

用户自定义字体通过 `appStore` 的 `sidebarFont` 和 `editorFont` 控制并注入为运行时变量：

```css
--sidebar-font-family: <family>;
--sidebar-font-size: <size>px;
--sidebar-font-color: <color>;
--editor-font-family: <family>;
--editor-font-size: <size>px;
--editor-font-color: <color>;
```

- 功能栏字体（`--sidebar-font-*`）：应用于活动栏、主侧边栏、辅助侧边栏。
- 编辑区字体（`--editor-font-*`）：应用于编辑器内容区域。
- 默认字体：霞鹜文楷。
- 字体列表来源：`system.fonts()` IPC 调用 `FontService` 枚举系统字体（限 300 个）。
- 持久化：`hetusketch.workbench.fonts.v1`。

## 12. 快捷键

| 快捷键 | 功能 | 实现位置 |
| --- | --- | --- |
| `Ctrl+B` | 切换主侧边栏显隐 | App.tsx 全局 keydown |
| `Ctrl+J` | 切换底部面板显隐 | App.tsx 全局 keydown |
| `Ctrl+\` | 切换编辑器分割模式（single → vertical → grid → single） | App.tsx 全局 keydown |
| `Ctrl+Shift+H` | 全局快捷键，切换悬浮速查窗 | 主进程 globalShortcut |
| `Alt+←/→` | Sash 垂直方向微调（10px） | Sash 组件 keydown |
| `Alt+↑/↓` | Sash 水平方向微调（10px） | Sash 组件 keydown |

## 13. 布局状态持久化

所有布局状态通过 `App.tsx` 的 `readJson` / `writeJson` 辅助函数保存到 localStorage：

| Key | 内容 | 默认值 |
| --- | --- | --- |
| `hetusketch.workbench.layout.v1` | 布局尺寸与显隐 | `{ primaryWidth: 250, secondaryWidth: 250, panelHeight: 200, primaryVisible: true, secondaryVisible: false, panelVisible: true, editorSplit: 'single' }` |
| `hetusketch.workbench.activity.v1` | 活动栏顺序 | `[search, characters, worlds, plots, editor, projects, settings]` |
| `hetusketch.workbench.sidebarView.v1` | 当前侧边栏视图 | `editor` |
| `hetusketch.workbench.tabs.v1` | 主编辑器 Tab 列表 | `[{ key: '/dashboard', ... }, { key: '/workspace/editor', ... }]` |
| `hetusketch.workbench.secondaryGroups.v1` | 辅助编辑器组状态 | 2 个默认组（各含 Dashboard Tab） |
| `hetusketch.workbench.sidebarFolders.v1` | 侧边栏文件夹结构 | `{}` |
| `hetusketch.workbench.theme.v1` | 主题模式 | `light` |
| `hetusketch.workbench.fonts.v1` | 字体设置 | 默认霞鹜文楷 |

## 14. 悬浮速查窗

悬浮速查窗是独立的 Electron 窗口（420×560，`alwaysOnTop`、`skipTaskbar`），加载 `/quick-lookup` 路由，渲染 `QuickLookupPage`。

### 14.1 布局

```text
┌────────────────────────────┐
│ 河图速查          [📌 置顶] │  quick-title
├────────────────────────────┤
│ 🔍 [搜索角色、设定...]      │  Input (autoFocus)
├────────────────────────────┤
│ ┌────────────────────────┐ │
│ │ [角色] 张三             │ │  quick-card List
│ │   重情义的主角          │ │
│ ├────────────────────────┤ │
│ │ [世界] 魔法规则         │ │
│ │   不可复活死者          │ │
│ └────────────────────────┘ │
│                            │
│      [隐藏速查窗]          │  quick-hide
└────────────────────────────┘
```

### 14.2 行为

- 初始加载最近访问（全作品，8 条）。
- 输入关键词后 220ms 防抖调用 `search.preview`。
- 无关键词时回退显示最近访问。
- 置顶开关调用 `desktop.setFloatingPinned`。
- 隐藏按钮调用 `desktop.hideFloating`。

## 15. 页面级布局约定

### 15.1 通用页面容器

大多数页面使用 `Space.page-stack` 作为垂直堆叠容器：

```tsx
<Space direction="vertical" size="middle" className="page-stack">
  <Typography.Title>页面标题</Typography.Title>
  <Card className="feature-card">...</Card>
</Space>
```

### 15.2 主要 CSS 类

| 类名 | 用途 |
| --- | --- |
| `.page-stack` | 页面垂直堆叠容器 |
| `.full-width` | 全宽元素 |
| `.two-column-grid` | 两列网格 |
| `.feature-card` | 功能卡片 |
| `.metric-card` | 统计指标卡片 |
| `.compact-card` | 紧凑卡片 |
| `.hero-panel` | 英雄区面板 |
| `.page-title-card` | 页面标题卡片 |
| `.eyebrow` | 小标题标签 |
| `.inline-alert` | 内联提示 |

### 15.3 设定条目页（EntriesPage）

```text
┌────────────────────────────────────────────────┐
│ [Banner Alert]                                 │
├────────────────────────────────────────────────┤
│ [标题]  [筛选 Select]  [视图 Radio]  [导出][新增] │  entries-toolbar-flat
├────────────────────────────────────────────────┤
│                                                │
│           卡片列表 / 关系图谱                    │  entries-content
│                                                │
├────────────────────────────────────────────────┤
│ 详情面板（标题/Tag/摘要/正文/关系）               │  entries-detail-flat
└────────────────────────────────────────────────┘
```

三种视图模式：
- `cards`：卡片网格
- `list`：列表
- `graph`：关系图谱（`RelationshipCanvas`，仅 character 类型）

### 15.4 文本编辑器页（WritingStudioPage）

```text
┌────────────────────────────────────────────────┐
│ [章节标题]  [状态 Select]  [新建分卷][新建章节]   │  studio-toolbar-flat
│            [模式 Radio] [查找][替换][校验范围]    │
│            [保存][逻辑校验][删除]                │
├────────────────────────────────────────────────┤
│                                                │
│  ┌──────────────┬──────────────┐               │
│  │              │              │               │
│  │  TextArea    │  Markdown    │  studio-editor-area
│  │  (编辑)      │  Preview     │  (mode-split) │
│  │              │              │               │
│  └──────────────┴──────────────┘               │
│                                                │
└────────────────────────────────────────────────┘
```

三种编辑模式：
- `edit`：仅 TextArea
- `preview`：仅 Markdown 预览
- `split`：双栏分屏（TextArea + Preview）

### 15.5 关系图谱（RelationshipCanvas）

三栏布局：

```text
┌──────────┬────────────────────────┬──────────┐
│ 筛选面板  │     图谱画布            │ 详情面板  │
│          │                        │          │
│ 角色分类  │  [适应][重置][+][-][▶]  │ 选中角色  │
│ ☑ 主角   │                        │ 详情     │
│ ☑ 配角   │     ● 张三              │          │
│ ☑ 反派   │      \                  │ 关联数   │
│ ☑ 其他   │       ● 李四            │          │
│          │                        │ [查看]   │
│ 关系类型  │                        │          │
│ [下拉]    │                        │          │
│          │                        │          │
│ 聚焦模式  │                        │          │
│ [全部]    │                        │          │
│          │                        │          │
│ 节点大小  │                        │          │
│ [Slider] │                        │          │
└──────────┴────────────────────────┴──────────┘
```

特性：
- 力导向模拟（requestAnimationFrame），节点 >220 时停止
- 滚轮缩放、拖拽平移、Shift 框选、节点拖拽
- 双击空白处新建草稿节点
- 聚焦模式：全部 / 一度关系 / 二度关系（BFS 计算）
- 节点 >200 时显示性能提示

## 16. 响应式与边界处理

- 工作台固定 `100vw × 100vh`，`overflow: hidden`，不滚动。
- 各侧边栏折叠时宽度为 0，通过 CSS 变量 `--primary-sidebar-width: 0px` 实现。
- 编辑器区域始终占据剩余空间（`minmax(0, 1fr)`），保证最小可用宽度。
- Sash 拖拽有最小/最大尺寸限制，防止区域过小或过大。
- Tab 栏横向滚动，避免 Tab 过多时溢出。
- 树形视图侧边栏内容区 `overflow: auto`，独立滚动。

## 17. 样式文件组织

### 17.1 设计令牌源文件

渲染端样式基于 `src/renderer/assets/styles/tokens/` 目录下的语义令牌体系，按类别组织：

- `colors.css` - 颜色令牌（主色、风险色、实体色、表面层、工作台分区色、边框、Sash、语义状态色、基础色阶）
- `typography.css` - 字体令牌（UI 字体族、编辑字体族、字号、字重、行高、段落间距）
- `shadows.css` - 阴影令牌（7 级）
- `radii.css` - 圆角令牌（6 级）

**令牌入口**：`src/renderer/assets/styles/variables.css` 通过 `@import` 统一导入所有 tokens 文件，在 `main.tsx` 中先于 `styles.css` 加载。

**令牌源文件为颜色/字体/阴影/圆角的唯一来源**，`styles.css` 中所有样式通过 `var(--color-*)` / `var(--font-*)` / `var(--shadow-*)` / `var(--radius-*)` 引用令牌，不使用硬编码色值。主题变量（深色 `:root` 默认、浅色 `.theme-light` 覆盖）定义在 `tokens/colors.css` 中，不再存在于 `styles.css` 的 `.theme-dark` / `.theme-light` 块。

### 17.2 styles.css 组织

`src/renderer/src/styles.css` 按以下顺序组织：

1. **基础重置**：`:root`、`body`、滚动条样式
2. **应用骨架**：`.app-shell`、`.app-sider`、`.app-header`、`.app-content`（旧版布局，部分页面仍使用）
3. **通用组件**：`.page-stack`、`.feature-card`、`.metric-card`、`.hero-panel` 等
4. **页面样式**：Dashboard、Entries、WritingStudio、Checks、Settings、QuickLookup 等
5. **关系图谱**：`.graph-workspace`、`.graph-canvas`、`.graph-filter-panel` 等
6. **工作台外壳**（约 1172 行起）：`.workbench-shell`、`.workbench-titlebar`、`.activity-bar`、`.primary-sidebar`、`.secondary-sidebar`、`.editor-area`、`.editor-group`、`.editor-tabbar`、`.bottom-panel`、`.status-bar`、`.workbench-sash` 等

工作台外壳样式与旧版应用骨架样式并存，当前主界面使用工作台外壳，部分页面内部仍引用旧版通用类。
