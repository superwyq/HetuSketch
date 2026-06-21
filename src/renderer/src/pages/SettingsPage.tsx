import { ApiOutlined, ArrowDownOutlined, ArrowUpOutlined, BuildOutlined, DeleteOutlined, PlusOutlined, PushpinOutlined, RobotOutlined, SyncOutlined, ThunderboltOutlined, ToolOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Checkbox, Collapse, ColorPicker, Empty, Form, Input, InputNumber, List, Segmented, Select, Slider, Space, Switch, Tabs, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AgentConfig, AgentSaveInput, AiConfig, AiConfigSaveInput, AiSkillConfig, AiSkillSaveInput, HttpToolConfig, HttpToolSaveInput, ModelInfo, VectorIndexState } from '@shared/storageTypes';
import { useAppStore } from '../store/appStore';

const providerOptions = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'azure-openai', label: 'Azure OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'ollama', label: 'Ollama (本地)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: '通义千问' },
  { value: 'openai-compatible', label: 'OpenAI 兼容' }
];

// 各供应商默认 Base URL，用于输入框 placeholder 提示
const providerDefaultUrls: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  'azure-openai': 'https://your-resource.openai.azure.com',
  gemini: 'https://generativelanguage.googleapis.com',
  ollama: 'http://localhost:11434',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'openai-compatible': 'https://api.example.com/v1'
};

// RAG 索引状态对应的 Tag 颜色
const ragStatusColors: Record<VectorIndexState['status'], string> = {
  ready: 'green',
  dirty: 'orange',
  building: 'blue',
  degraded: 'red',
  empty: 'default'
};

