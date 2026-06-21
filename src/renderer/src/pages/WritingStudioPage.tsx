import { CheckCircleOutlined, CloseOutlined, DeleteOutlined, FileAddOutlined, FolderAddOutlined, RobotOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Input, List, Popconfirm, Radio, Select, Space, Spin, Tabs, Tag, message } from 'antd';
import type { GetRef, InputRef } from 'antd';
import type { AiStreamChunk, AiValidationRequest, RagQueryRequest, ValidationFinding, ValidationResult } from '@shared/storageTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ensureDefaultBook, ensureDefaultVolume, listChapters, removeChapter, type ChapterNode, type ChapterStatus, upsertChapter } from '../iterationStore';
import { useAppStore } from '../store/appStore';

const statusOptions: Array<{ value: ChapterStatus; label: string }> = [
  { value: 'not_started', label: '未开始' },
  { value: 'drafting', label: '草稿中' },
  { value: 'done', label: '已完成' },
  { value: 'revision', label: '待修改' },
  { value: 'locked', label: '已锁定' }
];

export function WritingStudioPage(): React.JSX.Element {
  const location = useLocation();
  const selectedProject = useAppStore((state) => state.selectedProject);
  const refreshSidebar = useAppStore((state) => state.refreshSidebar);
  const [chapters, setChapters] = useState<ChapterNode[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findIndex, setFindIndex] = useState(-1);
  const [validationScope, setValidationScope] = useState<'chapter' | 'volume' | 'project'>('chapter');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  // AI 助手面板默认收起
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  // 编辑器中当前选中的文本，用于自动填入 AI 面板
  const [selectedText, setSelectedText] = useState('');
  const titleInputRef = useRef<InputRef>(null);
  const editorRef = useRef<GetRef<typeof Input.TextArea>>(null);

  const reload = useCallback((): void => {
    if (!selectedProject) {
      setChapters([]);
      setActiveId(undefined);
      return;
    }
    const book = ensureDefaultBook(selectedProject);
    const next = listChapters(selectedProject.id);
    const firstChapter = next.find((item) => item.kind === 'chapter');
    setChapters(next);
    setActiveId((current) => current ?? firstChapter?.id ?? book.id);
  }, [selectedProject]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    const chapterId = new URLSearchParams(location.search).get('chapter');
    if (chapterId && chapters.some((item) => item.id === chapterId)) {
      setActiveId(chapterId);
    }
  }, [chapters, location.search]);

  // 监听编辑器选中文本变化，同步到 selectedText 状态
  useEffect(() => {
    const ta = editorRef.current?.resizableTextArea?.textArea;
    if (!ta) return;
    const updateSelection = (): void => {
      const { selectionStart: start, selectionEnd: end } = ta;
      setSelectedText(start !== end ? ta.value.slice(start, end) : '');
    };
    ta.addEventListener('mouseup', updateSelection);
    ta.addEventListener('keyup', updateSelection);
    return () => {
      ta.removeEventListener('mouseup', updateSelection);
      ta.removeEventListener('keyup', updateSelection);
    };
  }, [activeId, mode]);

  const activeChapter = useMemo(() => chapters.find((item) => item.id === activeId), [activeId, chapters]);

  const startTitleEdit = (): void => {
    if (!activeChapter) return;
    setTitleDraft(activeChapter.title);
    setEditingTitle(true);
  };

  const commitTitleEdit = (): void => {
    if (!activeChapter || !editingTitle) return;
    const nextTitle = titleDraft.trim() || activeChapter.title;
    if (nextTitle !== activeChapter.title) {
      const updated = upsertChapter({ ...activeChapter, title: nextTitle });
      setChapters(listChapters(updated.projectId));
      setActiveId(updated.id);
    }
    setEditingTitle(false);
  };

  const createVolumeInline = (): void => {
    if (!selectedProject) return;
    const name = window.prompt('新建分卷名称', '新建分卷');
    if (!name?.trim()) return;
    const book = chapters.find((item) => item.kind === 'book');
    const created = upsertChapter({ projectId: selectedProject.id, title: name.trim(), kind: 'volume', parentId: book?.id, status: 'drafting' });
    setChapters(listChapters(selectedProject.id));
    setActiveId(created.id);
    refreshSidebar();
    message.success('分卷已创建');
  };

  const createChapterInline = (): void => {
    if (!selectedProject) return;
    const latestVolume = ensureDefaultVolume(selectedProject);
    const allChapters = chapters.filter((item) => item.kind === 'chapter');
    const nextIndex = allChapters.length + 1;
    const title = `第${nextIndex}章`;
    const created = upsertChapter({ projectId: selectedProject.id, title, kind: 'chapter', parentId: latestVolume.id, status: 'drafting' });
    setChapters(listChapters(selectedProject.id));
    setActiveId(created.id);
    refreshSidebar();
    message.success(`已创建 ${title}`);
  };

  const updateActive = (changes: Partial<ChapterNode>): void => {
    if (!activeChapter) return;
    const updated = upsertChapter({ ...activeChapter, ...changes });
    setChapters(listChapters(updated.projectId));
    setActiveId(updated.id);
    if ('title' in changes) refreshSidebar();
  };

  const runValidation = async (): Promise<void> => {
    if (!selectedProject || !activeChapter) return;
    const scopeText = collectValidationText(chapters, activeChapter, validationScope);
    const hide = message.loading(`正在校验${validationScopeLabel(validationScope)}...`, 0);
    try {
      const result = await window.hetuSketch.validation.basic({ projectId: selectedProject.id, text: scopeText });
      message.success(result.ok ? '当前章节未发现明显冲突' : `发现 ${result.findings.length} 条提醒`);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '逻辑校验失败');
    } finally {
      hide();
    }
  };

  const replaceCurrent = (): void => {
    if (!activeChapter || !findText) return;
    const idx = activeChapter.content.indexOf(findText, Math.max(findIndex, 0));
    if (idx < 0) {
      message.info('未找到匹配文本');
      return;
    }
    updateActive({ content: `${activeChapter.content.slice(0, idx)}${replaceText}${activeChapter.content.slice(idx + findText.length)}` });
    setFindIndex(idx + replaceText.length);
  };

  const replaceAll = (): void => {
    if (!activeChapter || !findText) return;
    updateActive({ content: activeChapter.content.split(findText).join(replaceText) });
    message.success('已完成全文替换');
  };

  if (!selectedProject) {
    return <Alert showIcon type="warning" message="请先选择作品" description="创作工作台需要绑定到具体作品，用于管理书 > 分卷 > 章节和正文内容。" />;
  }

  return (
    <div className="writing-studio-page">
      {activeChapter ? (
        <>
          <div className="studio-toolbar-flat">
            <div className="studio-toolbar-left">
              <div className="studio-title">
                {editingTitle ? (
                  <Input
                    ref={titleInputRef}
                    className="chapter-title-input"
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={commitTitleEdit}
                    onPressEnter={commitTitleEdit}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditingTitle(false);
                    }}
                  />
                ) : (
                  <button className="chapter-title-button" type="button" onClick={startTitleEdit} title="点击编辑章节名称">
                    {activeChapter.title}
                  </button>
                )}
              </div>
              <Select value={activeChapter.status} options={statusOptions} onChange={(status) => updateActive({ status })} size="small" />
            </div>
            <Space wrap className="studio-toolbar-actions" size={4}>
              <Button size="small" icon={<FolderAddOutlined />} onClick={createVolumeInline}>新建分卷</Button>
              <Button size="small" type="primary" icon={<FileAddOutlined />} onClick={createChapterInline}>新建章节</Button>
              <Radio.Group size="small" value={mode} onChange={(event) => setMode(event.target.value)} options={[{ value: 'edit', label: '编辑' }, { value: 'preview', label: '预览' }, { value: 'split', label: '双栏' }]} optionType="button" />
              <Input size="small" prefix={<SearchOutlined />} value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="查找" className="find-input" />
              <Input size="small" value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="替换为" className="find-input" />
              <Button size="small" onClick={replaceCurrent}>替换当前</Button>
              <Button size="small" onClick={replaceAll}>全部替换</Button>
              <Select size="small" value={validationScope} onChange={setValidationScope} options={[{ value: 'chapter', label: '当前章节' }, { value: 'volume', label: '当前分卷' }, { value: 'project', label: '当前作品' }]} />
              <Button size="small" icon={<SaveOutlined />} onClick={() => message.success('已自动保存到本地')}>保存</Button>
              <Button size="small" icon={<CheckCircleOutlined />} onClick={() => void runValidation()}>逻辑校验</Button>
              <Button size="small" type={aiPanelOpen ? 'primary' : 'default'} icon={<RobotOutlined />} onClick={() => setAiPanelOpen((open) => !open)}>AI 助手</Button>
              <Popconfirm title="删除该节点及子节点" onConfirm={() => { removeChapter(activeChapter.id); reload(); refreshSidebar(); }}>
                <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </Space>
          </div>

          <div className="studio-body">
            <div className={`studio-editor-area mode-${mode}`}>
              {mode !== 'preview' && (
                <Input.TextArea
                  ref={editorRef}
                  className="markdown-editor"
                  value={activeChapter.content}
                  onChange={(event) => updateActive({ content: event.target.value })}
                  placeholder="在这里写作。支持 Markdown 标题、列表、引用、代码块等基础语法。"
                />
              )}
              {mode !== 'edit' && <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(activeChapter.content) }} />}
            </div>
            {aiPanelOpen && (
              <AiAssistantPanel
                projectId={selectedProject.id}
                selectedText={selectedText}
                onClose={() => setAiPanelOpen(false)}
              />
            )}
          </div>
        </>
      ) : (
        <div className="studio-empty"><Empty description="请选择或创建章节" /></div>
      )}
    </div>
  );
}

