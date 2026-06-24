import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookService } from './bookService.js';
import { ChapterService } from './chapterService.js';
import { PlotboardService } from './plotboardService.js';
import type { PlotCard, ProjectEntry, StateSnapshot } from '../../shared/storageTypes.js';
import { getStoragePaths } from './storagePaths.js';

let tempDir: string;
let service: PlotboardService;
let chapterService: ChapterService;

const now = '2026-06-24T00:00:00.000Z';

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'hetu-plotboard-ai-'));
  const paths = getStoragePaths(tempDir);
  const bookService = new BookService(paths);
  chapterService = new ChapterService(bookService, paths);
  await bookService.create({ id: 'book-1', title: '测试书', type: 'original' });
  const volume = await chapterService.createVolume({ bookId: 'book-1', id: 'vol-1', title: '第一卷' });
  await chapterService.createChapter({ bookId: 'book-1', volumeId: volume.id, id: 'ch-0', title: '序章', content: '上一章正文', order: 0 });
  await chapterService.createChapter({ bookId: 'book-1', volumeId: volume.id, id: 'ch-1', title: '第一章', content: '旧正文', order: 1 });
  const entries = new Map<string, ProjectEntry>([
    ['char-1', { id: 'char-1', projectId: 'book-1', type: 'character', title: '阿洛', summary: '侦探', content: '谨慎的侦探', tags: [], relations: [], customFields: {}, createdAt: now, updatedAt: now, format: 'json', role: 'protagonist', personalityTags: ['谨慎'], redLines: ['绝不主动杀害无辜者'] }],
    ['world-1', { id: 'world-1', projectId: 'book-1', type: 'world', title: '旧城', summary: '雨夜旧城', content: '旧城永远有雾', tags: [], relations: [], customFields: {}, createdAt: now, updatedAt: now, format: 'json', category: 'geography', rules: ['雾会屏蔽远距离通讯'] }],
    ['world-2', { id: 'world-2', projectId: 'book-1', type: 'world', title: '钟楼', summary: '旧城钟楼', content: '钟楼高处', tags: [], relations: [], customFields: {}, createdAt: now, updatedAt: now, format: 'json', category: 'geography', rules: ['死亡不能复活'] }],
    ['plot-1', { id: 'plot-1', projectId: 'book-1', type: 'plot', title: '密信', summary: '未回收密信', content: '密信指向旧城钟楼', tags: [], relations: [], customFields: {}, createdAt: now, updatedAt: now, format: 'json', inspirationType: 'plot_setting', relatedProjectIds: [], status: 'open', relatedCharacters: ['char-1'] }]
  ]);
  service = new PlotboardService(paths, chapterService, undefined, async (_projectId, _type, entryId) => {
    const entry = entries.get(entryId);
    if (!entry) throw new Error('not found');
    return entry;
  });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function card(overrides: Partial<PlotCard> = {}): PlotCard {
  return {
    cardId: overrides.cardId ?? 'card-1',
    title: overrides.title ?? '收到密信',
    fact: overrides.fact ?? '阿洛在旧城收到一封没有署名的密信。',
    cardType: overrides.cardType ?? 'event',
    locationWorldEntryId: overrides.locationWorldEntryId ?? 'world-1',
    characterIds: overrides.characterIds ?? ['char-1'],
    worldEntryIds: overrides.worldEntryIds ?? ['world-1'],
    plotEntryIds: overrides.plotEntryIds ?? ['plot-1'],
    stateDeltas: overrides.stateDeltas ?? [{ ownerType: 'character', ownerId: 'char-1', fieldName: 'emotion', operator: 'set', value: '警惕', reason: '密信威胁' }],
    narrativeTone: overrides.narrativeTone ?? ['悬疑'],
    detailLevel: 3,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function plotboard(cards: PlotCard[], links: Array<{ linkId: string; sourceCardId: string; targetCardId: string; linkType: 'sequence' | 'causal' | 'parallel' | 'flashback' | 'conditional'; motivation?: string }> = []) {
  return { schemaVersion: 1 as const, plotboardId: 'plotboard-1', bookId: 'book-1', chapterId: 'ch-1', projectId: 'book-1', cards, links, viewport: { x: 0, y: 0, zoom: 1 }, createdAt: now, updatedAt: now };
}

async function savePreviousLocation(location: string): Promise<StateSnapshot> {
  return service.saveStateSnapshot('book-1', { schemaVersion: 1, bookId: 'book-1', chapterId: 'ch-0', states: [{ ownerType: 'character', ownerId: 'char-1', fields: { location: { value: location } } }], sourceDiffIds: [], createdAt: now, updatedAt: now });
}

describe('PlotboardService AI generation and state snapshots', () => {
  it('组装 AI 上下文时包含卡片事实、素材设定、快照、增量和邻近摘要', async () => {
    await service.savePlotboard({
      schemaVersion: 1,
      plotboardId: 'plotboard-1',
      bookId: 'book-1',
      chapterId: 'ch-1',
      projectId: 'book-1',
      cards: [card(), card({ cardId: 'card-2', title: '前往钟楼', fact: '阿洛决定前往钟楼。', x: 260 })],
      links: [{ linkId: 'link-1', sourceCardId: 'card-1', targetCardId: 'card-2', linkType: 'sequence', motivation: '密信指向钟楼' }],
      stateTemplates: [{ templateId: 'tpl-1', ownerType: 'character', ownerId: 'char-1', fieldName: 'emotion', valueType: 'text', currentValue: '平静', semanticPrompt: '角色情绪', visibility: 'chapter' }],
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now
    });

    const context = await service.buildAiContext({ bookId: 'book-1', chapterId: 'ch-1', settings: { mode: 'single_card', selectedCardIds: ['card-1'] } });

    expect(context.cards).toHaveLength(1);
    expect(context.characters[0].title).toBe('阿洛');
    expect(context.worldRules[0].rules).toContain('雾会屏蔽远距离通讯');
    expect(context.plotClues[0].status).toBe('open');
    expect(context.chapterSnapshot.states[0].fields.emotion.value).toBe('平静');
    expect(context.sceneDeltas[0].value).toBe('警惕');
    expect(context.neighborSummaries[0].cardId).toBe('card-2');
  });

  it('未配置 AI 时降级生成 Markdown，并对重写模式标记旧正文过期', async () => {
    await service.savePlotboard({ schemaVersion: 1, plotboardId: 'plotboard-1', bookId: 'book-1', chapterId: 'ch-1', projectId: 'book-1', cards: [card()], links: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: now, updatedAt: now });

    const result = await service.generate({ bookId: 'book-1', chapterId: 'ch-1', settings: { mode: 'rewrite', selectedCardIds: ['card-1'], rewriteStrategy: 'mark_stale_and_append' } });

    expect(result.status).toBe('degraded');
    expect(result.warnings[0]).toContain('LLM 未配置');
    expect(result.markdown).toContain('PLOTBOARD_STALE_START');
    expect(result.markdown).toContain('阿洛在旧城收到一封没有署名的密信');
    expect(result.stateDiffs[0].to).toBe('警惕');
  });

  it('确认 State Diff 后写入章节状态快照', async () => {
    const settled = await service.settleStateDiffs({
      bookId: 'book-1',
      chapterId: 'ch-1',
      diffs: [
        { diffId: 'diff-1', targetType: 'character', targetId: 'char-1', fieldName: 'emotion', from: '平静', to: '警惕', reason: '密信威胁', status: 'accepted' },
        { diffId: 'diff-2', targetType: 'plot', targetId: 'plot-1', fieldName: 'status', from: 'open', to: 'resolved', reason: '未确认', status: 'rejected' }
      ]
    });

    expect(settled.appliedDiffIds).toEqual(['diff-1']);
    expect(settled.rejectedDiffIds).toEqual(['diff-2']);
    expect(settled.snapshot.states.find((item) => item.ownerId === 'char-1')?.fields.emotion.value).toBe('警惕');
    expect(settled.snapshot.sourceDiffIds).toContain('diff-1');
  });
});

describe('PlotboardService advanced export', () => {
  it('导出 Markdown 大纲时包含卡片、POV、状态变更和连线信息', async () => {
    const board = plotboard([
      card({ cardId: 'a', title: '诱因', timecode: 'Act 1', povCharacterId: 'char-1' }),
      card({ cardId: 'b', title: '后果', timecode: 'Act 2', povCharacterId: 'char-1', x: 300 })
    ], [{ linkId: 'causal-1', sourceCardId: 'a', targetCardId: 'b', linkType: 'causal', motivation: '诱因导致后果' }]);
    await service.savePlotboard(board);

    const markdown = service.exportMarkdownOutline(board);

    expect(markdown).toContain('# 剧情画布大纲');
    expect(markdown).toContain('## 诱因');
    expect(markdown).toContain('- POV：char-1');
    expect(markdown).toContain('character:char-1:emotion');
    expect(markdown).toContain('a -> b（causal）：诱因导致后果');
  });

  it('可将导出的 Markdown 大纲写入文件作为导出产物', async () => {
    const board = plotboard([card({ cardId: 'outline-card', title: '导出节点' })]);
    await service.savePlotboard(board);
    const outputPath = join(tempDir, 'plotboard-outline.md');

    await writeFile(outputPath, service.exportMarkdownOutline(board), 'utf8');

    await expect(readFile(outputPath, 'utf8')).resolves.toContain('导出节点');
  });
});

describe('PlotboardService PRD author scenarios', () => {
  it('用户场景：长篇架构型作者可按因果链生成整章并保留事件顺序', async () => {
    await service.savePlotboard(plotboard([
      card({ cardId: 'middle', title: '中段反击', fact: '阿洛根据密信反击幕后人。', timecode: 'Day 3 12:00', x: 500 }),
      card({ cardId: 'start', title: '开端铺垫', fact: '阿洛发现密信里的旧城暗号。', timecode: 'Day 3 08:00', x: 0 }),
      card({ cardId: 'end', title: '结尾余波', fact: '阿洛意识到钟楼仍有第二封信。', timecode: 'Day 3 20:00', x: 1000 })
    ], [
      { linkId: 'seq-1', sourceCardId: 'start', targetCardId: 'middle', linkType: 'sequence', motivation: '暗号指向幕后人' },
      { linkId: 'cause-1', sourceCardId: 'middle', targetCardId: 'end', linkType: 'causal', motivation: '反击暴露新线索' }
    ]));

    const result = await service.generate({ bookId: 'book-1', chapterId: 'ch-1', settings: { mode: 'full_chapter' } });

    expect(result.markdown.indexOf('开端铺垫')).toBeLessThan(result.markdown.indexOf('中段反击'));
    expect(result.markdown.indexOf('中段反击')).toBeLessThan(result.markdown.indexOf('结尾余波'));
    expect(result.context.links.map((link) => link.linkType)).toEqual(['sequence', 'causal']);
  });

  it('用户场景：情感叙事作者可用自定义关系状态生成 Diff，并修改确认后结算', async () => {
    await service.saveStateSnapshot('book-1', { schemaVersion: 1, bookId: 'book-1', chapterId: 'ch-1', states: [{ ownerType: 'character', ownerId: 'char-1', fields: { 信任度: { value: 60, semanticPrompt: '低于 50 时对白更防备' } } }], sourceDiffIds: [], createdAt: now, updatedAt: now });
    await service.savePlotboard(plotboard([
      card({ cardId: 'emotion', title: '误会加深', fact: '阿洛误以为同伴隐瞒密信。', stateDeltas: [{ ownerType: 'character', ownerId: 'char-1', fieldName: '信任度', operator: 'decrease', value: 15, reason: '误会加深' }] })
    ]));

    const result = await service.generate({ bookId: 'book-1', chapterId: 'ch-1', settings: { mode: 'single_card', selectedCardIds: ['emotion'] } });
    const [diff] = result.stateDiffs;
    const settled = await service.settleStateDiffs({ bookId: 'book-1', chapterId: 'ch-1', diffs: [{ ...diff, to: 40, status: 'modified' }] });

    expect(diff.from).toBe(60);
    expect(diff.to).toBe(45);
    expect(settled.snapshot.states.find((item) => item.ownerId === 'char-1')?.fields.信任度.value).toBe(40);
  });

  it('用户场景：悬疑推理作者可追踪线索埋设、强化、回收状态', async () => {
    await service.savePlotboard(plotboard([
      card({ cardId: 'setup', title: '埋设密信', cardType: 'clue_setup', plotClueUsages: { 'plot-1': 'setup' } }),
      card({ cardId: 'reinforce', title: '强化密信', cardType: 'clue_reinforce', plotClueUsages: { 'plot-1': 'reinforce' }, x: 300 }),
      card({ cardId: 'payoff', title: '回收密信', cardType: 'clue_payoff', plotClueUsages: { 'plot-1': 'payoff' }, x: 600 })
    ], [
      { linkId: 'seq-1', sourceCardId: 'setup', targetCardId: 'reinforce', linkType: 'sequence' },
      { linkId: 'seq-2', sourceCardId: 'reinforce', targetCardId: 'payoff', linkType: 'sequence' }
    ]));

    const result = await service.validatePlotboard({ bookId: 'book-1', chapterId: 'ch-1' });

    expect(result.summary.plotThreadConflicts).toBe(0);
    expect(result.clueStatusHints[0]).toMatchObject({ setupCardIds: ['setup'], reinforceCardIds: ['reinforce'], payoffCardIds: ['payoff'], shouldResolve: true });
  });

  it('用户场景：同人作者生成前后可校验角色红线与世界观硬规则', async () => {
    await service.savePlotboard(plotboard([
      card({ cardId: 'ooc', title: '越界行动', fact: '阿洛可以主动杀害无辜者，并在钟楼复活死者。', locationWorldEntryId: 'world-2', worldEntryIds: ['world-2'], plotEntryIds: [] })
    ]));

    const result = await service.validatePlotboard({ bookId: 'book-1', chapterId: 'ch-1', markdown: '### 越界行动\n阿洛可以主动杀害无辜者，并在钟楼复活死者。' });

    expect(result.findings.some((item) => item.category === 'behavior-redline' && item.rule?.includes('绝不主动杀害无辜者'))).toBe(true);
    expect(result.findings.some((item) => item.category === 'world-rule' && item.rule?.includes('死亡不能复活'))).toBe(true);
  });

  it('用户场景：碎片化创作者的插叙卡读取历史章节快照而不污染主线状态', async () => {
    await service.saveStateSnapshot('book-1', { schemaVersion: 1, bookId: 'book-1', chapterId: 'ch-0', states: [{ ownerType: 'character', ownerId: 'char-1', fields: { 视力: { value: '正常' } } }], sourceDiffIds: [], createdAt: now, updatedAt: now });
    await service.saveStateSnapshot('book-1', { schemaVersion: 1, bookId: 'book-1', chapterId: 'ch-1', states: [{ ownerType: 'character', ownerId: 'char-1', fields: { 视力: { value: '失明' } } }], sourceDiffIds: [], createdAt: now, updatedAt: now });
    await service.savePlotboard(plotboard([
      card({ cardId: 'now', title: '主线现在', fact: '阿洛在主线中已经失明。', timecode: 'Day 30' }),
      card({ cardId: 'flashback', title: '回忆旧城', fact: '阿洛回忆仍能看见雾色的旧城。', cardType: 'transition', timecode: 'Day 1', chapterIds: ['ch-0'], x: 300 })
    ], [{ linkId: 'flashback-link', sourceCardId: 'now', targetCardId: 'flashback', linkType: 'flashback' }]));

    const context = await service.buildAiContext({ bookId: 'book-1', chapterId: 'ch-1', settings: { mode: 'single_card', selectedCardIds: ['flashback'] } });

    expect(context.chapterSnapshot.states.find((item) => item.ownerId === 'char-1')?.fields.视力.value).toBe('失明');
    expect(context.flashbackSnapshot?.states.find((item) => item.ownerId === 'char-1')?.fields.视力.value).toBe('正常');
  });
});

describe('PlotboardService plotboard validation', () => {
  it('校验时间线、死亡后出场、红线、世界观、伏笔顺序和章节衔接，并提供 Markdown 段落定位', async () => {
    await savePreviousLocation('world-2');
    await service.savePlotboard(plotboard([
      card({ cardId: 'payoff', title: '先回收', cardType: 'clue_payoff', fact: '阿洛允许密信被当众回收，并可以主动杀害无辜者。', timecode: 'Day 1 09:00', locationWorldEntryId: 'world-1', worldEntryIds: ['world-1'], plotClueUsages: { 'plot-1': 'payoff' } }),
      card({ cardId: 'death', title: '死亡', fact: '阿洛在雾中死亡。', timecode: 'Day 1 10:00', locationWorldEntryId: 'world-1', stateDeltas: [{ ownerType: 'character', ownerId: 'char-1', fieldName: '生死', operator: 'set', value: '已死亡' }] }),
      card({ cardId: 'after-death', title: '继续出场', fact: '阿洛复活后成功使用远距离通讯。', timecode: 'Day 1 11:00', locationWorldEntryId: 'world-2', worldEntryIds: ['world-2'], plotEntryIds: [], stateDeltas: [] }),
      card({ cardId: 'setup', title: '后埋设', cardType: 'clue_setup', fact: '阿洛才第一次埋设密信。', timecode: 'Day 1 12:00', locationWorldEntryId: 'world-2', plotClueUsages: { 'plot-1': 'setup' } })
    ]));

    const result = await service.validatePlotboard({ bookId: 'book-1', chapterId: 'ch-1', markdown: '### 继续出场\n阿洛复活后成功使用远距离通讯。' });

    expect(result.ok).toBe(false);
    expect(result.summary.plotThreadConflicts).toBeGreaterThan(0);
    expect(result.findings.some((item) => item.category === 'chapter-continuity')).toBe(true);
    expect(result.findings.some((item) => item.category === 'character-state')).toBe(true);
    expect(result.findings.some((item) => item.category === 'behavior-redline')).toBe(true);
    expect(result.findings.some((item) => item.category === 'world-rule')).toBe(true);
    expect(result.findings.some((item) => item.markdownLocation?.sourceCardId === 'after-death')).toBe(true);
    expect(result.clueStatusHints[0].shouldResolve).toBe(true);
  });

  it('用户场景：同一角色同一 timecode 在不同地点会被定位到相关剧情卡', async () => {
    await service.savePlotboard(plotboard([
      card({ cardId: 'a', title: '旧城问询', timecode: 'Day 2 08:00', locationWorldEntryId: 'world-1', plotEntryIds: [] }),
      card({ cardId: 'b', title: '钟楼追逐', timecode: 'Day 2 08:00', locationWorldEntryId: 'world-2', worldEntryIds: ['world-2'], plotEntryIds: [], x: 300 })
    ]));

    const result = await service.validatePlotboard({ bookId: 'book-1', chapterId: 'ch-1' });

    expect(result.summary.timelineConflicts).toBe(1);
    expect(result.findings[0].relatedCardIds).toEqual(['a', 'b']);
  });

  it('集成场景：并行卡修改同一状态字段、重复回收线索会给出可操作提示', async () => {
    await service.savePlotboard(plotboard([
      card({ cardId: 'p1', title: '并行一', cardType: 'clue_payoff', plotClueUsages: { 'plot-1': 'payoff' }, stateDeltas: [{ ownerType: 'character', ownerId: 'char-1', fieldName: 'emotion', operator: 'set', value: '恐惧' }] }),
      card({ cardId: 'p2', title: '并行二', cardType: 'clue_payoff', plotClueUsages: { 'plot-1': 'payoff' }, stateDeltas: [{ ownerType: 'character', ownerId: 'char-1', fieldName: 'emotion', operator: 'set', value: '愤怒' }], x: 300 })
    ], [{ linkId: 'parallel-1', sourceCardId: 'p1', targetCardId: 'p2', linkType: 'parallel' }]));

    const result = await service.validatePlotboard({ bookId: 'book-1', chapterId: 'ch-1' });

    expect(result.findings.some((item) => item.id.startsWith('state-parallel'))).toBe(true);
    expect(result.findings.some((item) => item.id.startsWith('plot-duplicate-payoff'))).toBe(true);
    expect(result.clueStatusHints[0].payoffCardIds).toEqual(['p1', 'p2']);
  });
});
