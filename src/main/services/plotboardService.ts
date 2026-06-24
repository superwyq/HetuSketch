import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  AiStreamChunk,
  ChapterBodySnapshotResult,
  GeneratedMarkdownWriteInput,
  GeneratedMarkdownWriteResult,
  Plotboard,
  PlotboardAiContext,
  PlotboardGenerationRequest,
  PlotboardGenerationResult,
  PlotboardGenerationSettings,
  PlotCard,
  PlotLink,
  ProjectEntry,
  StateDelta,
  StateDiff,
  StateDiffSettlementInput,
  StateDiffSettlementResult,
  StateSnapshot,
  StateSnapshotItem,
  StateTemplate,
  PlotboardValidationFinding,
  PlotboardValidationRequest,
  PlotboardValidationResult,
  PlotClueStatusHint
} from '../../shared/storageTypes.js';
import {
  getChapterBodySnapshotPath,
  getChapterFilePath,
  getPlotboardFilePath,
  getStateSnapshotFilePath,
  type StoragePaths
} from './storagePaths.js';
import type { ChapterService } from './chapterService.js';
import type { AiService } from './aiService.js';

const DEFAULT_STATE_TEMPLATES: StateTemplate[] = [
  { templateId: 'builtin-character-location', ownerType: 'character', ownerId: '*', fieldName: 'location', valueType: 'text', currentValue: '', semanticPrompt: '角色当前所在地点，生成时不得无铺垫瞬移。', visibility: 'chapter' },
  { templateId: 'builtin-character-emotion', ownerType: 'character', ownerId: '*', fieldName: 'emotion', valueType: 'text', currentValue: '', semanticPrompt: '角色当前主导情绪，用于维持段落间心理连续性。', visibility: 'scene' },
  { templateId: 'builtin-plot-status', ownerType: 'plot', ownerId: '*', fieldName: 'status', valueType: 'enum', currentValue: 'open', semanticPrompt: '线索状态：open、reinforced、resolved。', visibility: 'chapter' }
];

export class PlotboardService {
  constructor(
    private readonly paths: StoragePaths,
    private readonly chapterService: ChapterService,
    private readonly aiService?: AiService,
    private readonly entryReader?: (projectId: string, type: ProjectEntry['type'], entryId: string) => Promise<ProjectEntry>
  ) {}

  async createPlotboard(input: { bookId: string; chapterId: string; projectId?: string; settingSetId?: string }): Promise<Plotboard> {
    const existing = await this.loadPlotboard(input.bookId, input.chapterId).catch(() => undefined);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const plotboard: Plotboard = {
      schemaVersion: 1,
      plotboardId: `plotboard-${randomUUID()}`,
      bookId: input.bookId,
      chapterId: input.chapterId,
      projectId: input.projectId,
      settingSetId: input.settingSetId,
      cards: [],
      links: [],
      stateTemplates: DEFAULT_STATE_TEMPLATES,
      viewport: { x: 0, y: 0, zoom: 1 },
      createdAt: now,
      updatedAt: now
    };

    await this.savePlotboard(plotboard);
    return plotboard;
  }

  async loadPlotboard(bookId: string, chapterId: string): Promise<Plotboard> {
    return readJson<Plotboard>(getPlotboardFilePath(this.paths, bookId, chapterId));
  }

  async savePlotboard(plotboard: Plotboard): Promise<Plotboard> {
    const next: Plotboard = {
      ...plotboard,
      schemaVersion: 1,
      cards: plotboard.cards ?? [],
      links: plotboard.links ?? [],
      stateTemplates: mergeStateTemplates(plotboard.stateTemplates),
      viewport: plotboard.viewport ?? { x: 0, y: 0, zoom: 1 },
      updatedAt: new Date().toISOString()
    };
    await writeJson(getPlotboardFilePath(this.paths, next.bookId, next.chapterId), next);
    return next;
  }

  async loadStateSnapshot(bookId: string, chapterId: string): Promise<StateSnapshot> {
    return readJson<StateSnapshot>(getStateSnapshotFilePath(this.paths, bookId, chapterId));
  }

  async saveStateSnapshot(bookId: string, snapshot: StateSnapshot): Promise<StateSnapshot> {
    const next: StateSnapshot = {
      ...snapshot,
      schemaVersion: 1,
      bookId,
      states: snapshot.states ?? [],
      sourceDiffIds: snapshot.sourceDiffIds ?? [],
      updatedAt: new Date().toISOString()
    };
    await writeJson(getStateSnapshotFilePath(this.paths, bookId, next.chapterId), next);
    return next;
  }

