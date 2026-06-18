import type {
  AiAgentResponse,
  AiConfig,
  AiConfigSaveInput,
  AiPromptConfig,
  AiPromptSaveInput,
  AiSkillConfig,
  AiSkillSaveInput,
  AiValidationRequest,
  AiValidationResult,
  DashboardStats,
  EntryCreateInput,
  EntryListQuery,
  EntryType,
  EntryUpdateInput,
  HttpToolConfig,
  HttpToolSaveInput,
  IndexSyncSummary,
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
  VectorIndexState,
  SettingCompletionResult,
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
  ragBuild: 'rag:build',
  ragState: 'rag:state',
  ragQuery: 'rag:query',
  ragAnswer: 'rag:answer',
  aiSettingComplete: 'ai:setting:complete',
  aiForeshadowing: 'ai:foreshadowing',
  indexRebuild: 'index:rebuild',
  desktopFloatingToggle: 'desktop:floating:toggle',
  desktopFloatingShow: 'desktop:floating:show',
  desktopFloatingHide: 'desktop:floating:hide',
  desktopFloatingPin: 'desktop:floating:pin',
  desktopMainPin: 'desktop:main:pin'
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  isPackaged: boolean;
}

export type SearchPreviewItem = SearchResultItem;

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
  validation: {
    basic: (request: ValidationRequest) => Promise<ValidationResult>;
    enhanced: (request: AiValidationRequest) => Promise<AiAgentResponse<AiValidationResult>>;
  };
  ai: {
    getConfig: () => Promise<AiConfig>;
    saveConfig: (input: AiConfigSaveInput) => Promise<AiConfig>;
    testConnection: (kind: 'llm' | 'embedding') => Promise<{ ok: boolean; message: string; provider?: string; model?: string }>;
    getPrompts: () => Promise<AiPromptConfig>;
    savePrompts: (input: AiPromptSaveInput) => Promise<AiPromptConfig>;
    listSkills: () => Promise<AiSkillConfig[]>;
    saveSkills: (input: AiSkillSaveInput[]) => Promise<AiSkillConfig[]>;
    listHttpTools: () => Promise<HttpToolConfig[]>;
    saveHttpTool: (input: HttpToolSaveInput) => Promise<HttpToolConfig>;
    deleteHttpTool: (toolId: string) => Promise<void>;
    completeSetting: (request: SettingCompletionRequest) => Promise<AiAgentResponse<SettingCompletionResult>>;
    foreshadowing: (projectId: string, text: string, requestId?: string) => Promise<AiAgentResponse<{ reminders: ValidationFinding[] }>>;
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
  desktop: {
    toggleFloating: () => Promise<{ visible: boolean; pinned: boolean }>;
    showFloating: () => Promise<{ visible: boolean; pinned: boolean }>;
    hideFloating: () => Promise<{ visible: boolean; pinned: boolean }>;
    setFloatingPinned: (pinned: boolean) => Promise<{ visible: boolean; pinned: boolean }>;
    setMainPinned: (pinned: boolean) => Promise<{ pinned: boolean }>;
  };
}
