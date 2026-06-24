export type ProjectType = 'original' | 'fanfiction';

export type EntryType = 'character' | 'world' | 'plot';

export type EntryFormat = 'json' | 'markdown';

export type PlotStatus = 'open' | 'resolved' | 'abandoned';

export type InspirationBuiltinType = 'uncategorized' | 'character_setting' | 'plot_setting' | 'world_setting';

export interface InspirationTypeDefinition {
  id: string;
  name: string;
  builtIn: boolean;
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectManifest {
  id: string;
  name: string;
  type: ProjectType;
  summary: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
}

export interface SettingSetManifest {
  id: string;
  name: string;
  summary: string;
  cover?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: 2;
}

export type BookStatus = 'planning' | 'drafting' | 'revision' | 'completed' | 'archived';

export interface BookManifest {
  id: string;
  settingSetId?: string;
  title: string;
  subtitle?: string;
  type: ProjectType;
  summary: string;
  cover?: string;
  targetWords?: number;
  status: BookStatus;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 2;
}

export type SettingEntityType = 'character' | 'world';
export type SettingEntityScope = 'global' | 'book' | 'override';

export interface SettingRelation {
  id: string;
  settingSetId?: string;
  bookId?: string;
  sourceId: string;
  sourceType: SettingEntityType;
  targetId: string;
  targetType: SettingEntityType;
  label: string;
  description?: string;
  scope: SettingEntityScope;
  createdAt: string;
  updatedAt: string;
}

export interface SettingEntityBase {
  id: string;
  settingSetId?: string;
  bookId?: string;
  baseEntityId?: string;
  type: SettingEntityType;
  scope: SettingEntityScope;
  title: string;
  summary?: string;
  content: string;
  tags: string[];
  relations: SettingRelation[];
  customFields: Record<string, string>;
  sourceState: 'active' | 'overridden' | 'deprecated';
  createdAt: string;
  updatedAt: string;
}

export interface CharacterEntity extends SettingEntityBase {
  type: 'character';
  role: 'protagonist' | 'supporting' | 'antagonist' | 'other';
  appearance?: string;
  personalityTags: string[];
  abilities?: string;
  background?: string;
  redLines: string[];
}

export interface WorldEntity extends SettingEntityBase {
  type: 'world';
  category: 'geography' | 'faction' | 'magic' | 'technology' | 'history' | 'culture' | 'other';
  rules: string[];
}

export type SettingEntity = CharacterEntity | WorldEntity;

export type VolumeStatus = 'planning' | 'drafting' | 'revision' | 'completed' | 'locked';
export type ChapterStatus = 'not_started' | 'drafting' | 'revision' | 'done' | 'locked';

export interface VolumeNode {
  id: string;
  bookId: string;
  title: string;
  summary?: string;
  order: number;
  targetWords?: number;
  actualWords: number;
  status: VolumeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterNode {
  id: string;
  bookId: string;
  volumeId: string;
  title: string;
  summary?: string;
  content: string;
  format: 'markdown';
  order: number;
  targetWords?: number;
  actualWords: number;
  status: ChapterStatus;
  relatedCharacterIds: string[];
  relatedWorldEntryIds: string[];
  relatedPlotIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BookTree {
  book: BookManifest;
  volumes: VolumeNode[];
  chapters: ChapterNode[];
}

export interface SettingSetCreateInput {
  name: string;
  summary?: string;
  cover?: string;
  tags?: string[];
  id?: string;
}

export interface SettingSetUpdateInput extends Partial<SettingSetCreateInput> {
  id: string;
}

export type DeleteSettingSetStrategy = 'block' | 'detach_books';

export interface BookCreateInput {
  title: string;
  settingSetId?: string;
  subtitle?: string;
  type?: ProjectType;
  summary?: string;
  cover?: string;
  targetWords?: number;
  status?: BookStatus;
  id?: string;
}

export interface BookUpdateInput extends Partial<BookCreateInput> {
  id: string;
}

export interface BookBindingResult {
  book: BookManifest;
  conflictCount: number;
  warnings: string[];
}

export interface VolumeCreateInput {
  bookId: string;
  title: string;
  summary?: string;
  order?: number;
  targetWords?: number;
  status?: VolumeStatus;
  id?: string;
}

export interface VolumeUpdateInput extends Partial<Omit<VolumeCreateInput, 'bookId'>> {
  bookId: string;
  id: string;
}

export interface ChapterCreateInput {
  bookId: string;
  volumeId: string;
  title: string;
  summary?: string;
  content?: string;
  order?: number;
  targetWords?: number;
  status?: ChapterStatus;
  relatedCharacterIds?: string[];
  relatedWorldEntryIds?: string[];
  relatedPlotIds?: string[];
  id?: string;
}

export interface ChapterUpdateInput extends Partial<Omit<ChapterCreateInput, 'bookId' | 'volumeId'>> {
  bookId: string;
  id: string;
  volumeId?: string;
}

export interface ChapterMoveInput {
  bookId: string;
  chapterId: string;
  volumeId: string;
  order: number;
}

export interface EntryRelation {
  targetId: string;
  targetType: EntryType;
  label?: string;
}

export interface BaseEntry {
  id: string;
  projectId: string;
  type: EntryType;
  title: string;
  summary?: string;
  content: string;
  tags: string[];
  relations: EntryRelation[];
  customFields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  format: EntryFormat;
}

export interface CharacterEntry extends BaseEntry {
  type: 'character';
  role: 'protagonist' | 'supporting' | 'antagonist' | 'other';
  appearance?: string;
  personalityTags: string[];
  abilities?: string;
  background?: string;
  redLines: string[];
}

export interface WorldEntry extends BaseEntry {
  type: 'world';
  category: 'geography' | 'faction' | 'magic' | 'technology' | 'history' | 'culture' | 'other';
  rules: string[];
}

export interface PlotEntry extends BaseEntry {
  type: 'plot';
  inspirationType: InspirationBuiltinType | string;
  relatedProjectIds: string[];
  setupChapter?: string;
  expectedPayoffChapter?: string;
  status: PlotStatus;
  relatedCharacters: string[];
}

export type ProjectEntry = CharacterEntry | WorldEntry | PlotEntry;

export interface ProjectCreateInput {
  name: string;
  type: ProjectType;
  summary?: string;
  id?: string;
}

export interface ProjectUpdateInput {
  projectId: string;
  name?: string;
  type?: ProjectType;
  summary?: string;
}

export interface EntrySaveInput {
  projectId: string;
  entry: ProjectEntry;
}

export interface EntryCreateInput {
  projectId: string;
  type: EntryType;
  title: string;
  createdAt?: string;
  summary?: string;
  content?: string;
  tags?: string[];
  relations?: EntryRelation[];
  customFields?: Record<string, string>;
  relationsText?: string;
  customFieldsText?: string;
  format?: EntryFormat;
  id?: string;
  role?: CharacterEntry['role'];
  appearance?: string;
  personalityTags?: string[];
  abilities?: string;
  background?: string;
  redLines?: string[];
  category?: WorldEntry['category'];
  rules?: string[];
  inspirationType?: InspirationBuiltinType | string;
  relatedProjectIds?: string[];
  setupChapter?: string;
  expectedPayoffChapter?: string;
  status?: PlotStatus;
  relatedCharacters?: string[];
}

export interface EntryUpdateInput {
  projectId: string;
  type: EntryType;
  entryId: string;
  changes: Partial<Omit<EntryCreateInput, 'projectId' | 'type' | 'id'>>;
}

export interface EntryListQuery {
  projectId: string;
  type?: EntryType;
  limit?: number;
}

export interface SearchQuery {
  projectId?: string;
  keyword: string;
  limit?: number;
}

export interface SearchResultItem {
  id: string;
  projectId: string;
  type: EntryType | 'project';
  title: string;
  excerpt: string;
  score?: number;
  filePath?: string;
  updatedAt: string;
  metadata?: Record<string, string>;
}

export interface RecentAccessItem extends SearchResultItem {
  accessedAt: string;
}

export interface DashboardStats {
  projectCount: number;
  entryCount: number;
  byType: Record<EntryType, number>;
  plotStatus: Record<PlotStatus, number>;
  openPlotCount: number;
  updatedTodayCount: number;
  latestUpdatedAt?: string;
}

export type ValidationCategory = 'character-red-line' | 'world-rule' | 'plot-reminder';

export type ValidationSeverity = 'info' | 'warning';

export interface ValidationRequest {
  projectId: string;
  text: string;
  characterIds?: string[];
  worldEntryIds?: string[];
  includePlotReminders?: boolean;
}

export interface ValidationFinding {
  id: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  entryId: string;
  entryType: EntryType;
  title: string;
  rule: string;
  message: string;
  suggestion?: string;
  excerpt?: string;
  start?: number;
  end?: number;
}

export interface ValidationResult {
  ok: boolean;
  checkedAt: string;
  summary: {
    checkedCharacters: number;
    checkedWorldRules: number;
    checkedOpenPlots: number;
    warningCount: number;
    reminderCount: number;
  };
  findings: ValidationFinding[];
}

export interface IndexSyncSummary {
  scannedFiles: number;
  indexedEntries: number;
  indexedProjects: number;
  removedFiles: number;
  errors: Array<{ filePath: string; message: string }>;
}

export interface ProjectImportResult {
  project: ProjectManifest;
  summary: IndexSyncSummary;
}

export type PlotCardType = 'event' | 'dialogue' | 'battle' | 'clue_setup' | 'clue_reinforce' | 'clue_payoff' | 'transition' | 'narration';

export type PlotLinkType = 'sequence' | 'causal' | 'parallel' | 'flashback' | 'conditional';

export type StateOwnerType = 'character' | 'world' | 'plot' | 'chapter';

export type StateValueType = 'text' | 'number' | 'enum' | 'boolean';

export type StateVisibility = 'global' | 'chapter' | 'scene';

export type StateDeltaOperator = 'set' | 'increase' | 'decrease' | 'append' | 'remove';

export type PlotboardValidationCategory = 'timeline' | 'character-state' | 'behavior-redline' | 'world-rule' | 'plot-thread' | 'chapter-continuity';

export type PlotboardValidationSeverity = 'info' | 'warning' | 'error';

export interface PlotboardViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface StateFieldValue {
  value: unknown;
  semanticPrompt?: string;
}

export interface StateDelta {
  ownerType: StateOwnerType;
  ownerId: string;
  fieldName: string;
  operator: StateDeltaOperator;
  value: unknown;
  reason?: string;
}

export interface PlotCard {
  cardId: string;
  title: string;
  fact: string;
  cardType: PlotCardType;
  timecode?: string;
  povCharacterId?: string;
  locationWorldEntryId: string;
  characterIds: string[];
  worldEntryIds: string[];
  plotEntryIds: string[];
  stateDeltas: StateDelta[];
  narrativeTone: string[];
  detailLevel?: number;
  generationInstruction?: string;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface PlotLink {
  linkId: string;
  sourceCardId: string;
  targetCardId: string;
  linkType: PlotLinkType;
  motivation?: string;
  condition?: string;
  [key: string]: unknown;
}

export interface StateTemplate {
  templateId: string;
  ownerType: StateOwnerType;
  ownerId: string;
  fieldName: string;
  valueType: StateValueType;
  currentValue: unknown;
  semanticPrompt: string;
  visibility: StateVisibility;
  [key: string]: unknown;
}

export interface StateSnapshotItem {
  ownerType: StateOwnerType;
  ownerId: string;
  fields: Record<string, StateFieldValue>;
  [key: string]: unknown;
}

export interface StateSnapshot {
  schemaVersion: 1;
  bookId?: string;
  chapterId: string;
  snapshotTimecode?: string;
  states: StateSnapshotItem[];
  sourceDiffIds: string[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface StateDiff {
  diffId: string;
  targetType: StateOwnerType;
  targetId: string;
  fieldName: string;
  from: unknown;
  to: unknown;
  reason: string;
  sourceCardId?: string;
  confidence?: string;
  status?: 'suggested' | 'accepted' | 'modified' | 'rejected';
  [key: string]: unknown;
}

export type PlotboardGenerationMode = 'single_card' | 'selection' | 'full_chapter' | 'continue' | 'rewrite';

export interface PlotboardGenerationSettings {
  mode: PlotboardGenerationMode;
  selectedCardIds?: string[];
  userInstruction?: string;
  targetWords?: number;
  appendToExisting?: boolean;
  rewriteStrategy?: 'replace_all' | 'append' | 'mark_stale_and_append';
}

export interface PlotboardAiContext {
  plotboard: Pick<Plotboard, 'plotboardId' | 'bookId' | 'chapterId'>;
  mode: PlotboardGenerationMode;
  cards: PlotCard[];
  links: PlotLink[];
  characters: Array<Pick<CharacterEntry, 'id' | 'title' | 'summary' | 'content' | 'personalityTags' | 'redLines' | 'customFields'>>;
  worldRules: Array<Pick<WorldEntry, 'id' | 'title' | 'summary' | 'content' | 'category' | 'rules' | 'customFields'>>;
  plotClues: Array<Pick<PlotEntry, 'id' | 'title' | 'summary' | 'content' | 'status' | 'setupChapter' | 'expectedPayoffChapter' | 'customFields'>>;
  stateTemplates: StateTemplate[];
  chapterSnapshot: StateSnapshot;
  flashbackSnapshot?: StateSnapshot;
  sceneDeltas: StateDelta[];
  neighborSummaries: Array<{ cardId: string; title: string; fact: string; relation: 'previous' | 'next' | 'linked' }>;
  generationSettings: PlotboardGenerationSettings;
}

export interface PlotboardGenerationRequest {
  bookId: string;
  chapterId: string;
  settings: PlotboardGenerationSettings;
}

export interface PlotboardGenerationResult {
  requestId: string;
  status: 'ok' | 'degraded' | 'error';
  markdown: string;
  stateDiffs: StateDiff[];
  context: PlotboardAiContext;
  warnings: string[];
  usage?: AiAgentResponse<unknown>['usage'];
  error?: string;
}

export interface StateDiffSettlementInput {
  bookId: string;
  chapterId: string;
  diffs: StateDiff[];
}

export interface StateDiffSettlementResult {
  snapshot: StateSnapshot;
  appliedDiffIds: string[];
  rejectedDiffIds: string[];
}

export interface PlotboardMarkdownLocation {
  sourceCardId?: string;
  paragraphIndex: number;
  excerpt: string;
}

export interface PlotboardValidationFinding {
  id: string;
  category: PlotboardValidationCategory;
  severity: PlotboardValidationSeverity;
  message: string;
  suggestion?: string;
  cardId?: string;
  relatedCardIds?: string[];
  linkId?: string;
  chapterId?: string;
  markdownRange?: { start: number; end: number };
  markdownLocation?: PlotboardMarkdownLocation;
  entryId?: string;
  entryType?: EntryType;
  rule?: string;
  [key: string]: unknown;
}

export interface PlotClueStatusHint {
  plotEntryId: string;
  title?: string;
  status?: PlotStatus;
  setupCardIds: string[];
  reinforceCardIds: string[];
  payoffCardIds: string[];
  shouldResolve: boolean;
}

export interface PlotboardValidationResult {
  ok: boolean;
  checkedAt: string;
  summary: {
    timelineConflicts: number;
    characterStateConflicts: number;
    behaviorRedlineConflicts: number;
    worldRuleConflicts: number;
    plotThreadConflicts: number;
    chapterContinuityConflicts: number;
    warningCount: number;
    errorCount: number;
  };
  findings: PlotboardValidationFinding[];
  clueStatusHints: PlotClueStatusHint[];
}

export interface PlotboardValidationRequest {
  bookId: string;
  chapterId: string;
  markdown?: string;
}

export interface Plotboard {
  schemaVersion: 1;
  plotboardId: string;
  bookId: string;
  chapterId: string;
  projectId?: string;
  settingSetId?: string;
  cards: PlotCard[];
  links: PlotLink[];
  stateTemplates?: StateTemplate[];
  viewport: PlotboardViewport;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface ChapterBodySnapshotResult {
  snapshotId: string;
  filePath: string;
  createdAt: string;
}

export interface GeneratedMarkdownWriteInput {
  bookId: string;
  chapterId: string;
  markdown: string;
  preserveSnapshot?: boolean;
}

export interface GeneratedMarkdownWriteResult {
  chapter: ChapterNode;
  snapshot?: ChapterBodySnapshotResult;
}

export interface ProjectExportResult {
  projectId: string;
  destinationPath: string;
}

export type VectorIndexStatus = 'ready' | 'dirty' | 'building' | 'degraded' | 'empty';

export interface VectorIndexState {
  projectId: string;
  status: VectorIndexStatus;
  dirty: boolean;
  updatedAt?: string;
  chunkCount: number;
  embeddedCount: number;
  warnings: string[];
}

export type AiProvider = 'openai' | 'anthropic' | 'azure-openai' | 'gemini' | 'ollama' | 'deepseek' | 'qwen' | 'openai-compatible';

export interface ModelInfo {
  id: string;
  name?: string;
  ownedBy?: string;
  source?: 'remote' | 'manual';
}

export interface AiModelConfigPublic {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  apiKeySet: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  customModels: ModelInfo[];
}

export interface AiConfig {
  llm: AiModelConfigPublic;
  embedding: AiModelConfigPublic;
}

export interface AiModelConfigSaveInput {
  enabled?: boolean;
  provider?: AiProvider;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  apiKey?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  customModels?: ModelInfo[];
}

export interface AiStreamChunk {
  type: 'delta' | 'finish' | 'usage' | 'error';
  content?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  error?: string;
}

export interface AiConfigSaveInput {
  llm?: AiModelConfigSaveInput;
  embedding?: AiModelConfigSaveInput;
}

export type PromptScenario = 'logic_check' | 'setting_completion' | 'foreshadowing' | 'rag_qa';

export interface AiPromptConfig {
  globalSystemPrompt: string;
  scenarios: Record<PromptScenario, string>;
  updatedAt: string;
}

export interface AiPromptSaveInput {
  globalSystemPrompt?: string;
  scenarios?: Partial<Record<PromptScenario, string>>;
}

export interface AiSkillConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  builtIn: boolean;
}

export interface AiSkillSaveInput {
  id: string;
  name?: string;
  description?: string;
  enabled: boolean;
}

export interface HttpToolConfig {
  id: string;
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  enabled: boolean;
  timeoutMs: number;
  updatedAt: string;
}

export interface HttpToolSaveInput {
  id?: string;
  name: string;
  description?: string;
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  enabled?: boolean;
  timeoutMs?: number;
}

/** 智能体配置 - 每个智能体独立组合模型、提示词、技能、工具 */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 场景提示词（保留兼容旧 AiPromptConfig.scenarios） */
  scenarios: Partial<Record<'logic_check' | 'setting_completion' | 'foreshadowing' | 'rag_qa', string>>;
  /** 使用的模型 ID（引用 aiConfig.llm.model 或自定义） */
  model: string;
  /** 模型参数（每个智能体独立） */
  temperature: number;
  topP: number;
  maxTokens: number;
  /** 启用的技能 ID 列表（引用 AiSkillConfig.id） */
  enabledSkills: string[];
  /** 启用的工具 ID 列表（引用 HttpToolConfig.id） */
  enabledTools: string[];
  /** 排序序号 */
  order: number;
  /** 是否内置（内置智能体不可删除） */
  builtIn: boolean;
  updatedAt: string;
}

export interface AgentSaveInput {
  id?: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  scenarios?: Partial<Record<'logic_check' | 'setting_completion' | 'foreshadowing' | 'rag_qa', string>>;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  enabledSkills?: string[];
  enabledTools?: string[];
  order?: number;
}

export interface AgentReorderInput {
  id: string;
  order: number;
}

export type RetrievalMode = 'fts' | 'vector' | 'hybrid';

export interface RetrievedContext {
  id: string;
  projectId: string;
  entityType: EntryType;
  title: string;
  snippet: string;
  sourcePath?: string;
  score: number;
  matchReason: 'keyword' | 'vector' | 'relation' | 'recent_access' | 'manual_scope';
  fields: string[];
}

export interface RagQueryRequest {
  requestId?: string;
  projectId: string;
  query: string;
  filters?: {
    entityTypes?: EntryType[];
    ids?: string[];
    includeArchived?: boolean;
  };
  topK?: number;
  retrievalMode?: RetrievalMode;
  maxContextChars?: number;
}

export interface RagQueryResult {
  status: 'ok' | 'partial' | 'degraded';
  query: string;
  contexts: RetrievedContext[];
  warnings: string[];
}

export interface RagBuildResult extends VectorIndexState {
  status: 'ready' | 'dirty' | 'building' | 'degraded' | 'empty';
}

export interface AiAgentResponse<T> {
  requestId: string;
  status: 'ok' | 'partial' | 'degraded' | 'blocked' | 'error';
  data?: T;
  warnings: string[];
  evidence: RetrievedContext[];
  usage?: {
    provider?: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
  };
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

export interface AiValidationRequest extends ValidationRequest {
  requestId?: string;
  topK?: number;
  retrievalMode?: RetrievalMode;
}

export interface AiValidationResult {
  validation: ValidationResult;
  aiFindings: ValidationFinding[];
  mergedFindings: ValidationFinding[];
}

export interface SettingCompletionRequest {
  requestId?: string;
  projectId: string;
  entityType: EntryType;
  draft: string;
  existingFields?: Record<string, unknown>;
  completionGoal?: 'fill_empty_fields' | 'expand_red_lines' | 'suggest_relations' | 'normalize_tags';
  topK?: number;
}

export interface SettingCompletionResult {
  proposedFields: Record<string, unknown>;
  missingQuestions: string[];
  possibleConflicts: Array<{
    field: string;
    reason: string;
    relatedEvidenceId?: string;
  }>;
  adoptionMode: 'manual_review_required';
}
