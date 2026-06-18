import { ApiOutlined, BookOutlined, ClockCircleOutlined, FileSearchOutlined, SafetyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, List, Row, Skeleton, Space, Statistic, Tag, Timeline, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardStats, RecentAccessItem } from '@shared/storageTypes';
import { useAppStore } from '../store/appStore';

const defaultStats: DashboardStats = {
  projectCount: 0,
  entryCount: 0,
  byType: { character: 0, world: 0, plot: 0 },
  plotStatus: { open: 0, resolved: 0, abandoned: 0 },
  openPlotCount: 0,
  updatedTodayCount: 0
};

export function DashboardPage(): React.JSX.Element {
  const selectedProject = useAppStore((state) => state.selectedProject);
  const guideDismissed = useAppStore((state) => state.guideDismissed);
  const dismissGuide = useAppStore((state) => state.dismissGuide);
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [recent, setRecent] = useState<RecentAccessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(undefined);

    Promise.all([
      window.hetuSketch.dashboard.stats(selectedProject?.id),
      window.hetuSketch.search.recent(selectedProject?.id, 6)
    ])
      .then(([nextStats, nextRecent]) => {
        if (!disposed) {
          setStats(nextStats);
          setRecent(nextRecent);
        }
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : 'Dashboard 数据加载失败');
        }
      })
      .finally(() => {
        if (!disposed) {
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [selectedProject?.id]);

  const rebuildIndex = async (): Promise<void> => {
    const hide = message.loading('正在重建本地索引...', 0);
    try {
      const summary = await window.hetuSketch.index.rebuild(selectedProject?.id);
      message.success(`索引完成：${summary.indexedProjects} 个作品，${summary.indexedEntries} 条设定`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '索引重建失败');
    } finally {
      hide();
    }
  };

  const statItems = [
    { title: '作品', value: stats.projectCount, suffix: '个' },
    { title: '设定条目', value: stats.entryCount, suffix: '条' },
    { title: '角色 / 世界 / 伏笔', value: `${stats.byType.character}/${stats.byType.world}/${stats.byType.plot}`, suffix: '' },
    { title: '未回收伏笔', value: stats.openPlotCount, suffix: '个' }
  ];

  return (
    <Space direction="vertical" size="large" className="page-stack">
      {!guideDismissed && (
        <Alert
          showIcon
          type="info"
          message="新手三步：创建作品 → 录入角色/世界观/伏笔 → 粘贴片段做逻辑校验"
          description="HetuSketch 默认离线工作。只有在 AI 设置中启用并主动调用时，才会发送必要上下文到外部模型。"
          action={<Button onClick={dismissGuide}>知道了</Button>}
        />
      )}

      <section className="hero-panel">
        <div>
          <Typography.Text className="eyebrow">Task 7 用户界面与桌面交互</Typography.Text>
          <Typography.Title>河图速写创作助手</Typography.Title>
          <Typography.Paragraph>
            面向长篇创作的本地设定库、逻辑监工与 AI 增强控制台。当前作品：{selectedProject?.name ?? '尚未选择'}。
          </Typography.Paragraph>
          <Space wrap>
            <Button type="primary" icon={<BookOutlined />}><Link to="/projects">管理作品</Link></Button>
            <Button icon={<FileSearchOutlined />}><Link to="/checks">开始校验</Link></Button>
            <Button icon={<ThunderboltOutlined />} onClick={() => void window.hetuSketch.desktop.showFloating()}>打开悬浮速查</Button>
          </Space>
        </div>
      </section>

      {error && <Alert type="error" showIcon message="加载失败" description={error} />}

      <Row gutter={[16, 16]}>
        {statItems.map((item) => (
          <Col xs={24} sm={12} lg={6} key={item.title}>
            <Card className="metric-card">
              <Skeleton active loading={loading} paragraph={false}>
                <Statistic title={item.title} value={item.value} suffix={item.suffix} />
              </Skeleton>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title="最近访问"
            className="feature-card"
            extra={<Button size="small" onClick={() => void rebuildIndex()}>重建索引</Button>}
          >
            <List
              loading={loading}
              dataSource={recent}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无最近访问，先创建或打开一个设定条目" /> }}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<ClockCircleOutlined className="list-icon" />}
                    title={<Space><Tag>{typeLabel(item.type)}</Tag><span>{item.title}</span></Space>}
                    description={item.excerpt || `访问于 ${new Date(item.accessedAt).toLocaleString()}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="能力入口" className="feature-card">
            <Row gutter={[12, 12]}>
              <Col xs={24} md={12}><Link className="feature-item" to="/checks"><SafetyOutlined /> 基础/AI 校验</Link></Col>
              <Col xs={24} md={12}><Link className="feature-item" to="/settings"><ApiOutlined /> AI 与 RAG 配置</Link></Col>
              <Col xs={24} md={12}><Link className="feature-item" to="/worlds"><FileSearchOutlined /> 世界观规则</Link></Col>
              <Col xs={24} md={12}><button className="feature-item feature-button" onClick={() => void window.hetuSketch.desktop.toggleFloating()}><ThunderboltOutlined /> 全局速查窗</button></Col>
            </Row>
          </Card>
          <Card title="创作流程建议" className="feature-card compact-card">
            <Timeline
              items={[
                { children: '录入作品简介，建立角色红线和世界观硬规则' },
                { children: '用伏笔线索记录埋设章节、预期回收章节和状态' },
                { children: '写作时用悬浮窗快速搜索设定，用校验页审查片段' }
              ]}
            />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

function typeLabel(type: RecentAccessItem['type']): string {
  return ({ project: '作品', character: '角色', world: '世界', plot: '线索' } as const)[type];
}
