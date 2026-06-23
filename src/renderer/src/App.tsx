import {
  ApiOutlined,
  BranchesOutlined,
  CloseOutlined,
  CloudOutlined,
  CodeOutlined,
  DownloadOutlined,
  EditOutlined,
  FolderOpenOutlined,
  FontSizeOutlined,
  GlobalOutlined,
  InfoOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  MoreOutlined,
  PlusOutlined,
  PushpinOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  SettingOutlined,
  SplitCellsOutlined,
  SunOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined
} from '@ant-design/icons';
import { AutoComplete, Badge, Button, Card, Dropdown, Empty, Form, Input, Modal, Select, Space, Switch, Tabs, Tag, Tooltip, Typography, message } from 'antd';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ChapterExportFormat } from '@shared/ipc';
import type { EntryType, ProjectEntry, ProjectManifest, SearchResultItem } from '@shared/storageTypes';
// 页面按需加载：将各功能页拆分为独立 chunk，显著缩小主包体积，加快首屏
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const EntriesPage = lazy(() => import('./pages/EntriesPage').then((m) => ({ default: m.EntriesPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const QuickLookupPage = lazy(() => import('./pages/QuickLookupPage').then((m) => ({ default: m.QuickLookupPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const WritingStudioPage = lazy(() => import('./pages/WritingStudioPage').then((m) => ({ default: m.WritingStudioPage })));

function PageFallback(): React.JSX.Element {
  return <div className="page-suspense-fallback" role="status" aria-label="加载中">加载中…</div>;
}
import {
  deleteChapterNode,
  listChapterNodesForProject,
  migrateLegacyChapters,
  reorderChapterNode,
  type ChapterNode,
  type ChapterStatus,
  updateChapterNode
} from './chapterStorage';
import { useAppStore } from './store/appStore';
import { useWorkbenchLayout, type WorkbenchLayoutState } from './hooks/useWorkbenchLayout';

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
type EditorGroupId = 'main' | `secondary-${number}`;

interface DraggingEditorTab {
  groupId: EditorGroupId;
  key: EditorTabKey;
}

interface EditorOpenRequest {
  id: number;
  groupId: EditorGroupId;
  path: string;
  replace?: boolean;
}

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
  status?: ChapterStatus;
  readonly?: boolean;
  children?: TreeNodeItem[];
  /** 渲染为分组分隔线（忽略其他字段） */
  divider?: boolean;
  /** 节点前导图标 */
  icon?: React.ReactNode;
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
  const { layout, updateLayout } = useWorkbenchLayout(LAYOUT_STORAGE_KEY);
  const [activityOrder, setActivityOrder] = useState<string[]>(() => readArray<string>(ACTIVITY_STORAGE_KEY, [...ACTIVITY_DEFAULT_ORDER]).filter((id) => ACTIVITY_DEFAULT_ORDER.includes(id as ActivityId)));
  const [sidebarViewId, setSidebarViewId] = useState<ActivityId>(() => {
    const stored = readJson<ActivityId | undefined>(SIDEBAR_VIEW_STORAGE_KEY, undefined);
    return stored && (ACTIVITY_DEFAULT_ORDER as readonly string[]).includes(stored) ? stored : 'editor';
  });
  const [draggingActivityId, setDraggingActivityId] = useState<string>();
  const [activePanelTab, setActivePanelTab] = useState<PanelTabId>('ai');
  const [currentEditorGroupId, setCurrentEditorGroupId] = useState<EditorGroupId>('main');
  const [editorOpenRequest, setEditorOpenRequest] = useState<EditorOpenRequest>();

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
    void window.hetuSketch.projects.list().then(async (next) => {
      setProjects(next);
      setSelectedProject(useAppStore.getState().selectedProject ?? next[0]);
      try {
        const migration = await migrateLegacyChapters(next);
        if (migration.migrated) {
          useAppStore.getState().refreshSidebar();
        }
      } catch (err) {
        console.error('[HetuSketch] Failed to migrate legacy chapters:', err);
      }
    }).catch((err) => console.error('[HetuSketch] Failed to load projects:', err));
  }, [setSelectedProject]);

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
      plots: { id: 'plots', icon: <BranchesOutlined />, label: '灵感数据库', viewId: 'plots', badge: 1, path: '/data/plots' },
      editor: { id: 'editor', icon: <EditOutlined />, label: '文本管理', viewId: 'editor', path: '/workspace/editor' },
      projects: { id: 'projects', icon: <FolderOpenOutlined />, label: '书目管理', viewId: 'projects', path: '/projects' },
      settings: { id: 'settings', icon: <SettingOutlined />, label: '系统设置', viewId: 'settings', path: '/settings' }
    };
    return activityOrder
      .filter((id): id is ActivityId => id in base)
      .map((id, index) => ({ ...base[id], order: index, visible: true }));
  }, [activityOrder]);

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

  const openInCurrentEditorGroup = useCallback((path: string, replace = false) => {
    setEditorOpenRequest({ id: Date.now() + Math.random(), groupId: currentEditorGroupId, path, replace });
  }, [currentEditorGroupId]);

  const navigateInCurrentTab = useCallback((path: string) => openInCurrentEditorGroup(path, true), [openInCurrentEditorGroup]);
  const openInNewTab = useCallback((path: string) => openInCurrentEditorGroup(path, false), [openInCurrentEditorGroup]);

  if (location.pathname === '/quick-lookup') {
    return (
      <Suspense fallback={<PageFallback />}>
        <QuickLookupPage />
      </Suspense>
    );
  }

  return (
    <div
      className={`workbench-shell ${themeMode === 'light' ? 'theme-light' : ''}`}
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
        onOpenInNewTab={openInNewTab}
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
        verticalRatio={layout.editorVerticalRatio}
        gridRowRatio={layout.editorGridRowRatio}
        gridColumnRatio={layout.editorGridColumnRatio}
        currentGroupId={currentEditorGroupId}
        openRequest={editorOpenRequest}
        onOpenRequestHandled={() => setEditorOpenRequest(undefined)}
        onCurrentGroupChange={setCurrentEditorGroupId}
        onSplitModeChange={(editorSplit) => updateLayout({ editorSplit })}
        onVerticalRatioChange={(editorVerticalRatio) => updateLayout({ editorVerticalRatio })}
        onGridRowRatioChange={(editorGridRowRatio) => updateLayout({ editorGridRowRatio })}
        onGridColumnRatioChange={(editorGridColumnRatio) => updateLayout({ editorGridColumnRatio })}
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
        <Input prefix={<SearchOutlined />} onPressEnter={() => onNavigate(`/search?q=${encodeURIComponent(searchKeyword)}`)} placeholder="搜索角色、世界观规则、灵感条目..." allowClear />
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
  const entityTypeOf = (id: ActivityId): 'character' | 'world' | 'plot' | 'primary' => {
    if (id === 'characters') return 'character';
    if (id === 'worlds') return 'world';
    if (id === 'plots') return 'plot';
    return 'primary';
  };
  return (
    <nav className="activity-bar" aria-label="活动栏">
      <div className="activity-main">
        {mainItems.map((item) => (
          <Tooltip key={item.id} placement="right" title={item.label}>
            <button
              className={`activity-button ${activeId === item.id ? 'is-active' : ''} ${draggingId === item.id ? 'is-dragging' : ''}`}
              data-entity-type={entityTypeOf(item.id)}
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
          <button className="activity-button" data-entity-type="primary" aria-label="账户"><UserOutlined /></button>
        </Tooltip>
        {bottomItems.map((item) => (
          <Tooltip key={item.id} placement="right" title={item.label}>
            <button className={`activity-button ${activeId === item.id ? 'is-active' : ''}`} data-entity-type={entityTypeOf(item.id)} onClick={() => onOpen(item)} aria-label={item.label}>{item.icon}</button>
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
  onOpenInNewTab,
  onToggle
}: {
  visible: boolean;
  activeId: ActivityId;
  selectedProject?: ProjectManifest;
  searchKeyword: string;
  onSearchChange: (value: string) => void;
  onNavigate: (path: string) => void;
  onOpenInNewTab: (path: string) => void;
  onToggle: () => void;
}): React.JSX.Element {
  const [chapters, setChapters] = useState<ChapterNode[]>([]);
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [folders, setFolders] = useState<SidebarFolderState>(() => readJson(SIDEBAR_FOLDERS_STORAGE_KEY, {}));
  const [draggingTreeNode, setDraggingTreeNode] = useState<TreeDragState>();
  const [selectedTextNodeIds, setSelectedTextNodeIds] = useState<string[]>([]);
  const [exportDialog, setExportDialog] = useState<{ open: boolean; nodeIds: string[] }>({ open: false, nodeIds: [] });
  const [exportFormat, setExportFormat] = useState<ChapterExportFormat>('markdown');
  const [exportDirectory, setExportDirectory] = useState('');
  const [exporting, setExporting] = useState(false);
  const lastSelectedTextNodeIdRef = useRef<string>();
  const [folderForm] = Form.useForm<{ name: string }>();
  const sidebarRevision = useAppStore((state) => state.sidebarRevision);
  const updateTabNameMap = useAppStore((state) => state.updateTabNameMap);

  const reloadTreeData = useCallback((): void => {
    if (!selectedProject) {
      setChapters([]);
      setEntries([]);
      return;
    }

    void listChapterNodesForProject(selectedProject)
      .then((nextChapters) => {
        setChapters(nextChapters);
        if (activeId === 'characters' || activeId === 'worlds') {
          const type: EntryType = activeId === 'characters' ? 'character' : 'world';
          return window.hetuSketch.entries.list({ projectId: selectedProject.id, type, limit: 300 })
            .then((summaries) => {
              const nextEntries = summaries.map((item) => entrySummaryToProjectEntry(item, type));
              setEntries(nextEntries);
              updateTabNameMap(nextChapters, nextEntries);
            })
            .catch(() => {
              setEntries([]);
              updateTabNameMap(nextChapters, []);
            });
        }
        setEntries([]);
        updateTabNameMap(nextChapters, []);
        return undefined;
      })
      .catch(() => {
        setChapters([]);
        setEntries([]);
        updateTabNameMap([], []);
      });
  }, [activeId, selectedProject, sidebarRevision, updateTabNameMap]);

  useEffect(() => {
    reloadTreeData();
  }, [reloadTreeData]);

  useEffect(() => {
    writeJson(SIDEBAR_FOLDERS_STORAGE_KEY, folders);
  }, [folders]);

  useEffect(() => {
    if (activeId !== 'editor') {
      setSelectedTextNodeIds([]);
      lastSelectedTextNodeIdRef.current = undefined;
    }
  }, [activeId]);

  const folderType = activeId === 'characters' ? 'character' : activeId === 'worlds' ? 'world' : undefined;
  const createFolder = (): void => {
    if (!folderType) return;
    folderForm.setFieldsValue({ name: '新建分类' });
    let modal: ReturnType<typeof Modal.confirm>;
    modal = Modal.confirm({
      title: '新建文件夹',
      icon: null,
      content: (
        <Form form={folderForm} layout="vertical">
          <Form.Item name="name" label="文件夹名称" rules={[{ required: true, whitespace: true, message: '请输入文件夹名称' }]}>
            <Input autoFocus maxLength={40} />
          </Form.Item>
        </Form>
      ),
      okText: '创建',
      cancelText: '取消',
      onOk: async () => {
        const { name } = await folderForm.validateFields();
        const trimmedName = name.trim();
        const nextFolder: SidebarFolderNode = { id: `folder-${crypto.randomUUID().slice(0, 8)}`, name: trimmedName, entryIds: [], children: [] };
        setFolders((current) => ({ ...current, [folderType]: [...(current[folderType] ?? []), nextFolder] }));
        modal.destroy();
      }
    });
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
    void reorderChapterNode(selectedProject.id, chapters, sourceId, targetId, position)
      .then((nextChapters) => {
        setChapters(nextChapters);
        updateTabNameMap(nextChapters, entries);
        message.success(position === 'inside' ? '章节所属分卷已更新' : '文本结构已更新');
      })
      .catch((reason) => message.error(reason instanceof Error ? reason.message : '重排章节失败'));
    setDraggingTreeNode(undefined);
  };

  const selectableTextNodes = useMemo(() => chapters.filter((item) => item.kind === 'volume' || item.kind === 'chapter'), [chapters]);

  const handleTextNodeSelect = (node: TreeNodeItem, event: React.MouseEvent): void => {
    if (activeId !== 'editor' || (node.kind !== 'volume' && node.kind !== 'chapter')) return;
    const ids = selectableTextNodes.map((item) => item.id);
    setSelectedTextNodeIds((current) => {
      if (event.shiftKey && lastSelectedTextNodeIdRef.current) {
        const anchorIndex = ids.indexOf(lastSelectedTextNodeIdRef.current);
        const nodeIndex = ids.indexOf(node.id);
        if (anchorIndex >= 0 && nodeIndex >= 0) {
          const [start, end] = anchorIndex < nodeIndex ? [anchorIndex, nodeIndex] : [nodeIndex, anchorIndex];
          return ids.slice(start, end + 1);
        }
      }
      if (event.ctrlKey || event.metaKey) {
        return current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id];
      }
      return [node.id];
    });
    lastSelectedTextNodeIdRef.current = node.id;
  };

  const handleTextNodeContextMenu = (node: TreeNodeItem): void => {
    if (activeId !== 'editor' || (node.kind !== 'volume' && node.kind !== 'chapter')) return;
    setSelectedTextNodeIds((current) => current.includes(node.id) ? current : [node.id]);
    lastSelectedTextNodeIdRef.current = node.id;
  };

  const textExportChapters = useMemo(() => {
    const selectedIds = new Set(exportDialog.nodeIds);
    return selectableTextNodes
      .filter((item) => item.kind === 'chapter' && selectedIds.has(item.id))
      .map((item) => ({ title: item.title, content: item.content, order: item.order }));
  }, [exportDialog.nodeIds, selectableTextNodes]);

  const openExportDialog = (nodeIds: string[]): void => {
    const selectedIds = new Set(nodeIds);
    const chapterIds = selectableTextNodes.filter((item) => item.kind === 'chapter' && selectedIds.has(item.id)).map((item) => item.id);
    if (chapterIds.length === 0) {
      message.warning('请选择章节进行导出');
      return;
    }
    setExportFormat('markdown');
    setExportDialog({ open: true, nodeIds: chapterIds });
  };

  const chooseExportDirectory = (): void => {
    void window.hetuSketch.chapters.selectExportFolder()
      .then((directory) => {
        if (directory) setExportDirectory(directory);
      })
      .catch((reason) => {
        const detail = reason instanceof Error ? reason.message : '未知错误';
        message.error(`无法打开系统文件浏览器：${detail}`);
      });
  };

  const confirmExport = (): void => {
    if (!exportDirectory) {
      message.warning('请先选择导出文件夹');
      return;
    }
    if (textExportChapters.length === 0) {
      message.warning('没有可导出的章节');
      return;
    }
    setExporting(true);
    const hide = message.loading('正在导出章节…', 0);
    void window.hetuSketch.chapters.export({
      format: exportFormat,
      outputDirectory: exportDirectory,
      chapters: textExportChapters
    }).then((result) => {
      hide();
      setExporting(false);
      setExportDialog({ open: false, nodeIds: [] });
      message.success(`导出完成：${result.destinationPath}`);
    }).catch((reason) => {
      hide();
      setExporting(false);
      message.error(reason instanceof Error ? reason.message : '导出失败，请检查文件夹权限或磁盘空间');
    });
  };

  const deleteTextNodes = (nodeIds: string[]): void => {
    if (!selectedProject) return;
    const deletable = nodeIds
      .map((id) => chapters.find((item) => item.id === id))
      .filter((item): item is ChapterNode => item !== undefined)
      .filter((item) => item.kind === 'volume' || item.kind === 'chapter');
    if (deletable.length === 0) return;
    const volumeIds = new Set(deletable.filter((item) => item.kind === 'volume').map((item) => item.id));
    const targets = deletable.filter((item) => item.kind === 'volume' || !volumeIds.has(item.parentId ?? item.volumeId ?? ''));
    const hasVolume = targets.some((item) => item.kind === 'volume');
    Modal.confirm({
      rootClassName: 'theme-aware-modal',
      title: targets.length > 1 ? `确认删除 ${targets.length} 个文本节点？` : `确认删除“${targets[0].title}”？`,
      content: hasVolume ? '删除分卷时，该分卷下的所有章节也将一并删除' : '删除后无法恢复，请确认是否继续。',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await Promise.all(targets.map((item) => deleteChapterNode(item)));
          const nextChapters = await listChapterNodesForProject(selectedProject);
          setChapters(nextChapters);
          setSelectedTextNodeIds((current) => current.filter((id) => nextChapters.some((item) => item.id === id)));
          updateTabNameMap(nextChapters, entries);
          message.success(targets.length > 1 ? '已批量删除文本节点' : '已删除文本节点');
        } catch (reason) {
          message.error(reason instanceof Error ? reason.message : '删除文本节点失败');
        }
      }
    });
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
    if (node.kind === 'chapter' || node.kind === 'volume' || node.kind === 'book') {
      const chapter = chapters.find((item) => item.id === node.id);
      if (chapter) {
        void updateChapterNode(chapter, { title: label })
          .then(() => listChapterNodesForProject(selectedProject))
          .then((nextChapters) => {
            setChapters(nextChapters);
            updateTabNameMap(nextChapters, entries);
          })
          .catch((reason) => message.error(reason instanceof Error ? reason.message : '重命名章节失败'));
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
          selectedTextNodeIds={selectedTextNodeIds}
          onTextNodeSelect={handleTextNodeSelect}
          onTextNodeContextMenu={handleTextNodeContextMenu}
          onExportTextNodes={openExportDialog}
          onDeleteTextNodes={deleteTextNodes}
          onTreeDragStart={setDraggingTreeNode}
          onFolderDrop={handleFolderDrop}
          onFolderRename={renameFolder}
          onNodeRename={handleNodeRename}
          onChapterReorder={handleChapterReorder}
          onNavigate={onNavigate}
          onOpenInNewTab={onOpenInNewTab}
        />
        {activeId === 'search' && <Button block className="sidebar-search-action" onClick={() => onNavigate(`/search?q=${encodeURIComponent(searchKeyword)}`)}>打开搜索结果</Button>}
      </div>
      <Modal
        className="theme-aware-modal chapter-export-modal"
        rootClassName="theme-aware-modal chapter-export-modal-root"
        title="导出章节"
        open={exportDialog.open}
        onOk={confirmExport}
        okText="确认导出"
        cancelText="取消"
        confirmLoading={exporting}
        onCancel={() => setExportDialog({ open: false, nodeIds: [] })}
      >
        <div className="chapter-export-panel">
          <div className="chapter-export-summary">将导出 {textExportChapters.length} 个章节</div>
          <div className="chapter-export-field">
            <span className="chapter-export-label">导出格式</span>
            <Select<ChapterExportFormat>
              value={exportFormat}
              onChange={setExportFormat}
              options={[
                { value: 'markdown', label: 'Markdown（合并为单个 .md 文件）' },
                { value: 'txt', label: 'TXT（合并为单个 .txt 文件）' },
                { value: 'zip', label: 'ZIP（分别导出章节并压缩）', disabled: textExportChapters.length <= 1 }
              ]}
            />
          </div>
          <div className="chapter-export-field">
            <span className="chapter-export-label">导出路径</span>
            <Space.Compact className="chapter-export-path">
              <Input value={exportDirectory} placeholder="请选择导出文件夹" readOnly />
              <Button onClick={chooseExportDirectory}>选择文件夹</Button>
            </Space.Compact>
          </div>
        </div>
      </Modal>
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
  selectedTextNodeIds,
  onTextNodeSelect,
  onTextNodeContextMenu,
  onExportTextNodes,
  onDeleteTextNodes,
  onTreeDragStart,
  onFolderDrop,
  onFolderRename,
  onNodeRename,
  onChapterReorder,
  onNavigate,
  onOpenInNewTab
}: {
  activeId: ActivityId;
  selectedProject?: ProjectManifest;
  chapters: ChapterNode[];
  entries: ProjectEntry[];
  folders: SidebarFolderState;
  draggingTreeNode?: TreeDragState;
  selectedTextNodeIds?: string[];
  onTextNodeSelect?: (node: TreeNodeItem, event: React.MouseEvent) => void;
  onTextNodeContextMenu?: (node: TreeNodeItem) => void;
  onExportTextNodes?: (nodeIds: string[]) => void;
  onDeleteTextNodes?: (nodeIds: string[]) => void;
  onTreeDragStart: (node?: TreeDragState) => void;
  onFolderDrop: (folderId: string) => void;
  onFolderRename: (folderId: string, name: string) => void;
  onNodeRename?: (node: TreeNodeItem, newLabel: string) => void;
  onChapterReorder?: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  onNavigate: (path: string) => void;
  onOpenInNewTab: (path: string) => void;
}): React.JSX.Element {
  const location = useLocation();
  const selectedId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (activeId === 'editor') return params.get('chapter') ?? undefined;
    if (activeId === 'characters' || activeId === 'worlds') return params.get('entry') ?? params.get('folder') ?? undefined;
    if (activeId === 'settings') return params.get('section') ? `settings-${params.get('section')}` : undefined;
    return undefined;
  }, [activeId, location.search]);

  if (activeId === 'editor') {
    return <TreeSection title="TEXT STRUCTURE" nodes={chapterTreeNodes(selectedProject, chapters)} selectedId={selectedId} selectedTextNodeIds={selectedTextNodeIds} onTextNodeSelect={onTextNodeSelect} onTextNodeContextMenu={onTextNodeContextMenu} onExportTextNodes={onExportTextNodes} onDeleteTextNodes={onDeleteTextNodes} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} onChapterReorder={onChapterReorder} />;
  }
  if (activeId === 'characters') {
    return <TreeSection title="CHARACTERS" nodes={entryTreeNodes('character', entries, folders.character ?? [], selectedProject)} selectedId={selectedId} draggingTreeNode={draggingTreeNode} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  if (activeId === 'worlds') {
    return <TreeSection title="WORLDBUILDING" nodes={entryTreeNodes('world', entries, folders.world ?? [], selectedProject)} selectedId={selectedId} draggingTreeNode={draggingTreeNode} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  if (activeId === 'plots') {
    return <TreeSection title="INSPIRATION DATABASE" nodes={plotTreeNodes()} selectedId={selectedId} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  if (activeId === 'projects') {
    return <TreeSection title="BOOKS" nodes={[{ id: 'books-local', label: '本地书目', path: '/projects' }, { id: 'books-import', label: '导入导出', path: '/projects' }, { id: 'books-binding', label: '绑定设定集', path: '/projects' }]} selectedId={selectedId} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  if (activeId === 'settings') {
    return <TreeSection title="SETTINGS" nodes={[
      { id: 'settings-ai', label: 'AI 服务', path: '/settings?section=ai', icon: <CloudOutlined /> },
      { id: 'settings-divider-1', label: '', divider: true },
      { id: 'settings-general', label: '通用', path: '/settings?section=general', icon: <SettingOutlined /> },
      { id: 'settings-display', label: '显示', path: '/settings?section=display', icon: <FontSizeOutlined /> },
      { id: 'settings-divider-2', label: '', divider: true },
      { id: 'settings-agents', label: '智能体', path: '/settings?section=agents', icon: <RobotOutlined /> },
      { id: 'settings-skills', label: '技能开关', path: '/settings?section=skills', icon: <ThunderboltOutlined /> },
      { id: 'settings-tools', label: 'HTTP 工具', path: '/settings?section=tools', icon: <ApiOutlined /> },
      { id: 'settings-divider-3', label: '', divider: true },
      { id: 'settings-about', label: '关于', path: '/settings?section=about', icon: <InfoOutlined /> }
    ]} selectedId={selectedId} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
  }
  return <TreeSection title="SEARCH" nodes={[{ id: 'search-global', label: '全局搜索', path: '/search' }]} selectedId={selectedId} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} />;
}

interface TreeInteractionProps {
  selectedId?: string;
  draggingTreeNode?: TreeDragState;
  selectedTextNodeIds?: string[];
  onTextNodeSelect?: (node: TreeNodeItem, event: React.MouseEvent) => void;
  onTextNodeContextMenu?: (node: TreeNodeItem) => void;
  onExportTextNodes?: (nodeIds: string[]) => void;
  onDeleteTextNodes?: (nodeIds: string[]) => void;
  onNavigate: (path: string) => void;
  onOpenInNewTab: (path: string) => void;
  onTreeDragStart: (node?: TreeDragState) => void;
  onFolderDrop: (folderId: string) => void;
  onFolderRename: (folderId: string, name: string) => void;
  onNodeRename?: (node: TreeNodeItem, newLabel: string) => void;
  onChapterReorder?: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
}

function TreeSection({ title, nodes, ...interactions }: { title: string; nodes: TreeNodeItem[] } & TreeInteractionProps): React.JSX.Element {
  return (
    <section className="sidebar-section">
      <div className="sidebar-section-title">{title}</div>
      <TreeNodeList nodes={nodes} level={0} {...interactions} />
    </section>
  );
}

function TreeNodeList({ nodes, level, ...interactions }: { nodes: TreeNodeItem[]; level: number } & TreeInteractionProps): React.JSX.Element {
  return (
    <div className="tree-node-list" role={level === 0 ? 'tree' : 'group'}>
      {nodes.map((node) => node.divider ? <div key={node.id} className="tree-divider" role="separator" /> : <TreeNode key={node.id} node={node} level={level} {...interactions} />)}
    </div>
  );
}

function TreeNode({ node, level, selectedId, draggingTreeNode, selectedTextNodeIds = [], onTextNodeSelect, onTextNodeContextMenu, onExportTextNodes, onDeleteTextNodes, onNavigate, onOpenInNewTab, onTreeDragStart, onFolderDrop, onFolderRename, onNodeRename, onChapterReorder }: { node: TreeNodeItem; level: number } & TreeInteractionProps): React.JSX.Element {
  const hasChildren = Boolean(node.children?.length);
  const [expanded, setExpanded] = useState(level < 1);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside'>();
  const isTextNode = node.kind === 'volume' || node.kind === 'chapter';
  const isSelected = selectedId === node.id || (isTextNode && selectedTextNodeIds.includes(node.id));
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
    onOpenInNewTab(node.path);
  };

  const handleClick = (event: React.MouseEvent): void => {
    if (isTextNode) {
      onTextNodeSelect?.(node, event);
      if (event.shiftKey || event.ctrlKey || event.metaKey) return;
    }
    onClick();
  };

  const selectedActionIds = (): string[] => (isTextNode && selectedTextNodeIds.includes(node.id) ? selectedTextNodeIds : [node.id]);

  const exportSelection = (): void => {
    onExportTextNodes?.(selectedActionIds());
  };

  const deleteSelection = (): void => {
    onDeleteTextNodes?.(selectedActionIds());
  };

  const menuItems = [
    ...(shouldNavigate && node.path
      ? [
          { key: 'open-current', label: '打开', onClick },
          { key: 'open-new', label: '在新页面打开', onClick: openInNewPage }
        ]
      : [{ key: 'open-current', label: '打开', onClick }]),
    ...(node.kind === 'chapter' && onExportTextNodes ? [{ key: 'export', icon: <DownloadOutlined />, label: '导出', onClick: exportSelection }] : []),
    ...(isTextNode && onDeleteTextNodes ? [{ key: 'delete', label: '删除', danger: true, onClick: deleteSelection }] : [])
  ];

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
        menu={{ items: menuItems }}
      >
        <button
          className={`tree-row tree-row-${node.kind ?? 'item'} ${isSelected ? 'is-selected' : ''} ${isReadonly ? 'is-readonly' : ''}`}
          data-entity-type={node.entryType}
          draggable={node.kind === 'entry' || (node.kind === 'folder' && !node.readonly) || node.kind === 'chapter' || node.kind === 'volume'}
          style={{ '--tree-level': level } as React.CSSProperties}
          title={node.label}
          onClick={handleClick}
          onContextMenu={() => onTextNodeContextMenu?.(node)}
          onDoubleClick={startEdit}
          onDragStart={() => onTreeDragStart({ nodeId: node.id, nodeKind: node.kind, entryType: node.entryType })}
          onDragEnd={() => onTreeDragStart(undefined)}
        >
          <span className={`tree-twist ${expanded ? 'is-expanded' : ''}`}>{hasChildren || node.kind === 'folder' ? '▸' : (node.icon ? '' : '·')}</span>
          {node.kind === 'chapter' && node.status ? <span className="tree-status-dot" data-chapter-status={node.status} aria-hidden="true" /> : null}
          {node.icon ? <span className="tree-icon">{node.icon}</span> : null}
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
      {(hasChildren || node.kind === 'folder') && expanded ? <TreeNodeList nodes={node.children ?? []} level={level + 1} selectedId={selectedId} draggingTreeNode={draggingTreeNode} selectedTextNodeIds={selectedTextNodeIds} onTextNodeSelect={onTextNodeSelect} onTextNodeContextMenu={onTextNodeContextMenu} onExportTextNodes={onExportTextNodes} onDeleteTextNodes={onDeleteTextNodes} onNavigate={onNavigate} onOpenInNewTab={onOpenInNewTab} onTreeDragStart={onTreeDragStart} onFolderDrop={onFolderDrop} onFolderRename={onFolderRename} onNodeRename={onNodeRename} onChapterReorder={onChapterReorder} /> : null}
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
      status: item.status,
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

function entrySummaryToProjectEntry(item: SearchResultItem, type: 'character' | 'world'): ProjectEntry {
  const base = {
    id: item.id,
    projectId: item.projectId,
    type,
    title: item.title,
    summary: item.excerpt,
    content: '',
    tags: [],
    relations: [],
    customFields: {},
    createdAt: item.updatedAt,
    updatedAt: item.updatedAt,
    format: 'json' as const
  };
  return type === 'character'
    ? { ...base, type: 'character', role: 'other', personalityTags: [], redLines: [] }
    : { ...base, type: 'world', category: 'other', rules: [] };
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
    { id: 'plot-open', label: '待整理灵感', path: '/data/plots?status=open' },
    { id: 'plot-closed', label: '已使用灵感', path: '/data/plots?status=resolved' }
  ];
}

function EditorWorkbench({
  splitMode,
  verticalRatio,
  gridRowRatio,
  gridColumnRatio,
  currentGroupId,
  openRequest,
  onOpenRequestHandled,
  onCurrentGroupChange,
  onSplitModeChange,
  onVerticalRatioChange,
  onGridRowRatioChange,
  onGridColumnRatioChange
}: {
  splitMode: WorkbenchLayoutState['editorSplit'];
  verticalRatio: number;
  gridRowRatio: number;
  gridColumnRatio: number;
  currentGroupId: EditorGroupId;
  openRequest?: EditorOpenRequest;
  onOpenRequestHandled: () => void;
  onCurrentGroupChange: (groupId: EditorGroupId) => void;
  onSplitModeChange: (mode: WorkbenchLayoutState['editorSplit']) => void;
  onVerticalRatioChange: (ratio: number) => void;
  onGridRowRatioChange: (ratio: number) => void;
  onGridColumnRatioChange: (ratio: number) => void;
}): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = `${location.pathname}${location.search}`;
  const previousActivePathRef = useRef(activePath);
  const areaRef = useRef<HTMLElement>(null);
  const [tabs, setTabs] = useState<EditorTab[]>(() => readArray<EditorTab>(OPEN_TABS_STORAGE_KEY, [
    { key: '/dashboard', title: '总览', path: '/dashboard', dirty: false },
    { key: '/workspace/editor', title: '文本编辑器', path: '/workspace/editor', dirty: false }
  ]));
  const [draggingTab, setDraggingTab] = useState<DraggingEditorTab>();
  const [tabDropTarget, setTabDropTarget] = useState<DraggingEditorTab>();
  const suppressedMainPathRef = useRef<string>();
  const newTabSequenceRef = useRef(0);
  const [secondaryGroups, setSecondaryGroups] = useState<SecondaryGroupState[]>(() => readSecondaryGroups());
  const secondaryCount = splitMode === 'grid' ? 2 : splitMode === 'vertical' ? 1 : 0;
  const visibleSecondaryGroups = secondaryGroups.slice(0, secondaryCount);
  const visibleGroupCount = (tabs.length > 0 ? 1 : 0) + visibleSecondaryGroups.filter((group) => group.tabs.length > 0).length;
  const gridClass = visibleGroupCount <= 1 ? 'grid-1x1' : splitMode === 'grid' && visibleGroupCount >= 3 ? 'grid-1-over-2' : 'grid-1x2';
  const hasVisibleTabs = visibleGroupCount > 0;
  const tabNameMap = useAppStore((state) => state.tabNameMap);

  const updateSecondaryGroup = useCallback((index: number, updater: (group: SecondaryGroupState) => SecondaryGroupState): void => {
    setSecondaryGroups((current) => current.map((group, i) => (i === index ? updater(group) : group)));
  }, []);

  const ensureSecondaryGroupTab = useCallback((index: number): void => {
    updateSecondaryGroup(index, (group) => {
      if (group.tabs.length > 0) return group;
      const tab = createTabFromPath('/dashboard');
      return { tabs: [tab], activeKey: tab.key, draggingTabKey: undefined };
    });
  }, [updateSecondaryGroup]);

  useEffect(() => {
    setTabs((current) => current.map((tab) => {
      if (tab.titleSource === 'custom') return tab;
      const next = createTabFromPath(tab.path);
      return next.title === tab.title ? tab : { ...tab, title: next.title };
    }));
    setSecondaryGroups((current) => current.map((group) => ({
      ...group,
      tabs: group.tabs.map((tab) => {
        if (tab.titleSource === 'custom') return tab;
        const next = createTabFromPath(tab.path);
        return next.title === tab.title ? tab : { ...tab, title: next.title };
      })
    })));
  }, [tabNameMap]);

  useEffect(() => {
    if (tabs.length === 0 || currentGroupId !== 'main' || draggingTab) return;
    const previous = previousActivePathRef.current;
    setTabs((current) => {
      if (current.length === 0 || current.some((tab) => tab.key === activePath)) return current;
      if (suppressedMainPathRef.current === activePath) return current;
      const nextTab = createTabFromPath(activePath);
      if (location.state?.replaceTab && current.some((tab) => tab.key === previous)) {
        return current.map((tab) => tab.key === previous ? nextTab : tab);
      }
      return [...current, nextTab];
    });
    previousActivePathRef.current = activePath;
  }, [activePath, currentGroupId, draggingTab, location.state, tabs.length]);

  useEffect(() => {
    writeJson(OPEN_TABS_STORAGE_KEY, tabs);
  }, [tabs]);

  useEffect(() => {
    writeJson(SECONDARY_GROUPS_STORAGE_KEY, secondaryGroups);
  }, [secondaryGroups]);

  useEffect(() => {
    const visibleGroups: EditorGroupId[] = [];
    if (tabs.length > 0) visibleGroups.push('main');
    if (secondaryCount >= 1 && secondaryGroups[0]?.tabs.length > 0) visibleGroups.push('secondary-0');
    if (secondaryCount >= 2 && secondaryGroups[1]?.tabs.length > 0) visibleGroups.push('secondary-1');
    if (visibleGroups.length > 0 && !visibleGroups.includes(currentGroupId)) {
      onCurrentGroupChange(visibleGroups[0]);
    }
  }, [currentGroupId, onCurrentGroupChange, secondaryCount, secondaryGroups, tabs.length]);

  useEffect(() => {
    if (!openRequest) return;
    const visibleGroups: EditorGroupId[] = [];
    if (tabs.length > 0) visibleGroups.push('main');
    if (secondaryCount >= 1 && secondaryGroups[0]?.tabs.length > 0) visibleGroups.push('secondary-0');
    if (secondaryCount >= 2 && secondaryGroups[1]?.tabs.length > 0) visibleGroups.push('secondary-1');
    const targetGroupId = visibleGroups.includes(openRequest.groupId) ? openRequest.groupId : visibleGroups[0] ?? 'main';
    const tab = createTabFromPath(openRequest.path);
    if (targetGroupId === 'main') {
      suppressedMainPathRef.current = undefined;
      setTabs((current) => {
        if (openRequest.replace && current.some((item) => item.key === activePath)) {
          return current.map((item) => item.key === activePath ? tab : item);
        }
        if (current.some((item) => item.key === tab.key)) return current;
        return [...current, tab];
      });
      navigate(tab.path);
      onCurrentGroupChange('main');
      onOpenRequestHandled();
      return;
    }
    const index = Number(targetGroupId.replace('secondary-', ''));
    updateSecondaryGroup(index, (group) => {
      if (openRequest.replace && group.tabs.some((item) => item.key === group.activeKey)) {
        return { ...group, tabs: group.tabs.map((item) => item.key === group.activeKey ? tab : item), activeKey: tab.key, draggingTabKey: undefined };
      }
      if (group.tabs.some((item) => item.key === tab.key)) return { ...group, activeKey: tab.key, draggingTabKey: undefined };
      return { ...group, tabs: [...group.tabs, tab], activeKey: tab.key, draggingTabKey: undefined };
    });
    onCurrentGroupChange(targetGroupId);
    onOpenRequestHandled();
  }, [activePath, navigate, onCurrentGroupChange, onOpenRequestHandled, openRequest, secondaryCount, secondaryGroups, tabs.length, updateSecondaryGroup]);

  const closeTab = (key: EditorTabKey): void => {
    setTabs((current) => {
      const next = current.filter((item) => item.key !== key);
      if (key === activePath && next.length > 0) {
        navigate(next[Math.max(0, current.findIndex((tab) => tab.key === key) - 1)]?.path ?? next[next.length - 1].path);
      }
      return next;
    });
  };

  const renameTab = (key: EditorTabKey, title: string): void => {
    setTabs((current) => current.map((tab) => tab.key === key ? { ...tab, title, titleSource: 'custom' } : tab));
  };

  const moveDraggingTab = (targetGroupId: EditorGroupId, targetKey?: string): void => {
    if (!draggingTab) return;
    if (draggingTab.groupId === targetGroupId && draggingTab.key === targetKey) return;

    const groups: Record<EditorGroupId, EditorTab[]> = {
      main: [...tabs],
      'secondary-0': [...(secondaryGroups[0]?.tabs ?? [])],
      'secondary-1': [...(secondaryGroups[1]?.tabs ?? [])]
    };
    const sourceTabs = groups[draggingTab.groupId];
    const movingTab = sourceTabs.find((tab) => tab.key === draggingTab.key);
    if (!movingTab) return;
    if (draggingTab.groupId === 'main' && targetGroupId !== 'main') {
      suppressedMainPathRef.current = movingTab.path;
    }
    if (targetGroupId === 'main') {
      suppressedMainPathRef.current = undefined;
    }

    groups[draggingTab.groupId] = sourceTabs.filter((tab) => tab.key !== draggingTab.key);
    const targetTabs = groups[targetGroupId].filter((tab) => tab.key !== movingTab.key);
    const insertIndex = targetKey ? targetTabs.findIndex((tab) => tab.key === targetKey) : -1;
    targetTabs.splice(insertIndex >= 0 ? insertIndex : targetTabs.length, 0, movingTab);
    groups[targetGroupId] = targetTabs;

    setTabs(groups.main);
    setSecondaryGroups((current) => current.map((group, index) => {
      const groupId = `secondary-${index}` as EditorGroupId;
      const nextTabs = groups[groupId] ?? [];
      const activeKey = groupId === targetGroupId
        ? movingTab.key
        : nextTabs.some((tab) => tab.key === group.activeKey) ? group.activeKey : nextTabs[0]?.key ?? '';
      return { ...group, tabs: nextTabs, activeKey, draggingTabKey: undefined };
    }));
    if (targetGroupId === 'main') navigate(movingTab.path);
    onCurrentGroupChange(targetGroupId);
    setDraggingTab(undefined);
    setTabDropTarget(undefined);
  };

  const openPathInGroup = (groupId: EditorGroupId, path: string): void => {
    const tab = createTabFromPath(path);
    if (groupId === 'main') {
      suppressedMainPathRef.current = undefined;
      setTabs((current) => current.some((item) => item.key === tab.key) ? current : [...current, tab]);
      navigate(tab.path);
      onCurrentGroupChange('main');
      return;
    }
    const index = Number(groupId.replace('secondary-', ''));
    updateSecondaryGroup(index, (group) => {
      if (group.tabs.some((item) => item.key === tab.key)) return { ...group, activeKey: tab.key, draggingTabKey: undefined };
      return { ...group, tabs: [...group.tabs, tab], activeKey: tab.key, draggingTabKey: undefined };
    });
    onCurrentGroupChange(groupId);
  };

  const createBlankTabPath = (): string => {
    newTabSequenceRef.current += 1;
    return `/workspace/editor?untitled=${Date.now()}-${newTabSequenceRef.current}`;
  };

  const toggleSplitMode = (): void => {
    if (visibleGroupCount >= 3) {
      message.info('已达到最大标签组数量');
      return;
    }
    const hasMainGroup = tabs.length > 0;
    const hasFirstSecondaryGroup = (secondaryGroups[0]?.tabs.length ?? 0) > 0;
    const hasSecondSecondaryGroup = (secondaryGroups[1]?.tabs.length ?? 0) > 0;
    if (!hasMainGroup) {
      openPathInGroup('main', '/dashboard');
      onSplitModeChange(hasFirstSecondaryGroup || hasSecondSecondaryGroup ? 'grid' : 'single');
      return;
    }
    if (!hasFirstSecondaryGroup) {
      ensureSecondaryGroupTab(0);
      onSplitModeChange(hasSecondSecondaryGroup ? 'grid' : 'vertical');
      return;
    }
    if (!hasSecondSecondaryGroup) {
      ensureSecondaryGroupTab(1);
      onSplitModeChange('grid');
      return;
    }
    message.info('已达到最大标签组数量');
  };

  const createEditorActions = (groupId: EditorGroupId): ReactNode => (
    <Space size={4}>
      <Button size="small" icon={<SplitCellsOutlined />} onClick={toggleSplitMode}>分割</Button>
      <Button size="small" icon={<PlusOutlined />} onClick={() => openPathInGroup(groupId, createBlankTabPath())}>新建</Button>
    </Space>
  );

  return (
    <main
      ref={areaRef}
      className={`editor-area ${gridClass} ${hasVisibleTabs ? '' : 'is-empty'}`}
      style={{
        '--editor-vertical-ratio': verticalRatio,
        '--editor-grid-row-ratio': gridRowRatio,
        '--editor-grid-column-ratio': gridColumnRatio
      } as React.CSSProperties}
      aria-label="编辑器区域"
    >
      {hasVisibleTabs ? null : (
        <WorkbenchWelcome
          actions={createEditorActions(currentGroupId)}
        />
      )}
      {tabs.length > 0 && (
      <EditorGroup
        title="主编辑器组"
        groupId="main"
        activeKey={activePath}
        currentGroupId={currentGroupId}
        tabs={tabs}
        draggingTabKey={draggingTab?.groupId === 'main' ? draggingTab.key : undefined}
        isDragTarget={draggingTab !== undefined}
        onFocusGroup={onCurrentGroupChange}
        onNavigate={(path) => {
          suppressedMainPathRef.current = undefined;
          onCurrentGroupChange('main');
          navigate(path);
        }}
        onCloseTab={closeTab}
        onRenameTab={renameTab}
        onDragTabStart={(key) => setDraggingTab({ groupId: 'main', key })}
        onDragTabEnter={(key) => setTabDropTarget({ groupId: 'main', key })}
        onDropTab={() => moveDraggingTab(tabDropTarget?.groupId ?? 'main', tabDropTarget?.key)}
        onDragTabEnd={() => {
          setDraggingTab(undefined);
          setTabDropTarget(undefined);
        }}
        actions={createEditorActions('main')}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/workspace/editor" replace />} />
          <Route path="/dashboard" element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} />
          <Route path="/workspace/data" element={<Navigate to="/data/characters" replace />} />
          <Route path="/data/characters" element={<Suspense fallback={<PageFallback />}><CharactersDataPage /></Suspense>} />
          <Route path="/data/worlds" element={<Suspense fallback={<PageFallback />}><WorldSettingsDataPage /></Suspense>} />
          <Route path="/data/plots" element={<Suspense fallback={<PageFallback />}><LimitedDatabasePage /></Suspense>} />
          <Route path="/workspace/editor" element={<Suspense fallback={<PageFallback />}><TextEditorWorkspacePage /></Suspense>} />
          <Route path="/setting-sets" element={<Navigate to="/data/characters" replace />} />
          <Route path="/characters" element={<Navigate to="/data/characters" replace />} />
          <Route path="/worlds" element={<Navigate to="/data/worlds" replace />} />
          <Route path="/plots" element={<Navigate to="/data/plots" replace />} />
          <Route path="/studio" element={<Navigate to="/workspace/editor" replace />} />
          <Route path="/checks" element={<Navigate to="/workspace/editor" replace />} />
          <Route path="/projects" element={<Suspense fallback={<PageFallback />}><ProjectsPage /></Suspense>} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
        </Routes>
      </EditorGroup>
      )}
      {gridClass === 'grid-1x2' && visibleGroupCount >= 2 && (
        <EditorSplitSash
          direction="vertical"
          areaRef={areaRef}
          onRatioChange={onVerticalRatioChange}
        />
      )}
      {gridClass === 'grid-1-over-2' && (
        <EditorSplitSash
          direction="horizontal"
          areaRef={areaRef}
          onRatioChange={onGridRowRatioChange}
        />
      )}
      {gridClass === 'grid-1-over-2' && secondaryGroups[0]?.tabs.length > 0 && secondaryGroups[1]?.tabs.length > 0 && (
        <EditorSplitSash
          direction="vertical"
          areaRef={areaRef}
          onRatioChange={onGridColumnRatioChange}
          lowerOnly
        />
      )}
      {secondaryCount >= 1 && secondaryGroups[0]?.tabs.length > 0 && (
        <SecondaryEditorGroup
          title="辅助编辑器组"
          groupId="secondary-0"
          currentGroupId={currentGroupId}
          groupState={secondaryGroups[0]}
          onCurrentGroupChange={onCurrentGroupChange}
          onGroupChange={(updater) => updateSecondaryGroup(0, updater)}
          draggingTab={draggingTab}
          onDragTabStart={setDraggingTab}
          onDragTabMove={(targetGroupId, targetKey) => setTabDropTarget({ groupId: targetGroupId, key: targetKey ?? '' })}
          onDropTab={(targetGroupId) => moveDraggingTab(tabDropTarget?.groupId ?? targetGroupId, tabDropTarget?.key || undefined)}
          onDragTabEnd={() => {
            setDraggingTab(undefined);
            setTabDropTarget(undefined);
          }}
          actions={createEditorActions('secondary-0')}
        />
      )}
      {secondaryCount >= 2 && secondaryGroups[1]?.tabs.length > 0 && (
        <SecondaryEditorGroup
          title="参考编辑器组"
          groupId="secondary-1"
          currentGroupId={currentGroupId}
          groupState={secondaryGroups[1]}
          onCurrentGroupChange={onCurrentGroupChange}
          onGroupChange={(updater) => updateSecondaryGroup(1, updater)}
          draggingTab={draggingTab}
          onDragTabStart={setDraggingTab}
          onDragTabMove={(targetGroupId, targetKey) => setTabDropTarget({ groupId: targetGroupId, key: targetKey ?? '' })}
          onDropTab={(targetGroupId) => moveDraggingTab(tabDropTarget?.groupId ?? targetGroupId, tabDropTarget?.key || undefined)}
          onDragTabEnd={() => {
            setDraggingTab(undefined);
            setTabDropTarget(undefined);
          }}
          actions={createEditorActions('secondary-1')}
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
    '/data/plots': '灵感数据库',
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
  { path: '/data/plots', label: '灵感数据库' },
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
  let content: ReactNode;
  switch (normalizePathname(pathname)) {
    case '/dashboard': content = <DashboardPage />; break;
    case '/data/characters': content = <CharactersDataPage />; break;
    case '/data/worlds': content = <WorldSettingsDataPage />; break;
    case '/data/plots': content = <LimitedDatabasePage />; break;
    case '/workspace/editor': content = <TextEditorWorkspacePage />; break;
    case '/projects': content = <ProjectsPage />; break;
    case '/search': content = <SearchPage />; break;
    case '/settings': content = <SettingsPage />; break;
    default: content = <WorkbenchWelcome />; break;
  }
  return <Suspense fallback={<PageFallback />}>{content}</Suspense>;
}

function readSecondaryGroups(): SecondaryGroupState[] {
  const stored = readArray<SecondaryGroupState>(SECONDARY_GROUPS_STORAGE_KEY, []);
  const fallback: SecondaryGroupState[] = [
    { tabs: [createTabFromPath('/dashboard')], activeKey: '/dashboard' },
    { tabs: [createTabFromPath('/dashboard')], activeKey: '/dashboard' }
  ];
  const sanitize = (group: unknown): SecondaryGroupState | undefined => {
    if (!group || typeof group !== 'object') return undefined;
    const candidate = group as Partial<SecondaryGroupState>;
    if (!Array.isArray(candidate.tabs)) return undefined;
    const tabs = candidate.tabs.filter((tab): tab is EditorTab => Boolean(tab && typeof tab.key === 'string' && typeof tab.title === 'string' && typeof tab.path === 'string'));
    return { tabs, activeKey: tabs.some((tab) => tab.key === candidate.activeKey) ? candidate.activeKey as string : tabs[0]?.key ?? '', draggingTabKey: undefined };
  };
  const first = sanitize(stored[0]) ?? fallback[0];
  const second = sanitize(stored[1]) ?? fallback[1];
  return [first, second];
}

function SecondaryEditorGroup({ title, groupId, currentGroupId, groupState, actions, draggingTab, onCurrentGroupChange, onGroupChange, onDragTabStart, onDragTabMove, onDropTab, onDragTabEnd }: {
  title: string;
  groupId: EditorGroupId;
  currentGroupId: EditorGroupId;
  groupState: SecondaryGroupState;
  actions?: ReactNode;
  draggingTab?: DraggingEditorTab;
  onCurrentGroupChange: (groupId: EditorGroupId) => void;
  onGroupChange: (updater: (group: SecondaryGroupState) => SecondaryGroupState) => void;
  onDragTabStart: (tab?: DraggingEditorTab) => void;
  onDragTabMove: (targetGroupId: EditorGroupId, targetKey?: string) => void;
  onDropTab: (targetGroupId: EditorGroupId) => void;
  onDragTabEnd: () => void;
}): React.JSX.Element {
  const { tabs, activeKey, draggingTabKey } = groupState;

  const openTab = (path: string): void => {
    onCurrentGroupChange(groupId);
    onGroupChange((group) => {
      if (group.tabs.some((tab) => tab.key === path)) return { ...group, activeKey: path, draggingTabKey: undefined };
      return { ...group, tabs: [...group.tabs, createTabFromPath(path)], activeKey: path, draggingTabKey: undefined };
    });
  };

  const closeTab = (key: EditorTabKey): void => {
    onGroupChange((group) => {
      const next = group.tabs.filter((tab) => tab.key !== key);
      let nextActive = group.activeKey;
      if (next.length === 0) nextActive = '';
      if (key === group.activeKey && next.length > 0) {
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
      groupId={groupId}
      activeKey={activeKey}
      currentGroupId={currentGroupId}
      tabs={tabs}
      draggingTabKey={draggingTab?.groupId === groupId ? draggingTab.key : draggingTabKey}
      isDragTarget={draggingTab !== undefined}
      onFocusGroup={onCurrentGroupChange}
      onNavigate={(path) => {
        onCurrentGroupChange(groupId);
        onGroupChange((group) => {
          if (group.tabs.some((tab) => tab.key === path)) return { ...group, activeKey: path, draggingTabKey: undefined };
          return { ...group, tabs: [...group.tabs, createTabFromPath(path)], activeKey: path, draggingTabKey: undefined };
        });
      }}
      onCloseTab={closeTab}
      onRenameTab={renameTab}
      onDragTabStart={(key) => onDragTabStart({ groupId, key })}
      onDragTabEnter={(key) => onDragTabMove(groupId, key)}
      onDropTab={() => onDropTab(groupId)}
      onDragTabEnd={onDragTabEnd}
      actions={(
        <Space size={4}>
          {actions}
          <Dropdown menu={openMenu} trigger={['click']}>
            <Button size="small" icon={<MoreOutlined />}>打开</Button>
          </Dropdown>
        </Space>
      )}
    >
      {renderPageContent(activeKey)}
    </EditorGroup>
  );
}

function EditorGroup({
  title,
  groupId,
  activeKey,
  currentGroupId,
  tabs,
  draggingTabKey,
  isDragTarget,
  actions,
  children,
  onFocusGroup,
  onNavigate,
  onCloseTab,
  onRenameTab,
  onDragTabStart,
  onDragTabEnter,
  onDropTab,
  onDragTabEnd
}: {
  title: string;
  groupId: EditorGroupId;
  activeKey: string;
  currentGroupId: EditorGroupId;
  tabs: EditorTab[];
  draggingTabKey?: string;
  isDragTarget?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  onFocusGroup: (groupId: EditorGroupId) => void;
  onNavigate: (path: string) => void;
  onCloseTab?: (key: EditorTabKey) => void;
  onRenameTab?: (key: EditorTabKey, title: string) => void;
  onDragTabStart?: (key: string) => void;
  onDragTabEnter?: (key: string) => void;
  onDropTab?: () => void;
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
    <section
      className={`editor-group ${currentGroupId === groupId ? 'is-current' : ''} ${isDragTarget ? 'is-tab-drop-target' : ''}`}
      aria-label={title}
      onMouseDownCapture={() => onFocusGroup(groupId)}
      onFocus={() => onFocusGroup(groupId)}
      onDragOver={(event) => {
        if (!isDragTarget) return;
        event.preventDefault();
      }}
      onDrop={(event) => {
        if (!isDragTarget) return;
        event.preventDefault();
        onDropTab?.();
      }}
    >
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
      <div
        className="editor-content"
        onClickCapture={(event) => {
          const target = event.target as HTMLElement;
          const directLink = target.closest('a[href]');
          const buttonLink = target.closest('button')?.querySelector('a[href]');
          const link = directLink ?? buttonLink;
          if (!(link instanceof HTMLAnchorElement)) return;
          const href = link.getAttribute('href') ?? '';
          const path = href.startsWith('#/') ? href.slice(1) : href.startsWith('/') ? href : undefined;
          if (!path) return;
          event.preventDefault();
          onNavigate(path);
        }}
      >
        {children}
      </div>
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
              onOpenInNewTab={() => undefined}
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
            { key: 'plots', label: '灵感条目' },
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
  if (activeTab === 'characters') return <Suspense fallback={<PageFallback />}><EntriesPage type="character" /></Suspense>;
  if (activeTab === 'worlds') return <Suspense fallback={<PageFallback />}><EntriesPage type="world" /></Suspense>;
  if (activeTab === 'plots') return <Suspense fallback={<PageFallback />}><EntriesPage type="plot" /></Suspense>;
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

function EditorSplitSash({
  direction,
  areaRef,
  onRatioChange,
  lowerOnly = false
}: {
  direction: 'vertical' | 'horizontal';
  areaRef: React.RefObject<HTMLElement>;
  onRatioChange: (ratio: number) => void;
  lowerOnly?: boolean;
}): React.JSX.Element {
  const onMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const area = areaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    document.body.classList.add('is-resizing');

    const onMove = (moveEvent: MouseEvent): void => {
      const raw = direction === 'vertical'
        ? (moveEvent.clientX - rect.left) / rect.width
        : (moveEvent.clientY - rect.top) / rect.height;
      onRatioChange(Math.min(Math.max(raw, 0.24), 0.76));
    };

    const onUp = (): void => {
      document.body.classList.remove('is-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [areaRef, direction, onRatioChange]);

  return (
    <div
      className={`editor-split-sash editor-split-sash-${direction} ${lowerOnly ? 'is-lower-only' : ''}`}
      role="separator"
      aria-orientation={direction === 'vertical' ? 'vertical' : 'horizontal'}
      onMouseDown={onMouseDown}
    />
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

function WorkbenchWelcome({ compact = false, actions }: { compact?: boolean; actions?: ReactNode }): React.JSX.Element {
  return (
    <div className={`workbench-welcome ${compact ? 'compact' : ''}`}>
      <div className="workbench-watermark" aria-hidden="true">Hetu</div>
      <Typography.Text className="workbench-welcome-kicker">Creative Workbench</Typography.Text>
      <Typography.Title level={compact ? 4 : 2}>HetuSketch</Typography.Title>
      <Typography.Paragraph type="secondary">文思如涌，下笔千言</Typography.Paragraph>
      {actions}
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
  return ({ project: '作品', character: '角色', world: '世界', plot: '灵感' } as const)[type];
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
