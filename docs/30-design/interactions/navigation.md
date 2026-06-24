# 导航交互

## ActivityBar

- 点击活动项切换主侧边栏视图和主路由。
- 当前活动再次点击可折叠主侧边栏。
- 支持拖拽调整活动项顺序，设置项固定在底部。
- 右键可重置活动栏顺序。

## Tab 导航

- 主编辑器默认包含 Dashboard 与文本编辑器 Tab。
- 页面跳转会打开或激活对应 Tab。
- Tab 支持拖拽重排、双击重命名、关闭。
- 鼠标滚轮可横向滚动 Tab 栏。

## 侧边栏导航

- 章节节点进入 `/workspace/editor?chapter=<id>`。
- 角色进入 `/data/characters?entry=<id>`。
- 世界观进入 `/data/worlds?entry=<id>`。
- 伏笔进入 `/data/plots?entry=<id>` 或按状态筛选。

## 剧情画布导航

- 从写作工作台选中章节后点击“剧情画布”，进入 `/workspace/plotboard?chapter=<chapterId>`。
- 剧情画布加载时先调用 `plotboards.open(bookId, chapterId)`，不存在时调用 `plotboards.create(...)`。
- 剧情画布工具栏“返回章节”回到 `/workspace/editor?chapter=<chapterId>`。
- 校验面板 finding 点击后将视口移动到目标剧情卡，并临时高亮。
- 多 POV 状态轴中的卡片按钮可跳转到对应剧情卡。
- 已生成正文时，校验结果可展示 Markdown 段落编号和摘要；当前 UI 仍以卡片回跳为主。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+B` | 切换主侧边栏 |
| `Ctrl+J` | 切换底部面板 |
| `Ctrl+\\` | 切换编辑器分割模式 |
| `Ctrl+Shift+H` | 切换悬浮速查窗 |
| `Ctrl+S` | 在剧情画布保存当前画布 |
| `Ctrl+Z` | 在剧情画布撤销 |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 在剧情画布重做 |
| `Delete` / `Backspace` | 在剧情画布删除选中卡片或连线（输入框聚焦时不触发） |