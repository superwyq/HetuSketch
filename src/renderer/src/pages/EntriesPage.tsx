import { CheckCircleOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, RobotOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Card, Drawer, Empty, Form, Input, List, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Tag, Typography, message } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { AiStreamChunk, EntryCreateInput, EntryRelation, EntryType, PlotStatus, ProjectEntry, SettingCompletionRequest, SettingCompletionResult } from '@shared/storageTypes';
import { RelationshipCanvas } from '../components/RelationshipCanvas';
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
  const location = useLocation();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const sidebarKeyword = useAppStore((state) => state.searchKeyword);
  const refreshSidebar = useAppStore((state) => state.refreshSidebar);
  const [items, setItems] = useState<ProjectEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<ProjectEntry>();
  const [editingEntry, setEditingEntry] = useState<ProjectEntry>();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'list' | 'graph'>('cards');
  const [characterRoleFilter, setCharacterRoleFilter] = useState('all');
  const [relationTargetId, setRelationTargetId] = useState<string>();
  const [relationLabel, setRelationLabel] = useState('');
  const [reverseRelationLabel, setReverseRelationLabel] = useState('');
  const [relationBidirectional, setRelationBidirectional] = useState(true);
  const [worldCategoryFilter, setWorldCategoryFilter] = useState('all');
  const [plotStatusFilter, setPlotStatusFilter] = useState<PlotStatus | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // AI 设定补全相关状态
  const [completionGoal, setCompletionGoal] = useState<NonNullable<SettingCompletionRequest['completionGoal']>>('fill_empty_fields');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiPreviewText, setAiPreviewText] = useState('');
  const [aiResult, setAiResult] = useState<SettingCompletionResult>();
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [ignoredFields, setIgnoredFields] = useState<Set<string>>(new Set());
  const meta = pageMeta[type];
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const roleQuery = query.get('role') ?? 'all';
  const categoryQuery = query.get('category') ?? 'all';
  const statusQuery = (query.get('status') as PlotStatus | null) ?? 'all';
  const entryQuery = query.get('entry');

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
      setCreateOpen(false);
      await loadItems();
      refreshSidebar();
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const editEntry = (entry: ProjectEntry): void => {
    setEditingEntry(entry);
    setActiveEntry(entry);
    setCreateOpen(true);
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
    refreshSidebar();
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
    // 收集表单中的草稿内容（标题、摘要、正文）
    const draft = [form.getFieldValue('title'), form.getFieldValue('summary'), form.getFieldValue('content')].filter(Boolean).join('\n');
    if (!draft.trim()) {
      message.warning('请先输入草稿内容');
      return;
    }
    // 收集当前表单值作为已有字段上下文
    const existingFields = form.getFieldsValue() as unknown as Record<string, unknown>;
    // 重置流式状态并打开预览
    setAiStreaming(true);
    setAiPreviewText('');
    setAiResult(undefined);
    setIgnoredFields(new Set());
    setAiPreviewOpen(true);

    let accumulated = '';
    const request: SettingCompletionRequest = {
      projectId: selectedProject.id,
      entityType: type,
      draft,
      existingFields,
      completionGoal,
      topK: 5
    };

    try {
      await window.hetuSketch.ai.streamCompleteSetting(request, (chunk: AiStreamChunk) => {
        if (chunk.type === 'delta' && chunk.content) {
          // 文本增量：追加到预览区域
          accumulated += chunk.content;
          setAiPreviewText(accumulated);
        } else if (chunk.type === 'error') {
          // 错误信息
          message.error(chunk.error ?? 'AI 补全失败');
        } else if (chunk.type === 'finish') {
          // 流式结束：尝试解析累积文本为 SettingCompletionResult
          const parsed = parseCompletionResult(accumulated);
          if (parsed) {
            setAiResult(parsed);
          }
        }
      });
      message.success('AI 补全已完成，请审阅建议');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'AI 补全失败');
    } finally {
      setAiStreaming(false);
    }
  };

  useEffect(() => {
    if (!entryQuery) return;
    const nextActive = items.find((entry) => entry.id === entryQuery);
    if (nextActive) setActiveEntry(nextActive);
  }, [entryQuery, items]);

  const filteredItems = useMemo(() => items.filter((entry) => {
    const keyword = sidebarKeyword.trim().toLowerCase();
    if (keyword && !`${entry.title} ${entry.summary ?? ''} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase().includes(keyword)) {
      return false;
    }
    const roleFilter = roleQuery !== 'all' ? roleQuery : characterRoleFilter;
    const categoryFilter = categoryQuery !== 'all' ? categoryQuery : worldCategoryFilter;
    const statusFilter = statusQuery !== 'all' ? statusQuery : plotStatusFilter;
    if (type === 'character' && roleFilter !== 'all') {
      return entry.type === 'character' && entry.role === roleFilter;
    }
    if (type === 'world' && categoryFilter !== 'all') {
      return entry.type === 'world' && entry.category === categoryFilter;
    }
    if (type === 'plot' && statusFilter !== 'all') {
      return entry.type === 'plot' && entry.status === statusFilter;
    }
    return true;
  }), [categoryQuery, characterRoleFilter, entryQuery, items, plotStatusFilter, roleQuery, sidebarKeyword, statusQuery, type, worldCategoryFilter]);

  const addStructuredRelation = (): void => {
    if (!relationTargetId || !relationLabel.trim()) {
      message.warning('请选择关联角色并填写关系类型');
      return;
    }
    const target = items.find((entry) => entry.id === relationTargetId);
    const current = String(form.getFieldValue('relationsText') ?? '').trim();
    const relationLine = `${relationTargetId}, character, ${relationLabel.trim()}${relationBidirectional ? `；双向：${reverseRelationLabel.trim() || relationLabel.trim()}` : ''}${target ? `；目标：${target.title}` : ''}`;
    form.setFieldValue('relationsText', [current, relationLine].filter(Boolean).join('\n'));
    setRelationTargetId(undefined);
    setRelationLabel('');
    setReverseRelationLabel('');
    message.success('已添加结构化人物关系');
  };

  const exportCurrent = (): void => {
    const blob = new Blob([JSON.stringify(filteredItems, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entryTypeLabel(type)}数据库.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const extraForm = useMemo(() => renderExtraFields(type, meta.primaryExtra, meta.primaryName), [type, meta.primaryExtra, meta.primaryName]);

  return (
    <div className="entries-page">
      {!selectedProject && <Alert className="entries-page-banner" showIcon type="warning" message="未选择作品" description="请先在作品管理中创建或选择当前作品。" />}
      {error && <Alert className="entries-page-banner" showIcon type="error" message="加载失败" description={error} />}

      <Modal
        title={editingEntry ? `编辑设定：${editingEntry.title}` : `新增${entryTypeLabel(type)}`}
        open={createOpen}
        width={760}
        onCancel={() => { setCreateOpen(false); cancelEdit(); }}
        footer={null}
      >
        <Space className="modal-toolbar" wrap>
          <Button icon={<RobotOutlined />} onClick={() => void aiComplete()} loading={aiStreaming}>AI 辅助补全</Button>
          <Select
            size="small"
            value={completionGoal}
            onChange={setCompletionGoal}
            options={[
              { value: 'fill_empty_fields', label: '填空字段' },
              { value: 'expand_red_lines', label: '扩展红线' },
              { value: 'suggest_relations', label: '建议关系' },
              { value: 'normalize_tags', label: '规范标签' }
            ]}
            style={{ width: 140 }}
          />
        </Space>
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
          {type === 'character' && (
            <Card size="small" title="结构化人物关系" className="relationship-builder">
              <Space wrap>
                <Select placeholder="选择关联角色" value={relationTargetId} onChange={setRelationTargetId} className="relation-select" options={items.filter((entry) => entry.type === 'character' && entry.id !== editingEntry?.id).map((entry) => ({ value: entry.id, label: entry.title }))} />
                <Input value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} placeholder="关系类型：父亲 / 朋友 / 敌人" className="find-input" />
                <Switch checked={relationBidirectional} onChange={setRelationBidirectional} checkedChildren="双向" unCheckedChildren="单向" />
                {relationBidirectional && <Input value={reverseRelationLabel} onChange={(event) => setReverseRelationLabel(event.target.value)} placeholder="反向关系：女儿 / 朋友" className="find-input" />}
                <Button onClick={addStructuredRelation}>添加关系</Button>
              </Space>
            </Card>
          )}
          <Form.Item name="relationsText" label="关系" extra="每行：目标ID, 类型(character/world/plot), 关系说明；也可使用上方结构化关系选择器生成">
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
      </Modal>

      <div className="entries-toolbar-flat">
        <div className="entries-toolbar-left">
          <Typography.Text className="entries-toolbar-title">{`${entryTypeLabel(type)}数据库`}</Typography.Text>
        </div>
        <Space wrap className="entries-toolbar-actions" size={4}>
          {type === 'character' && <Select size="small" value={roleQuery !== 'all' ? roleQuery : characterRoleFilter} onChange={setCharacterRoleFilter} options={[{ value: 'all', label: '全部角色' }, { value: 'protagonist', label: '主角' }, { value: 'supporting', label: '配角' }, { value: 'antagonist', label: '反派' }, { value: 'other', label: '其他' }]} />}
          <Radio.Group size="small" value={viewMode} onChange={(event) => setViewMode(event.target.value)} optionType="button" options={[{ value: 'cards', label: '卡片' }, { value: 'list', label: '列表' }, { value: 'graph', label: '关系网' }]} />
          {type === 'world' && <Select size="small" value={categoryQuery !== 'all' ? categoryQuery : worldCategoryFilter} options={worldCategoryOptions} onChange={setWorldCategoryFilter} />}
          {type === 'plot' && <Select size="small" value={statusQuery !== 'all' ? statusQuery : plotStatusFilter} options={plotStatusOptions} onChange={setPlotStatusFilter} />}
          <Button size="small" icon={<DownloadOutlined />} onClick={exportCurrent}>导出</Button>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新增{entryTypeLabel(type)}</Button>
        </Space>
      </div>

      <div className="entries-content">
        {viewMode === 'graph' && type === 'character' ? (
          <RelationshipCanvas characters={filteredItems.filter((entry) => entry.type === 'character')} onSelectCharacter={setActiveEntry} />
        ) : viewMode === 'graph' ? (
          <div className="relation-graph relation-graph-fallback">
            {filteredItems.map((entry) => <button key={entry.id} className="graph-node" onClick={() => setActiveEntry(entry)}>{entry.title}</button>)}
            {filteredItems.flatMap((entry) => entry.relations.map((relation) => <span key={`${entry.id}-${relation.targetId}`} className="graph-edge">{entry.title} → {relation.label || relation.targetId}</span>))}
            {filteredItems.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可展示关系" />}
          </div>
        ) : <List
          grid={viewMode === 'cards' ? { gutter: 24, xs: 1, sm: 2, md: 2, lg: 3, xl: 3, xxl: 4 } : undefined}
          loading={loading}
          dataSource={filteredItems}
          pagination={{ pageSize: 12, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无条目" /> }}
          renderItem={(entry) => viewMode === 'cards' ? (
            <List.Item>
              {type === 'character' ? renderCharacterCard(entry, setActiveEntry, editEntry, deleteEntry) : renderKnowledgeCard(entry, type, setActiveEntry, editEntry, deleteEntry, markResolved)}
            </List.Item>
          ) : (
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
        />}
      </div>

      {activeEntry && (
        <div className="entries-detail-flat">
          <div className="entries-detail-header">
            <Typography.Title level={4} className="entries-detail-title">{activeEntry.title}</Typography.Title>
            <Space wrap>{activeEntry.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space>
          </div>
          {activeEntry.summary && <Typography.Paragraph className="entries-detail-summary">{activeEntry.summary}</Typography.Paragraph>}
          <Typography.Paragraph className="entries-detail-content">{activeEntry.content || '暂无正文设定'}</Typography.Paragraph>
          <Typography.Text className="entries-detail-meta">关系：{activeEntry.relations.length || 0} 条 · 自定义字段：{Object.keys(activeEntry.customFields).length || 0} 项</Typography.Text>
          {activeEntry.type === 'character' && (
            <div className="entries-detail-relations">
              <div className="entries-detail-relations-title">人物关系</div>
              <div className="relation-strip">
                {activeEntry.relations.length === 0 && <Typography.Text type="secondary">暂无结构化关系，可在编辑弹窗中添加。</Typography.Text>}
                {activeEntry.relations.map((relation) => (
                  <div className="relation-card" key={`${relation.targetId}-${relation.label}`}>
                    <Avatar>{relation.targetId.slice(0, 1).toUpperCase()}</Avatar>
                    <Tag color="blue">{relation.label || '关联'}</Tag>
                    <Typography.Link>{relation.targetId}</Typography.Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Drawer
        title="AI 设定补全建议"
        open={aiPreviewOpen}
        onClose={() => setAiPreviewOpen(false)}
        width={520}
        destroyOnClose
      >
        {aiStreaming && (
          <Space style={{ marginBottom: 16 }}>
            <Spin size="small" />
            <Typography.Text type="secondary">正在生成建议...</Typography.Text>
          </Space>
        )}
        {aiPreviewText && (
          <Card size="small" title="原始输出" style={{ marginBottom: 16 }}>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', marginBottom: 0 }}>{aiPreviewText}</Typography.Paragraph>
          </Card>
        )}
        {aiResult?.proposedFields && Object.keys(aiResult.proposedFields).length > 0 && (
          <Card size="small" title="建议字段" style={{ marginBottom: 16 }}>
            {Object.entries(aiResult.proposedFields)
              .filter(([field]) => !ignoredFields.has(field))
              .map(([field, value]) => (
                <div key={field} style={{ marginBottom: 12 }}>
                  <Typography.Text strong>{field}</Typography.Text>
                  <Typography.Paragraph style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{String(value)}</Typography.Paragraph>
                  <Space>
                    <Button size="small" type="primary" onClick={() => { form.setFieldValue(field as keyof EntryCreateInput, value as EntryCreateInput[keyof EntryCreateInput]); message.success(`已采纳字段：${field}`); }}>采纳</Button>
                    <Button size="small" onClick={() => setIgnoredFields((prev) => new Set(prev).add(field))}>忽略</Button>
                  </Space>
                </div>
              ))}
          </Card>
        )}
        {aiResult?.missingQuestions && aiResult.missingQuestions.length > 0 && (
          <Card size="small" title="缺失问题" style={{ marginBottom: 16 }}>
            {aiResult.missingQuestions.map((question, index) => (
              <Typography.Paragraph key={index} style={{ marginBottom: 4 }}>• {question}</Typography.Paragraph>
            ))}
          </Card>
        )}
        {aiResult?.possibleConflicts && aiResult.possibleConflicts.length > 0 && (
          <Card size="small" title="潜在冲突" style={{ marginBottom: 16 }}>
            {aiResult.possibleConflicts.map((conflict, index) => (
              <Typography.Paragraph key={index} style={{ marginBottom: 4 }}>
                <Tag color="orange">{conflict.field}</Tag> {conflict.reason}
              </Typography.Paragraph>
            ))}
          </Card>
        )}
        {!aiStreaming && !aiPreviewText && !aiResult && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无补全结果" />
        )}
      </Drawer>
    </div>
  );
}

function renderKnowledgeCard(
  entry: ProjectEntry,
  type: EntryType,
  setActiveEntry: (entry: ProjectEntry) => void,
  editEntry: (entry: ProjectEntry) => void,
  deleteEntry: (entry: ProjectEntry) => Promise<void>,
  markResolved: (entry: ProjectEntry) => Promise<void>
): React.ReactNode {
  const tone = type === 'world' ? worldTone(entry) : plotTone(entry);
  const eyebrow = type === 'world' && entry.type === 'world' ? worldCategoryLabel(entry.category) : entry.type === 'plot' ? plotStatusLabel(entry.status) : entryTypeLabel(type);
  const headline = entry.title;
  const subline = type === 'world' && entry.type === 'world' ? `${entry.rules.length} 条硬规则 · ${entry.relations.length} 个关联` : entry.type === 'plot' ? `${entry.setupChapter || '未知章节'} → ${entry.expectedPayoffChapter || '待定回收'}` : `${entry.tags.length} 个标签`;
  const intro = entry.summary || entry.content || '暂无摘要，可在编辑弹窗中补充核心设定。';

  return (
    <article className={`knowledge-profile-card ${tone}`} onClick={() => setActiveEntry(entry)}>
      <div className="knowledge-cover">
        <span className="knowledge-symbol">{type === 'world' ? '界' : '伏'}</span>
        <div className="knowledge-card-actions" onClick={(event) => event.stopPropagation()}>
          <Button size="small" onClick={() => setActiveEntry(entry)}>详情</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => editEntry(entry)}>编辑</Button>
          {entry.type === 'plot' && entry.status !== 'resolved' && <Button size="small" icon={<CheckCircleOutlined />} onClick={() => void markResolved(entry)}>回收</Button>}
          <Popconfirm title={`删除${entryTypeLabel(type)}`} onConfirm={() => void deleteEntry(entry)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      </div>
      <div className="knowledge-card-body">
        <Tag color={type === 'world' ? 'geekblue' : entry.type === 'plot' && entry.status === 'resolved' ? 'green' : 'gold'}>{eyebrow}</Tag>
        <Typography.Title level={4} className="character-name">{headline}</Typography.Title>
        <Typography.Text className="character-identity">{subline}</Typography.Text>
        <Typography.Paragraph className="character-intro">{intro}</Typography.Paragraph>
        <Space wrap className="character-tags">{entry.tags.slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space>
      </div>
    </article>
  );
}

function worldTone(entry: ProjectEntry): string {
  if (entry.type !== 'world') return 'tone-world';
  return `tone-world tone-${entry.category}`;
}

function plotTone(entry: ProjectEntry): string {
  if (entry.type !== 'plot') return 'tone-plot';
  return `tone-plot tone-${entry.status}`;
}

function worldCategoryLabel(category: string): string {
  return ({ geography: '地理', faction: '势力', magic: '魔法', technology: '科技', history: '历史', culture: '文化', other: '其他' } as Record<string, string>)[category] ?? '世界观';
}

function plotStatusLabel(status: string): string {
  return ({ open: '未回收', resolved: '已回收', abandoned: '废弃' } as Record<string, string>)[status] ?? '线索';
}

function renderCharacterCard(
  entry: ProjectEntry,
  setActiveEntry: (entry: ProjectEntry) => void,
  editEntry: (entry: ProjectEntry) => void,
  deleteEntry: (entry: ProjectEntry) => Promise<void>
): React.ReactNode {
  if (entry.type !== 'character') return null;
  const identity = entry.customFields['身份'] || entry.customFields['职位'] || entry.abilities || '身份 / 职位未填写';
  const avatar = entry.customFields['头像'] || entry.customFields['avatar'] || entry.customFields['海报'];
  const intro = entry.summary || entry.content || entry.background || '暂无简介，可在角色详情中补充核心特征、背景或动机。';

  return (
    <article className="character-profile-card" onClick={() => setActiveEntry(entry)}>
      <div className="character-cover">
        {avatar ? <img src={avatar} alt={entry.title} /> : <div className="character-cover-fallback">{entry.title.slice(0, 1)}</div>}
        <div className="character-card-actions" onClick={(event) => event.stopPropagation()}>
          <Button size="small" onClick={() => setActiveEntry(entry)}>详情</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => editEntry(entry)}>编辑</Button>
          <Popconfirm title="删除角色" onConfirm={() => void deleteEntry(entry)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      </div>
      <div className="character-card-body">
        <Tag color={roleColor(entry.role)} className="character-role-tag">{roleLabel(entry.role)}</Tag>
        <Typography.Title level={4} className="character-name">{entry.title}</Typography.Title>
        <Typography.Text className="character-identity">{identity}</Typography.Text>
        <Typography.Paragraph className="character-intro">{intro}</Typography.Paragraph>
        <Space wrap className="character-tags">
          {entry.personalityTags.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
          {entry.tags.slice(0, 2).map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </Space>
      </div>
    </article>
  );
}

function roleLabel(role: string): string {
  return ({ protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' } as Record<string, string>)[role] ?? '角色';
}

function roleColor(role: string): string {
  return ({ protagonist: 'volcano', supporting: 'blue', antagonist: 'red', other: 'default' } as Record<string, string>)[role] ?? 'default';
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

// 从流式累积文本中解析 SettingCompletionResult，兼容纯 JSON、markdown 代码块和裸 JSON 片段
function parseCompletionResult(text: string): SettingCompletionResult | undefined {
  if (!text.trim()) return undefined;
  // 尝试直接解析整段文本
  try {
    const parsed = JSON.parse(text) as SettingCompletionResult;
    if (parsed.proposedFields) return parsed;
  } catch {
    // 继续尝试其他提取方式
  }
  // 尝试从 markdown 代码块中提取 JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim()) as SettingCompletionResult;
      if (parsed.proposedFields) return parsed;
    } catch {
      // 继续尝试其他提取方式
    }
  }
  // 尝试提取第一个 { 到最后一个 } 之间的内容
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1)) as SettingCompletionResult;
      if (parsed.proposedFields) return parsed;
    } catch {
      // 解析失败，返回 undefined
    }
  }
  return undefined;
}
