import { ExperimentOutlined, RobotOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, List, Space, Statistic, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import type { ValidationFinding, ValidationResult } from '@shared/storageTypes';
import { useAppStore } from '../store/appStore';

export function ChecksPage(): React.JSX.Element {
  const [form] = Form.useForm<{ text: string; includePlotReminders: boolean }>();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult>();
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);

  const runBasic = async (): Promise<void> => {
    if (!selectedProject) {
      message.warning('请先选择作品');
      return;
    }
    const values = await form.validateFields();
    setLoading(true);
    try {
      setResult(await window.hetuSketch.validation.basic({ projectId: selectedProject.id, text: values.text, includePlotReminders: true }));
      setAiWarnings([]);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '校验失败');
    } finally {
      setLoading(false);
    }
  };

  const runEnhanced = async (): Promise<void> => {
    if (!selectedProject) {
      message.warning('请先选择作品');
      return;
    }
    const values = await form.validateFields();
    setAiLoading(true);
    try {
      const response = await window.hetuSketch.validation.enhanced({ projectId: selectedProject.id, text: values.text, includePlotReminders: true, retrievalMode: 'hybrid', topK: 6 });
      if (response.data) {
        setResult({ ...response.data.validation, findings: response.data.mergedFindings });
      }
      setAiWarnings(response.warnings);
      if (response.status !== 'ok') {
        message.warning(response.error?.message ?? 'AI 增强已降级，保留本地校验结果');
      }
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'AI 增强校验失败');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Space direction="vertical" size="large" className="page-stack">
      <Card className="page-title-card">
        <Typography.Title level={2}>逻辑校验</Typography.Title>
        <Typography.Paragraph type="secondary">粘贴正文片段，基于角色红线、世界观硬规则和未回收伏笔执行离线校验；可选 AI 增强只作为建议。</Typography.Paragraph>
      </Card>

      {!selectedProject && <Alert showIcon type="warning" message="未选择作品" description="请先在作品管理中选择当前作品。" />}

      <Card title="待校验文本" className="feature-card">
        <Form form={form} layout="vertical">
          <Form.Item name="text" label="正文片段" rules={[{ required: true, message: '请输入待校验文本' }, { min: 10, message: '至少输入 10 个字符' }, { max: 50000, message: '单次校验不超过 50000 字' }]}>
            <Input.TextArea rows={10} placeholder="粘贴当前章节片段，系统会匹配角色红线、世界规则和伏笔线索" />
          </Form.Item>
          <Space wrap>
            <Button type="primary" icon={<ExperimentOutlined />} loading={loading} onClick={() => void runBasic()} disabled={!selectedProject}>基础校验</Button>
            <Button icon={<RobotOutlined />} loading={aiLoading} onClick={() => void runEnhanced()} disabled={!selectedProject}>AI 增强校验</Button>
          </Space>
        </Form>
      </Card>

      {aiWarnings.length > 0 && <Alert showIcon type="warning" message="AI 降级提示" description={aiWarnings.join('；')} />}

      {result && (
        <Card title="校验结果" className="feature-card">
          <Space wrap size="large" className="result-stats">
            <Statistic title="状态" value={result.ok ? '通过' : '需复核'} />
            <Statistic title="警告" value={result.summary.warningCount} />
            <Statistic title="伏笔提醒" value={result.summary.reminderCount} />
            <Statistic title="检查角色" value={result.summary.checkedCharacters} />
          </Space>
          <List
            className="finding-list"
            dataSource={result.findings}
            locale={{ emptyText: '未发现冲突或提醒' }}
            renderItem={(finding) => <FindingItem finding={finding} />}
          />
        </Card>
      )}
    </Space>
  );
}

function FindingItem({ finding }: { finding: ValidationFinding }): React.JSX.Element {
  return (
    <List.Item>
      <List.Item.Meta
        title={<Space><Tag color={finding.severity === 'warning' ? 'red' : 'blue'}>{finding.severity === 'warning' ? '警告' : '提醒'}</Tag><span>{finding.title}</span></Space>}
        description={(
          <Space direction="vertical" size={4}>
            <Typography.Text>{finding.message}</Typography.Text>
            {finding.excerpt && <Typography.Text type="secondary">证据：{finding.excerpt}</Typography.Text>}
            {finding.suggestion && <Typography.Text type="secondary">建议：{finding.suggestion}</Typography.Text>}
          </Space>
        )}
      />
    </List.Item>
  );
}
