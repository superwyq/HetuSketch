import { CheckCircleOutlined, DeleteOutlined, EditOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Form, Input, List, Popconfirm, Select, Space, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EntryCreateInput, EntryRelation, EntryType, PlotStatus, ProjectEntry } from '@shared/storageTypes';
import { useAppStore } from '../store/appStore';

interface EntriesPageProps {
  type: EntryType;
}

const pageMeta = {
  character: { title: '角色卡片', desc: '记录角色定位、外观、能力背景、关系、自定义字段与不可违背的人设红线。', primaryExtra: '人设红线', primaryName: 'redLines' },
  world: { title: '世界观条目', desc: '管理地理、势力、魔法、科技、历史文化等硬规则，并支持分类筛选。', primaryExtra: '硬规则', primaryName: 'rules' },
  plot: { title: '线索与伏笔', desc: '追踪埋设章节、预期回收章节、状态和关联角色，支持一键标记回收。', primaryExtra: '关联角色', primaryName: 'relatedCharacters' }
} as const;

const worldCategoryOptions = [
  { value: 'all', label: '全部分类' },
  { value: 'geography', label: '地理' },
  { value: 'faction', label: '势力' },
  { value: 'magic', label: '魔法' },
  { value: 'technology', label: '科技' },
  { value: 'history', label: '历史' },
  { value: 'culture', label: '文化' },
  { value: 'other', label: '其他' }
];

const plotStatusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'open', label: '未回收' },
  { value: 'resolved', label: '已回收' },
  { value: 'abandoned', label: '废弃' }
];

