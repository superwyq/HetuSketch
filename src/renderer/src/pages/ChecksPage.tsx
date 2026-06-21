import { DownOutlined, ExperimentOutlined, RobotOutlined, StopOutlined, UpOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, InputNumber, List, Pagination, Segmented, Slider, Space, Spin, Statistic, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AiStreamChunk, AiValidationRequest, RetrievalMode, ValidationFinding, ValidationResult } from '@shared/storageTypes';
import { useAppStore } from '../store/appStore';

// 检索参数持久化 key
const CHECKS_PARAMS_KEY = 'hetusketch.checks.params.v1';
// 分页每页条数
const PAGE_SIZE = 10;
// 触发分页的最小 Finding 数量阈值
const PAGINATION_THRESHOLD = 20;

interface ChecksParams {
  topK: number;
  retrievalMode: RetrievalMode;
  maxContextChars: number;
}

// 默认检索参数
const DEFAULT_PARAMS: ChecksParams = {
  topK: 6,
  retrievalMode: 'hybrid',
  maxContextChars: 4000
};

// 从 localStorage 读取检索参数
function readParams(): ChecksParams {
  try {
    const raw = localStorage.getItem(CHECKS_PARAMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ChecksParams>;
      return { ...DEFAULT_PARAMS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PARAMS;
}

// 写入检索参数到 localStorage
function writeParams(params: ChecksParams): void {
  try {
    localStorage.setItem(CHECKS_PARAMS_KEY, JSON.stringify(params));
  } catch {
    // ignore
  }
}

// 检索模式选项
const RETRIEVAL_MODE_OPTIONS: Array<{ label: string; value: RetrievalMode }> = [
  { label: '关键词搜索', value: 'fts' },
  { label: '向量搜索', value: 'vector' },
  { label: '混合', value: 'hybrid' }
];

// 严重程度过滤值
type SeverityFilter = 'all' | 'warning' | 'info';
const SEVERITY_FILTER_OPTIONS: Array<{ label: string; value: SeverityFilter }> = [
  { label: '全部', value: 'all' },
  { label: '警告', value: 'warning' },
  { label: '提醒', value: 'info' }
];

export function ChecksPage(): React.JSX.Element {
  const [form] = Form.useForm<{ text: string; includePlotReminders: boolean }>();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [result, setResult] = useState<ValidationResult>();
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);

  // 检索参数（持久化到 localStorage）
  const [params, setParams] = useState<ChecksParams>(readParams);

  // 流式输出相关状态
  const [streamingText, setStreamingText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamInterrupted, setStreamInterrupted] = useState(false);
  const [streamError, setStreamError] = useState<string>();
  const [usage, setUsage] = useState<AiStreamChunk['usage']>();

  // 中断标志（使用 ref 避免 onChunk 闭包捕获旧状态）
  const streamInterruptedRef = useRef(false);

  // 结果过滤与分页
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [page, setPage] = useState(1);

  // 参数变更时持久化
  useEffect(() => {
    writeParams(params);
  }, [params]);

  // 过滤条件变化时重置页码
  useEffect(() => {
    setPage(1);
  }, [severityFilter]);

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
      // 清空流式状态
      setStreamingText('');
      setStreamError(undefined);
      setStreamInterrupted(false);
      setUsage(undefined);
      setPage(1);
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

    // 先执行基础校验，立即展示基础结果
    let basicResult: ValidationResult;
    try {
      basicResult = await window.hetuSketch.validation.basic({ projectId: selectedProject.id, text: values.text, includePlotReminders: true });
      setResult(basicResult);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '基础校验失败');
      return;
    }

    // 重置流式状态
    streamInterruptedRef.current = false;
    setStreamingText('');
    setStreamError(undefined);
    setStreamInterrupted(false);
    setUsage(undefined);
    setStreaming(true);
    setAiLoading(true);
    setAiWarnings([]);
    setPage(1);

    const request: AiValidationRequest = {
      projectId: selectedProject.id,
      text: values.text,
      includePlotReminders: true,
      topK: params.topK,
      retrievalMode: params.retrievalMode
    };

    try {
      await window.hetuSketch.ai.streamValidation(request, basicResult, (chunk: AiStreamChunk) => {
        // 用户已中断，忽略后续 chunk
        if (streamInterruptedRef.current) return;

        switch (chunk.type) {
          case 'delta':
            // 文本增量：追加到流式输出区域
            if (chunk.content) {
              setStreamingText((prev) => prev + chunk.content);
            }
            break;
          case 'usage':
            // Token 消耗信息
            if (chunk.usage) {
              setUsage(chunk.usage);
            }
            break;
          case 'error':
            // 错误信息
            setStreamError(chunk.error ?? 'AI 流式校验出错');
            break;
          case 'finish':
            // 流式输出完成
            break;
        }
      });
    } catch (reason) {
      if (!streamInterruptedRef.current) {
        setStreamError(reason instanceof Error ? reason.message : 'AI 流式校验失败');
      }
    } finally {
      setStreaming(false);
      setAiLoading(false);
    }
  };

  // 停止流式输出（仅 UI 层面，当前 IPC 不支持取消）
  const handleStop = (): void => {
    streamInterruptedRef.current = true;
    setStreamInterrupted(true);
    setStreaming(false);
    setAiLoading(false);
  };

  // 按严重程度过滤 findings
  const filteredFindings = useMemo(() => {
    if (!result) return [];
    if (severityFilter === 'all') return result.findings;
    return result.findings.filter((f) => f.severity === severityFilter);
  }, [result, severityFilter]);

  // Finding 数量超过阈值时分页
  const needPagination = filteredFindings.length > PAGINATION_THRESHOLD;

  // 当前页的 findings
  const pagedFindings = useMemo(() => {
    if (!needPagination) return filteredFindings;
    const start = (page - 1) * PAGE_SIZE;
    return filteredFindings.slice(start, start + PAGE_SIZE);
  }, [filteredFindings, needPagination, page]);

  // 是否展示 AI 流式分析卡片
  const showStreamCard = streaming || streamingText.length > 0 || Boolean(streamError) || streamInterrupted;

  return (
    <Space direction="vertical" size="middle" className="page-stack">
      {!selectedProject && <Alert showIcon type="warning" message="未选择作品" description="请先在作品管理中选择当前作品。" />}

      <Card title="待校验文本" className="feature-card">
        <Form form={form} layout="vertical">
          <Form.Item name="text" label="正文片段" rules={[{ required: true, message: '请输入待校验文本' }, { min: 10, message: '至少输入 10 个字符' }, { max: 50000, message: '单次校验不超过 50000 字' }]}>
            <Input.TextArea rows={10} placeholder="粘贴当前章节片段，系统会匹配角色红线、世界规则和伏笔线索" />
          </Form.Item>
          <Space wrap>
            <Button type="primary" icon={<ExperimentOutlined />} loading={loading} onClick={() => void runBasic()} disabled={!selectedProject}>基础校验</Button>
            <Button icon={<RobotOutlined />} loading={aiLoading} onClick={() => void runEnhanced()} disabled={!selectedProject || streaming}>AI 增强校验</Button>
            {streaming && <Button danger icon={<StopOutlined />} onClick={handleStop}>停止</Button>}
          </Space>
        </Form>
      </Card>

      <Card title="检索参数" className="feature-card" size="small">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Text strong>Top K（检索条数）</Typography.Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <Slider
                min={1}
                max={20}
                step={1}
                value={params.topK}
                onChange={(value) => setParams((prev) => ({ ...prev, topK: value }))}
                style={{ flex: 1 }}
              />
              <InputNumber
                min={1}
                max={20}
                value={params.topK}
                onChange={(value) => setParams((prev) => ({ ...prev, topK: value ?? DEFAULT_PARAMS.topK }))}
                style={{ width: 80 }}
              />
            </div>
          </div>
          <div>
            <Typography.Text strong>检索模式</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Segmented
                options={RETRIEVAL_MODE_OPTIONS}
                value={params.retrievalMode}
                onChange={(value) => setParams((prev) => ({ ...prev, retrievalMode: value as RetrievalMode }))}
              />
            </div>
          </div>
          <div>
            <Typography.Text strong>最大上下文长度（字符）</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <InputNumber
                min={500}
                max={20000}
                step={500}
                value={params.maxContextChars}
                onChange={(value) => setParams((prev) => ({ ...prev, maxContextChars: value ?? DEFAULT_PARAMS.maxContextChars }))}
                style={{ width: 160 }}
              />
            </div>
          </div>
        </Space>
      </Card>

      {aiWarnings.length > 0 && <Alert showIcon type="warning" message="AI 降级提示" description={aiWarnings.join('；')} />}

      {result && (
        <Card title="校验结果" className="feature-card">
          <Space wrap size="middle" className="result-stats">
            <Statistic title="状态" value={result.ok ? '通过' : '需复核'} />
            <Statistic title="警告" value={result.summary.warningCount} />
            <Statistic title="伏笔提醒" value={result.summary.reminderCount} />
            <Statistic title="检查角色" value={result.summary.checkedCharacters} />
          </Space>
          <Space style={{ marginBottom: 12 }} align="center">
            <Segmented
              options={SEVERITY_FILTER_OPTIONS}
              value={severityFilter}
              onChange={(value) => setSeverityFilter(value as SeverityFilter)}
            />
            <Typography.Text type="secondary">共 {filteredFindings.length} 条</Typography.Text>
          </Space>
          <List
            className="finding-list"
            dataSource={pagedFindings}
            locale={{ emptyText: '未发现冲突或提醒' }}
            renderItem={(finding) => <FindingItem finding={finding} />}
          />
          {needPagination && (
            <Pagination
              style={{ marginTop: 16, textAlign: 'right' }}
              current={page}
              pageSize={PAGE_SIZE}
              total={filteredFindings.length}
              onChange={(p) => setPage(p)}
              showSizeChanger={false}
            />
          )}
        </Card>
      )}

      {showStreamCard && (
        <Card
          title={
            <Space>
              <RobotOutlined />
              <span>AI 流式分析</span>
              {streaming && <Spin size="small" />}
            </Space>
          }
          className="feature-card"
        >
          {streamError && <Alert showIcon type="error" message="流式校验出错" description={streamError} style={{ marginBottom: 12 }} />}
          {streamInterrupted && <Alert showIcon type="warning" message="已中断" description="用户已停止接收流式输出。" style={{ marginBottom: 12 }} />}
          {streamingText.length > 0 ? (
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: usage ? 12 : 0 }}>{streamingText}</Typography.Paragraph>
          ) : (
            !streamError && !streamInterrupted && <Typography.Text type="secondary">等待 AI 输出...</Typography.Text>
          )}
          {usage && (
            <Space size="small" wrap>
              <Typography.Text type="secondary">Token 消耗：</Typography.Text>
              {usage.promptTokens !== undefined && <Tag>提示 {usage.promptTokens}</Tag>}
              {usage.completionTokens !== undefined && <Tag>补全 {usage.completionTokens}</Tag>}
              {usage.totalTokens !== undefined && <Tag color="blue">合计 {usage.totalTokens}</Tag>}
            </Space>
          )}
        </Card>
      )}
    </Space>
  );
}

function FindingItem({ finding }: { finding: ValidationFinding }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(finding.excerpt || finding.suggestion);

  return (
    <List.Item>
      <List.Item.Meta
        title={
          <Space>
            <Tag color={finding.severity === 'warning' ? 'red' : 'blue'}>{finding.severity === 'warning' ? '警告' : '提醒'}</Tag>
            <span>{finding.title}</span>
            {hasDetail && (
              <Button type="link" size="small" onClick={() => setExpanded((prev) => !prev)}>
                {expanded ? '收起' : '展开'}
                {expanded ? <UpOutlined /> : <DownOutlined />}
              </Button>
            )}
          </Space>
        }
        description={(
          <Space direction="vertical" size={4}>
            <Typography.Text>{finding.message}</Typography.Text>
            {expanded && (
              <>
                {finding.excerpt && <Typography.Text type="secondary">证据：{finding.excerpt}</Typography.Text>}
                {finding.suggestion && <Typography.Text type="secondary">建议：{finding.suggestion}</Typography.Text>}
              </>
            )}
          </Space>
        )}
      />
    </List.Item>
  );
}