export function SettingsPage(): React.JSX.Element {
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const mainPinned = useAppStore((state) => state.mainPinned);
  const setMainPinned = useAppStore((state) => state.setMainPinned);
  const sidebarFont = useAppStore((state) => state.sidebarFont);
  const editorFont = useAppStore((state) => state.editorFont);
  const setSidebarFont = useAppStore((state) => state.setSidebarFont);
  const setEditorFont = useAppStore((state) => state.setEditorFont);
  const systemFonts = useAppStore((state) => state.systemFonts);
  const selectedProject = useAppStore((state) => state.selectedProject);
  const [aiForm] = Form.useForm<AiConfigSaveInput>();
  const [toolForm] = Form.useForm<HttpToolSaveInput>();
  const [aiConfig, setAiConfig] = useState<AiConfig>();
  const [tools, setTools] = useState<HttpToolConfig[]>([]);
  const [skills, setSkills] = useState<AiSkillConfig[]>([]);
  const [ragState, setRagState] = useState<VectorIndexState>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // 模型列表拉取状态
  const [llmModels, setLlmModels] = useState<ModelInfo[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<ModelInfo[]>([]);
  const [loadingModelsKind, setLoadingModelsKind] = useState<'llm' | 'embedding' | null>(null);
  // 连接测试与索引构建状态
  const [testingKind, setTestingKind] = useState<'llm' | 'embedding' | null>(null);
  const [buildingRag, setBuildingRag] = useState(false);
  // 智能体模块状态
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<AgentSaveInput | null>(null);
  const [savingAgent, setSavingAgent] = useState(false);

  // 监听 Provider 变化以动态更新 Base URL placeholder
  const llmProvider = Form.useWatch(['llm', 'provider'], aiForm);
  const embeddingProvider = Form.useWatch(['embedding', 'provider'], aiForm);

  const fontOptions = useMemo(() => systemFonts.map((font) => ({ value: font, label: font })), [systemFonts]);

  useEffect(() => {
    let disposed = false;
    Promise.all([window.hetuSketch.ai.getConfig(), window.hetuSketch.ai.listHttpTools(), window.hetuSketch.ai.listSkills(), window.hetuSketch.agent.list()])
      .then(([config, httpTools, aiSkills, agentList]) => {
        if (disposed) return;
        setAiConfig(config);
        setTools(httpTools);
        setSkills(aiSkills);
        setAgents(agentList);
        if (agentList.length > 0 && !selectedAgentId) {
          setSelectedAgentId(agentList[0].id);
        }
        aiForm.setFieldsValue({
          llm: {
            ...config.llm,
            timeoutMs: config.llm.timeoutMs ?? 30000
          },
          embedding: {
            ...config.embedding,
            timeoutMs: config.embedding.timeoutMs ?? 30000
          }
        });
      })
      .catch((reason) => message.error(reason instanceof Error ? reason.message : '设置加载失败'))
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [aiForm]);

  useEffect(() => {
    if (!selectedProject) {
      setRagState(undefined);
      return;
    }
    void window.hetuSketch.rag.state(selectedProject.id).then(setRagState).catch(() => undefined);
  }, [selectedProject]);

  const saveAi = async (values: AiConfigSaveInput): Promise<void> => {
    setSaving(true);
    try {
      const next = await window.hetuSketch.ai.saveConfig(values);
      setAiConfig(next);
      // 刷新全局 AI 状态（aiConfig / aiCapabilities）
      await useAppStore.getState().loadAiConfig();
      message.success('AI 配置已保存');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'AI 配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  const selectAgent = (agent: AgentConfig): void => {
    setSelectedAgentId(agent.id);
    setEditingForm({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      scenarios: agent.scenarios,
      model: agent.model,
      temperature: agent.temperature,
      topP: agent.topP,
      maxTokens: agent.maxTokens,
      enabledSkills: agent.enabledSkills,
      enabledTools: agent.enabledTools,
      order: agent.order
    });
  };

  const startNewAgent = (): void => {
    setSelectedAgentId(null);
    setEditingForm({
      name: '新智能体',
      description: '',
      systemPrompt: '',
      scenarios: {},
      model: '',
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 1000,
      enabledSkills: [],
      enabledTools: [],
      order: agents.length
    });
  };

  const saveAgent = async (): Promise<void> => {
    if (!editingForm) return;
    if (!editingForm.name.trim()) {
      message.warning('请输入智能体名称');
      return;
    }
    setSavingAgent(true);
    try {
      const isEditing = !!editingForm.id && agents.some((a) => a.id === editingForm.id);
      const saved = isEditing
        ? await window.hetuSketch.agent.update(editingForm)
        : await window.hetuSketch.agent.create(editingForm);
      const list = await window.hetuSketch.agent.list();
      setAgents(list);
      setSelectedAgentId(saved.id);
      setEditingForm({ ...editingForm, id: saved.id });
      message.success(isEditing ? '智能体已更新' : '智能体已创建');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '智能体保存失败');
    } finally {
      setSavingAgent(false);
    }
  };

  const removeAgent = async (id: string): Promise<void> => {
    try {
      await window.hetuSketch.agent.delete(id);
      const list = await window.hetuSketch.agent.list();
      setAgents(list);
      if (selectedAgentId === id) {
        setSelectedAgentId(list[0]?.id ?? null);
        setEditingForm(list[0] ? {
          id: list[0].id,
          name: list[0].name,
          description: list[0].description,
          systemPrompt: list[0].systemPrompt,
          scenarios: list[0].scenarios,
          model: list[0].model,
          temperature: list[0].temperature,
          topP: list[0].topP,
          maxTokens: list[0].maxTokens,
          enabledSkills: list[0].enabledSkills,
          enabledTools: list[0].enabledTools,
          order: list[0].order
        } : null);
      }
      message.success('智能体已删除');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '智能体删除失败');
    }
  };

  const moveAgent = async (agent: AgentConfig, direction: 'up' | 'down'): Promise<void> => {
    const idx = agents.findIndex((a) => a.id === agent.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= agents.length) return;
    const reordered = [...agents];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const list = await window.hetuSketch.agent.reorder(reordered.map((a, i) => ({ id: a.id, order: i })));
    setAgents(list);
  };

  const updateEditingField = <K extends keyof AgentSaveInput>(key: K, value: AgentSaveInput[K]): void => {
    setEditingForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const toggleAgentTool = (toolId: string, checked: boolean): void => {
    if (!editingForm) return;
    const current = new Set(editingForm.enabledTools ?? []);
    if (checked) current.add(toolId);
    else current.delete(toolId);
    updateEditingField('enabledTools', [...current]);
  };

  const saveTool = async (values: HttpToolSaveInput): Promise<void> => {
    const tool = await window.hetuSketch.ai.saveHttpTool(values);
    setTools((current) => [tool, ...current.filter((item) => item.id !== tool.id)]);
    toolForm.resetFields();
    message.success('HTTP 工具已保存');
  };

  const toggleSkill = async (skill: AiSkillConfig, enabled: boolean): Promise<void> => {
    const payload: AiSkillSaveInput[] = skills.map((item) => ({ id: item.id, name: item.name, description: item.description, enabled: item.id === skill.id ? enabled : item.enabled }));
    const next = await window.hetuSketch.ai.saveSkills(payload);
    setSkills(next);
    message.success('技能开关已保存');
  };

  const toggleTool = async (tool: HttpToolConfig, enabled: boolean): Promise<void> => {
    const next = await window.hetuSketch.ai.saveHttpTool({ ...tool, enabled });
    setTools((current) => current.map((item) => (item.id === next.id ? next : item)));
    message.success('HTTP 工具状态已更新');
  };

  const deleteTool = async (toolId: string): Promise<void> => {
    await window.hetuSketch.ai.deleteHttpTool(toolId);
    setTools((current) => current.filter((item) => item.id !== toolId));
    message.success('HTTP 工具已删除');
  };

  const testConnection = async (kind: 'llm' | 'embedding'): Promise<void> => {
    setTestingKind(kind);
    try {
      const start = Date.now();
      const result = await window.hetuSketch.ai.testConnection(kind);
      const latency = Date.now() - start;
      if (result.ok) {
        message.success(`连接成功，延迟 ${latency}ms`);
      } else {
        message.error(result.message);
      }
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '连接测试失败');
    } finally {
      setTestingKind(null);
    }
  };

  // 拉取模型列表
  const fetchModels = async (kind: 'llm' | 'embedding'): Promise<void> => {
    setLoadingModelsKind(kind);
    try {
      const models = await window.hetuSketch.ai.listModels(kind);
      if (kind === 'llm') {
        setLlmModels(models);
      } else {
        setEmbeddingModels(models);
      }
      message.success(`获取到 ${models.length} 个模型`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '获取模型列表失败');
    } finally {
      setLoadingModelsKind(null);
    }
  };

  const buildRag = async (): Promise<void> => {
    if (!selectedProject) {
      message.warning('请先选择作品');
      return;
    }
    setBuildingRag(true);
    try {
      const result = await window.hetuSketch.rag.build(selectedProject.id);
      setRagState(result);
      // 同步全局 RAG 状态
      await useAppStore.getState().loadRagState(selectedProject.id);
      message.success(`索引状态：${ragStatusLabel(result.status)}，文本块 ${result.chunkCount}，已嵌入 ${result.embeddedCount}`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '向量索引构建失败');
    } finally {
      setBuildingRag(false);
    }
  };

  const togglePin = async (checked: boolean): Promise<void> => {
    const result = await window.hetuSketch.desktop.setMainPinned(checked);
    setMainPinned(result.pinned);
  };

  // 渲染 LLM / Embedding 配置表单（共用逻辑，按 kind 区分）
  const renderModelConfig = (kind: 'llm' | 'embedding'): React.ReactNode => {
    const isLlm = kind === 'llm';
    const models = isLlm ? llmModels : embeddingModels;
    const currentProvider = isLlm ? llmProvider : embeddingProvider;
    const defaultUrl = providerDefaultUrls[currentProvider ?? 'openai-compatible'] ?? 'https://api.example.com/v1';
    const modelOptions = models.map((m) => ({
      value: m.id,
      label: m.name ? `${m.name} (${m.id})` : m.id
    }));

    return (
      <>
        <Form.Item name={[kind, 'enabled']} label={isLlm ? '启用 LLM' : '启用 Embedding'} valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name={[kind, 'provider']} label="供应商" rules={[{ required: true, message: '请选择供应商' }]}>
          <Select options={providerOptions} placeholder="选择 AI 供应商" />
        </Form.Item>
        <Form.Item name={[kind, 'baseUrl']} label="Base URL" rules={[{ type: 'url', warningOnly: true, message: '建议输入完整 URL' }]}>
          <Input placeholder={defaultUrl} />
        </Form.Item>
        <Form.Item name={[kind, 'apiKey']} label="API Key">
          <Input.Password
            visibilityToggle
            placeholder={aiConfig?.[kind]?.apiKeySet ? '已保存，留空则不变' : '仅保存到主进程服务层'}
          />
        </Form.Item>
        <Form.Item label="模型名称">
          <Space style={{ width: '100%' }}>
            <Form.Item name={[kind, 'model']} noStyle>
              <Select
                showSearch
                optionFilterProp="label"
                tokenSeparators={[',']}
                options={modelOptions}
                placeholder="选择或输入模型名称"
                style={{ width: 300 }}
              />
            </Form.Item>
            <Button
              icon={<SyncOutlined />}
              loading={loadingModelsKind === kind}
              onClick={() => void fetchModels(kind)}
            >
              获取模型列表
            </Button>
          </Space>
        </Form.Item>
        <Form.Item name={[kind, 'timeoutMs']} label="超时 (ms)">
          <InputNumber min={1000} max={120000} step={1000} style={{ width: 200 }} />
        </Form.Item>
        <Button
          icon={<ThunderboltOutlined />}
          loading={testingKind === kind}
          onClick={() => void testConnection(kind)}
        >
          {testingKind === kind ? '正在测试...' : `测试${isLlm ? ' LLM' : ' Embedding'}连接`}
        </Button>
      </>
    );
  };

  const [searchParams] = useSearchParams();
  const section = searchParams.get('section') ?? 'general';

  const renderGeneral = (): React.ReactNode => (
    <Card loading={loading} title="通用" className="feature-card">
      <Form layout="vertical">
        <Form.Item label="主窗口置顶"><Switch checked={mainPinned} onChange={(checked) => void togglePin(checked)} checkedChildren="置顶" unCheckedChildren="普通" /></Form.Item>
        <Space wrap>
          <Button icon={<PushpinOutlined />} onClick={() => void window.hetuSketch.desktop.showFloating()}>显示悬浮速查</Button>
          <Button onClick={() => void window.hetuSketch.desktop.setFloatingPinned(true)}>悬浮窗置顶</Button>
          <Button onClick={() => void window.hetuSketch.desktop.setFloatingPinned(false)}>取消悬浮置顶</Button>
        </Space>
      </Form>
    </Card>
  );

  const renderDisplay = (): React.ReactNode => (
    <Card loading={loading} title="显示" className="feature-card">
      <Space direction="vertical" className="full-width" size="middle">
        <div>
          <Typography.Title level={4}>界面主题</Typography.Title>
          <Segmented
            value={themeMode}
            onChange={(value) => setThemeMode(value as 'light' | 'dark')}
            options={[
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' }
            ]}
          />
          <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
            切换后整个工作台会立即应用对应主题风格。
          </Typography.Paragraph>
        </div>
        <div>
          <Typography.Title level={4}>功能栏字体</Typography.Title>
          <Space wrap size="small">
            <Select
              showSearch
              optionFilterProp="label"
              value={sidebarFont.family}
              options={fontOptions}
              onChange={(value) => setSidebarFont({ ...sidebarFont, family: value })}
              placeholder="字体名称"
              style={{ width: 220 }}
            />
            <InputNumber min={10} max={32} value={sidebarFont.size} onChange={(value) => setSidebarFont({ ...sidebarFont, size: value ?? 13 })} />
            <ColorPicker value={sidebarFont.color} onChange={(color) => setSidebarFont({ ...sidebarFont, color: color.toHexString() })} showText />
          </Space>
          <div className="font-preview" style={{ fontFamily: sidebarFont.family, fontSize: sidebarFont.size, color: sidebarFont.color, background: 'var(--color-surface)', padding: 12, borderRadius: 8, marginTop: 12 }}>
            功能栏字体预览 · 目录 · 角色 · 世界观
          </div>
        </div>
        <div>
          <Typography.Title level={4}>文本编辑区字体</Typography.Title>
          <Space wrap size="small">
            <Select
              showSearch
              optionFilterProp="label"
              value={editorFont.family}
              options={fontOptions}
              onChange={(value) => setEditorFont({ ...editorFont, family: value })}
              placeholder="字体名称"
              style={{ width: 220 }}
            />
            <InputNumber min={10} max={48} value={editorFont.size} onChange={(value) => setEditorFont({ ...editorFont, size: value ?? 16 })} />
            <ColorPicker value={editorFont.color} onChange={(color) => setEditorFont({ ...editorFont, color: color.toHexString() })} showText />
          </Space>
          <div className="font-preview" style={{ fontFamily: editorFont.family, fontSize: editorFont.size, color: editorFont.color, background: 'var(--color-background)', padding: 12, borderRadius: 8, minHeight: 80, marginTop: 12 }}>
            文本编辑区字体预览<br />
            第一章 · 风起青萍之末
          </div>
        </div>
      </Space>
    </Card>
  );

  const renderAi = (): React.ReactNode => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card loading={loading} title="LLM 与 Embedding" className="feature-card">
        <Form form={aiForm} layout="vertical" onFinish={(values) => void saveAi(values)}>
          <Tabs
            items={[
              { key: 'llm', label: 'LLM 大语言模型', children: renderModelConfig('llm') },
              { key: 'embedding', label: 'Embedding 向量模型', children: renderModelConfig('embedding') }
            ]}
          />
          <Space wrap>
            <Button type="primary" htmlType="submit" loading={saving} icon={<ApiOutlined />}>保存配置</Button>
          </Space>
        </Form>
      </Card>
      <Card
        loading={loading}
        title="RAG 向量索引状态"
        className="feature-card"
        extra={<Button icon={<BuildOutlined />} loading={buildingRag} onClick={() => void buildRag()}>构建向量索引</Button>}
      >
        {ragState ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={ragStatusColors[ragState.status]}>{ragStatusLabel(ragState.status)}</Tag>
              <Typography.Text>文本块：{ragState.chunkCount}</Typography.Text>
              <Typography.Text>已嵌入：{ragState.embeddedCount}</Typography.Text>
              <Typography.Text>更新时间：{ragState.updatedAt ? new Date(ragState.updatedAt).toLocaleString() : '暂无'}</Typography.Text>
            </Space>
            {ragState.warnings.length > 0 && (
              <Collapse
                items={[{
                  key: 'warnings',
                  label: `警告列表 (${ragState.warnings.length})`,
                  children: ragState.warnings.map((warning, index) => (
                    <Alert key={index} type="warning" message={warning} showIcon style={{ marginBottom: 8 }} />
                  ))
                }]}
              />
            )}
          </Space>
        ) : <Typography.Text type="secondary">请选择作品后查看索引状态。</Typography.Text>}
      </Card>
    </Space>
  );

  const renderAgents = (): React.ReactNode => (
    <div className="agent-settings">
      <div className="agent-list-panel">
        <div className="agent-list-header">
          <span>智能体列表</span>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={startNewAgent}>新建</Button>
        </div>
        {agents.map((agent, index) => (
          <div
            key={agent.id}
            className={`agent-list-item${selectedAgentId === agent.id ? ' is-selected' : ''}`}
            onClick={() => selectAgent(agent)}
          >
            <RobotOutlined style={{ color: 'var(--color-foreground-secondary)' }} />
            <span className="agent-list-item-name">{agent.name}</span>
            {agent.builtIn && <Tag style={{ marginInlineEnd: 0 }}>内置</Tag>}
            <span className="agent-list-item-actions">
              <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={(e) => { e.stopPropagation(); void moveAgent(agent, 'up'); }} />
              <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === agents.length - 1} onClick={(e) => { e.stopPropagation(); void moveAgent(agent, 'down'); }} />
            </span>
          </div>
        ))}
      </div>
      <div className="agent-detail-panel">
        {editingForm ? (
          <>
            <div className="agent-detail-section">
              <div className="agent-detail-section-title">基本信息</div>
              <Form layout="vertical">
                <Form.Item label="名称" required>
                  <Input value={editingForm.name} onChange={(e) => updateEditingField('name', e.target.value)} placeholder="智能体名称" />
                </Form.Item>
                <Form.Item label="描述">
                  <Input value={editingForm.description} onChange={(e) => updateEditingField('description', e.target.value)} placeholder="智能体用途说明" />
                </Form.Item>
                <Form.Item label="模型">
                  <Select
                    showSearch
                    optionFilterProp="label"
                    tokenSeparators={[',']}
                    value={editingForm.model || undefined}
                    options={llmModels.map((m) => ({ value: m.id, label: m.name ? `${m.name} (${m.id})` : m.id }))}
                    onChange={(value) => updateEditingField('model', value)}
                    placeholder="选择或输入模型名称（留空则使用全局配置）"
                    allowClear
                  />
                </Form.Item>
                <Form.Item label="系统提示词">
                  <Input.TextArea rows={6} value={editingForm.systemPrompt} onChange={(e) => updateEditingField('systemPrompt', e.target.value)} placeholder="覆盖全局系统提示词" />
                </Form.Item>
              </Form>
            </div>

            <div className="agent-detail-section">
              <div className="agent-detail-section-title">模型参数</div>
              <Form layout="vertical">
                <Form.Item label="温度 (temperature)" tooltip="值越高输出越随机，值越低输出越确定">
                  <SliderInput min={0} max={2} step={0.1} value={editingForm.temperature} onChange={(value) => updateEditingField('temperature', value)} />
                </Form.Item>
                <Form.Item label="Top P" tooltip="核采样：仅从概率累积达 P 的 token 中采样">
                  <SliderInput min={0} max={1} step={0.05} value={editingForm.topP} onChange={(value) => updateEditingField('topP', value)} />
                </Form.Item>
                <Form.Item label="最大 Token">
                  <InputNumber min={1} max={32000} value={editingForm.maxTokens} onChange={(value) => updateEditingField('maxTokens', value ?? 1000)} style={{ width: 200 }} />
                </Form.Item>
              </Form>
            </div>

            <div className="agent-detail-section">
              <div className="agent-detail-section-title">技能权限</div>
              {skills.length === 0 ? (
                <Typography.Text type="secondary">暂无可用技能</Typography.Text>
              ) : (
                <Checkbox.Group
                  value={editingForm.enabledSkills}
                  onChange={(checkedValues) => updateEditingField('enabledSkills', checkedValues as string[])}
                >
                  <Space direction="vertical">
                    {skills.map((skill) => (
                      <Checkbox key={skill.id} value={skill.id}>{skill.name} - {skill.description}</Checkbox>
                    ))}
                  </Space>
                </Checkbox.Group>
              )}
            </div>

            <div className="agent-detail-section">
              <div className="agent-detail-section-title">工具权限</div>
              {tools.length === 0 ? (
                <Typography.Text type="secondary">暂无可用 HTTP 工具</Typography.Text>
              ) : (
                tools.map((tool) => (
                  <div key={tool.id} className="agent-permission-row">
                    <Space>
                      <Typography.Text>{tool.name}</Typography.Text>
                      <Tag>{tool.method}</Tag>
                    </Space>
                    <Switch
                      checked={(editingForm.enabledTools ?? []).includes(tool.id)}
                      onChange={(checked) => toggleAgentTool(tool.id, checked)}
                    />
                  </div>
                ))
              )}
            </div>

            <div className="agent-detail-actions">
              <Button danger icon={<DeleteOutlined />} disabled={!!editingForm.id && agents.find((a) => a.id === editingForm.id)?.builtIn} onClick={() => editingForm.id && void removeAgent(editingForm.id)}>
                删除
              </Button>
              <Button type="primary" loading={savingAgent} onClick={() => void saveAgent()}>保存</Button>
            </div>
          </>
        ) : (
          <Empty description="请选择左侧智能体或点击新建" />
        )}
      </div>
    </div>
  );

  const renderSkills = (): React.ReactNode => (
    <Card loading={loading} title="AI 技能开关" className="feature-card">
      <List
        dataSource={skills}
        renderItem={(skill) => (
          <List.Item actions={[<Switch key="enabled" checked={skill.enabled} onChange={(checked) => void toggleSkill(skill, checked)} />]}>
            <List.Item.Meta title={<Space>{skill.name}{skill.builtIn && <Tag>内置</Tag>}</Space>} description={skill.description} />
          </List.Item>
        )}
      />
    </Card>
  );

  const renderTools = (): React.ReactNode => (
    <Card title="受控 HTTP 回调工具" className="feature-card">
      <Form form={toolForm} layout="vertical" onFinish={(values) => void saveTool(values)}>
        <Form.Item name="name" label="工具名称" rules={[{ required: true, message: '请输入工具名称' }]}><Input /></Form.Item>
        <Form.Item name="url" label="URL" rules={[{ required: true, message: '请输入 URL' }, { type: 'url', message: '请输入有效 URL' }]}><Input /></Form.Item>
        <Form.Item name="method" label="方法" initialValue="POST"><Select options={[{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }]} /></Form.Item>
        <Form.Item name="description" label="说明"><Input /></Form.Item>
        <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue={false}><Switch /></Form.Item>
        <Button icon={<ToolOutlined />} type="primary" htmlType="submit">保存工具</Button>
      </Form>
      <List
        className="tool-list"
        dataSource={tools}
        renderItem={(tool) => (
          <List.Item actions={[
            <Switch key="enabled" checked={tool.enabled} onChange={(checked) => void toggleTool(tool, checked)} />,
            <Button key="delete" danger onClick={() => void deleteTool(tool.id)}>删除</Button>
          ]}>
            <List.Item.Meta title={<Space>{tool.name}<Tag>{tool.method}</Tag><Tag color={tool.enabled ? 'green' : 'default'}>{tool.enabled ? '启用' : '停用'}</Tag></Space>} description={`${tool.url} · ${tool.description || '无说明'}`} />
          </List.Item>
        )}
      />
    </Card>
  );

  const renderAbout = (): React.ReactNode => (
    <Card title="关于 HetuSketch" className="feature-card">
      <Space direction="vertical" className="full-width">
        <Typography.Title level={3}>HetuSketch 河图速写</Typography.Title>
        <Typography.Paragraph type="secondary">
          面向小说创作者的设定管理 + 逻辑校验 + 长文本创作桌面应用。
        </Typography.Paragraph>
        <Typography.Text type="secondary">技术栈：Electron + React + TypeScript + Ant Design</Typography.Text>
      </Space>
    </Card>
  );

  const sectionContent: Record<string, React.ReactNode> = {
    general: renderGeneral(),
    display: renderDisplay(),
    ai: renderAi(),
    agents: renderAgents(),
    skills: renderSkills(),
    tools: renderTools(),
    about: renderAbout()
  };

  return (
    <Space direction="vertical" size="middle" className="page-stack">
      {sectionContent[section] ?? renderGeneral()}
    </Space>
  );
}

function ragStatusLabel(status: VectorIndexState['status']): string {
  return ({ ready: '可用', dirty: '需重建', building: '构建中', degraded: '降级', empty: '暂无索引' } as const)[status];
}

// 滑块 + 数字输入组合控件，供 temperature / topP 使用
function SliderInput({ value, onChange, min, max, step }: {
  value?: number;
  onChange?: (value: number) => void;
  min: number;
  max: number;
  step: number;
}): React.JSX.Element {
  return (
    <Space>
      <Slider min={min} max={max} step={step} value={value} onChange={onChange} style={{ width: 200 }} />
      <InputNumber min={min} max={max} step={step} value={value} onChange={(v) => onChange?.(v ?? min)} />
    </Space>
  );
}
