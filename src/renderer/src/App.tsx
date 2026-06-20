import {
  BranchesOutlined,
  CloseOutlined,
  CodeOutlined,
  EditOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  MoreOutlined,
  PlusOutlined,
  PushpinOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  SplitCellsOutlined,
  SunOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined
} from '@ant-design/icons';
import { AutoComplete, Badge, Button, Card, Dropdown, Empty, Input, Select, Space, Switch, Tabs, Tag, Tooltip, Typography, message } from 'antd';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { EntryType, ProjectEntry, ProjectManifest, SearchResultItem } from '@shared/storageTypes';
import { DashboardPage } from './pages/DashboardPage';
import { EntriesPage } from './pages/EntriesPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { QuickLookupPage } from './pages/QuickLookupPage';
import { SettingsPage } from './pages/SettingsPage';
import { WritingStudioPage } from './pages/WritingStudioPage';
import { ensureDefaultBook, listChapters, reorderChapter, type ChapterNode, upsertChapter } from './iterationStore';
import { useAppStore } from './store/appStore';

const ACTIVITY_DEFAULT_ORDER = ['search', 'characters', 'worlds', 'plots', 'editor', 'projects', 'settings'] as const;
const LAYOUT_STORAGE_KEY = 'hetusketch.workbench.layout.v1';
const ACTIVITY_STORAGE_KEY = 'hetusketch.workbench.activity.v1';
const SIDEBAR_VIEW_STORAGE_KEY = 'hetusketch.workbench.sidebarView.v1';
const OPEN_TABS_STORAGE_KEY = 'hetusketch.workbench.tabs.v1';
const SECONDARY_GROUPS_STORAGE_KEY = 'hetusketch.workbench.secondaryGroups.v1';
const SIDEBAR_FOLDERS_STORAGE_KEY = 'hetusketch.workbench.sidebarFolders.v1';

type ActivityId = typeof ACTIVITY_DEFAULT_ORDER[number];
type PanelTabId = 'ai' | 'characters' | 'worlds' | 'plots' | 'output';
type EditorTabKey = string;

interface EditorTab {
  key: EditorTabKey;
  title: string;
  path: string;
  dirty: boolean;
  titleSource?: 'auto' | 'custom';
}

interface SecondaryGroupState {
  tabs: EditorTab[];
  activeKey: string;
  draggingTabKey?: string;
}

interface WorkbenchLayoutState {
  primaryWidth: number;
  secondaryWidth: number;
  panelHeight: number;
  primaryVisible: boolean;
  secondaryVisible: boolean;
  panelVisible: boolean;
  editorSplit: 'single' | 'vertical' | 'grid';
}

interface ActivityItem {
  id: ActivityId;
  icon: ReactNode;
  label: string;
  viewId: ActivityId;
  badge?: number;
  order: number;
  visible: boolean;
  path: string;
}

interface TreeNodeItem {
  id: string;
  label: string;
  path?: string;
  kind?: 'folder' | 'entry' | 'book' | 'volume' | 'chapter';
  entryType?: EntryType;
  readonly?: boolean;
  children?: TreeNodeItem[];
}

interface SidebarFolderNode {
  id: string;
  name: string;
  entryIds: string[];
  children: SidebarFolderNode[];
}

type SidebarFolderState = Partial<Record<'character' | 'world', SidebarFolderNode[]>>;

interface TreeDragState {
  nodeId: string;
  nodeKind?: TreeNodeItem['kind'];
  entryType?: EntryType;
}

interface SashProps {
  direction: 'vertical' | 'horizontal';
  minSize: number;
  maxSize: number;
  defaultSize: number;
  currentSize: number;
  onChange: (size: number) => void;
  onReset?: () => void;
  className?: string;
}

const defaultLayout: WorkbenchLayoutState = {
  primaryWidth: 250,
  secondaryWidth: 250,
  panelHeight: 200,
  primaryVisible: true,
  secondaryVisible: false,
  panelVisible: true,
  editorSplit: 'single'
};

