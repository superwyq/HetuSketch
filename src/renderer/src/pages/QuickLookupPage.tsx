import { PushpinOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Input, List, Space, Switch, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { RecentAccessItem, SearchResultItem } from '@shared/storageTypes';

export function QuickLookupPage(): React.JSX.Element {
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [recent, setRecent] = useState<RecentAccessItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    void window.hetuSketch.search.recent(undefined, 8).then(setRecent).catch(() => setRecent([]));
  }, []);

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
      <Button className="quick-hide" onClick={() => void window.hetuSketch.desktop.hideFloating()}>隐藏速查窗</Button>
    </main>
  );
}

function typeLabel(type: SearchResultItem['type']): string {
  return ({ project: '作品', character: '角色', world: '世界', plot: '线索' } as const)[type];
}
