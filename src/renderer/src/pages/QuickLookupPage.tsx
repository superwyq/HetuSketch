import { PushpinOutlined, RobotOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Input, List, Segmented, Space, Spin, Switch, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AiStreamChunk, RecentAccessItem, SearchResultItem } from '@shared/storageTypes';
import { useAppStore } from '../store/appStore';

type LookupMode = 'keyword' | 'ai';

export function QuickLookupPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LookupMode>('keyword');

  // 关键词搜索模式状态
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [recent, setRecent] = useState<RecentAccessItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pinned, setPinned] = useState(true);

  // AI 问答模式状态
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string>();
  const [finished, setFinished] = useState(false);

  // 全局状态：当前作品、AI 就绪状态、向量索引状态
  const selectedProject = useAppStore((state) => state.selectedProject);
  const ragState = useAppStore((state) => state.ragState);
  const aiReady = useAppStore((state) => state.aiCapabilities.llmReady);
  const loadAiConfig = useAppStore((state) => state.loadAiConfig);
  const loadRagState = useAppStore((state) => state.loadRagState);

  // 加载最近访问
  useEffect(() => {
    void window.hetuSketch.search.recent(undefined, 8).then(setRecent).catch(() => setRecent([]));
  }, []);

  // 加载 AI 配置，确保 isAiReady 判断可用
  useEffect(() => {
    void loadAiConfig();
  }, [loadAiConfig]);

  // AI 问答模式下，加载当前作品的向量索引状态
  useEffect(() => {
    if (mode === 'ai' && selectedProject) {
      void loadRagState(selectedProject.id);
    }
  }, [mode, selectedProject, loadRagState]);

  // 关键词搜索防抖
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!keyword.trim()) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      void window.hetuSketch.search.preview(keyword)
        .then(setItems)
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [keyword]);

  const dataSource = keyword.trim() ? items : recent;

  // 触发 AI 问答：调用流式 RAG 接口并按 chunk 类型处理
  const handleAsk = async (): Promise<void> => {
    const query = question.trim();
    if (!query || !selectedProject || asking) return;
    setAsking(true);
    setAnswer('');
    setError(undefined);
    setFinished(false);
    try {
      await window.hetuSketch.ai.streamRagAnswer(
        {
          projectId: selectedProject.id,
          query,
          topK: 5,
          retrievalMode: 'hybrid',
          maxContextChars: 4000
        },
        (chunk: AiStreamChunk) => {
          if (chunk.type === 'delta') {
            // 文本增量：追加到回答输出区域
            setAnswer((prev) => prev + (chunk.content ?? ''));
          } else if (chunk.type === 'error') {
            // 错误：展示错误信息
            setError(chunk.error ?? '未知错误');
          } else if (chunk.type === 'finish') {
            // 完成：标记回答结束
            setFinished(true);
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 问答失败');
    } finally {
      setAsking(false);
    }
  };

  return (
    <main className="quick-window">
      <div className="quick-title">
        <div>
          <Typography.Text className="eyebrow">Quick Lookup</Typography.Text>
          <Typography.Title level={4}>悬浮速查</Typography.Title>
        </div>
        <Space>
          <PushpinOutlined />
          <Switch
            size="small"
            checked={pinned}
            onChange={(checked) => {
              setPinned(checked);
              void window.hetuSketch.desktop.setFloatingPinned(checked);
            }}
          />
        </Space>
      </div>

      <Segmented
        block
        value={mode}
        onChange={(value) => setMode(value as LookupMode)}
        options={[
          { value: 'keyword', label: <Space><SearchOutlined />关键词搜索</Space> },
          { value: 'ai', label: <Space><RobotOutlined />AI 问答</Space> }
        ]}
      />

      {mode === 'keyword' ? (
        <>
          <Input
            autoFocus
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="输入关键词速查设定"
            allowClear
          />
          <Card className="quick-card">
            <List
              loading={loading}
              dataSource={dataSource}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword ? '未命中设定' : '暂无最近访问'} /> }}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Space><Tag>{typeLabel(item.type)}</Tag><span>{item.title}</span></Space>}
                    description={item.excerpt || '无摘要'}
                  />
                </List.Item>
              )}
            />
          </Card>
        </>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* AI 未配置提示 */}
          {!aiReady && (
            <Alert
              type="warning"
              showIcon
              message="AI 未配置，请先在设置中配置 LLM Provider"
              action={<Button size="small" onClick={() => navigate('/settings')}>前往设置</Button>}
            />
          )}
          {/* 向量索引未构建提示 */}
          {aiReady && ragState?.status !== 'ready' && (
            <Alert
              type="warning"
              showIcon
              message="向量索引未构建，AI 回答可能不准确。请先在设置中构建向量索引。"
              action={<Button size="small" onClick={() => navigate('/settings')}>前往设置</Button>}
            />
          )}
          {/* 未选择作品提示 */}
          {!selectedProject && (
            <Alert type="info" showIcon message="请先选择作品" />
          )}
          {/* 问答输入与流式回答输出 */}
          {selectedProject && (
            <>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  prefix={<RobotOutlined />}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="输入问题，AI 基于设定回答..."
                  allowClear
                  onPressEnter={() => void handleAsk()}
                />
                <Button type="primary" loading={asking} onClick={() => void handleAsk()}>提问</Button>
              </Space.Compact>
              {error && (
                <Alert type="error" showIcon message={error} />
              )}
              {(asking || answer) && (
                <Card className="quick-card">
                  {asking && !answer ? (
                    <Space>
                      <Spin size="small" />
                      <Typography.Text type="secondary">AI 思考中...</Typography.Text>
                    </Space>
                  ) : (
                    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                      {answer}
                    </Typography.Paragraph>
                  )}
                </Card>
              )}
              {finished && !answer && !error && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="AI 未返回内容" />
              )}
            </>
          )}
        </Space>
      )}

      <Button className="quick-hide" onClick={() => void window.hetuSketch.desktop.hideFloating()}>隐藏速查窗</Button>
    </main>
  );
}

function typeLabel(type: SearchResultItem['type']): string {
  return ({ project: '作品', character: '角色', world: '世界', plot: '灵感' } as const)[type];
}