  async saveChapterBodySnapshot(bookId: string, chapterId: string): Promise<ChapterBodySnapshotResult> {
    const createdAt = new Date().toISOString();
    const snapshotId = `${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    const sourcePath = getChapterFilePath(this.paths, bookId, chapterId);
    const content = await readFile(sourcePath, 'utf8').catch(() => '');
    const filePath = getChapterBodySnapshotPath(this.paths, bookId, chapterId, snapshotId);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    return { snapshotId, filePath, createdAt };
  }

  exportMarkdownOutline(plotboard: Plotboard): string {
    const lines = ['# 剧情画布大纲', '', `- 作品：${plotboard.bookId}`, `- 章节：${plotboard.chapterId}`, ''];
    const cards = [...plotboard.cards].sort((a, b) => {
      const timeCompare = String(a.timecode ?? '').localeCompare(String(b.timecode ?? ''));
      return timeCompare || a.y - b.y || a.x - b.x;
    });

    for (const card of cards) {
      lines.push(`## ${card.title || card.cardId}`);
      lines.push(`- 类型：${card.cardType}`);
      if (card.timecode) lines.push(`- 时间：${card.timecode}`);
      if (card.locationWorldEntryId) lines.push(`- 地点：${card.locationWorldEntryId}`);
      if (card.povCharacterId) lines.push(`- POV：${card.povCharacterId}`);
      if (card.characterIds.length) lines.push(`- 角色：${card.characterIds.join('、')}`);
      if (card.worldEntryIds.length) lines.push(`- 世界观：${card.worldEntryIds.join('、')}`);
      if (card.plotEntryIds.length) lines.push(`- 线索：${card.plotEntryIds.join('、')}`);
      if (card.stateDeltas?.length) lines.push(`- 状态变更：${card.stateDeltas.map((delta) => `${delta.ownerType}:${delta.ownerId}:${delta.fieldName} ${delta.operator} ${String(delta.value ?? '')}`).join('；')}`);
      lines.push('', card.fact || '（未填写事件事实）', '');
    }

    if (plotboard.links.length) {
      lines.push('## 连线', '');
      for (const link of plotboard.links) {
        const suffix = [link.motivation, link.condition].filter(Boolean).join('；');
        lines.push(`- ${link.sourceCardId} -> ${link.targetCardId}（${link.linkType}）${suffix ? `：${suffix}` : ''}`);
      }
    }

