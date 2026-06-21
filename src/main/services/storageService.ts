import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type {
  AiConfig,
  AiConfigSaveInput,
  AgentConfig,
  AgentReorderInput,
  AgentSaveInput,
  AiPromptConfig,
  AiPromptSaveInput,
  AiSkillConfig,
  AiSkillSaveInput,
  AiStreamChunk,
  AiValidationRequest,
  AiValidationResult,
  AiAgentResponse,
  BookBindingResult,
  BookCreateInput,
  BookManifest,
  BookTree,
  BookUpdateInput,
  CharacterEntry,
  ChapterCreateInput,
  ChapterMoveInput,
  ChapterNode,
  ChapterUpdateInput,
  DashboardStats,
  DeleteSettingSetStrategy,
  EntryCreateInput,
  EntryListQuery,
  EntrySaveInput,
  EntryType,
  EntryUpdateInput,
  HttpToolConfig,
  HttpToolSaveInput,
  IndexSyncSummary,
  ModelInfo,
  PlotEntry,
  ProjectCreateInput,
  ProjectEntry,
  ProjectImportResult,
  ProjectManifest,
  ProjectUpdateInput,
  RagBuildResult,
  RagQueryRequest,
  RagQueryResult,
  RecentAccessItem,
  RetrievedContext,
  VectorIndexState,
  SearchQuery,
  SearchResultItem,
  SettingCompletionRequest,
  SettingCompletionResult,
  SettingSetCreateInput,
  SettingSetManifest,
  SettingSetUpdateInput,
  ValidationFinding,
  VolumeCreateInput,
  VolumeNode,
  VolumeUpdateInput,
  ValidationRequest,
  ValidationResult,
  WorldEntry
} from '../../shared/storageTypes.js';
import { AiService, type AiServiceOptions } from './aiService.js';
import { BookService } from './bookService.js';
import { ChapterService } from './chapterService.js';
import { IndexDatabase } from './indexDatabase.js';
import { IndexService } from './indexService.js';
import { getFileStats, ProjectFileStore } from './projectFileStore.js';
import { SettingSetService } from './settingSetService.js';
import {
  ensureStorageDirectories,
  getProjectManifestPath,
  getProjectRoot,
  getStoragePaths,
  type StoragePaths
} from './storagePaths.js';

export class StorageService {
  readonly paths: StoragePaths;
  private readonly fileStore: ProjectFileStore;
  private readonly indexDb: IndexDatabase;
  private readonly indexService: IndexService;
  readonly aiService: AiService;
  private readonly settingSetService: SettingSetService;
  private readonly bookService: BookService;
  private readonly chapterService: ChapterService;

  constructor(baseDataPath?: string, aiOptions?: AiServiceOptions) {
    this.paths = getStoragePaths(baseDataPath);
    this.fileStore = new ProjectFileStore(this.paths);
    this.indexDb = new IndexDatabase(this.paths.indexDbPath);
    this.indexService = new IndexService(this.paths, this.fileStore, this.indexDb);
    this.aiService = new AiService(this.indexDb, this.fileStore, aiOptions);
    this.settingSetService = new SettingSetService(this.paths);
    this.bookService = new BookService(this.paths);
    this.chapterService = new ChapterService(this.bookService, this.paths);
  }

  async initialize(options: { watch?: boolean } = {}): Promise<IndexSyncSummary> {
    await ensureStorageDirectories(this.paths);
    const summary = await this.indexService.scanAll();

    if (options.watch) {
      this.indexService.startWatching();
    }

    return summary;
  }

  async close(): Promise<void> {
    await this.indexService.stopWatching();
    this.indexDb.close();
  }

  listSettingSets(): Promise<SettingSetManifest[]> {
    return this.settingSetService.list();
  }

  getSettingSet(id: string): Promise<SettingSetManifest> {
    return this.settingSetService.get(id);
  }

  createSettingSet(input: SettingSetCreateInput): Promise<SettingSetManifest> {
    return this.settingSetService.create(input);
  }

  updateSettingSet(input: SettingSetUpdateInput): Promise<SettingSetManifest> {
    return this.settingSetService.update(input);
  }

  deleteSettingSet(id: string, strategy: DeleteSettingSetStrategy): Promise<void> {
    return this.settingSetService.delete(id, strategy);
  }

  listBooks(): Promise<BookManifest[]> {
    return this.bookService.list();
  }

  getBook(bookId: string): Promise<BookManifest> {
    return this.bookService.get(bookId);
  }

  createBook(input: BookCreateInput): Promise<BookManifest> {
    return this.bookService.create(input);
  }

