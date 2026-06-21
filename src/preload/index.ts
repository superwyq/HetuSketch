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
  settingSets: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.settingSetsList),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.settingSetsGet, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingSetsCreate, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingSetsUpdate, input),
    delete: (id, strategy) => ipcRenderer.invoke(IPC_CHANNELS.settingSetsDelete, id, strategy)
  },
  books: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.booksList),
    get: (bookId) => ipcRenderer.invoke(IPC_CHANNELS.booksGet, bookId),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.booksCreate, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.booksUpdate, input),
    delete: (bookId) => ipcRenderer.invoke(IPC_CHANNELS.booksDelete, bookId),
    bindSettingSet: (bookId, settingSetId) => ipcRenderer.invoke(IPC_CHANNELS.booksBindSettingSet, bookId, settingSetId)
  },
  chapters: {
    listTree: (bookId) => ipcRenderer.invoke(IPC_CHANNELS.chaptersListTree, bookId),
    createVolume: (input) => ipcRenderer.invoke(IPC_CHANNELS.chaptersCreateVolume, input),
    updateVolume: (input) => ipcRenderer.invoke(IPC_CHANNELS.chaptersUpdateVolume, input),
    createChapter: (input) => ipcRenderer.invoke(IPC_CHANNELS.chaptersCreateChapter, input),
    updateChapter: (input) => ipcRenderer.invoke(IPC_CHANNELS.chaptersUpdateChapter, input),
    moveChapter: (input) => ipcRenderer.invoke(IPC_CHANNELS.chaptersMoveChapter, input),
    deleteChapter: (bookId, chapterId) => ipcRenderer.invoke(IPC_CHANNELS.chaptersDeleteChapter, bookId, chapterId)
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
    foreshadowing: (projectId, text, requestId) => ipcRenderer.invoke(IPC_CHANNELS.aiForeshadowing, projectId, text, requestId),
    listModels: (kind) => ipcRenderer.invoke(IPC_CHANNELS.aiModelsList, kind),
    streamValidation: (request, _basic, onChunk) => {
      const requestId = request.requestId ?? crypto.randomUUID();
      request.requestId = requestId;
      const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamValidation}:${suffix}:${requestId}`;
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          ipcRenderer.removeAllListeners(channel('chunk'));
          ipcRenderer.removeAllListeners(channel('end'));
          ipcRenderer.removeAllListeners(channel('error'));
        };
        ipcRenderer.on(channel('chunk'), (_e, chunk) => onChunk(chunk));
        ipcRenderer.on(channel('end'), () => {
          cleanup();
          resolve();
        });
        ipcRenderer.on(channel('error'), (_e, error: string) => {
          cleanup();
          reject(new Error(error));
        });
        ipcRenderer.send(IPC_CHANNELS.aiStreamValidation, request);
      });
    },
    streamRagAnswer: (request, onChunk) => {
      const requestId = request.requestId ?? crypto.randomUUID();
      request.requestId = requestId;
      const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamRagAnswer}:${suffix}:${requestId}`;
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          ipcRenderer.removeAllListeners(channel('chunk'));
          ipcRenderer.removeAllListeners(channel('end'));
          ipcRenderer.removeAllListeners(channel('error'));
        };
        ipcRenderer.on(channel('chunk'), (_e, chunk) => onChunk(chunk));
        ipcRenderer.on(channel('end'), () => {
          cleanup();
          resolve();
        });
        ipcRenderer.on(channel('error'), (_e, error: string) => {
          cleanup();
          reject(new Error(error));
        });
        ipcRenderer.send(IPC_CHANNELS.aiStreamRagAnswer, request);
      });
    },
    streamCompleteSetting: (request, onChunk) => {
      const requestId = request.requestId ?? crypto.randomUUID();
      request.requestId = requestId;
      const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamCompleteSetting}:${suffix}:${requestId}`;
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          ipcRenderer.removeAllListeners(channel('chunk'));
          ipcRenderer.removeAllListeners(channel('end'));
          ipcRenderer.removeAllListeners(channel('error'));
        };
        ipcRenderer.on(channel('chunk'), (_e, chunk) => onChunk(chunk));
        ipcRenderer.on(channel('end'), () => {
          cleanup();
          resolve();
        });
        ipcRenderer.on(channel('error'), (_e, error: string) => {
          cleanup();
          reject(new Error(error));
        });
        ipcRenderer.send(IPC_CHANNELS.aiStreamCompleteSetting, request);
      });
    },
    streamForeshadowing: (projectId, text, onChunk, requestId) => {
      const id = requestId ?? crypto.randomUUID();
      const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamForeshadowing}:${suffix}:${id}`;
      return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          ipcRenderer.removeAllListeners(channel('chunk'));
          ipcRenderer.removeAllListeners(channel('end'));
          ipcRenderer.removeAllListeners(channel('error'));
        };
        ipcRenderer.on(channel('chunk'), (_e, chunk) => onChunk(chunk));
        ipcRenderer.on(channel('end'), () => {
          cleanup();
          resolve();
        });
        ipcRenderer.on(channel('error'), (_e, error: string) => {
          cleanup();
          reject(new Error(error));
        });
        ipcRenderer.send(IPC_CHANNELS.aiStreamForeshadowing, projectId, text, id);
      });
    }
  },
  agent: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.agentList),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.agentGet, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.agentCreate, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.agentUpdate, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.agentDelete, id),
    reorder: (input) => ipcRenderer.invoke(IPC_CHANNELS.agentReorder, input)
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
  system: {
    fonts: () => ipcRenderer.invoke(IPC_CHANNELS.systemFonts)
  },
  desktop: {
    toggleFloating: () => ipcRenderer.invoke(IPC_CHANNELS.desktopFloatingToggle),
    showFloating: () => ipcRenderer.invoke(IPC_CHANNELS.desktopFloatingShow),
    hideFloating: () => ipcRenderer.invoke(IPC_CHANNELS.desktopFloatingHide),
    setFloatingPinned: (pinned: boolean) => ipcRenderer.invoke(IPC_CHANNELS.desktopFloatingPin, pinned),
    setMainPinned: (pinned: boolean) => ipcRenderer.invoke(IPC_CHANNELS.desktopMainPin, pinned),
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS.desktopWindowMinimize),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS.desktopWindowMaximize),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.desktopWindowClose),
    openWindow: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.desktopOpenWindow, path)
  }
};

contextBridge.exposeInMainWorld('hetuSketch', api);
