import {
  BookOutlined,
  BulbOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  NodeIndexOutlined,
  PushpinOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined,
  TeamOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { AutoComplete, Button, Card, Input, Layout, Menu, Select, Space, Switch, Tag, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import type { ProjectManifest, SearchResultItem } from '@shared/storageTypes';
import { ChecksPage } from './pages/ChecksPage';
import { DashboardPage } from './pages/DashboardPage';
import { EntriesPage } from './pages/EntriesPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { QuickLookupPage } from './pages/QuickLookupPage';
import { SettingsPage } from './pages/SettingsPage';
import { useAppStore } from './store/appStore';

const { Header, Sider, Content } = Layout;

const menuItems: MenuProps['items'] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: <Link to="/dashboard">总览</Link> },
  { key: '/projects', icon: <BookOutlined />, label: <Link to="/projects">作品</Link> },
  { key: '/characters', icon: <TeamOutlined />, label: <Link to="/characters">角色</Link> },
  { key: '/worlds', icon: <GlobalOutlined />, label: <Link to="/worlds">世界观</Link> },
  { key: '/plots', icon: <NodeIndexOutlined />, label: <Link to="/plots">伏笔线索</Link> },
  { key: '/checks', icon: <ExperimentOutlined />, label: <Link to="/checks">逻辑校验</Link> },
  { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">设置与 AI</Link> }
];

export function App(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const searchKeyword = useAppStore((state) => state.searchKeyword);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const themeMode = useAppStore((state) => state.themeMode);
  const mainPinned = useAppStore((state) => state.mainPinned);
  const setSelectedProject = useAppStore((state) => state.setSelectedProject);
  const setSearchKeyword = useAppStore((state) => state.setSearchKeyword);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const setMainPinned = useAppStore((state) => state.setMainPinned);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [searchItems, setSearchItems] = useState<SearchResultItem[]>([]);

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

  const selectedMenuKey = useMemo(() => {
    if (location.pathname.startsWith('/characters')) return '/characters';
    if (location.pathname.startsWith('/worlds')) return '/worlds';
    if (location.pathname.startsWith('/plots')) return '/plots';
    return location.pathname;
  }, [location.pathname]);

  if (location.pathname === '/quick-lookup') {
    return <QuickLookupPage />;
  }

  const pinMain = async (): Promise<void> => {
    const result = await window.hetuSketch.desktop.setMainPinned(!mainPinned);
    setMainPinned(result.pinned);
  };

  return (
    <Layout className={`app-shell theme-${themeMode}`}>
      <Sider className="app-sider" collapsed={sidebarCollapsed} width={244}>
        <div className="brand-block" aria-label="HetuSketch">
          <div className="brand-mark">河</div>
          {!sidebarCollapsed && (
            <div>
              <Typography.Title level={4}>HetuSketch</Typography.Title>
              <Typography.Text>逻辑监工 · 设定库</Typography.Text>
            </div>
          )}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedMenuKey]} items={menuItems} />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Space size="middle" className="header-left">
            <Button aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'} icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={toggleSidebar} />
            <AutoComplete
              className="global-search"
              value={searchKeyword}
              options={searchItems.map((item) => ({ value: item.title, label: <Space><Tag>{typeLabel(item.type)}</Tag><span>{item.title}</span></Space> }))}
              onChange={setSearchKeyword}
              onSelect={(value) => {
                setSearchKeyword(value);
                navigate(`/search?q=${encodeURIComponent(value)}`);
              }}
            >
              <Input prefix={<SearchOutlined />} onPressEnter={() => navigate(`/search?q=${encodeURIComponent(searchKeyword)}`)} placeholder="搜索角色、世界观规则、伏笔线索..." allowClear />
            </AutoComplete>
          </Space>
          <Space className="header-actions" wrap>
            <Select
              className="project-select"
              placeholder="选择作品"
              value={selectedProject?.id}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              onChange={(projectId) => setSelectedProject(projects.find((project) => project.id === projectId))}
            />
            <Button icon={<ThunderboltOutlined />} onClick={() => void window.hetuSketch.desktop.toggleFloating()}>速查</Button>
            <Button icon={<PushpinOutlined />} type={mainPinned ? 'primary' : 'default'} onClick={() => void pinMain()}>{mainPinned ? '已置顶' : '置顶'}</Button>
            <Switch
              checked={themeMode === 'dark'}
              checkedChildren={<MoonOutlined />}
              unCheckedChildren={<SunOutlined />}
              onChange={(checked) => setThemeMode(checked ? 'dark' : 'light')}
            />
            <Button icon={<BulbOutlined />} onClick={() => message.info('提示：全局快捷键 Ctrl+Shift+H 可唤起悬浮速查窗')}>引导</Button>
          </Space>
        </Header>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/characters" element={<EntriesPage type="character" />} />
            <Route path="/worlds" element={<EntriesPage type="world" />} />
            <Route path="/plots" element={<EntriesPage type="plot" />} />
            <Route path="/checks" element={<ChecksPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
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
    <Space direction="vertical" size="large" className="page-stack">
      <Typography.Title level={2}>全局搜索</Typography.Title>
      <Typography.Paragraph type="secondary">关键词：{keyword || '未输入'}</Typography.Paragraph>
      <Card className="feature-card">
        <Menu
          selectable={false}
          items={items.map((item) => ({ key: item.id, label: <Space><Tag>{typeLabel(item.type)}</Tag><span>{item.title}</span><Typography.Text type="secondary">{item.excerpt}</Typography.Text></Space> }))}
        />
        {!loading && items.length === 0 && <Typography.Text type="secondary">暂无搜索结果</Typography.Text>}
      </Card>
    </Space>
  );
}

function typeLabel(type: SearchResultItem['type']): string {
  return ({ project: '作品', character: '角色', world: '世界', plot: '线索' } as const)[type];
}