  updateBook(input: BookUpdateInput): Promise<BookManifest> {
    return this.bookService.update(input);
  }

  deleteBook(bookId: string): Promise<void> {
    return this.bookService.delete(bookId);
  }

  bindBookSettingSet(bookId: string, settingSetId?: string): Promise<BookBindingResult> {
    return this.bookService.bindSettingSet(bookId, settingSetId);
  }

  listBookTree(bookId: string): Promise<BookTree> {
    return this.chapterService.listTree(bookId);
  }

  createVolume(input: VolumeCreateInput): Promise<VolumeNode> {
    return this.chapterService.createVolume(input);
  }

  updateVolume(input: VolumeUpdateInput): Promise<VolumeNode> {
    return this.chapterService.updateVolume(input);
  }

  createChapter(input: ChapterCreateInput): Promise<ChapterNode> {
    return this.chapterService.createChapter(input);
  }

  updateChapter(input: ChapterUpdateInput): Promise<ChapterNode> {
    return this.chapterService.updateChapter(input);
  }

  moveChapter(input: ChapterMoveInput): Promise<BookTree> {
    return this.chapterService.moveChapter(input);
  }

  deleteChapter(bookId: string, chapterId: string): Promise<void> {
    return this.chapterService.deleteChapter(bookId, chapterId);
  }

  async createProject(input: ProjectCreateInput): Promise<ProjectManifest> {
    assertProjectCreateInput(input);
    const project = await this.fileStore.createProject(input);
    await this.indexService.scanProject(project.id);
    return project;
  }

  listProjects(): ProjectManifest[] {
    return this.indexDb.listProjects();
  }

  getProject(projectId: string): ProjectManifest {
    const project = this.indexDb.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }

  async updateProject(input: ProjectUpdateInput): Promise<ProjectManifest> {
    const current = await this.fileStore.readProject(input.projectId);
    const now = new Date().toISOString();
    const next: ProjectManifest = {
      ...current,
      name: input.name?.trim() || current.name,
      type: input.type ?? current.type,
      summary: input.summary?.trim() ?? current.summary,
      updatedAt: now
    };
    const filePath = await this.fileStore.updateProject(next);
    await this.indexService.syncFile(filePath);
    return next;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.fileStore.removeProject(projectId);
    this.indexDb.removeProject(projectId);
  }

  async createEntry(input: EntryCreateInput): Promise<ProjectEntry> {
    const entry = buildEntry(input);
    return this.saveEntry({ projectId: input.projectId, entry });
  }

  async updateEntry(input: EntryUpdateInput): Promise<ProjectEntry> {
    const current = await this.readEntry(input.projectId, input.type, input.entryId);
    const next = buildEntry({ ...current, ...input.changes, id: current.id, projectId: current.projectId, type: current.type });
    return this.saveEntry({ projectId: input.projectId, entry: { ...next, createdAt: current.createdAt, updatedAt: new Date().toISOString() } });
  }

  async saveEntry({ projectId, entry }: EntrySaveInput): Promise<ProjectEntry> {
    if (projectId !== entry.projectId) {
      throw new Error('Entry projectId mismatch');
    }
    validateEntry(entry);
    const normalized = { ...entry, updatedAt: entry.updatedAt || new Date().toISOString() } as ProjectEntry;
    const filePath = await this.fileStore.saveEntry(normalized);
    await this.indexService.syncFile(filePath);
    return normalized;
  }

  async readEntry(projectId: string, type: ProjectEntry['type'], entryId: string, recordAccess = true): Promise<ProjectEntry> {
    let entry: ProjectEntry;
    try {
      entry = (await this.fileStore.readEntry(projectId, type, entryId, 'json')).entry;
    } catch {
      entry = (await this.fileStore.readEntry(projectId, type, entryId, 'md')).entry;
    }

    if (recordAccess) {
      this.indexDb.recordRecentAccess(projectId, entryId);
    }

    return entry;
  }

  listEntries(query: EntryListQuery): SearchResultItem[] {
    return this.indexDb.listEntrySummaries(query);
  }

  async deleteEntry(projectId: string, type: EntryType, entryId: string): Promise<void> {
    await this.fileStore.deleteEntry(projectId, type, entryId);
    this.indexDb.removeEntry(entryId);
  }

  search(query: SearchQuery): SearchResultItem[] {
    return this.indexDb.search(query);
  }

  listRecentAccess(projectId?: string, limit?: number): RecentAccessItem[] {
    return this.indexDb.listRecentAccess(projectId, limit);
  }

