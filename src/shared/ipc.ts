import type {
  AiAgentResponse,
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
  BookBindingResult,
  BookCreateInput,
  BookManifest,
  BookTree,
  BookUpdateInput,
  ChapterCreateInput,
  ChapterMoveInput,
  ChapterNode,
  ChapterUpdateInput,
  DashboardStats,
  DeleteSettingSetStrategy,
  EntryCreateInput,
  EntryListQuery,
  EntryType,
  EntryUpdateInput,
  HttpToolConfig,
  InspirationTypeDefinition,
  HttpToolSaveInput,
  IndexSyncSummary,
  GeneratedMarkdownWriteInput,
  GeneratedMarkdownWriteResult,
  ModelInfo,
  Plotboard,
  PlotboardGenerationRequest,
  PlotboardGenerationResult,
  PlotboardValidationRequest,
  PlotboardValidationResult,
  ProjectCreateInput,
  ProjectEntry,
  ProjectExportResult,
  ProjectImportResult,
  ProjectManifest,
  ProjectUpdateInput,
  RagBuildResult,
  RagQueryRequest,
  RagQueryResult,
  RecentAccessItem,
  RetrievedContext,
  SearchQuery,
  SearchResultItem,
  SettingCompletionRequest,
  SettingSetCreateInput,
  SettingSetManifest,
  SettingSetUpdateInput,
  StateDiffSettlementInput,
  StateDiffSettlementResult,
  StateSnapshot,
  VectorIndexState,
  SettingCompletionResult,
  VolumeCreateInput,
  VolumeNode,
  VolumeUpdateInput,
  ValidationFinding,
  ValidationRequest,
  ValidationResult
} from './storageTypes.js';