interface AiAssistantPanelProps {
  projectId: string;
  selectedText: string;
  onClose: () => void;
}

// AI 助手侧边面板：包含 AI 校验、伏笔提醒、RAG 问答三个 Tab
function AiAssistantPanel({ projectId, selectedText, onClose }: AiAssistantPanelProps): React.JSX.Element {
  const navigate = useNavigate();
  const aiReady = useAppStore.getState().isAiReady();
  const [activeTab, setActiveTab] = useState<'validation' | 'foreshadowing' | 'rag'>('validation');

  // AI 校验 Tab 状态
  const [validationText, setValidationText] = useState('');
  const [validationOutput, setValidationOutput] = useState('');
  const [validationFindings, setValidationFindings] = useState<ValidationFinding[]>([]);
  const [validationLoading, setValidationLoading] = useState(false);

  // 伏笔提醒 Tab 状态
  const [foreshadowingText, setForeshadowingText] = useState('');
  const [foreshadowingOutput, setForeshadowingOutput] = useState('');
  const [foreshadowingReminders, setForeshadowingReminders] = useState<ValidationFinding[]>([]);
  const [foreshadowingLoading, setForeshadowingLoading] = useState(false);

  // RAG 问答 Tab 状态
  const [ragQuery, setRagQuery] = useState('');
  const [ragOutput, setRagOutput] = useState('');
  const [ragLoading, setRagLoading] = useState(false);

  // 编辑器选中文本时自动填入校验与伏笔输入框
  useEffect(() => {
    if (selectedText) {
      setValidationText(selectedText);
      setForeshadowingText(selectedText);
    }
  }, [selectedText]);

  // AI 未配置时展示空状态与前往设置入口
  if (!aiReady) {
    return (
      <aside className="ai-assistant-panel">
        <div className="ai-assistant-header">
          <span className="ai-assistant-title"><RobotOutlined /> AI 助手</span>
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
        </div>
        <div className="ai-assistant-empty">
          <Empty description="AI 尚未配置，请先在设置中开启 LLM 能力">
            <Button type="primary" onClick={() => navigate('/settings')}>前往设置</Button>
          </Empty>
        </div>
      </aside>
    );
  }

  // 执行 AI 流式校验
  const runValidation = async (): Promise<void> => {
    if (!validationText.trim()) {
      message.warning('请输入待校验文本');
      return;
    }
    setValidationLoading(true);
    setValidationOutput('');
    setValidationFindings([]);
    const request: AiValidationRequest = {
      projectId,
      text: validationText,
      includePlotReminders: true,
      retrievalMode: 'hybrid',
      topK: 5
    };
    // 流式版本会在主进程自行计算基础校验，这里传入空壳结果占位
    const basic: ValidationResult = {
      ok: true,
      checkedAt: new Date().toISOString(),
      summary: {
        checkedCharacters: 0,
        checkedWorldRules: 0,
        checkedOpenPlots: 0,
        warningCount: 0,
        reminderCount: 0
      },
      findings: []
    };
    try {
      await window.hetuSketch.ai.streamValidation(request, basic, (chunk: AiStreamChunk) => {
        if (chunk.type === 'delta' && chunk.content) {
          setValidationOutput((prev) => prev + chunk.content);
        } else if (chunk.type === 'error') {
          message.error(chunk.error ?? 'AI 校验出错');
        }
      });
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'AI 校验失败');
    } finally {
      setValidationLoading(false);
    }
  };

  // 执行伏笔流式分析
  const runForeshadowing = async (): Promise<void> => {
    if (!foreshadowingText.trim()) {
      message.warning('请输入待分析文本');
      return;
    }
    setForeshadowingLoading(true);
    setForeshadowingOutput('');
    setForeshadowingReminders([]);
    try {
      await window.hetuSketch.ai.streamForeshadowing(projectId, foreshadowingText, (chunk: AiStreamChunk) => {
        if (chunk.type === 'delta' && chunk.content) {
          setForeshadowingOutput((prev) => prev + chunk.content);
        } else if (chunk.type === 'error') {
          message.error(chunk.error ?? '伏笔分析出错');
        }
      });
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : '伏笔分析失败');
    } finally {
      setForeshadowingLoading(false);
    }
  };

  // 执行 RAG 流式问答
  const runRag = async (): Promise<void> => {
    if (!ragQuery.trim()) {
      message.warning('请输入问题');
      return;
    }
    setRagLoading(true);
    setRagOutput('');
    const request: RagQueryRequest = {
      projectId,
      query: ragQuery,
      topK: 5,
      retrievalMode: 'hybrid'
    };
    try {
      await window.hetuSketch.ai.streamRagAnswer(request, (chunk: AiStreamChunk) => {
        if (chunk.type === 'delta' && chunk.content) {
          setRagOutput((prev) => prev + chunk.content);
        } else if (chunk.type === 'error') {
          message.error(chunk.error ?? 'RAG 问答出错');
        }
      });
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : 'RAG 问答失败');
    } finally {
      setRagLoading(false);
    }
  };

  return (
    <aside className="ai-assistant-panel">
      <div className="ai-assistant-header">
        <span className="ai-assistant-title"><RobotOutlined /> AI 助手</span>
        <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
      </div>
      <div className="ai-assistant-body">
        <Tabs
          size="small"
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as typeof activeTab)}
          items={[
            {
              key: 'validation',
              label: 'AI 校验',
              children: (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Input.TextArea
                    rows={4}
                    value={validationText}
                    onChange={(event) => setValidationText(event.target.value)}
                    placeholder="粘贴待校验文本，或在编辑器中选中文本自动填入"
                  />
                  <Button block type="primary" icon={<RobotOutlined />} loading={validationLoading} onClick={() => void runValidation()}>AI 校验</Button>
                  {validationLoading && <div className="ai-stream-loading"><Spin size="small" /> <span>正在分析...</span></div>}
                  {validationOutput && <div className="ai-stream-output">{validationOutput}</div>}
                  <List
                    size="small"
                    dataSource={validationFindings}
                    locale={{ emptyText: 'AI 分析结果见上方文本输出' }}
                    renderItem={(finding) => <FindingItem finding={finding} />}
                  />
                </Space>
              )
            },
            {
              key: 'foreshadowing',
              label: '伏笔提醒',
              children: (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Input.TextArea
                    rows={4}
                    value={foreshadowingText}
                    onChange={(event) => setForeshadowingText(event.target.value)}
                    placeholder="粘贴待分析文本，或在编辑器中选中文本自动填入"
                  />
                  <Button block type="primary" icon={<RobotOutlined />} loading={foreshadowingLoading} onClick={() => void runForeshadowing()}>分析伏笔</Button>
                  {foreshadowingLoading && <div className="ai-stream-loading"><Spin size="small" /> <span>正在分析...</span></div>}
                  {foreshadowingOutput && <div className="ai-stream-output">{foreshadowingOutput}</div>}
                  <List
                    size="small"
                    dataSource={foreshadowingReminders}
                    locale={{ emptyText: 'AI 分析结果见上方文本输出' }}
                    renderItem={(finding) => <FindingItem finding={finding} />}
                  />
                </Space>
              )
            },
            {
              key: 'rag',
              label: 'RAG 问答',
              children: (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <Input.TextArea
                    rows={3}
                    value={ragQuery}
                    onChange={(event) => setRagQuery(event.target.value)}
                    placeholder="基于当前作品设定提问，例如：主角的红线是什么？"
                  />
                  <Button block type="primary" icon={<RobotOutlined />} loading={ragLoading} onClick={() => void runRag()}>提问</Button>
                  {ragLoading && <div className="ai-stream-loading"><Spin size="small" /> <span>正在思考...</span></div>}
                  {ragOutput && <div className="ai-stream-output">{ragOutput}</div>}
                </Space>
              )
            }
          ]}
        />
      </div>
    </aside>
  );
}