export function App(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const searchKeyword = useAppStore((state) => state.searchKeyword);
  const themeMode = useAppStore((state) => state.themeMode);
  const mainPinned = useAppStore((state) => state.mainPinned);
  const sidebarFont = useAppStore((state) => state.sidebarFont);
  const editorFont = useAppStore((state) => state.editorFont);
  const setSelectedProject = useAppStore((state) => state.setSelectedProject);
  const setSearchKeyword = useAppStore((state) => state.setSearchKeyword);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const setMainPinned = useAppStore((state) => state.setMainPinned);
  const loadSystemFonts = useAppStore((state) => state.loadSystemFonts);
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [searchItems, setSearchItems] = useState<SearchResultItem[]>([]);
  const [layout, setLayout] = useState<WorkbenchLayoutState>(() => readJson(LAYOUT_STORAGE_KEY, defaultLayout));
  const [activityOrder, setActivityOrder] = useState<string[]>(() => readArray<string>(ACTIVITY_STORAGE_KEY, [...ACTIVITY_DEFAULT_ORDER]).filter((id) => ACTIVITY_DEFAULT_ORDER.includes(id as ActivityId)));
  const [sidebarViewId, setSidebarViewId] = useState<ActivityId>(() => {
    const stored = readJson<ActivityId | undefined>(SIDEBAR_VIEW_STORAGE_KEY, undefined);
    return stored && (ACTIVITY_DEFAULT_ORDER as readonly string[]).includes(stored) ? stored : 'editor';
  });
  const [draggingActivityId, setDraggingActivityId] = useState<string>();
  const [activePanelTab, setActivePanelTab] = useState<PanelTabId>('ai');

  useEffect(() => {
    localStorage.removeItem('hetusketch.iteration.worldSubDatabases');
  }, []);

  useEffect(() => {
    if (typeof window.hetuSketch === 'undefined') return;
    loadSystemFonts();
  }, [loadSystemFonts]);

  useEffect(() => {
    if (typeof window.hetuSketch === 'undefined') {
      console.error('[HetuSketch] preload API not available, skipping project list load');
      return;
    }
    void window.hetuSketch.projects.list().then((next) => {
      setProjects(next);
      setSelectedProject(useAppStore.getState().selectedProject ?? next[0]);
    }).catch((err) => console.error('[HetuSketch] Failed to load projects:', err));
  }, [setSelectedProject]);

  useEffect(() => {
    writeJson(LAYOUT_STORAGE_KEY, layout);
  }, [layout]);

  useEffect(() => {
    writeJson(ACTIVITY_STORAGE_KEY, activityOrder);
  }, [activityOrder]);

  useEffect(() => {
    writeJson(SIDEBAR_VIEW_STORAGE_KEY, sidebarViewId);
  }, [sidebarViewId]);

  useEffect(() => {
    if (typeof window.hetuSketch === 'undefined') return;
    const timer = window.setTimeout(() => {
      if (!searchKeyword.trim()) {
        setSearchItems([]);
        return;
      }
      void window.hetuSketch.search.preview(searchKeyword).then(setSearchItems).catch(() => setSearchItems([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchKeyword]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl) return;
      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setLayout((current) => ({ ...current, primaryVisible: !current.primaryVisible }));
      }
      if (event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setLayout((current) => ({ ...current, panelVisible: !current.panelVisible }));
      }
      if (event.key === '\\') {
        event.preventDefault();
        setLayout((current) => ({ ...current, editorSplit: current.editorSplit === 'single' ? 'vertical' : 'single' }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activityIdFromPath = (pathname: string): ActivityId => {
    if (pathname.startsWith('/workspace/editor')) return 'editor';
    if (pathname.startsWith('/data/characters')) return 'characters';
    if (pathname.startsWith('/data/worlds')) return 'worlds';
    if (pathname.startsWith('/data/plots')) return 'plots';
    if (pathname.startsWith('/workspace/data')) return 'characters';
    if (pathname.startsWith('/projects')) return 'projects';
    if (pathname.startsWith('/settings')) return 'settings';
    if (pathname.startsWith('/search')) return 'search';
    return 'editor';
  };

  useEffect(() => {
    const stored = readJson<ActivityId | undefined>(SIDEBAR_VIEW_STORAGE_KEY, undefined);
    if (!stored || !(ACTIVITY_DEFAULT_ORDER as readonly string[]).includes(stored)) {
      setSidebarViewId(activityIdFromPath(location.pathname));
    }
    // intentionally only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activityItems = useMemo<ActivityItem[]>(() => {
    const base: Record<ActivityId, Omit<ActivityItem, 'order' | 'visible'>> = {
      search: { id: 'search', icon: <SearchOutlined />, label: '全局搜索', viewId: 'search', path: '/search' },
      characters: { id: 'characters', icon: <TeamOutlined />, label: '角色数据管理', viewId: 'characters', path: '/data/characters' },
      worlds: { id: 'worlds', icon: <GlobalOutlined />, label: '世界观设定管理', viewId: 'worlds', path: '/data/worlds' },
      plots: { id: 'plots', icon: <BranchesOutlined />, label: '限时数据库管理', viewId: 'plots', badge: 1, path: '/data/plots' },
      editor: { id: 'editor', icon: <EditOutlined />, label: '文本管理', viewId: 'editor', path: '/workspace/editor' },
      projects: { id: 'projects', icon: <FolderOpenOutlined />, label: '书目管理', viewId: 'projects', path: '/projects' },
      settings: { id: 'settings', icon: <SettingOutlined />, label: '系统设置', viewId: 'settings', path: '/settings' }
    };
    return activityOrder
      .filter((id): id is ActivityId => id in base)
      .map((id, index) => ({ ...base[id], order: index, visible: true }));
  }, [activityOrder]);

  const updateLayout = (changes: Partial<WorkbenchLayoutState>): void => {
    setLayout((current) => ({ ...current, ...changes }));
  };

  const pinMain = async (): Promise<void> => {
    const result = await window.hetuSketch.desktop.setMainPinned(!mainPinned);
    setMainPinned(result.pinned);
  };

  const reorderActivity = (targetId: string): void => {
    if (!draggingActivityId || draggingActivityId === targetId) return;
    setActivityOrder((current) => {
      const next = current.filter((id) => id !== draggingActivityId);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex, 0, draggingActivityId);
      return next;
    });
  };

  const navigateInCurrentTab = useCallback((path: string) => navigate(path, { state: { replaceTab: true } }), [navigate]);

  if (location.pathname === '/quick-lookup') {
    return <QuickLookupPage />;
  }

  return (
    <div
      className={`workbench-shell theme-${themeMode}`}
      style={{
        '--primary-sidebar-width': `${layout.primaryVisible ? layout.primaryWidth : 0}px`,
        '--secondary-sidebar-width': `${layout.secondaryVisible ? layout.secondaryWidth : 0}px`,
        '--panel-height': `${layout.panelVisible ? layout.panelHeight : 0}px`,
        '--sidebar-font-family': sidebarFont.family,
        '--sidebar-font-size': `${sidebarFont.size}px`,
        '--sidebar-font-color': sidebarFont.color,
        '--editor-font-family': editorFont.family,
        '--editor-font-size': `${editorFont.size}px`,
        '--editor-font-color': editorFont.color
      } as React.CSSProperties}
    >
      <TitleBar
        projects={projects}
        selectedProject={selectedProject}
        searchKeyword={searchKeyword}
        searchItems={searchItems}
        mainPinned={mainPinned}
        themeMode={themeMode}
        onSearchChange={setSearchKeyword}
        onProjectChange={(projectId) => setSelectedProject(projects.find((project) => project.id === projectId))}
        onNavigate={navigate}
        onPinMain={() => void pinMain()}
        onToggleTheme={(checked) => setThemeMode(checked ? 'dark' : 'light')}
        onMinimize={() => void window.hetuSketch.desktop.minimize()}
        onMaximize={() => void window.hetuSketch.desktop.maximize()}
        onClose={() => void window.hetuSketch.desktop.close()}
      />

      <ActivityBar
        items={activityItems}
        activeId={sidebarViewId}
        draggingId={draggingActivityId}
        onOpen={(item) => {
          if (sidebarViewId === item.id && layout.primaryVisible) {
            updateLayout({ primaryVisible: false });
            return;
          }
          setSidebarViewId(item.id);
          updateLayout({ primaryVisible: true });
        }}
        onDragStart={setDraggingActivityId}
        onDragEnter={reorderActivity}
        onDragEnd={() => setDraggingActivityId(undefined)}
        onResetOrder={() => setActivityOrder([...ACTIVITY_DEFAULT_ORDER])}
      />

      <PrimarySidebar
        visible={layout.primaryVisible}
        activeId={sidebarViewId}
        selectedProject={selectedProject}
        searchKeyword={searchKeyword}
        onSearchChange={setSearchKeyword}
        onNavigate={navigateInCurrentTab}
        onToggle={() => updateLayout({ primaryVisible: !layout.primaryVisible })}
      />

      <Sash
        direction="vertical"
        minSize={200}
        maxSize={500}
        defaultSize={250}
        currentSize={layout.primaryWidth}
        className="primary-sash"
        onChange={(size) => updateLayout({ primaryWidth: size, primaryVisible: size > 0 })}
        onReset={() => updateLayout({ primaryWidth: 250, primaryVisible: true })}
      />

      <EditorWorkbench
        splitMode={layout.editorSplit}
        onSplitModeChange={(editorSplit) => updateLayout({ editorSplit })}
      />

      <Sash
        direction="vertical"
        minSize={200}
        maxSize={500}
        defaultSize={250}
        currentSize={layout.secondaryWidth}
        className="secondary-sash"
        onChange={(size) => updateLayout({ secondaryWidth: size, secondaryVisible: size > 0 })}
        onReset={() => updateLayout({ secondaryWidth: 250, secondaryVisible: true })}
      />

      <SecondarySidebar
        visible={layout.secondaryVisible}
        onToggle={() => updateLayout({ secondaryVisible: !layout.secondaryVisible })}
      />

      <Sash
        direction="horizontal"
        minSize={100}
        maxSize={Math.round(window.innerHeight * 0.8)}
        defaultSize={200}
        currentSize={layout.panelHeight}
        className="panel-sash"
        onChange={(size) => updateLayout({ panelHeight: size, panelVisible: size > 0 })}
        onReset={() => updateLayout({ panelHeight: 200, panelVisible: true })}
      />

      <BottomPanel
        visible={layout.panelVisible}
        activeTab={activePanelTab}
        onActiveTabChange={setActivePanelTab}
        onToggle={() => updateLayout({ panelVisible: !layout.panelVisible })}
      />

      <StatusBar
        selectedProject={selectedProject}
        panelVisible={layout.panelVisible}
        secondaryVisible={layout.secondaryVisible}
        onTogglePanel={() => updateLayout({ panelVisible: !layout.panelVisible })}
      />
    </div>
  );
}

function TitleBar({
  projects,
  selectedProject,
  searchKeyword,
  searchItems,
  mainPinned,
  themeMode,
  onSearchChange,
  onProjectChange,
  onNavigate,
  onPinMain,
  onToggleTheme,
  onMinimize,
  onMaximize,
  onClose
}: {
  projects: ProjectManifest[];
  selectedProject?: ProjectManifest;
  searchKeyword: string;
  searchItems: SearchResultItem[];
  mainPinned: boolean;
  themeMode: 'light' | 'dark';
  onSearchChange: (value: string) => void;
  onProjectChange: (projectId: string) => void;
  onNavigate: (path: string) => void;
  onPinMain: () => void;
  onToggleTheme: (checked: boolean) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <header className="workbench-titlebar">
      <div className="workbench-brand">
        <span className="workbench-brand-mark">河</span>
        <strong>HetuSketch</strong>
        <span>河图速写</span>
      </div>
      <AutoComplete
        className="command-center"
        value={searchKeyword}
        options={searchItems.map((item) => ({ value: item.title, label: <Space><Tag>{typeLabel(item.type)}</Tag><span>{item.title}</span></Space> }))}
        onChange={onSearchChange}
        onSelect={(value) => {
          onSearchChange(value);
          onNavigate(`/search?q=${encodeURIComponent(value)}`);
        }}
      >
        <Input prefix={<SearchOutlined />} onPressEnter={() => onNavigate(`/search?q=${encodeURIComponent(searchKeyword)}`)} placeholder="搜索角色、世界观规则、伏笔线索..." allowClear />
      </AutoComplete>
      <Space className="titlebar-actions" size={8}>
        <Select
          className="titlebar-project-select"
          placeholder="选择作品"
          value={selectedProject?.id}
          options={projects.map((project) => ({ value: project.id, label: project.name }))}
          onChange={onProjectChange}
        />
        <Button size="small" icon={<ThunderboltOutlined />} onClick={() => void window.hetuSketch.desktop.toggleFloating()}>速查</Button>
        <Button size="small" icon={<PushpinOutlined />} type={mainPinned ? 'primary' : 'default'} onClick={onPinMain}>{mainPinned ? '已置顶' : '置顶'}</Button>
        <Button size="small" type="primary" icon={<SettingOutlined />} onClick={() => onNavigate('/settings')}>设置</Button>
        <Switch size="small" checked={themeMode === 'dark'} checkedChildren={<MoonOutlined />} unCheckedChildren={<SunOutlined />} onChange={onToggleTheme} />
      </Space>
      <div className="window-controls" aria-label="窗口操作">
        <button onClick={onMinimize} aria-label="最小化">—</button>
        <button onClick={onMaximize} aria-label="最大化">□</button>
        <button className="window-close" onClick={onClose} aria-label="关闭">×</button>
      </div>
    </header>
  );
}

function ActivityBar({
  items,
  activeId,
  draggingId,
  onOpen,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onResetOrder
}: {
  items: ActivityItem[];
  activeId: string;
  draggingId?: string;
  onOpen: (item: ActivityItem) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  onResetOrder: () => void;
}): React.JSX.Element {
  const mainItems = items.filter((item) => item.id !== 'settings');
  const bottomItems = items.filter((item) => item.id === 'settings');
  return (
    <nav className="activity-bar" aria-label="活动栏">
      <div className="activity-main">
        {mainItems.map((item) => (
          <Tooltip key={item.id} placement="right" title={item.label}>
            <button
              className={`activity-button ${activeId === item.id ? 'is-active' : ''} ${draggingId === item.id ? 'is-dragging' : ''}`}
              draggable
              onClick={() => onOpen(item)}
              onDragStart={() => onDragStart(item.id)}
              onDragEnter={() => onDragEnter(item.id)}
              onDragEnd={onDragEnd}
              onContextMenu={(event) => {
                event.preventDefault();
                onResetOrder();
                message.success('活动栏顺序已重置');
              }}
              aria-label={item.label}
            >
              <Badge count={item.badge} size="small" offset={[2, 4]}>
                <span className="activity-icon">{item.icon}</span>
              </Badge>
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="activity-bottom">
        <Tooltip placement="right" title="账户">
          <button className="activity-button" aria-label="账户"><UserOutlined /></button>
        </Tooltip>
        {bottomItems.map((item) => (
          <Tooltip key={item.id} placement="right" title={item.label}>
            <button className={`activity-button ${activeId === item.id ? 'is-active' : ''}`} onClick={() => onOpen(item)} aria-label={item.label}>{item.icon}</button>
          </Tooltip>
        ))}
      </div>
    </nav>
  );
}

function PrimarySidebar({
  visible,
  activeId,
  selectedProject,
  searchKeyword,
  onSearchChange,
  onNavigate,
  onToggle
}: {
  visible: boolean;
  activeId: ActivityId;
  selectedProject?: ProjectManifest;
  searchKeyword: string;
  onSearchChange: (value: string) => void;
  onNavigate: (path: string) => void;
  onToggle: () => void;
}): React.JSX.Element {
  const [chapters, setChapters] = useState<ChapterNode[]>([]);
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [folders, setFolders] = useState<SidebarFolderState>(() => readJson(SIDEBAR_FOLDERS_STORAGE_KEY, {}));
  const [draggingTreeNode, setDraggingTreeNode] = useState<TreeDragState>();
  const sidebarRevision = useAppStore((state) => state.sidebarRevision);
  const updateTabNameMap = useAppStore((state) => state.updateTabNameMap);

  const reloadTreeData = useCallback((): void => {
    if (!selectedProject) {
      setChapters([]);
      setEntries([]);
      return;
    }
    ensureDefaultBook(selectedProject);
    const nextChapters = listChapters(selectedProject.id);
    setChapters(nextChapters);
    if (activeId === 'characters' || activeId === 'worlds') {
      const type: EntryType = activeId === 'characters' ? 'character' : 'world';
      void window.hetuSketch.entries.list({ projectId: selectedProject.id, type, limit: 300 })
        .then((summaries) => Promise.all(summaries.map((item) => window.hetuSketch.entries.get(item.projectId, type, item.id))))
        .then((nextEntries) => {
          setEntries(nextEntries);
          updateTabNameMap(nextChapters, nextEntries);
        })
        .catch(() => {
          setEntries([]);
          updateTabNameMap(nextChapters, []);
        });
    } else {
      setEntries([]);
      updateTabNameMap(nextChapters, []);
    }
  }, [activeId, selectedProject, sidebarRevision, updateTabNameMap]);

  useEffect(() => {
    reloadTreeData();
  }, [reloadTreeData]);

  useEffect(() => {
    writeJson(SIDEBAR_FOLDERS_STORAGE_KEY, folders);
  }, [folders]);

  const folderType = activeId === 'characters' ? 'character' : activeId === 'worlds' ? 'world' : undefined;
  const createFolder = (): void => {
    if (!folderType) return;
    const name = window.prompt('新建文件夹名称', '新建分类');
    if (!name?.trim()) return;
    const nextFolder: SidebarFolderNode = { id: `folder-${crypto.randomUUID().slice(0, 8)}`, name: name.trim(), entryIds: [], children: [] };
    setFolders((current) => ({ ...current, [folderType]: [...(current[folderType] ?? []), nextFolder] }));
  };

  const handleFolderDrop = (folderId: string): void => {
    if (!folderType || !draggingTreeNode) return;
    setFolders((current) => {
      const currentFolders = current[folderType] ?? [];
      const nextFolders = draggingTreeNode.nodeKind === 'folder'
        ? moveFolderToFolder(currentFolders, draggingTreeNode.nodeId, folderId)
        : moveEntryToFolder(currentFolders, draggingTreeNode.nodeId, folderId);
      return { ...current, [folderType]: nextFolders };
    });
    setDraggingTreeNode(undefined);
  };

  const handleChapterReorder = (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside'): void => {
    if (!selectedProject) return;
    setChapters(reorderChapter(sourceId, targetId, position));
    setDraggingTreeNode(undefined);
  };

  const renameFolder = (folderId: string, name: string): void => {
    if (!folderType) return;
    const currentFolder = findFolder(folders[folderType] ?? [], folderId);
    if (!currentFolder || currentFolder.id.endsWith('-root') || currentFolder.id.endsWith('-uncategorized')) return;
    setFolders((current) => ({ ...current, [folderType]: renameFolderNode(current[folderType] ?? [], folderId, name.trim()) }));
  };

  const handleNodeRename = (node: TreeNodeItem, newLabel: string): void => {
    if (!selectedProject || !newLabel.trim()) return;
    const label = newLabel.trim();
    if (node.kind === 'chapter' || node.kind === 'volume') {
      const chapter = chapters.find((item) => item.id === node.id);
      if (chapter) {
        const updated = upsertChapter({ ...chapter, title: label });
        setChapters(listChapters(updated.projectId));
      }
    } else if (node.kind === 'entry' && node.entryType) {
      const entry = entries.find((item) => item.id === node.id);
      if (entry) {
        void window.hetuSketch.entries.update({ projectId: entry.projectId, type: node.entryType, entryId: entry.id, changes: { title: label } }).then(() => reloadTreeData());
      }
    } else if (node.kind === 'folder' && !node.readonly) {
      renameFolder(node.id, label);
    }
  };

  return (
    <aside className={`primary-sidebar ${visible ? '' : 'is-collapsed'}`} aria-label="主侧边栏">
      <div className="sidebar-titlebar">
        <span>{sidebarTitle(activeId)}</span>
        <Space size={4}>
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={reloadTreeData} />
          <Dropdown menu={{ items: folderType ? [{ key: 'new-folder', label: '新建文件夹', onClick: createFolder }] : [{ key: 'empty', label: '暂无可用操作', disabled: true }] }} trigger={['click']}>
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
          <Button
            type="text"
            size="small"
            icon={visible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
            onClick={onToggle}
            aria-label={visible ? '隐藏主侧边栏' : '显示主侧边栏'}
            title={visible ? '隐藏主侧边栏' : '显示主侧边栏'}
          />
        </Space>
      </div>
      <div className="sidebar-content">
        <div className="sidebar-filter">
          <Input
            prefix={<SearchOutlined />}
            value={searchKeyword}
            onChange={(event) => onSearchChange(event.target.value)}
            onPressEnter={() => onNavigate(activeId === 'search' ? `/search?q=${encodeURIComponent(searchKeyword)}` : currentDataPath(activeId))}
            placeholder="筛选当前视图内容"
            allowClear
          />
        </div>
        <SidebarView
          activeId={activeId}
          selectedProject={selectedProject}
          chapters={chapters}
          entries={entries}
          folders={folders}
          draggingTreeNode={draggingTreeNode}
          onTreeDragStart={setDraggingTreeNode}
          onFolderDrop={handleFolderDrop}
          onFolderRename={renameFolder}
          onNodeRename={handleNodeRename}
          onChapterReorder={handleChapterReorder}
          onNavigate={onNavigate}
        />
        {activeId === 'search' && <Button block className="sidebar-search-action" onClick={() => onNavigate(`/search?q=${encodeURIComponent(searchKeyword)}`)}>打开搜索结果</Button>}
      </div>
    </aside>
  );
}

function SidebarView({
  activeId,
  selectedProject,
  chapters,
  entries,
  folders,
  draggingTreeNode,
  onTreeDragStart,
  onFolderDrop,
  onFolderRename,
  onNodeRename,
  onChapterReorder,
  onNavigate
}: {
  activeId: ActivityId;
  selectedProject?: ProjectManifest;
  chapters: ChapterNode[];
  entries: ProjectEntry[];
  folders: SidebarFolderState;
  draggingTreeNode?: TreeDragState;
  onTreeDragStart: (node?: TreeDragState) => void;
  onFolderDrop: (folderId: string) => void;
  onFolderRename: (folderId: string, name: string) => void;
  onNodeRename?: (node: TreeNodeItem, newLabel: string) => void;
  onChapterReorder?: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  onNavigate: (path: string) => void;
}): React.JSX.Element {
  const location = useLocation();
  const selectedId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (activeId === 'editor') return params.get('chapter') ?? undefined;
    if (activeId === 'characters' || activeId === 'worlds') return params.get('entry') ?? params.get('folder') ?? undefined;
    return undefined;
  }, [activeId, location.search]);

  if (activeId === 'editor') {
    return <TreeSection title="TEXT STRUCTURE" nodes={chapterTreeNodes(selectedProject, chapters)} selectedId={selectedId} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} onChapterReorder={onChapterReorder} />;
  }
  if (activeId === 'characters') {
    return <TreeSection title="CHARACTERS" nodes={entryTreeNodes('character', entries, folders.character ?? [], selectedProject)} selectedId={selectedId} draggingTreeNode={draggingTreeNode} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  if (activeId === 'worlds') {
    return <TreeSection title="WORLDBUILDING" nodes={entryTreeNodes('world', entries, folders.world ?? [], selectedProject)} selectedId={selectedId} draggingTreeNode={draggingTreeNode} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  if (activeId === 'plots') {
    return <TreeSection title="LIMITED DATABASE" nodes={plotTreeNodes()} selectedId={selectedId} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  if (activeId === 'projects') {
    return <TreeSection title="BOOKS" nodes={[{ id: 'books-local', label: '本地书目', path: '/projects' }, { id: 'books-import', label: '导入导出', path: '/projects' }, { id: 'books-binding', label: '绑定设定集', path: '/projects' }]} selectedId={selectedId} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  if (activeId === 'settings') {
    return <TreeSection title="SETTINGS" nodes={[{ id: 'ai-config', label: 'AI 配置', path: '/settings' }, { id: 'prompts', label: '提示词', path: '/settings' }, { id: 'http-tools', label: 'HTTP 工具', path: '/settings' }, { id: 'shortcuts', label: '快捷键', path: '/settings' }]} selectedId={selectedId} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  return <TreeSection title="SEARCH" nodes={[{ id: 'search-global', label: '全局搜索', path: '/search' }]} selectedId={selectedId} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
}

function TreeSection({ title, nodes, selectedId, draggingTreeNode, onNavigate, onTreeDragStart, onFolderDrop, onFolderRename, onNodeRename, onChapterReorder }: { title: string; nodes: TreeNodeItem[]; selectedId?: string; draggingTreeNode?: TreeDragState; onNavigate: (path: string) => void; onTreeDragStart: (node?: TreeDragState) => void; onFolderDrop: (folderId: string) => void; onFolderRename: (folderId: string, name: string) => void; onNodeRename?: (node: TreeNodeItem, newLabel: string) => void; onChapterReorder?: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void }): React.JSX.Element {
  return (
    <section className="sidebar-section">
      <div className="sidebar-section-title">{title}</div>
      <TreeNodeList nodes={nodes} level={0} selectedId={selectedId} draggingTreeNode={draggingTreeNode} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} onChapterReorder={onChapterReorder} />
    </section>
  );
}

function TreeNodeList({ nodes, level, selectedId, draggingTreeNode, onNavigate, onTreeDragStart, onFolderDrop, onFolderRename, onNodeRename, onChapterReorder }: { nodes: TreeNodeItem[]; level: number; selectedId?: string; draggingTreeNode?: TreeDragState; onNavigate: (path: string) => void; onTreeDragStart: (node?: TreeDragState) => void; onFolderDrop: (folderId: string) => void; onFolderRename: (folderId: string, name: string) => void; onNodeRename?: (node: TreeNodeItem, newLabel: string) => void; onChapterReorder?: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void }): React.JSX.Element {
  return (
    <div className="tree-node-list" role={level === 0 ? 'tree' : 'group'}>
      {nodes.map((node) => <TreeNode key={node.id} node={node} level={level} selectedId={selectedId} draggingTreeNode={draggingTreeNode} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} onChapterReorder={onChapterReorder} />)}
    </div>
  );
}

function TreeNode({ node, level, selectedId, draggingTreeNode, onNavigate, onTreeDragStart, onFolderDrop, onFolderRename, onNodeRename, onChapterReorder }: { node: TreeNodeItem; level: number; selectedId?: string; draggingTreeNode?: TreeDragState; onNavigate: (path: string) => void; onTreeDragStart: (node?: TreeDragState) => void; onFolderDrop: (folderId: string) => void; onFolderRename: (folderId: string, name: string) => void; onNodeRename?: (node: TreeNodeItem, newLabel: string) => void; onChapterReorder?: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void }): React.JSX.Element {
  const hasChildren = Boolean(node.children?.length);
  const [expanded, setExpanded] = useState(level < 1);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside'>();
  const isSelected = selectedId === node.id;
  const isReadonly = Boolean(node.readonly);
  const canRename = !isReadonly && onNodeRename !== undefined;
  const draggedId = draggingTreeNode?.nodeId;
  const draggedKind = draggingTreeNode?.nodeKind;
  const canDropEntry = node.kind === 'folder' && (draggedKind === 'entry' || draggedKind === 'folder') && draggedId !== node.id;
  const isChapterDrag = draggedKind === 'chapter' || draggedKind === 'volume';
  const canDropBeforeAfter = isChapterDrag && draggedId !== node.id && onChapterReorder !== undefined && (
    (draggedKind === 'chapter' && node.kind === 'chapter') ||
    (draggedKind === 'volume' && (node.kind === 'volume' || node.kind === 'book'))
  );
  const canDropInside = isChapterDrag && draggedId !== node.id && onChapterReorder !== undefined && (
    (draggedKind === 'chapter' && node.kind === 'volume')
  );
  const canDropChapter = canDropBeforeAfter || canDropInside;

  const isRootFolder = node.kind === 'folder' && node.id.endsWith('-root');
  const shouldNavigate = node.kind !== 'folder' || isRootFolder;

  const onClick = (): void => {
    if (hasChildren || node.kind === 'folder') setExpanded((current) => !current);
    if (shouldNavigate && node.path) onNavigate(node.path);
  };

  const openInNewPage = (): void => {
    if (!node.path) return;
    if (typeof window !== 'undefined' && window.hetuSketch?.desktop?.openWindow) {
      void window.hetuSketch.desktop.openWindow(node.path);
    } else {
      window.open(node.path, '_blank');
    }
  };

  const startEdit = (event: React.MouseEvent): void => {
    if (!canRename) return;
    event.stopPropagation();
    setEditDraft(node.label);
    setIsEditing(true);
  };

  const commitEdit = (): void => {
    if (!isEditing) return;
    const label = editDraft.trim();
    if (label && label !== node.label) onNodeRename?.(node, label);
    setIsEditing(false);
  };

  const cancelEdit = (): void => {
    setIsEditing(false);
  };

  const computeDropPosition = (event: React.DragEvent<HTMLDivElement>): 'before' | 'after' | 'inside' | undefined => {
    if (!canDropChapter) return undefined;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    if (canDropInside && ratio > 0.3 && ratio < 0.7) return 'inside';
    if (!canDropBeforeAfter) return undefined;
    return ratio < 0.5 ? 'before' : 'after';
  };

  return (
    <div
      className={`tree-node ${canDropEntry ? 'can-drop-entry' : ''} ${dropPosition ? `drop-${dropPosition}` : ''}`}
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      onDragOver={(event) => {
        if (canDropEntry || canDropChapter) {
          event.preventDefault();
          if (canDropChapter) {
            const position = computeDropPosition(event);
            if (position) setDropPosition(position);
          }
        }
      }}
      onDragLeave={() => setDropPosition(undefined)}
      onDrop={() => {
        if (canDropEntry) onFolderDrop(node.id);
        if (canDropChapter && dropPosition && draggedId) onChapterReorder(draggedId, node.id, dropPosition);
        setDropPosition(undefined);
      }}
    >
      <Dropdown
        trigger={['contextMenu']}
        menu={{
          items: shouldNavigate && node.path
            ? [
                { key: 'open-current', label: '打开', onClick: onClick },
                { key: 'open-new', label: '在新页面打开', onClick: openInNewPage }
              ]
            : [{ key: 'open-current', label: '打开', onClick: onClick }]
        }}
      >
        <button
          className={`tree-row tree-row-${node.kind ?? 'item'} ${isSelected ? 'is-selected' : ''} ${isReadonly ? 'is-readonly' : ''}`}
          draggable={node.kind === 'entry' || (node.kind === 'folder' && !node.readonly) || node.kind === 'chapter' || node.kind === 'volume'}
          style={{ '--tree-level': level } as React.CSSProperties}
          title={node.label}
          onClick={onClick}
          onDoubleClick={startEdit}
          onDragStart={() => onTreeDragStart({ nodeId: node.id, nodeKind: node.kind, entryType: node.entryType })}
          onDragEnd={() => onTreeDragStart(undefined)}
        >
          <span className={`tree-twist ${expanded ? 'is-expanded' : ''}`}>{hasChildren || node.kind === 'folder' ? '▸' : '·'}</span>
          {isEditing ? (
            <Input
              className="tree-edit-input"
              size="small"
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              onBlur={commitEdit}
              onPressEnter={commitEdit}
              onKeyDown={(event) => { if (event.key === 'Escape') cancelEdit(); }}
              autoFocus
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="tree-label">{node.label}</span>
          )}
        </button>
      </Dropdown>
      {(hasChildren || node.kind === 'folder') && expanded ? <TreeNodeList nodes={node.children ?? []} level={level + 1} selectedId={selectedId} draggingTreeNode={draggingTreeNode} onNavigate={onNavigate} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} onChapterReorder={onChapterReorder} /> : null}
    </div>
  );
}

function chapterTreeNodes(selectedProject: ProjectManifest | undefined, chapters: ChapterNode[]): TreeNodeItem[] {
  const book = chapters.find((item) => item.kind === 'book');
  const root: TreeNodeItem = {
    id: book?.id ?? 'book-current',
    label: book?.title ?? selectedProject?.name ?? '未选择书目',
    path: '/workspace/editor',
    kind: 'book',
    children: buildChapterChildren(chapters, book?.id, book?.id)
  };
  return [root];
}

function buildChapterChildren(chapters: ChapterNode[], parentId?: string, rootBookId?: string): TreeNodeItem[] {
  return chapters
    .filter((item) => item.kind !== 'book' && (item.parentId === parentId || (parentId === rootBookId && !item.parentId)))
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      id: item.id,
      label: item.title,
      path: item.kind === 'chapter' ? `/workspace/editor?chapter=${encodeURIComponent(item.id)}` : '/workspace/editor',
      kind: item.kind,
      children: buildChapterChildren(chapters, item.id, rootBookId)
    }));
}

function entryTreeNodes(type: 'character' | 'world', entries: ProjectEntry[], folders: SidebarFolderNode[], selectedProject?: ProjectManifest): TreeNodeItem[] {
  const assignedIds = new Set(flattenFolders(folders).flatMap((folder) => folder.entryIds));
  const entryNodes = entries.filter((entry) => entry.type === type && !assignedIds.has(entry.id)).map((entry) => entryNode(type, entry));
  const basePath = type === 'character' ? '/data/characters' : '/data/worlds';
  const rootLabel = type === 'character' ? `角色数据库 · ${selectedProject?.name ?? '当前设定集'}` : `世界观设定库 · ${selectedProject?.name ?? '当前设定集'}`;
  return [{
    id: `${type}-root`,
    label: rootLabel,
    path: `${basePath}?scope=root`,
    kind: 'folder',
    readonly: true,
    children: [
      ...folders.map((folder) => folderNode(type, folder, entries)),
      { id: `${type}-uncategorized`, label: '未分类', path: `${basePath}?folder=uncategorized`, kind: 'folder', readonly: true, children: entryNodes }
    ]
  }];
}

function folderNode(type: 'character' | 'world', folder: SidebarFolderNode, entries: ProjectEntry[]): TreeNodeItem {
  return {
    id: folder.id,
    label: folder.name,
    path: type === 'character' ? `/data/characters?folder=${encodeURIComponent(folder.id)}` : `/data/worlds?folder=${encodeURIComponent(folder.id)}`,
    kind: 'folder',
    children: [
      ...folder.children.map((child) => folderNode(type, child, entries)),
      ...folder.entryIds.map((entryId) => entries.find((entry) => entry.id === entryId)).filter((entry): entry is ProjectEntry => Boolean(entry)).map((entry) => entryNode(type, entry))
    ]
  };
}

function entryNode(type: 'character' | 'world', entry: ProjectEntry): TreeNodeItem {
  return {
    id: entry.id,
    label: entry.title,
    kind: 'entry',
    entryType: type,
    path: type === 'character' ? `/data/characters?entry=${encodeURIComponent(entry.id)}` : `/data/worlds?entry=${encodeURIComponent(entry.id)}`
  };
}

function flattenFolders(folders: SidebarFolderNode[]): SidebarFolderNode[] {
  return folders.flatMap((folder) => [folder, ...flattenFolders(folder.children)]);
}

function moveEntryToFolder(folders: SidebarFolderNode[], entryId: string, folderId: string): SidebarFolderNode[] {
  return folders.map((folder) => {
    const cleanChildren = moveEntryToFolder(folder.children, entryId, folderId);
    const base = { ...folder, entryIds: folder.entryIds.filter((id) => id !== entryId), children: cleanChildren };
    return folder.id === folderId ? { ...base, entryIds: Array.from(new Set([...base.entryIds, entryId])) } : base;
  });
}

function moveFolderToFolder(folders: SidebarFolderNode[], folderId: string, targetFolderId: string): SidebarFolderNode[] {
  if (folderId === targetFolderId || containsFolder(findFolder(folders, folderId)?.children ?? [], targetFolderId)) return folders;
  const moving = findFolder(folders, folderId);
  if (!moving) return folders;
  const withoutMoving = removeFolder(folders, folderId);
  return insertFolder(withoutMoving, targetFolderId, moving);
}

function findFolder(folders: SidebarFolderNode[], folderId: string): SidebarFolderNode | undefined {
  for (const folder of folders) {
    if (folder.id === folderId) return folder;
    const child = findFolder(folder.children, folderId);
    if (child) return child;
  }
  return undefined;
}

function containsFolder(folders: SidebarFolderNode[], folderId: string): boolean {
  return folders.some((folder) => folder.id === folderId || containsFolder(folder.children, folderId));
}

function removeFolder(folders: SidebarFolderNode[], folderId: string): SidebarFolderNode[] {
  return folders.filter((folder) => folder.id !== folderId).map((folder) => ({ ...folder, children: removeFolder(folder.children, folderId) }));
}

function insertFolder(folders: SidebarFolderNode[], targetFolderId: string, moving: SidebarFolderNode): SidebarFolderNode[] {
  return folders.map((folder) => folder.id === targetFolderId ? { ...folder, children: [...folder.children, moving] } : { ...folder, children: insertFolder(folder.children, targetFolderId, moving) });
}

function renameFolderNode(folders: SidebarFolderNode[], folderId: string, name: string): SidebarFolderNode[] {
  return folders.map((folder) => folder.id === folderId ? { ...folder, name } : { ...folder, children: renameFolderNode(folder.children, folderId, name) });
}

function plotTreeNodes(): TreeNodeItem[] {
  return [
    { id: 'plot-open', label: '未回收伏笔', path: '/data/plots?status=open' },
    { id: 'plot-closed', label: '已回收伏笔', path: '/data/plots?status=resolved' },
    { id: 'plot-conflict', label: '冲突提醒', path: '/data/plots' }
  ];
}

function EditorWorkbench({ splitMode, onSplitModeChange }: { splitMode: WorkbenchLayoutState['editorSplit']; onSplitModeChange: (mode: WorkbenchLayoutState['editorSplit']) => void }): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = `${location.pathname}${location.search}`;
  const previousActivePathRef = useRef(activePath);
  const [tabs, setTabs] = useState<EditorTab[]>(() => readArray<EditorTab>(OPEN_TABS_STORAGE_KEY, [
    { key: '/dashboard', title: '总览', path: '/dashboard', dirty: false },
    { key: '/workspace/editor', title: '文本编辑器', path: '/workspace/editor', dirty: false }
  ]));
  const [draggingTabKey, setDraggingTabKey] = useState<string>();
  const [secondaryGroups, setSecondaryGroups] = useState<SecondaryGroupState[]>(() => readSecondaryGroups());
  const gridClass = splitMode === 'grid' ? 'grid-1-over-2' : splitMode === 'vertical' ? 'grid-1x2' : 'grid-1x1';
  const secondaryCount = splitMode === 'grid' ? 2 : splitMode === 'vertical' ? 1 : 0;
  const tabNameMap = useAppStore((state) => state.tabNameMap);

  const updateSecondaryGroup = useCallback((index: number, updater: (group: SecondaryGroupState) => SecondaryGroupState): void => {
    setSecondaryGroups((current) => current.map((group, i) => (i === index ? updater(group) : group)));
  }, []);

  useEffect(() => {
    setTabs((current) => current.map((tab) => {
      if (tab.titleSource === 'custom') return tab;
      const next = createTabFromPath(tab.path);
      return next.title === tab.title ? tab : { ...tab, title: next.title };
    }));
  }, [tabNameMap]);

  useEffect(() => {
    const previous = previousActivePathRef.current;
    setTabs((current) => {
      if (current.some((tab) => tab.key === activePath)) return current;
      const nextTab = createTabFromPath(activePath);
      if (location.state?.replaceTab && current.some((tab) => tab.key === previous)) {
        return current.map((tab) => tab.key === previous ? nextTab : tab);
      }
      return [...current, nextTab];
    });
    previousActivePathRef.current = activePath;
  }, [activePath, location.state]);

  useEffect(() => {
    writeJson(OPEN_TABS_STORAGE_KEY, tabs);
  }, [tabs]);

  useEffect(() => {
    writeJson(SECONDARY_GROUPS_STORAGE_KEY, secondaryGroups);
  }, [secondaryGroups]);

  const closeTab = (key: EditorTabKey): void => {
    setTabs((current) => {
      const next = current.filter((item) => item.key !== key);
      if (key === activePath) {
        navigate((next[next.length - 1] ?? createTabFromPath('/workspace/editor')).path);
      }
      return next.length > 0 ? next : [createTabFromPath('/workspace/editor')];
    });
  };

  const renameTab = (key: EditorTabKey, title: string): void => {
    setTabs((current) => current.map((tab) => tab.key === key ? { ...tab, title, titleSource: 'custom' } : tab));
  };

  const reorderTab = (targetKey: string): void => {
    if (!draggingTabKey || draggingTabKey === targetKey) return;
    setTabs((current) => {
      const dragging = current.find((tab) => tab.key === draggingTabKey);
      if (!dragging) return current;
      const next = current.filter((tab) => tab.key !== draggingTabKey);
      const targetIndex = next.findIndex((tab) => tab.key === targetKey);
      next.splice(targetIndex, 0, dragging);
      return next;
    });
  };

  return (
    <main className={`editor-area ${gridClass}`} aria-label="编辑器区域">
      <EditorGroup
        title="主编辑器组"
        activeKey={activePath}
        tabs={tabs}
        draggingTabKey={draggingTabKey}
        onNavigate={navigate}
        onCloseTab={closeTab}
        onRenameTab={renameTab}
        onDragTabStart={setDraggingTabKey}
        onDragTabEnter={reorderTab}
        onDragTabEnd={() => setDraggingTabKey(undefined)}
        actions={(
          <Space size={4}>
            <Button size="small" icon={<SplitCellsOutlined />} onClick={() => onSplitModeChange(splitMode === 'single' ? 'vertical' : splitMode === 'vertical' ? 'grid' : 'single')}>分割</Button>
            <Button size="small" icon={<PlusOutlined />} onClick={() => navigate('/workspace/editor')}>新建</Button>
          </Space>
        )}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/workspace/editor" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspace/data" element={<Navigate to="/data/characters" replace />} />
          <Route path="/data/characters" element={<CharactersDataPage />} />
          <Route path="/data/worlds" element={<WorldSettingsDataPage />} />
          <Route path="/data/plots" element={<LimitedDatabasePage />} />
          <Route path="/workspace/editor" element={<TextEditorWorkspacePage />} />
          <Route path="/setting-sets" element={<Navigate to="/data/characters" replace />} />
          <Route path="/characters" element={<Navigate to="/data/characters" replace />} />
          <Route path="/worlds" element={<Navigate to="/data/worlds" replace />} />
          <Route path="/plots" element={<Navigate to="/data/plots" replace />} />
          <Route path="/studio" element={<Navigate to="/workspace/editor" replace />} />
          <Route path="/checks" element={<Navigate to="/workspace/editor" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </EditorGroup>
      {secondaryCount >= 1 && (
        <SecondaryEditorGroup
          title="辅助编辑器组"
          groupState={secondaryGroups[0]}
          onGroupChange={(updater) => updateSecondaryGroup(0, updater)}
        />
      )}
      {secondaryCount >= 2 && (
        <SecondaryEditorGroup
          title="参考编辑器组"
          groupState={secondaryGroups[1]}
          onGroupChange={(updater) => updateSecondaryGroup(1, updater)}
        />
      )}
    </main>
  );
}

function createTabFromPath(path: string): EditorTab {
  const [pathname, queryString = ''] = path.split('?');
  const query = new URLSearchParams(queryString);
  const entryId = query.get('entry');
  const folderId = query.get('folder');
  const chapterId = query.get('chapter');
  const nameMap = useAppStore.getState().tabNameMap;
  const entryName = entryId ? nameMap[entryId] : undefined;
  const chapterName = chapterId ? nameMap[chapterId] : undefined;
  const titleMap: Record<string, string> = {
    '/dashboard': '总览',
    '/data/characters': entryId ? `角色 · ${entryName ?? entryId.slice(0, 8)}` : folderId ? `角色列表 · ${folderId === 'uncategorized' ? '未分类' : folderId.slice(0, 8)}` : '角色数据库',
    '/data/worlds': entryId ? `世界观 · ${entryName ?? entryId.slice(0, 8)}` : folderId ? `世界观列表 · ${folderId === 'uncategorized' ? '未分类' : folderId.slice(0, 8)}` : '世界观设定库',
    '/data/plots': '限时数据库',
    '/workspace/editor': chapterId ? `章节 · ${chapterName ?? chapterId.slice(0, 8)}` : '文本编辑器',
    '/projects': '书目管理',
    '/search': '搜索结果',
    '/settings': '系统设置'
  };
  return { key: path, title: titleMap[pathname] ?? '工作页', path, dirty: false, titleSource: 'auto' };
}

const OPENABLE_PAGES: Array<{ path: string; label: string }> = [
  { path: '/dashboard', label: '总览' },
  { path: '/data/characters', label: '角色数据库' },
  { path: '/data/worlds', label: '世界观设定库' },
  { path: '/data/plots', label: '限时数据库' },
  { path: '/workspace/editor', label: '文本编辑器' },
  { path: '/projects', label: '书目管理' },
  { path: '/search', label: '搜索结果' },
  { path: '/settings', label: '系统设置' }
];

function normalizePathname(pathname: string): string {
  if (pathname === '/') return '/workspace/editor';
  if (pathname.startsWith('/workspace/data')) return '/data/characters';
  if (pathname === '/setting-sets' || pathname === '/characters') return '/data/characters';
  if (pathname === '/worlds') return '/data/worlds';
  if (pathname === '/plots') return '/data/plots';
  if (pathname === '/studio' || pathname === '/checks') return '/workspace/editor';
  return pathname;
}

function renderPageContent(path: string): ReactNode {
  const [pathname] = path.split('?');
  switch (normalizePathname(pathname)) {
    case '/dashboard': return <DashboardPage />;
    case '/data/characters': return <CharactersDataPage />;
    case '/data/worlds': return <WorldSettingsDataPage />;
    case '/data/plots': return <LimitedDatabasePage />;
    case '/workspace/editor': return <TextEditorWorkspacePage />;
    case '/projects': return <ProjectsPage />;
    case '/search': return <SearchPage />;
    case '/settings': return <SettingsPage />;
    default: return <WorkbenchWelcome />;
  }
}

function readSecondaryGroups(): SecondaryGroupState[] {
  const stored = readJson<SecondaryGroupState[] | undefined>(SECONDARY_GROUPS_STORAGE_KEY, undefined);
  const fallback: SecondaryGroupState[] = [
    { tabs: [createTabFromPath('/dashboard')], activeKey: '/dashboard' },
    { tabs: [createTabFromPath('/dashboard')], activeKey: '/dashboard' }
  ];
  if (!Array.isArray(stored) || stored.length !== 2) return fallback;
  const sanitize = (group: unknown): SecondaryGroupState | undefined => {
    if (!group || typeof group !== 'object') return undefined;
    const candidate = group as Partial<SecondaryGroupState>;
    if (!Array.isArray(candidate.tabs) || typeof candidate.activeKey !== 'string') return undefined;
    const tabs = candidate.tabs.filter((tab): tab is EditorTab => Boolean(tab && typeof tab.key === 'string' && typeof tab.title === 'string' && typeof tab.path === 'string'));
    if (tabs.length === 0) return undefined;
    return { tabs, activeKey: tabs.some((tab) => tab.key === candidate.activeKey) ? candidate.activeKey : tabs[0].key, draggingTabKey: undefined };
  };
  const first = sanitize(stored[0]) ?? fallback[0];
  const second = sanitize(stored[1]) ?? fallback[1];
  return [first, second];
}

function SecondaryEditorGroup({ title, groupState, onGroupChange }: {
  title: string;
  groupState: SecondaryGroupState;
  onGroupChange: (updater: (group: SecondaryGroupState) => SecondaryGroupState) => void;
}): React.JSX.Element {
  const { tabs, activeKey, draggingTabKey } = groupState;

  const openTab = (path: string): void => {
    onGroupChange((group) => {
      if (group.tabs.some((tab) => tab.key === path)) return { ...group, activeKey: path, draggingTabKey: undefined };
      return { ...group, tabs: [...group.tabs, createTabFromPath(path)], activeKey: path, draggingTabKey: undefined };
    });
  };

  const closeTab = (key: EditorTabKey): void => {
    onGroupChange((group) => {
      const next = group.tabs.filter((tab) => tab.key !== key);
      if (next.length === 0) {
        const fresh = createTabFromPath('/dashboard');
        return { tabs: [fresh], activeKey: fresh.key, draggingTabKey: undefined };
      }
      let nextActive = group.activeKey;
      if (key === group.activeKey) {
        const removedIndex = group.tabs.findIndex((tab) => tab.key === key);
        const neighborIndex = Math.min(removedIndex, next.length - 1);
        nextActive = next[neighborIndex].key;
      }
      return { tabs: next, activeKey: nextActive, draggingTabKey: undefined };
    });
  };

  const renameTab = (key: EditorTabKey, title: string): void => {
    onGroupChange((group) => ({ ...group, tabs: group.tabs.map((tab) => tab.key === key ? { ...tab, title, titleSource: 'custom' as const } : tab) }));
  };

  const reorderTab = (targetKey: string): void => {
    onGroupChange((group) => {
      if (!group.draggingTabKey || group.draggingTabKey === targetKey) return group;
      const dragging = group.tabs.find((tab) => tab.key === group.draggingTabKey);
      if (!dragging) return group;
      const next = group.tabs.filter((tab) => tab.key !== group.draggingTabKey);
      const targetIndex = next.findIndex((tab) => tab.key === targetKey);
      if (targetIndex < 0) return group;
      next.splice(targetIndex, 0, dragging);
      return { ...group, tabs: next };
    });
  };

  const openMenu = {
    items: OPENABLE_PAGES.map((page) => ({
      key: page.path,
      label: page.label,
      onClick: () => openTab(page.path)
    }))
  };

  return (
    <EditorGroup
      title={title}
      activeKey={activeKey}
      tabs={tabs}
      draggingTabKey={draggingTabKey}
      onNavigate={(path) => onGroupChange((group) => ({ ...group, activeKey: path }))}
      onCloseTab={closeTab}
      onRenameTab={renameTab}
      onDragTabStart={(key) => onGroupChange((group) => ({ ...group, draggingTabKey: key }))}
      onDragTabEnter={reorderTab}
      onDragTabEnd={() => onGroupChange((group) => ({ ...group, draggingTabKey: undefined }))}
      actions={(
        <Dropdown menu={openMenu} trigger={['click']}>
          <Button size="small" icon={<PlusOutlined />}>打开</Button>
        </Dropdown>
      )}
    >
      {renderPageContent(activeKey)}
    </EditorGroup>
  );
}

function EditorGroup({
  title,
  activeKey,
  tabs,
  draggingTabKey,
  actions,
  children,
  onNavigate,
  onCloseTab,
  onRenameTab,
  onDragTabStart,
  onDragTabEnter,
  onDragTabEnd
}: {
  title: string;
  activeKey: string;
  tabs: EditorTab[];
  draggingTabKey?: string;
  actions?: ReactNode;
  children: ReactNode;
  onNavigate: (path: string) => void;
  onCloseTab?: (key: EditorTabKey) => void;
  onRenameTab?: (key: EditorTabKey, title: string) => void;
  onDragTabStart?: (key: string) => void;
  onDragTabEnter?: (key: string) => void;
  onDragTabEnd?: () => void;
}): React.JSX.Element {
  const [renamingTabKey, setRenamingTabKey] = useState<string>();
  const [renameDraft, setRenameDraft] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingTabKey) {
      const frame = window.requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [renamingTabKey]);

  const startRename = (tab: EditorTab): void => {
    setRenamingTabKey(tab.key);
    setRenameDraft(tab.title);
  };

  const commitRename = (): void => {
    if (!renamingTabKey) return;
    const nextTitle = renameDraft.trim();
    if (nextTitle) onRenameTab?.(renamingTabKey, nextTitle);
    setRenamingTabKey(undefined);
  };

  const cancelRename = (): void => {
    setRenamingTabKey(undefined);
  };

  return (
    <section className="editor-group" aria-label={title}>
      <div className="editor-tabbar">
        <div
          className="editor-tabs"
          onWheel={(event) => {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            event.currentTarget.scrollLeft += event.deltaY;
          }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={`editor-tab ${activeKey === tab.key ? 'is-active' : ''} ${draggingTabKey === tab.key ? 'is-dragging' : ''} ${renamingTabKey === tab.key ? 'is-renaming' : ''}`}
              draggable={renamingTabKey !== tab.key}
              role="tab"
              tabIndex={0}
              onClick={() => {
                if (renamingTabKey !== tab.key) onNavigate(tab.path);
              }}
              onDoubleClick={() => startRename(tab)}
              onDragStart={() => onDragTabStart?.(tab.key)}
              onDragEnter={() => onDragTabEnter?.(tab.key)}
              onDragEnd={onDragTabEnd}
            >
              <CodeOutlined />
              {renamingTabKey === tab.key ? (
                <input
                  ref={renameInputRef}
                  className="editor-tab-rename"
                  value={renameDraft}
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRename();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                />
              ) : (
                <span className="editor-tab-title">{tab.title}</span>
              )}
              {tab.dirty && <span className="dirty-dot" />}
              <CloseOutlined
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab?.(tab.key);
                }}
              />
            </div>
          ))}
        </div>
        <div className="editor-actions">{actions}</div>
      </div>
      <div className="editor-content">{children}</div>
    </section>
  );
}

function CharactersDataPage(): React.JSX.Element {
  return <EntriesPage type="character" />;
}

function WorldSettingsDataPage(): React.JSX.Element {
  return <EntriesPage type="world" />;
}

function LimitedDatabasePage(): React.JSX.Element {
  return <EntriesPage type="plot" />;
}

function TextEditorWorkspacePage(): React.JSX.Element {
  return <WritingStudioPage />;
}

function SecondarySidebar({ visible, onToggle }: { visible: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <aside className={`secondary-sidebar ${visible ? '' : 'is-collapsed'}`} aria-label="辅助侧边栏">
      <div className="sidebar-titlebar">
        <span>AI CHAT</span>
        <Button type="text" size="small" icon={visible ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={onToggle} />
      </div>
      <div className="sidebar-content">
        {visible ? (
          <Space direction="vertical" className="full-width">
            <Card size="small" title="上下文助手">
              <Typography.Paragraph type="secondary">默认展示 AI Chat / Outline / Timeline 等辅助视图。AI 输出仅作为建议，需人工采纳。</Typography.Paragraph>
              <Input.TextArea rows={5} placeholder="向当前上下文提问..." />
              <Button block type="primary" icon={<ThunderboltOutlined />}>发送到当前上下文</Button>
            </Card>
            <TreeSection
              title="OUTLINE"
              nodes={[
                { id: 'outline-chapter', label: '当前章节' },
                { id: 'outline-character', label: '相关角色' },
                { id: 'outline-world', label: '世界观规则' },
                { id: 'outline-plot', label: '未回收伏笔' }
              ]}
              onNavigate={() => undefined}
              onTreeDragStart={() => undefined}
              onFolderDrop={() => undefined}
              onFolderRename={() => undefined}
            />
          </Space>
        ) : null}
      </div>
    </aside>
  );
}

function BottomPanel({ visible, activeTab, onActiveTabChange, onToggle }: { visible: boolean; activeTab: PanelTabId; onActiveTabChange: (tab: PanelTabId) => void; onToggle: () => void }): React.JSX.Element {
  return (
    <section className={`bottom-panel ${visible ? '' : 'is-collapsed'}`} aria-label="底部面板">
      <div className="panel-tabbar">
        <Tabs
          size="small"
          activeKey={activeTab}
          onChange={(key) => onActiveTabChange(key as PanelTabId)}
          items={[
            { key: 'ai', label: 'AI 提示' },
            { key: 'characters', label: '角色条目' },
            { key: 'worlds', label: '世界观设定' },
            { key: 'plots', label: '线索条目' },
            { key: 'output', label: '输出' }
          ]}
        />
        <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={onToggle} />
      </div>
      <div className="panel-content">
        {visible ? <PanelContent activeTab={activeTab} /> : null}
      </div>
    </section>
  );
}

function PanelContent({ activeTab }: { activeTab: PanelTabId }): React.JSX.Element {
  if (activeTab === 'ai') return <Card size="small"><Typography.Text>AI 建议、校验提示和采纳记录会显示在这里。</Typography.Text></Card>;
  if (activeTab === 'characters') return <EntriesPage type="character" />;
  if (activeTab === 'worlds') return <EntriesPage type="world" />;
  if (activeTab === 'plots') return <EntriesPage type="plot" />;
  return <Card size="small"><pre className="panel-output">Workbench ready. Layout restored from local storage.</pre></Card>;
}

function StatusBar({
  selectedProject,
  panelVisible,
  secondaryVisible,
  onTogglePanel
}: {
  selectedProject?: ProjectManifest;
  panelVisible: boolean;
  secondaryVisible: boolean;
  onTogglePanel: () => void;
}): React.JSX.Element {
  return (
    <footer className="status-bar">
      <div className="status-left">
        <button>$(main)</button>
        <button>{selectedProject?.name ?? '未选择书目'}</button>
        <button>Ln 1, Col 1</button>
        <button>字数 0</button>
      </div>
      <div className="status-right">
        <button
          className={`status-toggle ${panelVisible ? 'is-on' : 'is-off'}`}
          onClick={onTogglePanel}
          aria-pressed={panelVisible}
          title={panelVisible ? '点击隐藏 Panel' : '点击显示 Panel'}
        >
          {panelVisible ? 'Panel 显示中' : 'Panel 已隐藏'}
        </button>
        <button>{secondaryVisible ? 'AI Chat 已停靠' : 'AI Chat 隐藏'}</button>
        <button>Markdown</button>
        <button>UTF-8</button>
      </div>
    </footer>
  );
}

function Sash({ direction, minSize, maxSize, defaultSize, currentSize, onChange, onReset, className }: SashProps): React.JSX.Element {
  const frameRef = useRef<number>();
  const effectiveSize = Number.isFinite(currentSize) ? currentSize : defaultSize;

  const onMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const start = direction === 'vertical' ? event.clientX : event.clientY;
    const startSize = effectiveSize;
    document.body.classList.add('is-resizing');

    const onMove = (moveEvent: MouseEvent): void => {
      const current = direction === 'vertical' ? moveEvent.clientX : moveEvent.clientY;
      const delta = direction === 'vertical' ? current - start : start - current;
      const nextSize = Math.min(Math.max(startSize + delta, minSize), maxSize);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(() => onChange(nextSize));
    };

    const onUp = (): void => {
      document.body.classList.remove('is-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [direction, effectiveSize, maxSize, minSize, onChange]);

  return (
    <div
      className={`workbench-sash sash-${direction} ${className ?? ''}`}
      role="separator"
      tabIndex={0}
      onMouseDown={onMouseDown}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (!event.altKey) return;
        if (direction === 'vertical' && event.key === 'ArrowRight') onChange(Math.min(currentSize + 10, maxSize));
        if (direction === 'vertical' && event.key === 'ArrowLeft') onChange(Math.max(currentSize - 10, minSize));
        if (direction === 'horizontal' && event.key === 'ArrowUp') onChange(Math.min(currentSize + 10, maxSize));
        if (direction === 'horizontal' && event.key === 'ArrowDown') onChange(Math.max(currentSize - 10, minSize));
      }}
      aria-orientation={direction === 'vertical' ? 'vertical' : 'horizontal'}
    />
  );
}

function WorkbenchWelcome({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <div className={`workbench-welcome ${compact ? 'compact' : ''}`}>
      <CodeOutlined />
      <Typography.Title level={compact ? 4 : 3}>可分割编辑器组</Typography.Title>
      <Typography.Paragraph type="secondary">拖拽 Tab 到边缘可扩展为分栏；Ctrl+\ 切换分割，Ctrl+B 切换侧栏，Ctrl+J 切换底部面板。</Typography.Paragraph>
    </div>
  );
}

function SearchPage(): React.JSX.Element {
  const keyword = useAppStore((state) => state.searchKeyword);
  const selectedProject = useAppStore((state) => state.selectedProject);
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    void window.hetuSketch.search.global({ projectId: selectedProject?.id, keyword, limit: 50 })
      .then(setItems)
      .finally(() => setLoading(false));
  }, [keyword, selectedProject?.id]);

  return (
    <Space direction="vertical" size="middle" className="page-stack workbench-page-stack">
      <Typography.Title level={2}>全局搜索</Typography.Title>
      <Typography.Paragraph type="secondary">关键词：{keyword || '未输入'}</Typography.Paragraph>
      <Card className="feature-card">
        <Space direction="vertical" className="full-width">
          {items.map((item) => <Tag key={item.id}>{typeLabel(item.type)} · {item.title}</Tag>)}
          {!loading && items.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无搜索结果" />}
        </Space>
      </Card>
    </Space>
  );
}

function currentDataPath(id: ActivityId): string {
  if (id === 'characters') return '/data/characters';
  if (id === 'worlds') return '/data/worlds';
  if (id === 'plots') return '/data/plots';
  if (id === 'editor') return '/workspace/editor';
  if (id === 'projects') return '/projects';
  if (id === 'settings') return '/settings';
  return '/search';
}

function sidebarTitle(id: ActivityId): string {
  return ({
    search: 'SEARCH',
    characters: 'CHARACTERS',
    worlds: 'WORLD SETTINGS',
    plots: 'PLOTS',
    editor: 'TEXT MANAGER',
    projects: 'BOOKS',
    settings: 'SETTINGS'
  } as const)[id];
}

function typeLabel(type: SearchResultItem['type']): string {
  return ({ project: '作品', character: '角色', world: '世界', plot: '线索' } as const)[type];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } as T : fallback;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}