export const IPC_CHANNELS = {
  appInfo: 'app:info',
  ping: 'app:ping',
  searchPreview: 'search:preview',
  searchGlobal: 'search:global',
  recentList: 'recent:list',
  dashboardStats: 'dashboard:stats',
  settingSetsList: 'setting-sets:list',
  settingSetsGet: 'setting-sets:get',
  settingSetsCreate: 'setting-sets:create',
  settingSetsUpdate: 'setting-sets:update',
  settingSetsDelete: 'setting-sets:delete',
  booksList: 'books:list',
  booksGet: 'books:get',
  booksCreate: 'books:create',
  booksUpdate: 'books:update',
  booksDelete: 'books:delete',
  booksBindSettingSet: 'books:bind-setting-set',
  chaptersListTree: 'chapters:list-tree',
  chaptersCreateVolume: 'chapters:create-volume',
  chaptersUpdateVolume: 'chapters:update-volume',
  chaptersCreateChapter: 'chapters:create-chapter',
  chaptersUpdateChapter: 'chapters:update-chapter',
  chaptersMoveChapter: 'chapters:move-chapter',
  chaptersDeleteChapter: 'chapters:delete-chapter',
  chaptersDeleteVolume: 'chapters:delete-volume',
  chaptersSelectExportFolder: 'chapters:select-export-folder',
  chaptersExport: 'chapters:export',
  plotboardsCreate: 'plotboards:create',
  plotboardsOpen: 'plotboards:open',
  plotboardsSave: 'plotboards:save',
  plotboardsSaveSnapshot: 'plotboards:snapshot:save',
  plotboardsLoadSnapshot: 'plotboards:snapshot:load',
  plotboardsSyncIndex: 'plotboards:index:sync',
  plotboardsExportOutline: 'plotboards:outline:export',
  plotboardsSaveChapterSnapshot: 'plotboards:chapter-snapshot:save',
  plotboardsWriteGeneratedMarkdown: 'plotboards:generated-markdown:write',
  plotboardsBuildAiContext: 'plotboards:ai-context:build',
  plotboardsGenerate: 'plotboards:generate',
  plotboardsStreamGenerate: 'plotboards:generate:stream',
  plotboardsSettleDiffs: 'plotboards:diffs:settle',
  plotboardsValidate: 'plotboards:validate',
  projectsList: 'projects:list',
  projectsGet: 'projects:get',
  projectsCreate: 'projects:create',
  projectsUpdate: 'projects:update',
  projectsDelete: 'projects:delete',
  projectsExport: 'projects:export',
  projectsImportFolder: 'projects:import-folder',
  projectsImportZip: 'projects:import-zip',
  entriesList: 'entries:list',
  entriesGet: 'entries:get',
  entriesCreate: 'entries:create',
  entriesUpdate: 'entries:update',
  entriesDelete: 'entries:delete',
  inspirationTypesList: 'inspiration-types:list',
  inspirationTypesCreate: 'inspiration-types:create',
  inspirationTypesUpdate: 'inspiration-types:update',
  inspirationTypesDelete: 'inspiration-types:delete',
  validationBasic: 'validation:basic',
  validationEnhanced: 'validation:enhanced',
  aiConfigGet: 'ai:config:get',
  aiConfigSave: 'ai:config:save',
  aiConnectionTest: 'ai:connection:test',
  aiPromptsGet: 'ai:prompts:get',
  aiPromptsSave: 'ai:prompts:save',
  aiSkillsList: 'ai:skills:list',
  aiSkillsSave: 'ai:skills:save',
  aiHttpToolsList: 'ai:http-tools:list',
  aiHttpToolsSave: 'ai:http-tools:save',
  aiHttpToolsDelete: 'ai:http-tools:delete',
  agentList: 'agent:list',
  agentGet: 'agent:get',
  agentCreate: 'agent:create',
  agentUpdate: 'agent:update',
  agentDelete: 'agent:delete',
  agentReorder: 'agent:reorder',
  ragBuild: 'rag:build',
  ragState: 'rag:state',
  ragQuery: 'rag:query',
  ragAnswer: 'rag:answer',
  aiSettingComplete: 'ai:setting:complete',
  aiForeshadowing: 'ai:foreshadowing',
  aiModelsList: 'ai:models:list',
  aiStreamValidation: 'ai:stream:validation',
  aiStreamRagAnswer: 'ai:stream:rag-answer',
  aiStreamCompleteSetting: 'ai:stream:complete-setting',
  aiStreamForeshadowing: 'ai:stream:foreshadowing',
  indexRebuild: 'index:rebuild',
  systemFonts: 'system:fonts',
  desktopFloatingToggle: 'desktop:floating:toggle',
  desktopFloatingShow: 'desktop:floating:show',
  desktopFloatingHide: 'desktop:floating:hide',
  desktopFloatingPin: 'desktop:floating:pin',
  desktopMainPin: 'desktop:main:pin',
  desktopWindowMinimize: 'desktop:window:minimize',
  desktopWindowMaximize: 'desktop:window:maximize',
  desktopWindowClose: 'desktop:window:close',
  desktopOpenWindow: 'desktop:window:open'
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  isPackaged: boolean;
}

export type SearchPreviewItem = SearchResultItem;

export type ChapterExportFormat = 'markdown' | 'txt' | 'zip';

export interface ChapterExportItem {
  title: string;
  content: string;
  order: number;
}

export interface ChapterExportInput {
  format: ChapterExportFormat;
  outputDirectory: string;
  chapters: ChapterExportItem[];
}

export interface ChapterExportResult {
  destinationPath: string;
  fileCount: number;
}