  async getDashboardStats(projectId?: string): Promise<DashboardStats> {
    const stats = this.indexDb.getDashboardStats(projectId);
    const projectIds = projectId ? [projectId] : this.indexDb.listProjects().map((project) => project.id);
    const plotStatus: DashboardStats['plotStatus'] = { open: 0, resolved: 0, abandoned: 0 };

    for (const currentProjectId of projectIds) {
      const plots = await this.loadEntriesByType<PlotEntry>(currentProjectId, 'plot');
      for (const plot of plots) {
        plotStatus[plot.status] += 1;
      }
    }

    return {
      ...stats,
      plotStatus,
      openPlotCount: plotStatus.open
    };
  }

  async validateContent(request: ValidationRequest): Promise<ValidationResult> {
    return this.runBasicValidation(request);
  }

  getAiConfig(): AiConfig {
    return this.aiService.getConfig();
  }

  saveAiConfig(input: AiConfigSaveInput): AiConfig {
    return this.aiService.saveConfig(input);
  }

  getAiPrompts(): AiPromptConfig {
    return this.aiService.getPrompts();
  }

  saveAiPrompts(input: AiPromptSaveInput): AiPromptConfig {
    return this.aiService.savePrompts(input);
  }

  listAiSkills(): AiSkillConfig[] {
    return this.aiService.listSkills();
  }

  saveAiSkills(input: AiSkillSaveInput[]): AiSkillConfig[] {
    return this.aiService.saveSkills(input);
  }

  listHttpTools(): HttpToolConfig[] {
    return this.aiService.listHttpTools();
  }

  saveHttpTool(input: HttpToolSaveInput): HttpToolConfig {
    return this.aiService.saveHttpTool(input);
  }

  deleteHttpTool(toolId: string): void {
    this.aiService.deleteHttpTool(toolId);
  }

  listAgents(): AgentConfig[] { return this.aiService.listAgents(); }
  getAgent(id: string): AgentConfig | null { return this.aiService.getAgent(id); }
  createAgent(input: AgentSaveInput): AgentConfig { return this.aiService.createAgent(input); }
  updateAgent(input: AgentSaveInput): AgentConfig { return this.aiService.updateAgent(input); }
  deleteAgent(id: string): void { return this.aiService.deleteAgent(id); }
  reorderAgents(input: AgentReorderInput[]): AgentConfig[] { return this.aiService.reorderAgents(input); }

  testAiConnection(kind: 'llm' | 'embedding'): Promise<{ ok: boolean; message: string; provider?: string; model?: string }> {
    return this.aiService.testConnection(kind);
  }

  buildVectorIndex(projectId: string): Promise<RagBuildResult> {
    return this.aiService.buildVectorIndex(projectId);
  }

  getVectorIndexState(projectId: string): VectorIndexState {
    return this.aiService.getVectorIndexState(projectId);
  }

  ragQuery(request: RagQueryRequest): Promise<RagQueryResult> {
    return this.aiService.ragQuery(request);
  }

  async validateContentEnhanced(request: AiValidationRequest): Promise<AiAgentResponse<AiValidationResult>> {
    const basic = await this.runBasicValidation(request);
    return this.aiService.enhancedValidation(request, basic);
  }

  completeSetting(request: SettingCompletionRequest): Promise<AiAgentResponse<SettingCompletionResult>> {
    return this.aiService.completeSetting(request);
  }

  foreshadowingReminder(projectId: string, text: string, requestId?: string): Promise<AiAgentResponse<{ reminders: ValidationFinding[] }>> {
    return this.aiService.foreshadowingReminder(projectId, text, requestId);
  }

  ragAnswer(request: RagQueryRequest): Promise<AiAgentResponse<{ answer: string; citations: RetrievedContext[] }>> {
    return this.aiService.ragAnswer(request);
  }

  listAiModels(kind: 'llm' | 'embedding'): Promise<ModelInfo[]> {
    return this.aiService.listModels(kind);
  }

  streamValidation(request: AiValidationRequest, basic: ValidationResult): AsyncGenerator<AiStreamChunk> {
    return this.aiService.streamValidation(request, basic);
  }

  streamRagAnswer(request: RagQueryRequest): AsyncGenerator<AiStreamChunk> {
    return this.aiService.streamRagAnswer(request);
  }

  streamCompleteSetting(request: SettingCompletionRequest): AsyncGenerator<AiStreamChunk> {
    return this.aiService.streamCompleteSetting(request);
  }

  streamForeshadowingReminder(projectId: string, text: string, requestId?: string): AsyncGenerator<AiStreamChunk> {
    return this.aiService.streamForeshadowingReminder(projectId, text, requestId);
  }

  async rebuildIndex(projectId?: string): Promise<IndexSyncSummary> {
    return projectId ? this.indexService.scanProject(projectId) : this.indexService.scanAll();
  }