export function EntriesPage({ type }: EntriesPageProps): React.JSX.Element {
  const [form] = Form.useForm<EntryCreateInput>();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const [items, setItems] = useState<ProjectEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<ProjectEntry>();
  const [editingEntry, setEditingEntry] = useState<ProjectEntry>();
  const [worldCategoryFilter, setWorldCategoryFilter] = useState('all');
  const [plotStatusFilter, setPlotStatusFilter] = useState<PlotStatus | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const meta = pageMeta[type];

  const loadItems = useCallback(async (): Promise<void> => {
    if (!selectedProject) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError(undefined);
    try {
      const summaries = await window.hetuSketch.entries.list({ projectId: selectedProject.id, type, limit: 100 });
      const entries = await Promise.all(summaries.map((item) => window.hetuSketch.entries.get(item.projectId, type, item.id)));
      setItems(entries);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '条目加载失败');
    } finally {
      setLoading(false);
    }
  }, [selectedProject, type]);

  useEffect(() => {
    form.resetFields();
    setActiveEntry(undefined);
    setEditingEntry(undefined);
    void loadItems();
  }, [form, loadItems]);

  const saveEntry = async (values: EntryCreateInput): Promise<void> => {
    if (!selectedProject) {
      message.warning('请先选择或创建作品');
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(values, type);
      if (editingEntry) {
        const updated = await window.hetuSketch.entries.update({
          projectId: selectedProject.id,
          type,
          entryId: editingEntry.id,
          changes: payload
        });
        setActiveEntry(updated);
        setEditingEntry(undefined);
        message.success('设定条目已更新');
      } else {
        await window.hetuSketch.entries.create({ ...payload, projectId: selectedProject.id, type });
        message.success('设定条目已保存');
      }
      form.resetFields();
      await loadItems();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const editEntry = (entry: ProjectEntry): void => {
    setEditingEntry(entry);
    setActiveEntry(entry);
    form.setFieldsValue(entryToForm(entry) as Partial<EntryCreateInput>);
  };

  const cancelEdit = (): void => {
    setEditingEntry(undefined);
    form.resetFields();
  };

  const deleteEntry = async (entry: ProjectEntry): Promise<void> => {
    await window.hetuSketch.entries.delete(entry.projectId, type, entry.id);
    if (activeEntry?.id === entry.id) {
      setActiveEntry(undefined);
    }
    if (editingEntry?.id === entry.id) {
      cancelEdit();
    }
    message.success('条目已删除');
    await loadItems();
  };

  const markResolved = async (entry: ProjectEntry): Promise<void> => {
    if (entry.type !== 'plot') return;
    const updated = await window.hetuSketch.entries.update({ projectId: entry.projectId, type: 'plot', entryId: entry.id, changes: { status: 'resolved' } });
    setActiveEntry(updated);
    message.success('伏笔已标记为已回收');
    await loadItems();
  };

  const aiComplete = async (): Promise<void> => {
    if (!selectedProject) {
      message.warning('请先选择作品');
      return;
    }
    const draft = [form.getFieldValue('title'), form.getFieldValue('summary'), form.getFieldValue('content')].filter(Boolean).join('\n');
    if (!draft.trim()) {
      message.warning('请先输入草稿内容');
      return;
    }
    const hide = message.loading('正在请求 AI 设定补全...', 0);
    try {
      const response = await window.hetuSketch.ai.completeSetting({ projectId: selectedProject.id, entityType: type, draft, completionGoal: 'fill_empty_fields' });
      if (response.data?.proposedFields) {
        form.setFieldsValue(response.data.proposedFields as Partial<EntryCreateInput>);
        message.success('已填入 AI 建议，请人工审阅后保存');
      } else {
        message.warning(response.error?.message ?? 'AI 未返回可采纳建议');
      }
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'AI 补全失败');
    } finally {
      hide();
    }
  };

  const filteredItems = useMemo(() => items.filter((entry) => {
    if (type === 'world' && worldCategoryFilter !== 'all') {
      return entry.type === 'world' && entry.category === worldCategoryFilter;
    }
    if (type === 'plot' && plotStatusFilter !== 'all') {
      return entry.type === 'plot' && entry.status === plotStatusFilter;
    }
    return true;
  }), [items, plotStatusFilter, type, worldCategoryFilter]);

  const extraForm = useMemo(() => renderExtraFields(type, meta.primaryExtra, meta.primaryName), [type, meta.primaryExtra, meta.primaryName]);

  return (
    <Space direction="vertical" size="large" className="page-stack">
      <Card className="page-title-card">
        <Typography.Title level={2}>{meta.title}</Typography.Title>
        <Typography.Paragraph type="secondary">{meta.desc}</Typography.Paragraph>
      </Card>

      {!selectedProject && <Alert showIcon type="warning" message="未选择作品" description="请先在作品管理中创建或选择当前作品。" />}
      {error && <Alert showIcon type="error" message="加载失败" description={error} />}

      <Card title={editingEntry ? `编辑设定：${editingEntry.title}` : '新增设定'} className="feature-card" extra={<Button icon={<RobotOutlined />} onClick={() => void aiComplete()}>AI 辅助补全</Button>}>
        <Form form={form} layout="vertical" onFinish={(values) => void saveEntry(values)} disabled={!selectedProject}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }, { max: 80, message: '标题不超过 80 字' }]}>
            <Input placeholder="例如：主角 / 北境商会 / 银钥匙伏笔" />
          </Form.Item>
          <Form.Item name="summary" label="摘要" rules={[{ max: 240, message: '摘要不超过 240 字' }]}>
            <Input placeholder="用于搜索结果和 Dashboard 展示" />
          </Form.Item>
          <Form.Item name="content" label="正文设定" rules={[{ max: 12000, message: '单条设定不超过 12000 字' }]}>
            <Input.TextArea rows={5} placeholder="记录背景、约束、关系、使用场景等" />
          </Form.Item>
          <Form.Item name="tags" label="标签" extra="逗号或换行分隔">
            <Input placeholder="主线, 阵营, 高风险" />
          </Form.Item>
          {extraForm}
          <Form.Item name="relationsText" label="关系" extra="每行：目标ID, 类型(character/world/plot), 关系说明">
            <Input.TextArea rows={3} placeholder="char-lingxi, character, 师徒" />
          </Form.Item>
          <Form.Item name="customFieldsText" label="自定义字段" extra="每行：字段名=字段值">
            <Input.TextArea rows={3} placeholder="武器=青铜剑" />
          </Form.Item>
          <Space wrap>
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={saving}>{editingEntry ? '更新条目' : '保存条目'}</Button>
            {editingEntry && <Button onClick={cancelEdit}>取消编辑</Button>}
          </Space>
        </Form>
      </Card>

      <Card
        title="条目列表"
        className="feature-card"
        extra={(
          <Space wrap>
            {type === 'world' && <Select value={worldCategoryFilter} options={worldCategoryOptions} onChange={setWorldCategoryFilter} />}
            {type === 'plot' && <Select value={plotStatusFilter} options={plotStatusOptions} onChange={setPlotStatusFilter} />}
          </Space>
        )}
      >
        <List
          loading={loading}
          dataSource={filteredItems}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无条目" /> }}
          renderItem={(entry) => (
            <List.Item
              actions={[
                <Button key="open" onClick={() => setActiveEntry(entry)}>查看</Button>,
                <Button key="edit" icon={<EditOutlined />} onClick={() => editEntry(entry)}>编辑</Button>,
                entry.type === 'plot' && entry.status !== 'resolved' ? <Button key="resolve" icon={<CheckCircleOutlined />} onClick={() => void markResolved(entry)}>标记已回收</Button> : null,
                <Popconfirm key="delete" title="删除条目" onConfirm={() => void deleteEntry(entry)}>
                  <Button danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              ]}
            >
              <List.Item.Meta title={<Space><Tag>{entryTypeLabel(type)}</Tag>{entry.title}{renderEntryTags(entry)}</Space>} description={entry.summary || `更新于 ${new Date(entry.updatedAt).toLocaleString()}`} />
            </List.Item>
          )}
        />
      </Card>

      {activeEntry && (
        <Card title="速览" className="feature-card">
          <Typography.Title level={4}>{activeEntry.title}</Typography.Title>
          <Typography.Paragraph>{activeEntry.summary}</Typography.Paragraph>
          <Typography.Paragraph className="entry-content">{activeEntry.content || '暂无正文设定'}</Typography.Paragraph>
          <Space wrap>{activeEntry.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space>
          <Typography.Paragraph type="secondary">关系：{activeEntry.relations.length || 0} 条 · 自定义字段：{Object.keys(activeEntry.customFields).length || 0} 项</Typography.Paragraph>
        </Card>
      )}
    </Space>
  );
}