    return `${lines.join('\n').trimEnd()}\n`;
  }

  async writeGeneratedMarkdown(input: GeneratedMarkdownWriteInput): Promise<GeneratedMarkdownWriteResult> {
    const snapshot = input.preserveSnapshot === false ? undefined : await this.saveChapterBodySnapshot(input.bookId, input.chapterId);
    const chapter = await this.chapterService.updateChapter({
      bookId: input.bookId,
      id: input.chapterId,
      content: input.markdown,
      status: 'drafting'
    });
    return { chapter, snapshot };
  }

  async buildAiContext(request: PlotboardGenerationRequest): Promise<PlotboardAiContext> {
    const plotboard = await this.loadPlotboard(request.bookId, request.chapterId);
    const settings = request.settings;
    const orderedCards = orderCardsForGeneration(plotboard.cards, plotboard.links);
    const selectedCards = selectCardsForMode(orderedCards, settings);
    const projectId = plotboard.projectId ?? plotboard.bookId;
    const [characters, worldRules, plotClues, chapterSnapshot, flashbackSnapshot] = await Promise.all([
      this.loadEntries(projectId, 'character', collectIds(selectedCards, 'characterIds')),
      this.loadEntries(projectId, 'world', collectIds(selectedCards, 'worldEntryIds')),
      this.loadEntries(projectId, 'plot', collectIds(selectedCards, 'plotEntryIds')),
      this.loadOrCreateStateSnapshot(plotboard.bookId, plotboard.chapterId, plotboard.stateTemplates),
      this.loadFlashbackSnapshot(plotboard, selectedCards)
    ]);

    return {
      plotboard: { plotboardId: plotboard.plotboardId, bookId: plotboard.bookId, chapterId: plotboard.chapterId },
      mode: settings.mode,
      cards: selectedCards,
      links: plotboard.links.filter((link) => selectedCards.some((card) => card.cardId === link.sourceCardId || card.cardId === link.targetCardId)),
      characters: characters.map((entry) => pickCharacter(entry)),
      worldRules: worldRules.map((entry) => pickWorld(entry)),
      plotClues: plotClues.map((entry) => pickPlot(entry)),
      stateTemplates: mergeStateTemplates(plotboard.stateTemplates),
      chapterSnapshot,
      flashbackSnapshot,
      sceneDeltas: selectedCards.flatMap((card) => card.stateDeltas ?? []),
      neighborSummaries: buildNeighborSummaries(orderedCards, selectedCards, plotboard.links),
      generationSettings: settings
    };
  }

  async generate(request: PlotboardGenerationRequest): Promise<PlotboardGenerationResult> {
    const context = await this.buildAiContext(request);
    const fallback = compileDeterministicNarrative(context);
    const warnings: string[] = [];
    let markdown = fallback;
    let status: PlotboardGenerationResult['status'] = 'degraded';
    let usage: PlotboardGenerationResult['usage'];
    let error: string | undefined;

    if (!this.aiService?.isLlmReady()) {
      warnings.push('LLM 未配置，已使用本地确定性叙事编译器生成正文。');
    } else {
      try {
        const result = await this.aiService.generateText(buildNarrativeMessages(context), { maxTokens: Math.max(1200, request.settings.targetWords ?? 1800) });
        markdown = normalizeGeneratedMarkdown(result.content) || fallback;
        usage = { provider: result.provider, model: result.model, latencyMs: result.latencyMs, promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens };
        status = 'ok';
      } catch (reason) {
        error = reason instanceof Error ? reason.message : 'AI 生成失败';
        warnings.push(`AI 生成失败，已降级为本地编译：${error}`);
      }
    }

    const finalMarkdown = applyRewriteStrategy(await this.getChapterContent(request.bookId, request.chapterId), markdown, request.settings);
    const stateDiffs = buildStateDiffs(context);
    return { requestId: randomUUID(), status, markdown: finalMarkdown, stateDiffs, context, warnings, usage, error };
  }

  async *streamGenerate(request: PlotboardGenerationRequest): AsyncGenerator<{ chunk: AiStreamChunk; result?: PlotboardGenerationResult }> {
    yield { chunk: { type: 'delta', content: '正在组装剧情画布上下文…\n' } };
    const result = await this.generate(request);
    yield { chunk: { type: 'delta', content: result.markdown } };
    yield { chunk: { type: 'finish' }, result };
  }

  async settleStateDiffs(input: StateDiffSettlementInput): Promise<StateDiffSettlementResult> {
    const current = await this.loadOrCreateStateSnapshot(input.bookId, input.chapterId);
    const accepted = input.diffs.filter((diff) => diff.status === 'accepted' || diff.status === 'modified');
    const next: StateSnapshot = {
      ...current,
      states: applyDiffsToSnapshot(current.states, accepted),
      sourceDiffIds: Array.from(new Set([...current.sourceDiffIds, ...accepted.map((diff) => diff.diffId)])),
      updatedAt: new Date().toISOString()
    };
    const snapshot = await this.saveStateSnapshot(input.bookId, next);
    return {
      snapshot,
      appliedDiffIds: accepted.map((diff) => diff.diffId),
      rejectedDiffIds: input.diffs.filter((diff) => diff.status === 'rejected').map((diff) => diff.diffId)
    };
  }

  async validatePlotboard(input: PlotboardValidationRequest): Promise<PlotboardValidationResult> {
    const plotboard = await this.loadPlotboard(input.bookId, input.chapterId);
    const projectId = plotboard.projectId ?? plotboard.bookId;
    const characterIds = collectIds(plotboard.cards, 'characterIds');
    const worldIds = Array.from(new Set([...collectIds(plotboard.cards, 'worldEntryIds'), ...plotboard.cards.map((card) => card.locationWorldEntryId).filter(Boolean)]));
    const plotIds = collectIds(plotboard.cards, 'plotEntryIds');
    const [characters, worlds, plots, tree, previousSnapshot] = await Promise.all([
      this.loadEntries(projectId, 'character', characterIds),
      this.loadEntries(projectId, 'world', worldIds),
      this.loadEntries(projectId, 'plot', plotIds),
      this.chapterService.listTree(input.bookId).catch(() => undefined),
      this.loadPreviousChapterSnapshot(input.bookId, input.chapterId)
    ]);
    const findings: PlotboardValidationFinding[] = [];
    const orderedCards = orderCardsForGeneration(plotboard.cards, plotboard.links);
    const markdownIndex = buildMarkdownIndex(input.markdown, orderedCards);

    findings.push(...validateTimelineConflicts(orderedCards, markdownIndex));
    findings.push(...validateStateConflicts(orderedCards, plotboard.links, markdownIndex));
    findings.push(...validateRuleConflicts(orderedCards, characters, worlds, input.markdown, markdownIndex));
    findings.push(...validatePlotClueOrder(orderedCards, plots, markdownIndex));
    findings.push(...validateChapterContinuity(orderedCards, input.chapterId, tree?.chapters ?? [], previousSnapshot, markdownIndex));

    const clueStatusHints = buildClueStatusHints(orderedCards, plots);
    const errorCount = findings.filter((finding) => finding.severity === 'error').length;
    const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
    return {
      ok: errorCount === 0 && warningCount === 0,
      checkedAt: new Date().toISOString(),
      summary: {
        timelineConflicts: findings.filter((finding) => finding.category === 'timeline').length,
        characterStateConflicts: findings.filter((finding) => finding.category === 'character-state').length,
        behaviorRedlineConflicts: findings.filter((finding) => finding.category === 'behavior-redline').length,
        worldRuleConflicts: findings.filter((finding) => finding.category === 'world-rule').length,
        plotThreadConflicts: findings.filter((finding) => finding.category === 'plot-thread').length,
        chapterContinuityConflicts: findings.filter((finding) => finding.category === 'chapter-continuity').length,
        warningCount,
        errorCount
      },
      findings,
      clueStatusHints
    };
  }

  private async loadOrCreateStateSnapshot(bookId: string, chapterId: string, templates: StateTemplate[] = []): Promise<StateSnapshot> {
    const existing = await this.loadStateSnapshot(bookId, chapterId).catch(() => undefined);
    if (existing) return existing;
    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      bookId,
      chapterId,
      states: templatesToSnapshotItems(mergeStateTemplates(templates)),
      sourceDiffIds: [],
      createdAt: now,
      updatedAt: now
    };
  }

  private async loadFlashbackSnapshot(plotboard: Plotboard, cards: PlotCard[]): Promise<StateSnapshot | undefined> {
    const flashbackCard = cards.find((card) => card.cardType === 'transition' || plotboard.links.some((link) => link.linkType === 'flashback' && (link.sourceCardId === card.cardId || link.targetCardId === card.cardId)));
    const chapterIds = Array.isArray(flashbackCard?.chapterIds) ? flashbackCard.chapterIds.filter((item): item is string => typeof item === 'string') : [];
    const target = chapterIds.find((id) => id !== plotboard.chapterId);
    return target ? this.loadStateSnapshot(plotboard.bookId, target).catch(() => undefined) : undefined;
  }

  private async loadPreviousChapterSnapshot(bookId: string, chapterId: string): Promise<StateSnapshot | undefined> {
    const tree = await this.chapterService.listTree(bookId).catch(() => undefined);
    const current = tree?.chapters.find((chapter) => chapter.id === chapterId);
    const previous = current ? tree?.chapters.filter((chapter) => chapter.volumeId === current.volumeId && chapter.order < current.order).sort((a, b) => b.order - a.order)[0] : undefined;
    return previous ? this.loadStateSnapshot(bookId, previous.id).catch(() => undefined) : undefined;
  }

  private async loadEntries(projectId: string, type: ProjectEntry['type'], ids: string[]): Promise<ProjectEntry[]> {
    if (!this.entryReader || ids.length === 0) return [];
    const entries: ProjectEntry[] = [];
    for (const id of ids) {
      const entry = await this.entryReader(projectId, type, id).catch(() => undefined);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  private async getChapterContent(bookId: string, chapterId: string): Promise<string> {
    const tree = await this.chapterService.listTree(bookId).catch(() => undefined);
    return tree?.chapters.find((chapter) => chapter.id === chapterId)?.content ?? '';
  }
}

export function mergeStateTemplates(templates: StateTemplate[] = []): StateTemplate[] {
  const byKey = new Map<string, StateTemplate>();
  for (const template of [...DEFAULT_STATE_TEMPLATES, ...templates]) {
    byKey.set(`${template.ownerType}:${template.ownerId}:${template.fieldName}`, template);
  }
  return [...byKey.values()];
}

function templatesToSnapshotItems(templates: StateTemplate[]): StateSnapshotItem[] {
  const byOwner = new Map<string, StateSnapshotItem>();
  for (const template of templates.filter((item) => item.visibility !== 'scene' && item.ownerId !== '*')) {
    const key = `${template.ownerType}:${template.ownerId}`;
    const current = byOwner.get(key) ?? { ownerType: template.ownerType, ownerId: template.ownerId, fields: {} };
    current.fields[template.fieldName] = { value: template.currentValue, semanticPrompt: template.semanticPrompt };
    byOwner.set(key, current);
  }
  return [...byOwner.values()];
}

function orderCardsForGeneration(cards: PlotCard[], links: PlotLink[]): PlotCard[] {
  const sequenceTargets = new Set(links.filter((link) => link.linkType === 'sequence' || link.linkType === 'causal').map((link) => link.targetCardId));
  const roots = cards.filter((card) => !sequenceTargets.has(card.cardId)).sort(compareCardsByPosition);
  const byId = new Map(cards.map((card) => [card.cardId, card]));
  const outgoing = new Map<string, PlotLink[]>();
  for (const link of links) {
    if (link.linkType !== 'sequence' && link.linkType !== 'causal') continue;
    outgoing.set(link.sourceCardId, [...(outgoing.get(link.sourceCardId) ?? []), link]);
  }
  const ordered: PlotCard[] = [];
  const visited = new Set<string>();
  const visit = (card: PlotCard): void => {
    if (visited.has(card.cardId)) return;
    visited.add(card.cardId);
    ordered.push(card);
    for (const link of (outgoing.get(card.cardId) ?? []).sort((a, b) => String(a.motivation ?? '').localeCompare(String(b.motivation ?? '')))) {
      const target = byId.get(link.targetCardId);
      if (target) visit(target);
    }
  };
  roots.forEach(visit);
  cards.sort(compareCardsByPosition).forEach(visit);
  return ordered;
}

function compareCardsByPosition(a: PlotCard, b: PlotCard): number {
  const timeCompare = String(a.timecode ?? '').localeCompare(String(b.timecode ?? ''));
  return timeCompare || a.y - b.y || a.x - b.x;
}

function selectCardsForMode(cards: PlotCard[], settings: PlotboardGenerationSettings): PlotCard[] {
  const selected = new Set(settings.selectedCardIds ?? []);
  if (settings.mode === 'full_chapter' || selected.size === 0) return cards;
  if (settings.mode === 'single_card') return cards.filter((card) => selected.has(card.cardId)).slice(0, 1);
  if (settings.mode === 'continue') {
    const index = cards.findIndex((card) => selected.has(card.cardId));
    return index >= 0 ? cards.slice(index) : cards.slice(-1);
  }
  return cards.filter((card) => selected.has(card.cardId));
}

function collectIds(cards: PlotCard[], key: 'characterIds' | 'worldEntryIds' | 'plotEntryIds'): string[] {
  return Array.from(new Set(cards.flatMap((card) => card[key] ?? [])));
}

function pickCharacter(entry: ProjectEntry): PlotboardAiContext['characters'][number] {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    personalityTags: entry.type === 'character' ? entry.personalityTags : [],
    redLines: entry.type === 'character' ? entry.redLines : [],
    customFields: entry.customFields
  };
}

