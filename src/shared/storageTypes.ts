export type ProjectType = 'original' | 'fanfiction';

export type EntryType = 'character' | 'world' | 'plot';

export type EntryFormat = 'json' | 'markdown';

export type PlotStatus = 'open' | 'resolved' | 'abandoned';

export interface ProjectManifest {
  id: string;
  name: string;
  type: ProjectType;
  summary: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: 1;
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

export type AiProvider = 'openai-compatible' | 'anthropic';

export interface AiModelConfigPublic {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  apiKeySet: boolean;
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
