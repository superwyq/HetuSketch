import { ApiOutlined, BuildOutlined, PushpinOutlined, ToolOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, InputNumber, List, Select, Space, Switch, Tabs, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import type { AiConfig, AiConfigSaveInput, AiPromptConfig, AiSkillConfig, AiSkillSaveInput, HttpToolConfig, HttpToolSaveInput, VectorIndexState } from '@shared/storageTypes';
import { useAppStore } from '../store/appStore';

const providerOptions = [
  { value: 'openai-compatible', label: 'OpenAI Compatible' },
  { value: 'anthropic', label: 'Anthropic Style' }
];

export function SettingsPage(): React.JSX.Element {
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const mainPinned = useAppStore((state) => state.mainPinned);
  const setMainPinned = useAppStore((state) => state.setMainPinned);
  const selectedProject = useAppStore((state) => state.selectedProject);
  const [aiForm] = Form.useForm<AiConfigSaveInput>();
  const [promptForm] = Form.useForm<AiPromptConfig>();
  const [toolForm] = Form.useForm<HttpToolSaveInput>();
  const [aiConfig, setAiConfig] = useState<AiConfig>();
  const [tools, setTools] = useState<HttpToolConfig[]>([]);
  const [skills, setSkills] = useState<AiSkillConfig[]>([]);
  const [ragState, setRagState] = useState<VectorIndexState>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let disposed = false;
    Promise.all([window.hetuSketch.ai.getConfig(), window.hetuSketch.ai.getPrompts(), window.hetuSketch.ai.listHttpTools(), window.hetuSketch.ai.listSkills()])
      .then(([config, prompts, httpTools, aiSkills]) => {
        if (disposed) return;
        setAiConfig(config);
        setTools(httpTools);
        setSkills(aiSkills);
        aiForm.setFieldsValue({ llm: config.llm, embedding: config.embedding });
        promptForm.setFieldsValue(prompts);
      })
      .catch((reason) => message.error(reason instanceof Error ? reason.message : '设置加载失败'))
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [aiForm, promptForm]);

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
      message.success('AI 配置已保存');
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'AI 配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  const savePrompts = async (values: AiPromptConfig): Promise<void> => {
    await window.hetuSketch.ai.savePrompts({ globalSystemPrompt: values.globalSystemPrompt, scenarios: values.scenarios });
    message.success('提示词已保存');
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
    const hide = message.loading('正在测试连接...', 0);
    try {
      const result = await window.hetuSketch.ai.testConnection(kind);
      if (result.ok) {
        message.success(result.message);
      } else {
        message.warning(result.message);
      }
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '连接测试失败');
    } finally {
      hide();
    }
  };

  const buildRag = async (): Promise<void> => {
    if (!selectedProject) {
      message.warning('请先选择作品');
      return;
    }
    const hide = message.loading('正在构建向量索引...', 0);
    try {
      const result = await window.hetuSketch.rag.build(selectedProject.id);
      setRagState(result);
      message.success(`索引状态：${ragStatusLabel(result.status)}，文本块 ${result.chunkCount}，已嵌入 ${result.embeddedCount}`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '向量索引构建失败');
    } finally {
      hide();
    }
  };

  const togglePin = async (checked: boolean): Promise<void> => {
    const result = await window.hetuSketch.desktop.setMainPinned(checked);
    setMainPinned(result.pinned);
  };

  return (
    <Space direction="vertical" size="large" className="page-stack">
      <Card className="page-title-card">
        <Typography.Title level={2}>设置与 AI</Typography.Title>
        <Typography.Paragraph type="secondary">配置主题、窗口置顶、AI 供应商、RAG 索引、提示词和受控 HTTP 工具。API Key 仅通过安全 IPC 交给主进程保存。</Typography.Paragraph>
      </Card>

      <Tabs
        items={[
          {
            key: 'appearance',
            label: '应用',
            children: (
              <Card loading={loading} title="外观与桌面交互" className="feature-card">
                <Form layout="vertical">
                  <Form.Item label="深色主题"><Switch checked={themeMode === 'dark'} onChange={(checked) => setThemeMode(checked ? 'dark' : 'light')} /></Form.Item>
                  <Form.Item label="主窗口置顶"><Switch checked={mainPinned} onChange={(checked) => void togglePin(checked)} checkedChildren="置顶" unCheckedChildren="普通" /></Form.Item>
                  <Space wrap>
                    <Button icon={<PushpinOutlined />} onClick={() => void window.hetuSketch.desktop.showFloating()}>显示悬浮速查</Button>
                    <Button onClick={() => void window.hetuSketch.desktop.setFloatingPinned(true)}>悬浮窗置顶</Button>
                    <Button onClick={() => void window.hetuSketch.desktop.setFloatingPinned(false)}>取消悬浮置顶</Button>
                  </Space>
                </Form>
              </Card>
            )
          },
          {
            key: 'ai',
            label: 'AI 供应商',
            children: (
              <Card loading={loading} title="LLM 与 Embedding" className="feature-card">
                <Alert showIcon type="info" message="隐私边界" description="未启用时不会发起外部调用；校验和搜索基础能力保持离线可用。" className="inline-alert" />
                <Form form={aiForm} layout="vertical" onFinish={(values) => void saveAi(values)}>
                  <Typography.Title level={4}>LLM</Typography.Title>
                  <Form.Item name={['llm', 'enabled']} label="启用 LLM" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name={['llm', 'provider']} label="协议" rules={[{ required: true }]}><Select options={providerOptions} /></Form.Item>
                  <Form.Item name={['llm', 'baseUrl']} label="Base URL" rules={[{ type: 'url', warningOnly: true, message: '建议输入完整 URL' }]}><Input placeholder="https://api.example.com/v1" /></Form.Item>
                  <Form.Item name={['llm', 'model']} label="模型名称"><Input placeholder="gpt-4.1-mini / claude-sonnet" /></Form.Item>
                  <Form.Item name={['llm', 'apiKey']} label="API Key"><Input.Password placeholder={aiConfig?.llm.apiKeySet ? '已保存，留空则不变' : '仅保存到主进程服务层'} /></Form.Item>
                  <Form.Item name={['llm', 'timeoutMs']} label="超时毫秒"><InputNumber min={3000} max={120000} step={1000} /></Form.Item>

                  <Typography.Title level={4}>Embedding</Typography.Title>
                  <Form.Item name={['embedding', 'enabled']} label="启用 Embedding" valuePropName="checked"><Switch /></Form.Item>
                  <Form.Item name={['embedding', 'provider']} label="协议" rules={[{ required: true }]}><Select options={providerOptions} /></Form.Item>
                  <Form.Item name={['embedding', 'baseUrl']} label="Base URL"><Input placeholder="https://api.example.com/v1" /></Form.Item>
                  <Form.Item name={['embedding', 'model']} label="模型名称"><Input placeholder="text-embedding-3-small" /></Form.Item>
                  <Form.Item name={['embedding', 'apiKey']} label="Embedding API Key"><Input.Password placeholder={aiConfig?.embedding.apiKeySet ? '已保存，留空则不变' : '仅保存到主进程服务层'} /></Form.Item>
                  <Space wrap>
                    <Button type="primary" htmlType="submit" loading={saving} icon={<ApiOutlined />}>保存配置</Button>
                    <Button onClick={() => void testConnection('llm')}>测试 LLM</Button>
                    <Button onClick={() => void testConnection('embedding')}>测试 Embedding</Button>
                    <Button icon={<BuildOutlined />} onClick={() => void buildRag()}>构建向量索引</Button>
                  </Space>
                  <Card size="small" title="RAG 向量索引状态" className="feature-card">
                    {ragState ? (
                      <Space direction="vertical">
                        <Space wrap>
                          <Tag color={ragState.dirty ? 'orange' : 'green'}>{ragStatusLabel(ragState.status)}</Tag>
                          <Typography.Text>dirty：{ragState.dirty ? '是' : '否'}</Typography.Text>
                          <Typography.Text>updatedAt：{ragState.updatedAt ? new Date(ragState.updatedAt).toLocaleString() : '暂无'}</Typography.Text>
                        </Space>
                        <Typography.Text>文本块 {ragState.chunkCount} · 已嵌入 {ragState.embeddedCount}</Typography.Text>
                        {ragState.warnings.map((warning) => <Alert key={warning} type="warning" message={warning} showIcon />)}
                      </Space>
                    ) : <Typography.Text type="secondary">请选择作品后查看索引状态。</Typography.Text>}
                  </Card>
                </Form>
              </Card>
            )
          },
          {
            key: 'prompts',
            label: '提示词',
            children: (
              <Card loading={loading} title="系统提示词与场景模板" className="feature-card">
                <Form form={promptForm} layout="vertical" onFinish={(values) => void savePrompts(values)}>
                  <Form.Item name="globalSystemPrompt" label="全局系统提示词"><Input.TextArea rows={4} /></Form.Item>
                  <Form.Item name={['scenarios', 'logic_check']} label="逻辑校验"><Input.TextArea rows={3} /></Form.Item>
                  <Form.Item name={['scenarios', 'setting_completion']} label="设定补全"><Input.TextArea rows={3} /></Form.Item>
                  <Form.Item name={['scenarios', 'foreshadowing']} label="伏笔提醒"><Input.TextArea rows={3} /></Form.Item>
                  <Form.Item name={['scenarios', 'rag_qa']} label="RAG 问答"><Input.TextArea rows={3} /></Form.Item>
                  <Button type="primary" htmlType="submit">保存提示词</Button>
                </Form>
              </Card>
            )
          },
          {
            key: 'skills',
            label: '技能开关',
            children: (
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
            )
          },
          {
            key: 'tools',
            label: 'HTTP 工具',
            children: (
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
            )
          }
        ]}
      />
    </Space>
  );
}

function ragStatusLabel(status: VectorIndexState['status']): string {
  return ({ ready: '可用', dirty: '需重建', building: '构建中', degraded: '降级', empty: '暂无索引' } as const)[status];
}