function renderExtraFields(type: EntryType, label: string, name: string): React.ReactNode {
  if (type === 'character') {
    return (
      <>
        <Form.Item name="role" label="角色定位" initialValue="other"><Select options={[{ value: 'protagonist', label: '主角' }, { value: 'supporting', label: '配角' }, { value: 'antagonist', label: '反派' }, { value: 'other', label: '其他' }]} /></Form.Item>
        <Form.Item name="appearance" label="外观"><Input.TextArea rows={2} placeholder="外貌特征、服饰、标志物" /></Form.Item>
        <Form.Item name="personalityTags" label="性格标签" extra="逗号或换行分隔"><Input placeholder="冷静, 克制, 不信任权威" /></Form.Item>
        <Form.Item name="abilities" label="能力"><Input.TextArea rows={2} placeholder="技能、限制、代价" /></Form.Item>
        <Form.Item name="background" label="背景"><Input.TextArea rows={2} placeholder="出身、经历、关键秘密" /></Form.Item>
        <Form.Item name={name} label={label} extra="每行一条，校验页会据此检查"><Input.TextArea rows={3} placeholder="例如：绝不主动伤害无辜者" /></Form.Item>
      </>
    );
  }

  if (type === 'world') {
    return (
      <>
        <Form.Item name="category" label="分类" initialValue="other"><Select options={worldCategoryOptions.filter((option) => option.value !== 'all')} /></Form.Item>
        <Form.Item name={name} label={label} extra="每行一条，校验页会据此检查"><Input.TextArea rows={3} placeholder="例如：死者不可复生，除非支付等价记忆" /></Form.Item>
      </>
    );
  }

  return (
    <>
      <Form.Item name="setupChapter" label="埋设章节"><Input placeholder="第 12 章" /></Form.Item>
      <Form.Item name="expectedPayoffChapter" label="预期回收章节"><Input placeholder="第 40 章前后" /></Form.Item>
      <Form.Item name="status" label="状态" initialValue="open"><Select options={plotStatusOptions.filter((option) => option.value !== 'all')} /></Form.Item>
      <Form.Item name={name} label={label} extra="逗号或换行分隔"><Input placeholder="角色 ID 或名称线索" /></Form.Item>
    </>
  );
}

