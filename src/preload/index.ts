import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type HetuSketchApi } from '../shared/ipc.js';

const api: HetuSketchApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appInfo),
    ping: () => ipcRenderer.invoke(IPC_CHANNELS.ping)
  },
  search: {
    preview: (keyword: string) => ipcRenderer.invoke(IPC_CHANNELS.searchPreview, keyword),
    global: (query) => ipcRenderer.invoke(IPC_CHANNELS.searchGlobal, query),
    recent: (projectId?: string, limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.recentList, projectId, limit)
  },
  dashboard: {
    stats: (projectId?: string) => ipcRenderer.invoke(IPC_CHANNELS.dashboardStats, projectId)
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.projectsList),
    get: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.projectsGet, projectId),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreate, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsUpdate, input),
    delete: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.projectsDelete, projectId),
    export: (projectId: string) => ipcRenderer.invoke(IPC_CHANNELS.projectsExport, projectId),
    importFolder: () => ipcRenderer.invoke(IPC_CHANNELS.projectsImportFolder),
    importZip: () => ipcRenderer.invoke(IPC_CHANNELS.projectsImportZip)
  },
  entries: {
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.entriesList, query),
    get: (projectId, type, entryId) => ipcRenderer.invoke(IPC_CHANNELS.entriesGet, projectId, type, entryId),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.entriesCreate, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.entriesUpdate, input),
    delete: (projectId, type, entryId) => ipcRenderer.invoke(IPC_CHANNELS.entriesDelete, projectId, type, entryId)
  },
  validation: {
    basic: (request) => ipcRenderer.invoke(IPC_CHANNELS.validationBasic, request),
    enhanced: (request) => ipcRenderer.invoke(IPC_CHANNELS.validationEnhanced, request)
  },
  ai: {
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.aiConfigGet),
    saveConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiConfigSave, input),
    testConnection: (kind) => ipcRenderer.invoke(IPC_CHANNELS.aiConnectionTest, kind),
    getPrompts: () => ipcRenderer.invoke(IPC_CHANNELS.aiPromptsGet),
    savePrompts: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiPromptsSave, input),
    listSkills: () => ipcRenderer.invoke(IPC_CHANNELS.aiSkillsList),
    saveSkills: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiSkillsSave, input),
    listHttpTools: () => ipcRenderer.invoke(IPC_CHANNELS.aiHttpToolsList),
    saveHttpTool: (input) => ipcRenderer.invoke(IPC_CHANNELS.aiHttpToolsSave, input),
    deleteHttpTool: (toolId) => ipcRenderer.invoke(IPC_CHANNELS.aiHttpToolsDelete, toolId),
    completeSetting: (request) => ipcRenderer.invoke(IPC_CHANNELS.aiSettingComplete, request),
    foreshadowing: (projectId, text, requestId) => ipcRenderer.invoke(IPC_CHANNELS.aiForeshadowing, projectId, text, requestId)
  },
  rag: {
    build: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.ragBuild, projectId),
    state: (projectId) => ipcRenderer.invoke(IPC_CHANNELS.ragState, projectId),
    query: (request) => ipcRenderer.invoke(IPC_CHANNELS.ragQuery, request),
    answer: (request) => ipcRenderer.invoke(IPC_CHANNELS.ragAnswer, request)
  },
  index: {
    rebuild: (projectId?: string) => ipcRenderer.invoke(IPC_CHANNELS.indexRebuild, projectId)
  },
  desktop: {
    toggleFloating: () => ipcRenderer.invoke(IPC_CHANNELS.desktopFloatingToggle),
    showFloating: () => ipcRenderer.invoke(IPC_CHANNELS.desktopFloatingShow),
    hideFloating: () => ipcRenderer.invoke(IPC_CHANNELS.desktopFloatingHide),
    setFloatingPinned: (pinned: boolean) => ipcRenderer.invoke(IPC_CHANNELS.desktopFloatingPin, pinned),
    setMainPinned: (pinned: boolean) => ipcRenderer.invoke(IPC_CHANNELS.desktopMainPin, pinned)
  }
};

contextBridge.exposeInMainWorld('hetuSketch', api);