  async exportProject(projectId: string, destinationZipPath: string): Promise<string> {
    return this.fileStore.exportProject(projectId, destinationZipPath);
  }

  async importFromFolder(sourceFolderPath: string): Promise<ProjectImportResult> {
    const result = await this.fileStore.importFromFolder(sourceFolderPath);
    result.summary = await this.indexService.scanProject(result.project.id);
    return result;
  }

  async importFromZip(zipPath: string): Promise<ProjectImportResult> {
    const result = await this.fileStore.importFromZip(zipPath);
    result.summary = await this.indexService.scanProject(result.project.id);
    return result;
  }

  async resetForTests(): Promise<void> {
    await this.close();
    await rm(this.paths.dataRoot, { recursive: true, force: true });
  }

  async indexExistingProject(project: ProjectManifest): Promise<void> {
    const filePath = getProjectManifestPath(this.paths, project.id);
    this.indexDb.upsertProject(project, getProjectRoot(this.paths, project.id), filePath);
    this.indexDb.recordFile({
      projectId: project.id,
      entryId: undefined,
      entryType: undefined,
      filePath,
      fileKind: 'project',
      ...(await getFileStats(filePath)),
      indexedAt: new Date().toISOString()
    });
  }

  private async runBasicValidation(request: ValidationRequest): Promise<ValidationResult> {
    const text = request.text.slice(0, 50_000);
    const findings: ValidationFinding[] = [];
    const characters = await this.loadEntriesByType<CharacterEntry>(request.projectId, 'character');
    const worlds = await this.loadEntriesByType<WorldEntry>(request.projectId, 'world');
    const plots = request.includePlotReminders === false ? [] : await this.loadEntriesByType<PlotEntry>(request.projectId, 'plot');
    const selectedCharacters = request.characterIds?.length ? characters.filter((entry) => request.characterIds?.includes(entry.id)) : characters;
    const selectedWorlds = request.worldEntryIds?.length ? worlds.filter((entry) => request.worldEntryIds?.includes(entry.id)) : worlds;
    let checkedWorldRules = 0;

    for (const character of selectedCharacters) {
      for (const redLine of character.redLines) {
        const match = findRuleMatch(text, redLine, character.title);
        if (match) {
          findings.push({
            id: randomUUID(),
            category: 'character-red-line',
            severity: 'warning',
            entryId: character.id,
            entryType: 'character',
            title: character.title,
            rule: redLine,
            message: `文本可能触犯角色“${character.title}”的人设红线：${redLine}`,
            suggestion: '请确认该行为是否有充分铺垫，或调整描写以避免违背既定人设。',
            excerpt: match.excerpt,
            start: match.start,
            end: match.end
          });
        }
      }
    }

    for (const world of selectedWorlds) {
      for (const rule of world.rules) {
        checkedWorldRules += 1;
        const match = findRuleMatch(text, rule, world.title);
        if (match) {
          findings.push({
            id: randomUUID(),
            category: 'world-rule',
            severity: 'warning',
            entryId: world.id,
            entryType: 'world',
            title: world.title,
            rule,
            message: `文本可能违背世界观规则“${world.title}”：${rule}`,
            suggestion: '请补充例外机制、代价限制，或改写为符合世界观规则的表述。',
            excerpt: match.excerpt,
            start: match.start,
            end: match.end
          });
        }
      }
    }

    const openPlots = plots.filter((plot) => plot.status === 'open');
    for (const plot of openPlots) {
      const match = findRuleMatch(text, [plot.title, plot.summary, plot.content, ...plot.relatedCharacters].filter(Boolean).join(' '));
      if (match) {
        findings.push({
          id: randomUUID(),
          category: 'plot-reminder',
          severity: 'info',
          entryId: plot.id,
          entryType: 'plot',
          title: plot.title,
          rule: plot.expectedPayoffChapter ? `预期回收：${plot.expectedPayoffChapter}` : '未回收伏笔',
          message: `当前文本提及未回收伏笔“${plot.title}”，可考虑推进或标记回收。`,
          suggestion: '如本段已经回应该线索，可将伏笔状态更新为已回收。',
          excerpt: match.excerpt,
          start: match.start,
          end: match.end
        });
      }
    }

    const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
    const reminderCount = findings.filter((finding) => finding.category === 'plot-reminder').length;

    return {
      ok: warningCount === 0,
      checkedAt: new Date().toISOString(),
      summary: {
        checkedCharacters: selectedCharacters.length,
        checkedWorldRules,
        checkedOpenPlots: openPlots.length,
        warningCount,
        reminderCount
      },
      findings
    };
  }

