import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookTree, Plotboard, PlotboardGenerationResult, PlotboardValidationResult, ProjectEntry, ProjectManifest, SearchResultItem } from '@shared/storageTypes';
import { PlotboardPage } from './PlotboardPage';
import { useAppStore } from '../store/appStore';

const project: ProjectManifest = {
  id: 'book-1',
  name: '测试作品',
  type: 'original',
  summary: '',
  createdAt: '2026-06-24T00:00:00.000Z',
  updatedAt: '2026-06-24T00:00:00.000Z',
  schemaVersion: 1
};

const tree: BookTree = {
  book: {
    id: 'book-1',
    title: '测试作品',
    type: 'original',
    summary: '',
    status: 'drafting',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    schemaVersion: 2
  },
  volumes: [{ id: 'vol-1', bookId: 'book-1', title: '第一卷', order: 1, actualWords: 0, status: 'drafting', createdAt: '2026-06-24T00:00:00.000Z', updatedAt: '2026-06-24T00:00:00.000Z' }],
  chapters: [{
    id: 'ch-1',
    bookId: 'book-1',
    volumeId: 'vol-1',
    title: '第一章 密室来信',
    content: '',
    format: 'markdown',
    order: 1,
    actualWords: 0,
    status: 'drafting',
    relatedCharacterIds: [],
    relatedWorldEntryIds: [],
    relatedPlotIds: [],
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z'
  }]
};

function emptyPlotboard(overrides: Partial<Plotboard> = {}): Plotboard {
  return {
    schemaVersion: 1,
    plotboardId: 'plotboard-1',
    bookId: 'book-1',
    chapterId: 'ch-1',
    projectId: 'book-1',
    cards: [],
    links: [],
    stateTemplates: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    ...overrides
  };
}

function generatedResult(markdown = '## 章节正文\n\n### 1. 围绕 阿洛\n阿洛收到密信。\n'): PlotboardGenerationResult {
  return {
    requestId: 'request-1',
    status: 'degraded',
    markdown,
    stateDiffs: [{ diffId: 'diff-1', targetType: 'character', targetId: 'char-1', fieldName: 'emotion', from: '平静', to: '警惕', reason: '密信触发', status: 'suggested' }],
    context: { plotboard: { plotboardId: 'plotboard-1', bookId: 'book-1', chapterId: 'ch-1' }, mode: 'full_chapter', cards: [], links: [], characters: [], worldRules: [], plotClues: [], stateTemplates: [], chapterSnapshot: { schemaVersion: 1, bookId: 'book-1', chapterId: 'ch-1', states: [], sourceDiffIds: [] }, sceneDeltas: [], neighborSummaries: [], generationSettings: { mode: 'full_chapter' } },
    warnings: ['LLM 未配置']
  };
}

function material(id: string, type: 'character' | 'world' | 'plot', title: string): SearchResultItem {
  return {
    id,
    projectId: 'book-1',
    type,
    title,
    excerpt: `${title} 摘要`,
    updatedAt: '2026-06-24T00:00:00.000Z'
  };
}

function validationResult(): PlotboardValidationResult {
  return {
    ok: false,
    checkedAt: '2026-06-24T00:00:00.000Z',
    summary: { timelineConflicts: 1, characterStateConflicts: 0, behaviorRedlineConflicts: 0, worldRuleConflicts: 0, plotThreadConflicts: 0, chapterContinuityConflicts: 0, warningCount: 0, errorCount: 1 },
    findings: [{ id: 'timeline-1', category: 'timeline', severity: 'error', cardId: 'card-conflict', message: '阿洛同一时间出现在不同地点', markdownLocation: { sourceCardId: 'card-conflict', paragraphIndex: 0, excerpt: '阿洛收到密信。' } }],
    clueStatusHints: [{ plotEntryId: 'plot-1', title: '密信伏笔', status: 'open', setupCardIds: ['card-setup'], reinforceCardIds: [], payoffCardIds: ['card-conflict'], shouldResolve: true }]
  };
}