function pickWorld(entry: ProjectEntry): PlotboardAiContext['worldRules'][number] {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    category: entry.type === 'world' ? entry.category : 'other',
    rules: entry.type === 'world' ? entry.rules : [],
    customFields: entry.customFields
  };
}

function pickPlot(entry: ProjectEntry): PlotboardAiContext['plotClues'][number] {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    content: entry.content,
    status: entry.type === 'plot' ? entry.status : 'open',
    setupChapter: entry.type === 'plot' ? entry.setupChapter : undefined,
    expectedPayoffChapter: entry.type === 'plot' ? entry.expectedPayoffChapter : undefined,
    customFields: entry.customFields
  };
}

function buildNeighborSummaries(cards: PlotCard[], selectedCards: PlotCard[], links: PlotLink[]): PlotboardAiContext['neighborSummaries'] {
  const selected = new Set(selectedCards.map((card) => card.cardId));
  const result = new Map<string, PlotboardAiContext['neighborSummaries'][number]>();
  for (const card of selectedCards) {
    const index = cards.findIndex((item) => item.cardId === card.cardId);
    const previous = index > 0 ? cards[index - 1] : undefined;
    const next = index >= 0 && index < cards.length - 1 ? cards[index + 1] : undefined;
    if (previous && !selected.has(previous.cardId)) result.set(`previous:${previous.cardId}`, { cardId: previous.cardId, title: previous.title, fact: previous.fact, relation: 'previous' });
    if (next && !selected.has(next.cardId)) result.set(`next:${next.cardId}`, { cardId: next.cardId, title: next.title, fact: next.fact, relation: 'next' });
  }
  for (const link of links) {
    const linkedId = selected.has(link.sourceCardId) ? link.targetCardId : selected.has(link.targetCardId) ? link.sourceCardId : undefined;
    const linked = linkedId && !selected.has(linkedId) ? cards.find((card) => card.cardId === linkedId) : undefined;
    if (linked) result.set(`linked:${linked.cardId}`, { cardId: linked.cardId, title: linked.title, fact: linked.fact, relation: 'linked' });
  }
  return [...result.values()].slice(0, 8);
}

