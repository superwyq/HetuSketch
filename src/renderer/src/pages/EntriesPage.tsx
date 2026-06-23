import { CheckCircleOutlined, CloseOutlined, DeleteOutlined, DownOutlined, DownloadOutlined, EditOutlined, EyeOutlined, LeftOutlined, PlusOutlined, RightOutlined, RobotOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Card, Drawer, Dropdown, Empty, Form, Input, List, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Tag, Typography, message } from 'antd';
import type { GetRef } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AiStreamChunk, EntryCreateInput, EntryRelation, EntryType, InspirationTypeDefinition, PlotStatus, ProjectEntry, SettingCompletionRequest, SettingCompletionResult } from '@shared/storageTypes';
import { RelationshipCanvas } from '../components/RelationshipCanvas';
import { MarkdownPreview } from '../components/MarkdownPreview';
import { useAppStore } from '../store/appStore';
import { useEntriesData } from '../hooks/useEntriesData';

interface EntriesPageProps {
  type: EntryType;
}

const pageMeta = {
  character: { title: '角色卡片', desc: '集中维护角色名称、摘要、正文 Markdown 设定、角色定位与人物关系。', primaryExtra: '人设红线', primaryName: 'redLines' },
  world: { title: '世界观条目', desc: '管理地理、势力、魔法、科技、历史文化等硬规则，并支持分类筛选。', primaryExtra: '硬规则', primaryName: 'rules' },
  plot: { title: '灵感数据库', desc: '以 Markdown 管理人物、剧情、世界观与自定义灵感类型，支持检索、标签、关联项目和 AI 知识库对接。', primaryExtra: '关联角色', primaryName: 'relatedCharacters' }
} as const;

const defaultInspirationTypes: InspirationTypeDefinition[] = [
  { id: 'uncategorized', name: '待分类', builtIn: true },
  { id: 'character_setting', name: '人物设定', builtIn: true },
  { id: 'plot_setting', name: '剧情设定', builtIn: true },
  { id: 'world_setting', name: '世界观设定', builtIn: true }
];

const UNCATEGORIZED_INSPIRATION_TYPE = 'uncategorized';

type InspirationTypesApi = Window['hetuSketch']['inspirationTypes'];

function getInspirationTypesApi(): InspirationTypesApi | undefined {
  const api = (window.hetuSketch as unknown as { inspirationTypes?: Partial<InspirationTypesApi> }).inspirationTypes;
  return typeof api?.list === 'function' && typeof api.create === 'function' && typeof api.delete === 'function' ? api as InspirationTypesApi : undefined;
}

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
  { value: 'open', label: '待整理' },
  { value: 'resolved', label: '已使用' },
  { value: 'abandoned', label: '归档' }
];