function buildPayload(values: EntryCreateInput, type: EntryType): EntryCreateInput {
  const payload: EntryCreateInput = {
    ...values,
    tags: splitLines(values.tags as unknown as string),
    relations: parseRelations(values.relationsText as unknown as string),
    customFields: parseCustomFields(values.customFieldsText as unknown as string),
    content: values.content ?? '',
    summary: values.summary ?? ''
  };
  if (type === 'character') {
    return { ...payload, personalityTags: splitLines(values.personalityTags as unknown as string), redLines: splitLines(values.redLines as unknown as string) };
  }
  if (type === 'world') {
    return { ...payload, rules: splitLines(values.rules as unknown as string) };
  }
  return { ...payload, relatedCharacters: splitLines(values.relatedCharacters as unknown as string) };
}

function entryToForm(entry: ProjectEntry): Record<string, unknown> {
  const base = {
    ...entry,
    tags: entry.tags.join(', '),
    relationsText: entry.relations.map((relation) => [relation.targetId, relation.targetType, relation.label].filter(Boolean).join(', ')).join('\n'),
    customFieldsText: Object.entries(entry.customFields).map(([key, value]) => `${key}=${value}`).join('\n')
  };
  if (entry.type === 'character') {
    return { ...base, personalityTags: entry.personalityTags.join(', '), redLines: entry.redLines.join('\n') };
  }
  if (entry.type === 'world') {
    return { ...base, rules: entry.rules.join('\n') };
  }
  return { ...base, relatedCharacters: entry.relatedCharacters.join(', ') };
}

function parseRelations(value: string | undefined): EntryRelation[] {
  const relations: EntryRelation[] = [];
  for (const line of splitRows(value)) {
    const [targetId, targetType, label] = line.split(/[,，]/).map((item) => item.trim());
    if (targetId && isEntryType(targetType)) {
      relations.push({ targetId, targetType, label });
    }
  }
  return relations;
}

function parseCustomFields(value: string | undefined): Record<string, string> {
  return Object.fromEntries(splitRows(value).map((line) => line.split(/[=：:]/, 2).map((item) => item.trim())).filter(([key, val]) => key && val));
}

function splitRows(value: string | undefined): string[] {
  return typeof value === 'string' ? value.split('\n').map((item) => item.trim()).filter(Boolean) : [];
}

function splitLines(value: string | undefined): string[] {
  return typeof value === 'string' ? value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean) : [];
}

function isEntryType(value: string | undefined): value is EntryType {
  return value === 'character' || value === 'world' || value === 'plot';
}

function renderEntryTags(entry: ProjectEntry): React.ReactNode {
  if (entry.type === 'world') return <Tag color="blue">{worldCategoryOptions.find((option) => option.value === entry.category)?.label}</Tag>;
  if (entry.type === 'plot') return <Tag color={entry.status === 'resolved' ? 'green' : entry.status === 'abandoned' ? 'default' : 'orange'}>{plotStatusOptions.find((option) => option.value === entry.status)?.label}</Tag>;
  return <Tag>{entry.role}</Tag>;
}

function entryTypeLabel(type: EntryType): string {
  return ({ character: '角色', world: '世界观', plot: '线索' } as const)[type];
}