// Finding 卡片项：复用校验结果的展示样式
function FindingItem({ finding }: { finding: ValidationFinding }): React.JSX.Element {
  return (
    <List.Item>
      <List.Item.Meta
        title={<Space><Tag color={finding.severity === 'warning' ? 'red' : 'blue'}>{finding.severity === 'warning' ? '警告' : '提醒'}</Tag><span>{finding.title}</span></Space>}
        description={finding.message}
      />
    </List.Item>
  );
}

function collectValidationText(items: ChapterNode[], active: ChapterNode, scope: 'chapter' | 'volume' | 'project'): string {
  if (scope === 'chapter') return active.content;
  if (scope === 'project') return items.filter((item) => item.kind === 'chapter').map((item) => `# ${item.title}\n${item.content}`).join('\n\n');
  const volumeId = active.kind === 'volume' ? active.id : active.parentId;
  if (!volumeId) return active.content;
  return items.filter((item) => item.kind === 'chapter' && item.parentId === volumeId).map((item) => `# ${item.title}\n${item.content}`).join('\n\n');
}

function validationScopeLabel(scope: 'chapter' | 'volume' | 'project'): string {
  return ({ chapter: '当前章节', volume: '当前分卷', project: '当前作品' } as const)[scope];
}

function renderMarkdown(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br />');
}
