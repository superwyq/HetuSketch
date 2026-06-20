import { ApartmentOutlined, DeleteOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Form, Input, List, Popconfirm, Select, Space, Statistic, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { ProjectManifest, SettingSetManifest } from '@shared/storageTypes';

export function SettingSetsPage(): React.JSX.Element {
  const [form] = Form.useForm<{ name: string; summary?: string; cover?: string }>();
  const [sets, setSets] = useState<SettingSetManifest[]>([]);
  const [projects, setProjects] = useState<ProjectManifest[]>([]);
  const [activeSetId, setActiveSetId] = useState<string>();
  const [activeProjectId, setActiveProjectId] = useState<string>();

  const reload = async (): Promise<void> => {
    const [nextSets, nextProjects] = await Promise.all([
      window.hetuSketch.settingSets.list(),
      window.hetuSketch.projects.list()
    ]);
    setSets(nextSets);
    setProjects(nextProjects);
  };

  useEffect(() => {
    void reload();
  }, []);

  const activeSet = useMemo(() => sets.find((item) => item.id === activeSetId), [activeSetId, sets]);

  const createSet = async (values: { name: string; summary?: string; cover?: string }): Promise<void> => {
    await window.hetuSketch.settingSets.create(values);
    form.resetFields();
    message.success('设定集已创建并保存到文件事实源');
    await reload();
  };

  const linkProject = async (): Promise<void> => {
    if (!activeSetId || !activeProjectId) {
      message.warning('请选择设定集和作品');
      return;
    }
    message.info('旧作品关联仍保持兼容；新书目请在书目管理中绑定设定集。');
  };

  return (
    <Space direction="vertical" size="middle" className="page-stack">
      <div className="two-column-grid">
        <Card title="创建设定集" className="feature-card">
          <Form form={form} layout="vertical" onFinish={(values) => void createSet(values)}>
            <Form.Item name="name" label="设定集名称" rules={[{ required: true, message: '请输入设定集名称' }, { max: 60, message: '名称不超过 60 字' }]}>
              <Input placeholder="例如：雾海宇宙 / 河图世界线" />
            </Form.Item>
            <Form.Item name="summary" label="简介" rules={[{ max: 500, message: '简介不超过 500 字' }]}>
              <Input.TextArea rows={3} placeholder="描述世界观母体、主题、时间线或共享规则" />
            </Form.Item>
            <Form.Item name="cover" label="封面链接（可选）">
              <Input placeholder="本轮迭代预留封面字段" />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>创建设定集</Button>
          </Form>
        </Card>

        <Card title="关联作品" className="feature-card">
          <Alert showIcon type="info" className="inline-alert" message="作品可以访问设定集级数据，也可以维护自己的局部角色、世界观和情节。" />
          <Space direction="vertical" className="full-width">
            <Select placeholder="选择设定集" value={activeSetId} onChange={setActiveSetId} options={sets.map((item) => ({ value: item.id, label: item.name }))} />
            <Select placeholder="选择作品" value={activeProjectId} onChange={setActiveProjectId} options={projects.map((item) => ({ value: item.id, label: item.name }))} />
            <Button icon={<LinkOutlined />} onClick={() => void linkProject()}>建立关联</Button>
          </Space>
          {activeSet && (
            <Card size="small" className="compact-card">
              <Statistic title="全局标签" value={activeSet.tags.length} suffix="个" />
            </Card>
          )}
        </Card>
      </div>

      <Card title="设定集列表" className="feature-card">
        <List
          dataSource={sets}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无设定集" /> }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="select" icon={<ApartmentOutlined />} onClick={() => setActiveSetId(item.id)}>查看结构</Button>,
                <Popconfirm key="delete" title="删除设定集" onConfirm={() => { void window.hetuSketch.settingSets.delete(item.id, 'block').then(reload); }}>
                  <Button danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              ]}
            >
              <List.Item.Meta
                title={<Space><Typography.Text strong>{item.name}</Typography.Text><Tag>全局数据层</Tag></Space>}
                description={<Space direction="vertical"><span>{item.summary || '暂无简介'}</span><span>标签：{item.tags.join('、') || '无'}</span></Space>}
              />
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}