describe('PlotboardPage', () => {
  beforeEach(() => {
    useAppStore.setState({ selectedProject: project });
    window.hetuSketch.plotboards.open = vi.fn(async () => emptyPlotboard());
    window.hetuSketch.plotboards.create = vi.fn(async () => emptyPlotboard());
    window.hetuSketch.plotboards.save = vi.fn(async (plotboard) => plotboard);
    window.hetuSketch.plotboards.syncIndex = vi.fn(async () => ({ scannedFiles: 1, indexedEntries: 1, indexedProjects: 0, removedFiles: 0, errors: [] }));
    window.hetuSketch.plotboards.exportOutline = vi.fn(async () => '# 剧情画布大纲\n\n## 导出节点\n');
    window.hetuSketch.plotboards.streamGenerate = vi.fn(async (_request, onChunk) => {
      const result = generatedResult();
      onChunk({ type: 'delta', content: result.markdown });
      return result;
    });
    window.hetuSketch.plotboards.writeGeneratedMarkdown = vi.fn(async (input) => ({ chapter: { id: input.chapterId, bookId: input.bookId, volumeId: 'vol-1', title: '第一章 密室来信', content: input.markdown, format: 'markdown' as const, order: 1, actualWords: input.markdown.length, status: 'drafting' as const, relatedCharacterIds: [], relatedWorldEntryIds: [], relatedPlotIds: [], createdAt: '2026-06-24T00:00:00.000Z', updatedAt: '2026-06-24T00:00:00.000Z' } }));
    window.hetuSketch.plotboards.settleDiffs = vi.fn(async () => ({ snapshot: { schemaVersion: 1 as const, bookId: 'book-1', chapterId: 'ch-1', states: [], sourceDiffIds: ['diff-1'] }, appliedDiffIds: ['diff-1'], rejectedDiffIds: [] }));
    window.hetuSketch.plotboards.validate = vi.fn(async () => validationResult());
    window.hetuSketch.chapters.listTree = vi.fn(async () => tree);
    window.hetuSketch.entries.list = vi.fn(async ({ type }: { type?: 'character' | 'world' | 'plot' }) => {
      if (type === 'character') return [material('char-1', 'character', '阿洛')];
      if (type === 'world') return [material('world-1', 'world', '北境雪原')];
      if (type === 'plot') return [material('plot-1', 'plot', '密信伏笔')];
      return [];
    });
    window.hetuSketch.entries.get = vi.fn(async (_projectId: string, type: 'character' | 'world' | 'plot', entryId: string): Promise<ProjectEntry> => {
      if (type === 'world') {
        return { id: entryId, projectId: 'book-1', type: 'world', title: '北境雪原', content: '', tags: [], relations: [], customFields: {}, createdAt: '', updatedAt: '', format: 'json', category: 'geography', rules: [] };
      }
      throw new Error('not found');
    });
    window.hetuSketch.entries.update = vi.fn(async (input): Promise<ProjectEntry> => ({ id: input.entryId, projectId: input.projectId, type: 'plot', title: '密信伏笔', content: '', tags: [], relations: [], customFields: {}, createdAt: '', updatedAt: '', format: 'json', inspirationType: 'plot_setting', relatedProjectIds: [], status: 'resolved', relatedCharacters: [] }));
    URL.createObjectURL = vi.fn(() => 'blob:plotboard-export');
    URL.revokeObjectURL = vi.fn(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('加载章节剧情画布并展示空状态引导和素材库', async () => {
    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/workspace/plotboard?chapter=ch-1']}>
          <PlotboardPage />
        </MemoryRouter>
      </ConfigProvider>
    );

    expect(await screen.findByText('剧情画布')).toBeInTheDocument();
    expect(screen.getByText('第一章 密室来信')).toBeInTheDocument();
    expect(screen.getByText(/双击空白处创建第一张剧情卡/)).toBeInTheDocument();
    expect(await screen.findByText('阿洛')).toBeInTheDocument();
  });

  it('点击素材可创建绑定引用的剧情卡并保存', async () => {
    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/workspace/plotboard?chapter=ch-1']}>
          <PlotboardPage />
        </MemoryRouter>
      </ConfigProvider>
    );

    const materialButton = await screen.findByRole('button', { name: /角色 阿洛/ });
    fireEvent.click(materialButton);

    expect((await screen.findAllByText('围绕 阿洛')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('阿洛').length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(window.hetuSketch.plotboards.save).toHaveBeenCalled());
    const saved = vi.mocked(window.hetuSketch.plotboards.save).mock.calls[0][0];
    expect(saved.cards[0].characterIds).toContain('char-1');
  });

  it('点击模板素材会插入一组剧情卡和连线', async () => {
    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/workspace/plotboard?chapter=ch-1']}>
          <PlotboardPage />
        </MemoryRouter>
      </ConfigProvider>
    );

    fireEvent.click(await screen.findByRole('tab', { name: '模板' }));
    fireEvent.click(await screen.findByRole('button', { name: /模板 三幕式推进/ }));
    expect((await screen.findAllByText('第一幕：诱因与目标')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('第二幕：对抗升级').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(window.hetuSketch.plotboards.save).toHaveBeenCalled());
    const saved = vi.mocked(window.hetuSketch.plotboards.save).mock.calls[0][0];
    expect(saved.cards).toHaveLength(3);
    expect(saved.links).toHaveLength(2);
  });

  it('选中状态变更卡后高亮因果传播后继，并展示多 POV 状态轴', async () => {
    window.hetuSketch.plotboards.open = vi.fn(async () => emptyPlotboard({
      cards: [
        { cardId: 'a', title: 'A 行动', fact: 'A 改变态度。', cardType: 'event', timecode: '1', povCharacterId: 'char-1', locationWorldEntryId: '', characterIds: ['char-1'], worldEntryIds: [], plotEntryIds: [], stateDeltas: [{ ownerType: 'character', ownerId: 'char-1', fieldName: 'emotion', operator: 'set', value: '警惕' }], narrativeTone: [], x: 0, y: 0, createdAt: '', updatedAt: '' },
        { cardId: 'b', title: 'B 后果', fact: 'B 受影响。', cardType: 'event', timecode: '2', povCharacterId: 'char-1', locationWorldEntryId: '', characterIds: ['char-1'], worldEntryIds: [], plotEntryIds: [], stateDeltas: [{ ownerType: 'character', ownerId: 'char-1', fieldName: 'emotion', operator: 'set', value: '恐惧' }], narrativeTone: [], x: 280, y: 0, createdAt: '', updatedAt: '' }
      ],
      links: [{ linkId: 'causal-1', sourceCardId: 'a', targetCardId: 'b', linkType: 'causal', motivation: '情绪传导' }]
    }));

    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/workspace/plotboard?chapter=ch-1']}>
          <PlotboardPage />
        </MemoryRouter>
      </ConfigProvider>
    );

    expect(await screen.findByText('多 POV 状态轴')).toBeInTheDocument();
    expect(screen.getByText('char-1.emotion')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('A 行动').find((item) => item.closest('article'))!);
    await waitFor(() => expect(screen.getAllByText('B 后果').find((item) => item.closest('article'))?.closest('article')).toHaveClass('is-propagation-highlighted'));
  });

  it('支持 Markdown 大纲导出和 SVG 图片导出', async () => {
    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/workspace/plotboard?chapter=ch-1']}>
          <PlotboardPage />
        </MemoryRouter>
      </ConfigProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /导出大纲/ }));
    await waitFor(() => expect(window.hetuSketch.plotboards.exportOutline).toHaveBeenCalledWith('book-1', 'ch-1'));
    fireEvent.click(screen.getByRole('button', { name: /图片导出/ }));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });

  it('生成正文后写入章节并展示 State Diff 结算入口', async () => {
    render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/workspace/plotboard?chapter=ch-1']}>
          <PlotboardPage />
        </MemoryRouter>
      </ConfigProvider>
    );

    fireEvent.click(await screen.findByRole('button', { name: /角色 阿洛/ }));
    fireEvent.click(screen.getByRole('button', { name: /生成正文/ }));

    expect(await screen.findByText('AI 生成与状态结算')).toBeInTheDocument();
    await waitFor(() => expect(window.hetuSketch.plotboards.writeGeneratedMarkdown).toHaveBeenCalled());
    expect(screen.getByText('State Diff 建议')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /逻辑校验/ }));
    expect(await screen.findByText('逻辑校验与线索回收')).toBeInTheDocument();
    expect(screen.getByText(/阿洛同一时间出现在不同地点/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /已回收，更新为 resolved/ }));
    await waitFor(() => expect(window.hetuSketch.entries.update).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'plot-1', changes: { status: 'resolved' } })));

    fireEvent.mouseDown(screen.getByText('待定'));
    fireEvent.click(await screen.findByTitle('确认'));
    fireEvent.click(screen.getByRole('button', { name: /写入已确认 Diff/ }));
    await waitFor(() => expect(window.hetuSketch.plotboards.settleDiffs).toHaveBeenCalled());
  });
});