  private async loadEntriesByType<T extends ProjectEntry>(projectId: string, type: T['type']): Promise<T[]> {
    const rows = this.indexDb.listEntriesByType<T>(projectId, type);
    const entries: T[] = [];

    for (const row of rows) {
      entries.push((await this.readEntry(projectId, type, row.id, false)) as T);
    }

    return entries;
  }
}

function assertProjectCreateInput(input: ProjectCreateInput): void {
  if (!input.name.trim()) {
    throw new Error('Project name is required');
  }

  if (input.type !== 'original' && input.type !== 'fanfiction') {
    throw new Error('Unsupported project type');
  }
}

function buildEntry(input: EntryCreateInput): ProjectEntry {
  const now = new Date().toISOString();
  const base = {
    id: input.id ?? randomUUID(),
    projectId: input.projectId,
    title: input.title.trim(),
    summary: input.summary?.trim() ?? '',
    content: input.content ?? '',
    tags: normalizeStringArray(input.tags),
    relations: input.relations ?? [],
    customFields: input.customFields ?? {},
    createdAt: 'createdAt' in input && typeof input.createdAt === 'string' ? input.createdAt : now,
    updatedAt: now,
    format: input.format ?? 'json'
  };

  if (input.type === 'character') {
    return {
      ...base,
      type: 'character',
      role: input.role ?? 'other',
      appearance: input.appearance,
      personalityTags: normalizeStringArray(input.personalityTags),
      abilities: input.abilities,
      background: input.background,
      redLines: normalizeStringArray(input.redLines)
    };
  }

  if (input.type === 'world') {
    return {
      ...base,
      type: 'world',
      category: input.category ?? 'other',
      rules: normalizeStringArray(input.rules)
    };
  }

  return {
    ...base,
    type: 'plot',
    setupChapter: input.setupChapter,
    expectedPayoffChapter: input.expectedPayoffChapter,
    status: input.status ?? 'open',
    relatedCharacters: normalizeStringArray(input.relatedCharacters)
  };
}

function validateEntry(entry: ProjectEntry): void {
  if (!entry.projectId || !entry.id || !entry.title.trim()) {
    throw new Error('Entry projectId, id and title are required');
  }

  if (entry.format !== 'json' && entry.format !== 'markdown') {
    throw new Error('Unsupported entry format');
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

function findRuleMatch(text: string, rule: string, subject?: string): { start: number; end: number; excerpt: string } | undefined {
  const subjectKeywords = extractKeywords(subject ?? '');
  const ruleKeywords = extractKeywords(rule);
  const matchKeywords = subjectKeywords.length && ruleKeywords.length ? [...subjectKeywords.slice(0, 2), ...ruleKeywords.slice(0, 4)] : extractKeywords(`${subject ?? ''} ${rule}`).slice(0, 6);

  for (const keyword of matchKeywords) {
    const index = text.indexOf(keyword);
    if (index >= 0) {
      return toExcerpt(text, index, index + keyword.length);
    }
  }

  const compactText = text.replace(/\s+/g, '');
  for (const keyword of matchKeywords) {
    const compactIndex = compactText.indexOf(keyword);
    if (compactIndex >= 0) {
      return toExcerpt(text, compactIndex, compactIndex + keyword.length);
    }
  }

  return undefined;
}

function extractKeywords(text: string): string[] {
  const normalized = text.replace(/[，。！？、；：“”‘’（）()\[\]{}<>《》,.!?;:\s]+/g, ' ');
  const words = normalized.match(/[\p{L}\p{N}_-]{2,}/gu) ?? [];
  const expanded = words.flatMap((word) => [...toCjkNgrams(word), word]);
  return [...new Set(expanded)].filter((word) => !STOP_WORDS.has(word));
}

function toCjkNgrams(word: string): string[] {
  if (!/[\p{Script=Han}]/u.test(word) || word.length < 4) {
    return [];
  }

  const ngrams: string[] = [];
  for (const size of [4, 3, 2]) {
    for (let index = 0; index <= word.length - size; index += 1) {
      ngrams.push(word.slice(index, index + size));
    }
  }

  return ngrams;
}

function toExcerpt(text: string, start: number, end: number): { start: number; end: number; excerpt: string } {
  const excerptStart = Math.max(0, start - 24);
  const excerptEnd = Math.min(text.length, end + 24);
  return { start, end, excerpt: text.slice(excerptStart, excerptEnd) };
}

const STOP_WORDS = new Set(['这个', '一个', '不能', '不可', '不会', '绝不', '角色', '世界', '规则', '伏笔', '线索', '相关', '描述']);