function buildNarrativeMessages(context: PlotboardAiContext): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content: '你是 HetuSketch 剧情画布的赛博史官。只依据剧情卡事实、设定、状态快照和用户指令生成小说章节 Markdown；不得发明重大转折。只输出正文 Markdown，不输出解释。'
    },
    {
      role: 'user',
      content: JSON.stringify({
        mode: context.mode,
        cards: context.cards,
        links: context.links,
        characters: context.characters,
        worldRules: context.worldRules,
        plotClues: context.plotClues,
        chapterSnapshot: context.chapterSnapshot,
        flashbackSnapshot: context.flashbackSnapshot,
        sceneDeltas: context.sceneDeltas,
        neighborSummaries: context.neighborSummaries,
        settings: context.generationSettings
      })
    }
  ];
}

function compileDeterministicNarrative(context: PlotboardAiContext): string {
  const title = modeTitle(context.generationSettings.mode);
  const lines = [`## ${title}`, ''];
  if (context.generationSettings.userInstruction) {
    lines.push(`> 生成说明：${context.generationSettings.userInstruction}`, '');
  }
  for (const [index, card] of context.cards.entries()) {
    const names = [
      ...card.characterIds.map((id) => context.characters.find((item) => item.id === id)?.title ?? id),
      card.locationWorldEntryId ? context.worldRules.find((item) => item.id === card.locationWorldEntryId)?.title ?? card.locationWorldEntryId : ''
    ].filter(Boolean);
    lines.push(`### ${index + 1}. ${card.title || '未命名剧情'}`);
    lines.push(card.fact || '这一幕的客观事件尚未补全，正文生成保留为待写段落。');
    if (names.length) lines.push(`\n涉及：${names.join('、')}。`);
    if (card.narrativeTone.length) lines.push(`\n基调：${card.narrativeTone.join('、')}。`);
    if (card.generationInstruction) lines.push(`\n写作提示：${card.generationInstruction}`);
    const outgoing = context.links.filter((link) => link.sourceCardId === card.cardId);
    if (outgoing.length) {
      lines.push(`\n承接：${outgoing.map((link) => `${link.linkType}${link.motivation ? `（${link.motivation}）` : ''}`).join('；')}。`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function modeTitle(mode: PlotboardGenerationSettings['mode']): string {
  return ({ single_card: '单卡正文', selection: '选区正文', full_chapter: '章节正文', continue: '续写正文', rewrite: '重写正文' } as const)[mode];
}

function normalizeGeneratedMarkdown(text: string): string {
  return text.replace(/^```(?:markdown)?\s*/i, '').replace(/```$/i, '').trim();
}

function applyRewriteStrategy(existing: string, generated: string, settings: PlotboardGenerationSettings): string {
  if (settings.mode === 'continue' || settings.appendToExisting || settings.rewriteStrategy === 'append') {
    return `${existing.trimEnd()}\n\n${generated.trim()}\n`.trimStart();
  }
  if (settings.mode === 'rewrite' && settings.rewriteStrategy !== 'replace_all' && existing.trim()) {
    return `<!-- PLOTBOARD_STALE_START generatedAt=${new Date().toISOString()} -->\n${existing.trim()}\n<!-- PLOTBOARD_STALE_END -->\n\n${generated.trim()}\n`;
  }
  return `${generated.trim()}\n`;
}

function buildStateDiffs(context: PlotboardAiContext): StateDiff[] {
  return context.sceneDeltas
    .filter((delta) => delta.ownerId && delta.fieldName)
    .map((delta) => {
      const current = findSnapshotValue(context.chapterSnapshot, delta);
      const next = applyDeltaValue(current, delta);
      return {
        diffId: `diff-${randomUUID()}`,
        targetType: delta.ownerType,
        targetId: delta.ownerId,
        fieldName: delta.fieldName,
        from: current,
        to: next,
        reason: delta.reason ?? '剧情卡 L3 场景增量推导',
        status: 'suggested',
        confidence: 'deterministic'
      } satisfies StateDiff;
    });
}

function findSnapshotValue(snapshot: StateSnapshot, delta: StateDelta): unknown {
  return snapshot.states.find((item) => item.ownerType === delta.ownerType && item.ownerId === delta.ownerId)?.fields[delta.fieldName]?.value;
}

function applyDeltaValue(current: unknown, delta: StateDelta): unknown {
  if (delta.operator === 'increase') return Number(current ?? 0) + Number(delta.value ?? 0);
  if (delta.operator === 'decrease') return Number(current ?? 0) - Number(delta.value ?? 0);
  if (delta.operator === 'append') return [...(Array.isArray(current) ? current : current ? [current] : []), delta.value];
  if (delta.operator === 'remove') return Array.isArray(current) ? current.filter((item) => item !== delta.value) : undefined;
  return delta.value;
}

function applyDiffsToSnapshot(states: StateSnapshotItem[], diffs: StateDiff[]): StateSnapshotItem[] {
  const byOwner = new Map<string, StateSnapshotItem>(states.map((item) => [`${item.ownerType}:${item.ownerId}`, { ...item, fields: { ...item.fields } }]));
  for (const diff of diffs) {
    const key = `${diff.targetType}:${diff.targetId}`;
    const item = byOwner.get(key) ?? { ownerType: diff.targetType, ownerId: diff.targetId, fields: {} };
    item.fields[diff.fieldName] = { value: diff.to };
    byOwner.set(key, item);
  }
  return [...byOwner.values()];
}

interface MarkdownIndexEntry {
  sourceCardId?: string;
  paragraphIndex: number;
  excerpt: string;
  start: number;
  end: number;
}

function buildMarkdownIndex(markdown: string | undefined, cards: PlotCard[]): Map<string, MarkdownIndexEntry> {
  const index = new Map<string, MarkdownIndexEntry>();
  if (!markdown?.trim()) return index;
  const paragraphs: MarkdownIndexEntry[] = [];
  let cursor = 0;
  for (const [paragraphIndex, raw] of markdown.split(/\n{2,}/).entries()) {
    const start = markdown.indexOf(raw, cursor);
    const end = start + raw.length;
    cursor = end;
    paragraphs.push({ paragraphIndex, excerpt: raw.trim().slice(0, 120), start, end });
  }
  for (const card of cards) {
    const explicit = paragraphs.find((paragraph) => paragraph.excerpt.includes(`sourceCardId=${card.cardId}`) || paragraph.excerpt.includes(`data-card-id="${card.cardId}"`));
    const byTitle = paragraphs.find((paragraph) => card.title && paragraph.excerpt.includes(card.title));
    const factNeedle = card.fact.trim().slice(0, 24);
    const byFact = factNeedle ? paragraphs.find((paragraph) => paragraph.excerpt.includes(factNeedle)) : undefined;
    const found = explicit ?? byTitle ?? byFact;
    if (found) index.set(card.cardId, { ...found, sourceCardId: card.cardId });
  }
  return index;
}

function withLocation(card: PlotCard, markdownIndex: Map<string, MarkdownIndexEntry>, finding: PlotboardValidationFinding): PlotboardValidationFinding {
  const location = markdownIndex.get(card.cardId);
  return location ? { ...finding, markdownLocation: { sourceCardId: card.cardId, paragraphIndex: location.paragraphIndex, excerpt: location.excerpt }, markdownRange: { start: location.start, end: location.end } } : finding;
}

function validateTimelineConflicts(cards: PlotCard[], markdownIndex: Map<string, MarkdownIndexEntry>): PlotboardValidationFinding[] {
  const findings: PlotboardValidationFinding[] = [];
  const seen = new Map<string, PlotCard>();
  for (const card of cards) {
    if (!card.timecode || !card.locationWorldEntryId) continue;
    for (const characterId of card.characterIds) {
      const key = `${characterId}:${card.timecode}`;
      const previous = seen.get(key);
      if (previous && previous.locationWorldEntryId !== card.locationWorldEntryId) {
        findings.push(withLocation(card, markdownIndex, {
          id: `timeline-${characterId}-${card.timecode}-${previous.cardId}-${card.cardId}`,
          category: 'timeline',
          severity: 'error',
          cardId: card.cardId,
          relatedCardIds: [previous.cardId, card.cardId],
          message: `角色 ${characterId} 在同一时间 ${card.timecode} 同时出现在 ${previous.locationWorldEntryId} 与 ${card.locationWorldEntryId}。`,
          suggestion: '请调整 timecode、地点或拆分为可解释的转场。'
        }));
      } else if (!previous) {
        seen.set(key, card);
      }
    }
  }
  return findings;
}

function validateStateConflicts(cards: PlotCard[], links: PlotLink[], markdownIndex: Map<string, MarkdownIndexEntry>): PlotboardValidationFinding[] {
  const findings: PlotboardValidationFinding[] = [];
  const deadCharacters = new Map<string, PlotCard>();
  for (const card of cards) {
    for (const characterId of card.characterIds) {
      const deathCard = deadCharacters.get(characterId);
      if (deathCard && deathCard.cardId !== card.cardId) {
        findings.push(withLocation(card, markdownIndex, {
          id: `state-dead-${characterId}-${deathCard.cardId}-${card.cardId}`,
          category: 'character-state',
          severity: 'error',
          cardId: card.cardId,
          relatedCardIds: [deathCard.cardId, card.cardId],
          message: `角色 ${characterId} 已在“${deathCard.title}”标记死亡，但后续仍在“${card.title}”出场。`,
          suggestion: '如为复活、回忆或伪装，请补充明确说明；否则移除后续出场。'
        }));
      }
    }
    for (const delta of card.stateDeltas ?? []) {
      if (delta.ownerType === 'character' && isDeathDelta(delta)) {
        deadCharacters.set(delta.ownerId, card);
      }
    }
    const fieldsInCard = new Map<string, StateDelta>();
    for (const delta of card.stateDeltas ?? []) {
      const key = `${delta.ownerType}:${delta.ownerId}:${delta.fieldName}`;
      if (fieldsInCard.has(key)) {
        findings.push(withLocation(card, markdownIndex, {
          id: `state-same-card-${card.cardId}-${key}`,
          category: 'character-state',
          severity: 'warning',
          cardId: card.cardId,
          message: `同一剧情卡重复修改状态字段 ${key}。`,
          suggestion: '请合并状态增量，或明确先后顺序。'
        }));
      }
      fieldsInCard.set(key, delta);
    }
  }

  for (const link of links.filter((item) => item.linkType === 'parallel')) {
    const source = cards.find((card) => card.cardId === link.sourceCardId);
    const target = cards.find((card) => card.cardId === link.targetCardId);
    if (!source || !target) continue;
    const sourceFields = new Set((source.stateDeltas ?? []).map((delta) => `${delta.ownerType}:${delta.ownerId}:${delta.fieldName}`));
    for (const delta of target.stateDeltas ?? []) {
      const key = `${delta.ownerType}:${delta.ownerId}:${delta.fieldName}`;
      if (sourceFields.has(key)) {
        findings.push(withLocation(target, markdownIndex, {
          id: `state-parallel-${link.linkId}-${key}`,
          category: 'character-state',
          severity: 'warning',
          cardId: target.cardId,
          linkId: link.linkId,
          relatedCardIds: [source.cardId, target.cardId],
          message: `并行剧情卡“${source.title}”和“${target.title}”同时修改 ${key}。`,
          suggestion: '请拆分时间戳、改为顺序连线，或手动确认合并结果。'
        }));
      }
    }
  }
  return findings;
}

function isDeathDelta(delta: StateDelta): boolean {
  const field = delta.fieldName.toLowerCase();
  const value = String(delta.value ?? '').toLowerCase();
  return field.includes('死亡') || field.includes('生死') || field.includes('status') && (value.includes('dead') || value.includes('死亡') || value.includes('已死亡')) || value.includes('已死亡') || value === '死亡';
}

function validateRuleConflicts(cards: PlotCard[], characters: ProjectEntry[], worlds: ProjectEntry[], markdown: string | undefined, markdownIndex: Map<string, MarkdownIndexEntry>): PlotboardValidationFinding[] {
  const findings: PlotboardValidationFinding[] = [];
  const textByCard = new Map(cards.map((card) => [card.cardId, `${card.title}\n${card.fact}\n${card.generationInstruction ?? ''}\n${markdownIndex.get(card.cardId)?.excerpt ?? ''}`]));
  for (const card of cards) {
    const text = textByCard.get(card.cardId) ?? '';
    for (const character of characters.filter((entry): entry is Extract<ProjectEntry, { type: 'character' }> => entry.type === 'character' && card.characterIds.includes(entry.id))) {
      for (const redLine of character.redLines) {
        const matched = findContradictionText(text, redLine) ?? findContradictionText(markdown ?? '', `${character.title} ${redLine}`);
        if (matched) {
          findings.push(withLocation(card, markdownIndex, {
            id: `redline-${character.id}-${card.cardId}-${hashText(redLine)}`,
            category: 'behavior-redline',
            severity: 'warning',
            cardId: card.cardId,
            entryId: character.id,
            entryType: 'character',
            rule: redLine,
            message: `剧情可能触犯角色“${character.title}”行为红线：${redLine}`,
            suggestion: `请检查“${matched}”是否有足够铺垫，或调整卡片事实/正文。`
          }));
        }
      }
    }
    const relatedWorldIds = new Set([...card.worldEntryIds, card.locationWorldEntryId].filter(Boolean));
    for (const world of worlds.filter((entry): entry is Extract<ProjectEntry, { type: 'world' }> => entry.type === 'world' && relatedWorldIds.has(entry.id))) {
      for (const rule of world.rules) {
        const matched = findContradictionText(text, rule) ?? findContradictionText(markdown ?? '', `${world.title} ${rule}`);
        if (matched) {
          findings.push(withLocation(card, markdownIndex, {
            id: `world-${world.id}-${card.cardId}-${hashText(rule)}`,
            category: 'world-rule',
            severity: 'warning',
            cardId: card.cardId,
            entryId: world.id,
            entryType: 'world',
            rule,
            message: `剧情可能违背世界观“${world.title}”规则：${rule}`,
            suggestion: `请补充例外机制、代价限制，或改写“${matched}”。`
          }));
        }
      }
    }
  }
  return findings;
}

function validatePlotClueOrder(cards: PlotCard[], plots: ProjectEntry[], markdownIndex: Map<string, MarkdownIndexEntry>): PlotboardValidationFinding[] {
  const findings: PlotboardValidationFinding[] = [];
  const positions = new Map(cards.map((card, index) => [card.cardId, index]));
  for (const hint of buildClueStatusHints(cards, plots)) {
    const firstSetup = hint.setupCardIds.map((id) => positions.get(id) ?? Number.MAX_SAFE_INTEGER).sort((a, b) => a - b)[0];
    const payoffPositions = hint.payoffCardIds.map((id) => ({ id, index: positions.get(id) ?? Number.MAX_SAFE_INTEGER })).sort((a, b) => a.index - b.index);
    if (payoffPositions.length && (firstSetup === undefined || payoffPositions[0].index < firstSetup)) {
      const card = cards.find((item) => item.cardId === payoffPositions[0].id);
      if (card) findings.push(withLocation(card, markdownIndex, {
        id: `plot-order-${hint.plotEntryId}-${card.cardId}`,
        category: 'plot-thread',
        severity: 'error',
        cardId: card.cardId,
        relatedCardIds: [...hint.setupCardIds, ...hint.payoffCardIds],
        entryId: hint.plotEntryId,
        entryType: 'plot',
        message: `线索“${hint.title ?? hint.plotEntryId}”回收早于埋设。`,
        suggestion: '请先安排 clue_setup 卡，或将该卡改为强化/埋设。'
      }));
    }
    if (payoffPositions.length > 1) {
      const duplicate = cards.find((item) => item.cardId === payoffPositions[1].id);
      if (duplicate) findings.push(withLocation(duplicate, markdownIndex, {
        id: `plot-duplicate-payoff-${hint.plotEntryId}-${duplicate.cardId}`,
        category: 'plot-thread',
        severity: 'warning',
        cardId: duplicate.cardId,
        relatedCardIds: hint.payoffCardIds,
        entryId: hint.plotEntryId,
        entryType: 'plot',
        message: `线索“${hint.title ?? hint.plotEntryId}”存在重复回收。`,
        suggestion: '同一伏笔通常只需一次正式回收，后续可改为结果展示或余波。'
      }));
    }
  }
  return findings;
}

function validateChapterContinuity(cards: PlotCard[], chapterId: string, chapters: Array<{ id: string; volumeId: string; order: number }>, previousSnapshot: StateSnapshot | undefined, markdownIndex: Map<string, MarkdownIndexEntry>): PlotboardValidationFinding[] {
  const firstCard = cards[0];
  if (!firstCard || !previousSnapshot) return [];
  const previousLocation = findPreviousSnapshotLocation(previousSnapshot);
  if (!previousLocation || previousLocation === firstCard.locationWorldEntryId) return [];
  const hasTransition = firstCard.cardType === 'transition' || /转场|抵达|前往|来到|到达|离开/.test(firstCard.fact);
  if (hasTransition) return [];
  const current = chapters.find((item) => item.id === chapterId);
  return [withLocation(firstCard, markdownIndex, {
    id: `chapter-continuity-${chapterId}-${firstCard.cardId}`,
    category: 'chapter-continuity',
    severity: 'warning',
    cardId: firstCard.cardId,
    chapterId: current?.id ?? chapterId,
    message: `上一章快照位置为 ${previousLocation}，但本章第一张卡地点为 ${firstCard.locationWorldEntryId}。`,
    suggestion: '请在本章开头补充转场卡，或更新上一章结算位置。'
  })];
}

function findPreviousSnapshotLocation(snapshot: StateSnapshot): string | undefined {
  for (const item of snapshot.states) {
    const location = Object.entries(item.fields).find(([fieldName]) => /location|地点|位置|所在/.test(fieldName));
    if (location?.[1].value) return String(location[1].value);
  }
  return undefined;
}

function buildClueStatusHints(cards: PlotCard[], plots: ProjectEntry[]): PlotClueStatusHint[] {
  const byPlot = new Map<string, PlotClueStatusHint>();
  const plotMap = new Map(plots.filter((entry) => entry.type === 'plot').map((entry) => [entry.id, entry]));
  for (const card of cards) {
    const usages = (card.plotClueUsages as Record<string, string> | undefined) ?? {};
    for (const plotEntryId of card.plotEntryIds) {
      const plot = plotMap.get(plotEntryId);
      const current = byPlot.get(plotEntryId) ?? { plotEntryId, title: plot?.title, status: plot?.type === 'plot' ? plot.status : undefined, setupCardIds: [], reinforceCardIds: [], payoffCardIds: [], shouldResolve: false };
      const usage = usages[plotEntryId] ?? (card.cardType === 'clue_payoff' ? 'payoff' : card.cardType === 'clue_reinforce' ? 'reinforce' : 'setup');
      if (usage === 'payoff') current.payoffCardIds.push(card.cardId);
      else if (usage === 'reinforce') current.reinforceCardIds.push(card.cardId);
      else current.setupCardIds.push(card.cardId);
      current.shouldResolve = current.payoffCardIds.length > 0 && current.status !== 'resolved';
      byPlot.set(plotEntryId, current);
    }
  }
  return [...byPlot.values()];
}

function findContradictionText(text: string, rule: string): string | undefined {
  const normalized = `${text} ${rule}`.toLowerCase();
  const pairs = [
    ['不能', '可以'], ['不可', '可以'], ['禁止', '允许'], ['禁止', '使用'], ['无法', '成功'], ['不会', '主动'], ['绝不', '主动'], ['不能', '复活'], ['死亡', '复活']
  ];
  const hasRuleKeyword = keywords(rule).some((word) => text.includes(word));
  for (const [negative, positive] of pairs) {
    if (normalized.includes(negative) && normalized.includes(positive) && (hasRuleKeyword || rule.includes(negative))) return positive;
  }
  return undefined;
}

function keywords(text: string): string[] {
  return text.split(/[\s，。、“”‘’：:；;,.!?！？/\\|()（）【】\[\]-]+/).map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 8);
}

function hashText(text: string): string {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