export function EntriesPage({ type }: EntriesPageProps): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const themeMode = useAppStore((state) => state.themeMode);
  const sidebarKeyword = useAppStore((state) => state.searchKeyword);
  const refreshSidebar = useAppStore((state) => state.refreshSidebar);
  const [viewMode, setViewMode] = useState<'cards' | 'list' | 'graph'>('cards');
  const [characterRoleFilter, setCharacterRoleFilter] = useState('all');
  const [relationTargetId, setRelationTargetId] = useState<string>();
  const [relationLabel, setRelationLabel] = useState('');
  const [reverseRelationLabel, setReverseRelationLabel] = useState('');
  const [relationBidirectional, setRelationBidirectional] = useState(true);
  const [summaryMode, setSummaryMode] = useState<'preview' | 'edit'>('preview');
  const [contentMode, setContentMode] = useState<'preview' | 'edit'>('preview');
  const [detailClosing, setDetailClosing] = useState(false);
  const [worldCategoryFilter, setWorldCategoryFilter] = useState('all');
  const [plotStatusFilter, setPlotStatusFilter] = useState<PlotStatus | 'all'>('all');
  const [inspirationTypes, setInspirationTypes] = useState<InspirationTypeDefinition[]>(defaultInspirationTypes);
  const [inspirationTypeFilter, setInspirationTypeFilter] = useState('all');
  const [newInspirationTypeName, setNewInspirationTypeName] = useState('');
  // AI 设定补全相关状态
  const [completionGoal, setCompletionGoal] = useState<NonNullable<SettingCompletionRequest['completionGoal']>>('fill_empty_fields');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiPreviewText, setAiPreviewText] = useState('');
  const [aiResult, setAiResult] = useState<SettingCompletionResult>();
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [ignoredFields, setIgnoredFields] = useState<Set<string>>(new Set());
  const meta = pageMeta[type];
  const inspirationTypeOptions = useMemo(() => inspirationTypes.map((item) => ({ value: item.id, label: item.name })), [inspirationTypes]);
  const inspirationTypeNameById = useMemo(() => Object.fromEntries(inspirationTypes.map((item) => [item.id, item.name])), [inspirationTypes]);
  const {
    form,
    items,
    activeEntry,
    setActiveEntry,
    editingEntry,
    createOpen,
    setCreateOpen,
    loading,
    saving,
    error,
    filteredItems,
    roleQuery,
    categoryQuery,
    statusQuery,
    loadItems,
    saveEntry,
    editEntry,
    cancelEdit,
    deleteEntry,
    markResolved
  } = useEntriesData({
    type,
    selectedProject,
    sidebarKeyword,
    locationSearch: location.search,
    characterRoleFilter,
    worldCategoryFilter,
    plotStatusFilter,
    buildPayload,
    entryToForm,
    onChanged: refreshSidebar
  });
  const visibleItems = useMemo(() => type === 'plot' && inspirationTypeFilter !== 'all'
    ? filteredItems.filter((entry) => entry.type === 'plot' && entry.inspirationType === inspirationTypeFilter)
    : filteredItems, [filteredItems, inspirationTypeFilter, type]);
  const viewModeOptions = useMemo(() => type === 'plot'
    ? [{ value: 'cards', label: '卡片' }, { value: 'list', label: '列表' }]
    : [{ value: 'cards', label: '卡片' }, { value: 'list', label: '列表' }, { value: 'graph', label: '关系网' }], [type]);

  useEffect(() => {
    if (type === 'plot' && viewMode === 'graph') {
      setViewMode('cards');
    }
  }, [type, viewMode]);

  const loadInspirationTypes = useCallback(async (): Promise<void> => {
    if (type !== 'plot' || !selectedProject) {
      setInspirationTypes(defaultInspirationTypes);
      return;
    }
    const api = getInspirationTypesApi();
    if (!api) {
      setInspirationTypes(defaultInspirationTypes);
      return;
    }
    setInspirationTypes(await api.list(selectedProject.id));
  }, [selectedProject, type]);

  useEffect(() => {
    void loadInspirationTypes().catch(() => setInspirationTypes(defaultInspirationTypes));
  }, [loadInspirationTypes]);

  const deleteInspirationTypeFromFilter = useCallback(async (target: InspirationTypeDefinition): Promise<void> => {
    if (target.id === UNCATEGORIZED_INSPIRATION_TYPE) {
      message.warning('待分类类型不可删除');
      return;
    }
    if (!selectedProject) {
      message.warning('请先选择作品');
      return;
    }
    const api = getInspirationTypesApi();
    if (!api) {
      message.error('灵感类型接口未初始化，请重启应用后重试');
      return;
    }

    try {
      await api.delete(selectedProject.id, target.id);
      setInspirationTypeFilter((current) => current === target.id ? 'all' : current);
      setActiveEntry((current) => current?.type === 'plot' && current.inspirationType === target.id ? { ...current, inspirationType: UNCATEGORIZED_INSPIRATION_TYPE } : current);
      setInspirationTypes(await api.list(selectedProject.id));
      await loadItems();
      refreshSidebar();
      message.success('灵感类型已删除，相关灵感已移至待分类');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '灵感类型删除失败');
    }
  }, [loadItems, refreshSidebar, selectedProject, setActiveEntry]);

  const inspirationTypeSelectOptions = useMemo(() => [
    { value: 'all', label: '全部灵感类型', title: '全部灵感类型' },
    ...inspirationTypes.map((item) => ({
      value: item.id,
      title: item.name,
      label: <InspirationTypeFilterOption type={item} onDelete={deleteInspirationTypeFromFilter} />
    }))
  ], [deleteInspirationTypeFromFilter, inspirationTypes]);

  const createInspirationTypeFromDropdown = useCallback(async (): Promise<void> => {
    const name = newInspirationTypeName.trim();
    if (!name) {
      message.warning('请输入自定义灵感类型名称');
      return;
    }
    if (!selectedProject) {
      message.warning('请先选择作品');
      return;
    }

    const api = getInspirationTypesApi();
    if (!api) {
      message.error('灵感类型接口未初始化，请重启应用后重试');
      return;
    }

    try {
      const created = await api.create(selectedProject.id, name);
      const nextTypes = await api.list(selectedProject.id);
      setInspirationTypes(nextTypes.some((item) => item.id === created.id) ? nextTypes : [...nextTypes, created]);
      form.setFieldValue('inspirationType', created.id);
      setNewInspirationTypeName('');
      message.success('灵感类型已新增');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '灵感类型新增失败');
    }
  }, [form, newInspirationTypeName, selectedProject]);

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

  const addStructuredRelation = async (): Promise<void> => {
    if (!relationTargetId || !relationLabel.trim()) {
      message.warning('请选择关联角色并填写关系类型');
      return;
    }
    const target = items.find((entry) => entry.id === relationTargetId);
    const current = String(form.getFieldValue('relationsText') ?? '').trim();
    const nextRelationsText = appendRelationLine(current, { targetId: relationTargetId, targetType: 'character', label: relationLabel.trim() });
    form.setFieldValue('relationsText', nextRelationsText);

    if (selectedProject && editingEntry?.type === 'character') {
      try {
        const nextRelations = parseRelations(nextRelationsText);
        const updated = await window.hetuSketch.entries.update({
          projectId: selectedProject.id,
          type: 'character',
          entryId: editingEntry.id,
          changes: { relations: nextRelations }
        });
        setActiveEntry(updated);

        if (relationBidirectional && target?.type === 'character') {
          const fullTarget = await window.hetuSketch.entries.get(selectedProject.id, 'character', target.id);
          const reverseLabel = reverseRelationLabel.trim() || relationLabel.trim();
          await window.hetuSketch.entries.update({
            projectId: selectedProject.id,
            type: 'character',
            entryId: target.id,
            changes: {
              relations: mergeRelations(fullTarget.relations, { targetId: editingEntry.id, targetType: 'character', label: reverseLabel })
            }
          });
        }
        refreshSidebar();
        message.success('人物关系已保存');
      } catch (reason) {
        message.error(reason instanceof Error ? reason.message : '人物关系保存失败');
        return;
      }
    } else {
      message.success('已添加结构化人物关系，保存条目后生效');
    }

    setRelationTargetId(undefined);
    setRelationLabel('');
    setReverseRelationLabel('');
  };

  const exportCurrent = (): void => {
    const blob = new Blob([JSON.stringify(visibleItems, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${entryTypeLabel(type)}数据库.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openEntryDetailTab = (entry: ProjectEntry): void => {
    navigate(`${type === 'character' ? '/data/characters' : type === 'world' ? '/data/worlds' : '/data/plots'}?entry=${encodeURIComponent(entry.id)}&mode=detail`);
  };

  const closeInlineDetail = (): void => {
    setDetailClosing(true);
    window.setTimeout(() => {
      setActiveEntry(undefined);
      setDetailClosing(false);
    }, 220);
  };

  const extraForm = useMemo(() => renderExtraFields(
    type,
    meta.primaryExtra,
    meta.primaryName,
    inspirationTypeOptions,
    newInspirationTypeName,
    setNewInspirationTypeName,
    createInspirationTypeFromDropdown
  ), [type, meta.primaryExtra, meta.primaryName, inspirationTypeOptions, newInspirationTypeName, createInspirationTypeFromDropdown]);
  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const detailEntryId = queryParams.get('entry');
  const isStandaloneDetail = queryParams.get('mode') === 'detail' && Boolean(detailEntryId);
  const summaryPreview = Form.useWatch('summary', form) ?? '';
  const contentPreview = Form.useWatch('content', form) ?? '';
  const relationsPreviewText = Form.useWatch('relationsText', form) ?? '';
  const relationsPreview = useMemo(() => parseRelations(relationsPreviewText as string), [relationsPreviewText]);

  if (isStandaloneDetail) {
    return (
      <div className="entries-page entries-page-detail-tab">
        {activeEntry ? (
          <EntryDetailPanel entry={activeEntry} entries={items} onSelectCharacter={setActiveEntry} />
        ) : (
          <div className="entries-detail-loading"><Spin size="small" /> <Typography.Text type="secondary">正在加载详情...</Typography.Text></div>
        )}
      </div>
    );
  }

  return (
    <div className="entries-page">
      {!selectedProject && <Alert className="entries-page-banner" showIcon type="warning" message="未选择作品" description="请先在作品管理中创建或选择当前作品。" />}
      {error && <Alert className="entries-page-banner" showIcon type="error" message="加载失败" description={error} />}

      <Modal
        title={editingEntry ? `编辑设定：${editingEntry.title}` : `新增${entryTypeLabel(type)}`}
        open={createOpen}
        rootClassName={themeMode === 'light' ? 'theme-light' : undefined}
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
        <Form form={form} layout="vertical" onFinish={(values) => void saveEntry(values)} disabled={!selectedProject} initialValues={type === 'plot' ? { inspirationType: 'plot_setting', status: 'open' } : undefined}>
          <Form.Item name="title" label={type === 'character' ? '角色名称' : '标题'} rules={[{ required: true, message: type === 'character' ? '请输入角色名称' : '请输入标题' }, { max: 80, message: '标题不超过 80 字' }]}>
            <Input placeholder={type === 'character' ? '例如：林溪 / 北境商会继承人' : type === 'plot' ? '例如：银钥匙灵感 / 帝国货币体系' : '例如：北境商会 / 银钥匙伏笔'} />
          </Form.Item>
          <MarkdownInlineEditor
            name="summary"
            label={type === 'character' ? '角色摘要' : '摘要'}
            value={summaryPreview}
            mode={summaryMode}
            rows={3}
            rules={[{ max: 240, message: '摘要不超过 240 字' }]}
            extra="支持 Markdown，用于搜索结果和 Dashboard 展示。"
            emptyText="点击切换到编辑模式输入摘要，保存后默认原地预览 Markdown。"
            placeholder={type === 'character' ? '用 Markdown 简述角色核心定位，例如：**主角**，持有星盘的边城少年。' : type === 'plot' ? '用 Markdown 简述这条灵感的核心内容。' : '用 Markdown 简述核心设定。'}
            onModeChange={setSummaryMode}
          />
          <MarkdownInlineEditor
            name="content"
            label={type === 'plot' ? '设定' : '正文设定'}
            value={contentPreview}
            mode={contentMode}
            rows={10}
            rules={[{ max: 12000, message: '单条设定不超过 12000 字' }]}
            extra={type === 'character' ? '支持完整 Markdown 语法。外观、背景、性格、能力、红线等附加设定请统一写入此处。' : '支持完整 Markdown 语法。'}
            emptyText="点击切换到编辑模式输入正文设定，系统会原地渲染 Markdown。"
            placeholder={type === 'character' ? '建议使用 Markdown 组织附加设定：\n\n## 背景\n- 出身、经历、秘密\n\n## 性格\n- 核心动机与行为边界\n\n## 能力\n- 技能、限制、代价' : '使用 Markdown 记录正文设定。'}
            onModeChange={setContentMode}
          />
          {type === 'world' && (
            <Form.Item name="tags" label="标签" extra="逗号或换行分隔">
              <Input placeholder="主线, 阵营, 高风险" />
            </Form.Item>
          )}
          {extraForm}
          {type === 'character' && (
            <Card size="small" title="角色之间关系设定" className="relationship-builder">
              <Space wrap className="relationship-builder-controls">
                <Select placeholder="选择关联角色" value={relationTargetId} onChange={setRelationTargetId} className="relation-select" options={items.filter((entry) => entry.type === 'character' && entry.id !== editingEntry?.id).map((entry) => ({ value: entry.id, label: entry.title }))} />
                <Input value={relationLabel} onChange={(event) => setRelationLabel(event.target.value)} placeholder="关系类型：父亲 / 朋友 / 敌人" className="find-input" />
                <Switch checked={relationBidirectional} onChange={setRelationBidirectional} checkedChildren="双向" unCheckedChildren="单向" />
                {relationBidirectional && <Input value={reverseRelationLabel} onChange={(event) => setReverseRelationLabel(event.target.value)} placeholder="反向关系：女儿 / 朋友" className="find-input" />}
                <Button onClick={() => void addStructuredRelation()}>添加关系</Button>
              </Space>
              <Form.Item name="relationsText" hidden><Input.TextArea /></Form.Item>
              <CharacterRelationStrip
                relations={relationsPreview}
                entries={items}
                compact
              />
            </Card>
          )}
          {type === 'world' && (
            <Form.Item name="relationsText" label="关系" extra="每行：目标ID, 类型(character/world/plot), 关系说明">
              <Input.TextArea rows={3} placeholder="char-lingxi, character, 师徒" />
            </Form.Item>
          )}
          {type === 'character' && (
            <>
              <Form.Item name="tags" hidden><Input /></Form.Item>
              <Form.Item name="customFieldsText" hidden><Input.TextArea /></Form.Item>
              <Form.Item name="appearance" hidden><Input.TextArea /></Form.Item>
              <Form.Item name="personalityTags" hidden><Input /></Form.Item>
              <Form.Item name="abilities" hidden><Input.TextArea /></Form.Item>
              <Form.Item name="background" hidden><Input.TextArea /></Form.Item>
              <Form.Item name="redLines" hidden><Input.TextArea /></Form.Item>
            </>
          )}
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
          <Radio.Group size="small" value={viewMode} onChange={(event) => setViewMode(event.target.value)} optionType="button" options={viewModeOptions} />
          {type === 'world' && <Select size="small" value={categoryQuery !== 'all' ? categoryQuery : worldCategoryFilter} options={worldCategoryOptions} onChange={setWorldCategoryFilter} />}
          {type === 'plot' && <Select size="small" value={inspirationTypeFilter} options={inspirationTypeSelectOptions} optionLabelProp="title" onChange={setInspirationTypeFilter} />}
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
            {visibleItems.map((entry) => <button key={entry.id} className="graph-node" onClick={() => setActiveEntry(entry)}>{entry.title}</button>)}
            {visibleItems.flatMap((entry) => entry.relations.map((relation) => <span key={`${entry.id}-${relation.targetId}`} className="graph-edge">{entry.title} → {relation.label || relation.targetId}</span>))}
            {visibleItems.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可展示关系" />}
          </div>
        ) : <List
          grid={viewMode === 'cards' ? { gutter: 24, xs: 1, sm: 2, md: 2, lg: 3, xl: 3, xxl: 4 } : undefined}
          loading={loading}
          dataSource={visibleItems}
          pagination={{ pageSize: 12, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无条目" /> }}
          renderItem={(entry) => viewMode === 'cards' ? (
            <List.Item>
              {type === 'character' ? renderCharacterCard(entry, setActiveEntry, openEntryDetailTab, editEntry, deleteEntry) : renderKnowledgeCard(entry, type, setActiveEntry, editEntry, deleteEntry, markResolved, inspirationTypeNameById)}
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
        <EntryDetailPanel
          entry={activeEntry}
          entries={items}
          closing={detailClosing}
          onClose={closeInlineDetail}
          onSelectCharacter={setActiveEntry}
        />
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

function InspirationTypeFilterOption({ type, onDelete }: { type: InspirationTypeDefinition; onDelete: (type: InspirationTypeDefinition) => Promise<void> }): React.JSX.Element {
  const deletable = !type.builtIn && type.id !== UNCATEGORIZED_INSPIRATION_TYPE;

  return (
    <span className="inspiration-type-option">
      <span className="inspiration-type-option-label">{type.name}</span>
      {deletable && (
        <Popconfirm
          title="确定要删除该灵感类型吗？删除后不可恢复"
          okText="确认删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => void onDelete(type)}
        >
          <button
            type="button"
            className="inspiration-type-delete"
            aria-label={`删除灵感类型 ${type.name}`}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <CloseOutlined />
          </button>
        </Popconfirm>
      )}
    </span>
  );
}

interface EntryDetailPanelProps {
  entry: ProjectEntry;
  entries: ProjectEntry[];
  closing?: boolean;
  onClose?: () => void;
  onSelectCharacter: (entry: ProjectEntry) => void;
}

function EntryDetailPanel({ entry, entries, closing = false, onClose, onSelectCharacter }: EntryDetailPanelProps): React.JSX.Element {
  return (
    <div className={`entries-detail-flat${closing ? ' is-closing' : ''}`}>
      <div className="entries-detail-header">
        <div className="entries-detail-heading">
          <Typography.Title level={4} className="entries-detail-title">{entry.title}</Typography.Title>
          <Space wrap>{entry.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</Space>
        </div>
        {onClose && <Button type="text" shape="circle" icon={<DownOutlined />} onClick={onClose} aria-label="关闭角色详情" />}
      </div>
      {entry.summary && <MarkdownPreview content={entry.summary} className="entries-detail-summary markdown-preview compact" />}
      <MarkdownPreview content={entry.content || '暂无正文设定'} className="entries-detail-content markdown-preview compact" />
      <Typography.Text className="entries-detail-meta">关系：{entry.relations.length || 0} 条</Typography.Text>
      {entry.type === 'character' && (
        <CharacterRelationStrip
          relations={entry.relations}
          entries={entries}
          onSelectCharacter={onSelectCharacter}
        />
      )}
    </div>
  );
}

interface CharacterRelationStripProps {
  relations: EntryRelation[];
  entries: ProjectEntry[];
  onSelectCharacter?: (entry: ProjectEntry) => void;
  compact?: boolean;
}

function CharacterRelationStrip({ relations, entries, onSelectCharacter, compact = false }: CharacterRelationStripProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 'left' | 'right'): void => {
    scrollRef.current?.scrollBy({ left: direction === 'left' ? -280 : 280, behavior: 'smooth' });
  };

  return (
    <section className={`character-relation-panel${compact ? ' compact' : ''}`}>
      <div className="character-relation-header">
        <Space size={8}>
          <Typography.Text className="character-relation-title">人物关系</Typography.Text>
          <EditOutlined className="character-relation-edit-icon" />
        </Space>
        <Space size={6} className="character-relation-actions">
          <Button size="small" type="link">查看更多</Button>
          <Button size="small" shape="circle" icon={<LeftOutlined />} onClick={() => scrollBy('left')} />
          <Button size="small" shape="circle" icon={<RightOutlined />} onClick={() => scrollBy('right')} />
        </Space>
      </div>
      <div className="character-relation-scroll" ref={scrollRef}>
        {relations.length === 0 && <Typography.Text type="secondary">暂无结构化关系，可在编辑弹窗中添加。</Typography.Text>}
        {relations.map((relation) => {
          const target = entries.find((entry) => entry.id === relation.targetId && entry.type === 'character');
          const name = target?.title ?? relation.targetId;
          const avatar = target?.customFields['头像'] || target?.customFields['avatar'] || target?.customFields['海报'];
          return (
            <button
              type="button"
              className="character-relation-card"
              key={`${relation.targetId}-${relation.label}`}
              onClick={() => target && onSelectCharacter?.(target)}
            >
              <Avatar size={58} src={avatar} className="character-relation-avatar">{name.slice(0, 1)}</Avatar>
              <span className="character-relation-label">{relation.label || '关联'}</span>
              <span className="character-relation-name">{name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface MarkdownInlineEditorProps {
  name: 'summary' | 'content';
  label: string;
  value: string;
  mode: 'preview' | 'edit';
  rows: number;
  rules: Array<{ max: number; message: string }>;
  extra: string;
  emptyText: string;
  placeholder: string;
  onModeChange: (mode: 'preview' | 'edit') => void;
}

function MarkdownInlineEditor({ name, label, value, mode, rows, rules, extra, emptyText, placeholder, onModeChange }: MarkdownInlineEditorProps): React.JSX.Element {
  const editorRef = useRef<GetRef<typeof Input.TextArea>>(null);
  const cursorRef = useRef<{ start: number; end: number; scrollTop: number }>({ start: 0, end: 0, scrollTop: 0 });

  useEffect(() => {
    if (mode !== 'edit') return;
    const textArea = editorRef.current?.resizableTextArea?.textArea;
    if (!textArea) return;
    textArea.focus({ preventScroll: true });
    textArea.setSelectionRange(cursorRef.current.start, cursorRef.current.end);
    textArea.scrollTop = cursorRef.current.scrollTop;
  }, [mode]);

  const rememberPosition = (): void => {
    const textArea = editorRef.current?.resizableTextArea?.textArea;
    if (!textArea) return;
    cursorRef.current = {
      start: textArea.selectionStart,
      end: textArea.selectionEnd,
      scrollTop: textArea.scrollTop
    };
  };

  const toggleMode = (): void => {
    rememberPosition();
    onModeChange(mode === 'edit' ? 'preview' : 'edit');
  };

  return (
    <Form.Item label={label} extra={extra} className="markdown-inline-form-item">
      <div className={`markdown-inline-editor mode-${mode}`}>
        <Button size="small" className="markdown-inline-toggle" icon={mode === 'edit' ? <EyeOutlined /> : <EditOutlined />} onClick={toggleMode}>
          {mode === 'edit' ? '预览' : '编辑'}
        </Button>
        {mode === 'edit' ? (
          <Form.Item name={name} rules={rules} noStyle>
            <Input.TextArea
              ref={editorRef}
              rows={rows}
              placeholder={placeholder}
              className="markdown-inline-textarea"
              onBlur={rememberPosition}
              onSelect={rememberPosition}
              onKeyUp={rememberPosition}
              onMouseUp={rememberPosition}
            />
          </Form.Item>
        ) : (
          <>
            <Form.Item name={name} rules={rules} hidden><Input.TextArea /></Form.Item>
            <button type="button" className="markdown-inline-preview" onClick={() => onModeChange('edit')}>
              {value.trim() ? <MarkdownPreview content={value} className="entry-markdown-preview markdown-preview compact" /> : <Typography.Text type="secondary">{emptyText}</Typography.Text>}
            </button>
          </>
        )}
      </div>
    </Form.Item>
  );
}

function renderKnowledgeCard(
  entry: ProjectEntry,
  type: EntryType,
  setActiveEntry: (entry: ProjectEntry) => void,
  editEntry: (entry: ProjectEntry) => void,
  deleteEntry: (entry: ProjectEntry) => Promise<void>,
  markResolved: (entry: ProjectEntry) => Promise<void>,
  inspirationTypeNameById: Record<string, string>
): React.ReactNode {
  const tone = type === 'world' ? worldTone(entry) : plotTone(entry);
  const eyebrow = type === 'world' && entry.type === 'world' ? worldCategoryLabel(entry.category) : entry.type === 'plot' ? inspirationTypeNameById[entry.inspirationType] ?? '灵感' : entryTypeLabel(type);
  const headline = entry.title;
  const subline = type === 'world' && entry.type === 'world' ? `${entry.rules.length} 条硬规则 · ${entry.relations.length} 个关联` : entry.type === 'plot' ? renderPlotStatusText(entry.status) : `${entry.tags.length} 个标签`;
  const intro = entry.summary || entry.content || '暂无摘要，可在编辑弹窗中补充核心设定。';

  return (
    <article className={`knowledge-profile-card ${tone}`} onClick={() => setActiveEntry(entry)}>
      <div className="knowledge-cover">
        <span className="knowledge-symbol">{type === 'world' ? '界' : '灵'}</span>
        <div className="knowledge-card-actions" onClick={(event) => event.stopPropagation()}>
          <Button size="small" onClick={() => setActiveEntry(entry)}>详情</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => editEntry(entry)}>编辑</Button>
          {entry.type === 'plot' && entry.status !== 'resolved' && <Button size="small" icon={<CheckCircleOutlined />} onClick={() => void markResolved(entry)}>标记使用</Button>}
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

function renderPlotStatusText(status: PlotStatus): string {
  return plotStatusOptions.find((option) => option.value === status)?.label ?? '待整理';
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

function renderCharacterCard(
  entry: ProjectEntry,
  setActiveEntry: (entry: ProjectEntry) => void,
  openEntryDetailTab: (entry: ProjectEntry) => void,
  editEntry: (entry: ProjectEntry) => void,
  deleteEntry: (entry: ProjectEntry) => Promise<void>
): React.ReactNode {
  if (entry.type !== 'character') return null;
  const identity = roleLabel(entry.role);
  const avatar = entry.customFields['头像'] || entry.customFields['avatar'] || entry.customFields['海报'];
  const intro = entry.summary || entry.content || '暂无简介，可在角色详情中补充核心特征、背景或动机。';

  const card = (
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
          <Tag>{roleLabel(entry.role)}</Tag>
        </Space>
      </div>
    </article>
  );

  return (
    <Dropdown
      trigger={['contextMenu']}
      menu={{ items: [{ key: 'open-new-tab', label: '在新标签页打开', onClick: () => openEntryDetailTab(entry) }] }}
    >
      {card}
    </Dropdown>
  );
}

function roleLabel(role: string): string {
  return ({ protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' } as Record<string, string>)[role] ?? '角色';
}

function roleColor(role: string): string {
  return ({ protagonist: 'volcano', supporting: 'blue', antagonist: 'red', other: 'default' } as Record<string, string>)[role] ?? 'default';
}

function renderExtraFields(
  type: EntryType,
  label: string,
  name: string,
  inspirationTypeOptions: Array<{ value: string; label: string }>,
  newInspirationTypeName: string,
  setNewInspirationTypeName: (value: string) => void,
  createInspirationTypeFromDropdown: () => Promise<void>
): React.ReactNode {
  if (type === 'character') {
    return <Form.Item name="role" label="角色定位" initialValue="other"><Select options={[{ value: 'protagonist', label: '主角' }, { value: 'supporting', label: '配角' }, { value: 'antagonist', label: '反派' }, { value: 'other', label: '其他' }]} /></Form.Item>;
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
      <Form.Item name="inspirationType" label="灵感类型" initialValue="plot_setting">
        <Select
          options={inspirationTypeOptions}
          dropdownRender={(menu) => (
            <>
              {menu}
              <div className="inspiration-type-create">
                <Input
                  size="small"
                  value={newInspirationTypeName}
                  onChange={(event) => setNewInspirationTypeName(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void createInspirationTypeFromDropdown();
                    }
                  }}
                  placeholder="输入自定义类型"
                />
                <Button
                  size="small"
                  type="primary"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    void createInspirationTypeFromDropdown();
                  }}
                  disabled={!newInspirationTypeName.trim()}
                >新增</Button>
              </div>
            </>
          )}
        />
      </Form.Item>
      <Form.Item name="status" label="状态" initialValue="open"><Select options={[{ value: 'open', label: '待整理' }, { value: 'resolved', label: '已使用' }, { value: 'abandoned', label: '归档' }]} /></Form.Item>
    </>
  );
}

function buildPayload(values: EntryCreateInput, type: EntryType): EntryCreateInput {
  const payload: EntryCreateInput = {
    ...values,
    tags: type === 'plot' ? [] : splitLines(values.tags as unknown as string),
    relations: type === 'plot' ? [] : parseRelations(values.relationsText as unknown as string),
    customFields: parseCustomFields(values.customFieldsText as unknown as string),
    content: values.content ?? '',
    summary: values.summary ?? '',
    format: 'markdown'
  };
  if (type === 'character') {
    return { ...payload, personalityTags: splitLines(values.personalityTags as unknown as string), redLines: splitLines(values.redLines as unknown as string) };
  }
  if (type === 'world') {
    return { ...payload, rules: splitLines(values.rules as unknown as string) };
  }
  return {
    ...payload,
    inspirationType: values.inspirationType ?? 'plot_setting',
    relatedProjectIds: [],
    relatedCharacters: []
  };
}

function entryToForm(entry: ProjectEntry): Record<string, unknown> {
  const base = {
    ...entry,
    tags: entry.tags.join(', '),
    relationsText: entry.relations.map(formatRelationLine).join('\n'),
    customFieldsText: Object.entries(entry.customFields).map(([key, value]) => `${key}=${value}`).join('\n')
  };
  if (entry.type === 'character') {
    return { ...base, personalityTags: entry.personalityTags.join(', '), redLines: entry.redLines.join('\n') };
  }
  if (entry.type === 'world') {
    return { ...base, rules: entry.rules.join('\n') };
  }
  return { ...base, relatedProjectIds: entry.relatedProjectIds.join(', '), relatedCharacters: entry.relatedCharacters.join(', ') };
}

function appendRelationLine(current: string, relation: EntryRelation): string {
  const nextRelations = mergeRelations(parseRelations(current), relation);
  return nextRelations.map(formatRelationLine).join('\n');
}

function mergeRelations(relations: EntryRelation[], relation: EntryRelation): EntryRelation[] {
  const exists = relations.some((item) => item.targetId === relation.targetId && item.targetType === relation.targetType && item.label === relation.label);
  return exists ? relations : [...relations, relation];
}

function formatRelationLine(relation: EntryRelation): string {
  return [relation.targetId, relation.targetType, relation.label].filter(Boolean).join(', ');
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
  return ({ character: '角色', world: '世界观', plot: '灵感' } as const)[type];
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
