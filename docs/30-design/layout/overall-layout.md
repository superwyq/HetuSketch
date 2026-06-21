# 工作台整体布局

工作台实现以 `src/renderer/src/App.tsx` 与 `src/renderer/src/styles.css` 为准，详细旧文档见 `../../ui-layout.md`。

## 区域

```text
┌─────────────────────────────────────────────┐
│ TitleBar                                    │
├──┬──────────────┬──┬──────────────┬──┬──────┤
│A │ Primary      │S │ Editor       │S │ Sec. │
│c │ Sidebar      │a │ Workbench    │a │ Side │
│t │              │s │              │s │      │
├──┴──────────────┴──┴──────────────┴──┴──────┤
│ BottomPanel                                 │
├─────────────────────────────────────────────┤
│ StatusBar                                   │
└─────────────────────────────────────────────┘
```

## 默认尺寸

| 区域 | 默认 | 约束 |
| --- | --- | --- |
| TitleBar | 32px | Windows；macOS 可为 22px |
| ActivityBar | 48px | 固定 |
| PrimarySidebar | 260px | 170px–500px，可折叠 |
| SecondarySidebar | 320px | 220px–500px，默认隐藏 |
| BottomPanel | 200px | 最小 80px，可折叠 |
| StatusBar | 22px | 固定 |

## 持久化

布局状态保存到 `localStorage`，包括尺寸、显隐、编辑器分割模式、活动栏顺序、Tab 列表和侧边栏文件夹。