export interface HetuSketchApi {
  app: {
    getInfo: () => Promise<AppInfo>;
    ping: () => Promise<{ ok: true; timestamp: number }>;
  };
  search: {
    preview: (keyword: string) => Promise<SearchPreviewItem[]>;
    global: (query: SearchQuery) => Promise<SearchResultItem[]>;
    recent: (projectId?: string, limit?: number) => Promise<RecentAccessItem[]>;
  };
  dashboard: {
    stats: (projectId?: string) => Promise<DashboardStats>;
  };
  settingSets: {
    list: () => Promise<SettingSetManifest[]>;
    get: (id: string) => Promise<SettingSetManifest>;
    create: (input: SettingSetCreateInput) => Promise<SettingSetManifest>;
    update: (input: SettingSetUpdateInput) => Promise<SettingSetManifest>;
    delete: (id: string, strategy: DeleteSettingSetStrategy) => Promise<void>;
  };
  books: {
    list: () => Promise<BookManifest[]>;
    get: (bookId: string) => Promise<BookManifest>;
    create: (input: BookCreateInput) => Promise<BookManifest>;
    update: (input: BookUpdateInput) => Promise<BookManifest>;
    delete: (bookId: string) => Promise<void>;
    bindSettingSet: (bookId: string, settingSetId?: string) => Promise<BookBindingResult>;
  };
  chapters: {
    listTree: (bookId: string) => Promise<BookTree>;
    createVolume: (input: VolumeCreateInput) => Promise<VolumeNode>;
    updateVolume: (input: VolumeUpdateInput) => Promise<VolumeNode>;
    createChapter: (input: ChapterCreateInput) => Promise<ChapterNode>;
    updateChapter: (input: ChapterUpdateInput) => Promise<ChapterNode>;
    moveChapter: (input: ChapterMoveInput) => Promise<BookTree>;
    deleteChapter: (bookId: string, chapterId: string) => Promise<void>;
    deleteVolume: (bookId: string, volumeId: string) => Promise<void>;
    selectExportFolder: () => Promise<string | undefined>;
    export: (input: ChapterExportInput) => Promise<ChapterExportResult>;
  };
  plotboards: {
    create: (input: { bookId: string; chapterId: string; projectId?: string; settingSetId?: string }) => Promise<Plotboard>;
    open: (bookId: string, chapterId: string) => Promise<Plotboard>;
    save: (plotboard: Plotboard) => Promise<Plotboard>;
    saveSnapshot: (bookId: string, snapshot: StateSnapshot) => Promise<StateSnapshot>;
    loadSnapshot: (bookId: string, chapterId: string) => Promise<StateSnapshot>;
    syncIndex: (bookId: string) => Promise<IndexSyncSummary>;
    exportOutline: (bookId: string, chapterId: string) => Promise<string>;
    saveChapterSnapshot: (bookId: string, chapterId: string) => Promise<{ snapshotId: string; filePath: string; createdAt: string }>;
    writeGeneratedMarkdown: (input: GeneratedMarkdownWriteInput) => Promise<GeneratedMarkdownWriteResult>;
    buildAiContext: (request: PlotboardGenerationRequest) => Promise<PlotboardGenerationResult['context']>;
    generate: (request: PlotboardGenerationRequest) => Promise<PlotboardGenerationResult>;
    streamGenerate: (request: PlotboardGenerationRequest, onChunk: (chunk: AiStreamChunk) => void) => Promise<PlotboardGenerationResult>;
    settleDiffs: (input: StateDiffSettlementInput) => Promise<StateDiffSettlementResult>;
    validate: (input: PlotboardValidationRequest) => Promise<PlotboardValidationResult>;
  };
  projects: {
    list: () => Promise<ProjectManifest[]>;
    get: (projectId: string) => Promise<ProjectManifest>;
    create: (input: ProjectCreateInput) => Promise<ProjectManifest>;
    update: (input: ProjectUpdateInput) => Promise<ProjectManifest>;
    delete: (projectId: string) => Promise<void>;
    export: (projectId: string) => Promise<ProjectExportResult | undefined>;
    importFolder: () => Promise<ProjectImportResult | undefined>;
    importZip: () => Promise<ProjectImportResult | undefined>;
  };
  entries: {
    list: (query: EntryListQuery) => Promise<SearchResultItem[]>;
    get: (projectId: string, type: EntryType, entryId: string) => Promise<ProjectEntry>;
    create: (input: EntryCreateInput) => Promise<ProjectEntry>;
    update: (input: EntryUpdateInput) => Promise<ProjectEntry>;
    delete: (projectId: string, type: EntryType, entryId: string) => Promise<void>;
  };
  inspirationTypes: {
    list: (projectId: string) => Promise<InspirationTypeDefinition[]>;
    create: (projectId: string, name: string) => Promise<InspirationTypeDefinition>;
    update: (projectId: string, id: string, name: string) => Promise<InspirationTypeDefinition>;
    delete: (projectId: string, id: string) => Promise<void>;
  };
  validation: {
    basic: (request: ValidationRequest) => Promise<ValidationResult>;
    enhanced: (request: AiValidationRequest) => Promise<AiAgentResponse<AiValidationResult>>;
  };
  ai: {
    getConfig: () => Promise<AiConfig>;
    saveConfig: (input: AiConfigSaveInput) => Promise<AiConfig>;
    testConnection: (kind: 'llm' | 'embedding', input?: AiConfigSaveInput['llm']) => Promise<{ ok: boolean; message: string; provider?: string; model?: string }>;
    getPrompts: () => Promise<AiPromptConfig>;
    savePrompts: (input: AiPromptSaveInput) => Promise<AiPromptConfig>;
    listSkills: () => Promise<AiSkillConfig[]>;
    saveSkills: (input: AiSkillSaveInput[]) => Promise<AiSkillConfig[]>;
    listHttpTools: () => Promise<HttpToolConfig[]>;
    saveHttpTool: (input: HttpToolSaveInput) => Promise<HttpToolConfig>;
    deleteHttpTool: (toolId: string) => Promise<void>;
    completeSetting: (request: SettingCompletionRequest) => Promise<AiAgentResponse<SettingCompletionResult>>;
    foreshadowing: (projectId: string, text: string, requestId?: string) => Promise<AiAgentResponse<{ reminders: ValidationFinding[] }>>;
    listModels: (kind: 'llm' | 'embedding', input?: AiConfigSaveInput['llm']) => Promise<ModelInfo[]>;
    streamValidation: (request: AiValidationRequest, basic: ValidationResult, onChunk: (chunk: AiStreamChunk) => void) => Promise<void>;
    streamRagAnswer: (request: RagQueryRequest, onChunk: (chunk: AiStreamChunk) => void) => Promise<void>;
    streamCompleteSetting: (request: SettingCompletionRequest, onChunk: (chunk: AiStreamChunk) => void) => Promise<void>;
    streamForeshadowing: (projectId: string, text: string, onChunk: (chunk: AiStreamChunk) => void, requestId?: string) => Promise<void>;
  };
  agent: {
    list: () => Promise<AgentConfig[]>;
    get: (id: string) => Promise<AgentConfig | null>;
    create: (input: AgentSaveInput) => Promise<AgentConfig>;
    update: (input: AgentSaveInput) => Promise<AgentConfig>;
    delete: (id: string) => Promise<void>;
    reorder: (input: AgentReorderInput[]) => Promise<AgentConfig[]>;
  };
  rag: {
    build: (projectId: string) => Promise<RagBuildResult>;
    state: (projectId: string) => Promise<VectorIndexState>;
    query: (request: RagQueryRequest) => Promise<RagQueryResult>;
    answer: (request: RagQueryRequest) => Promise<AiAgentResponse<{ answer: string; citations: RetrievedContext[] }>>;
  };
  index: {
    rebuild: (projectId?: string) => Promise<IndexSyncSummary>;
  };
  system: {
    fonts: () => Promise<string[]>;
  };
  desktop: {
    toggleFloating: () => Promise<{ visible: boolean; pinned: boolean }>;
    showFloating: () => Promise<{ visible: boolean; pinned: boolean }>;
    hideFloating: () => Promise<{ visible: boolean; pinned: boolean }>;
    setFloatingPinned: (pinned: boolean) => Promise<{ visible: boolean; pinned: boolean }>;
    setMainPinned: (pinned: boolean) => Promise<{ pinned: boolean }>;
    minimize: () => Promise<void>;
    maximize: () => Promise<{ maximized: boolean }>;
    close: () => Promise<void>;
    openWindow: (path: string) => Promise<void>;
  };
}
