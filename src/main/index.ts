import { app, BrowserWindow, Tray, Menu, dialog, globalShortcut, ipcMain, nativeImage, shell } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../shared/ipc.js';
import type { EntryType, ProjectCreateInput, RagQueryRequest, SearchQuery, ValidationRequest } from '../shared/storageTypes.js';
import { StorageService } from './services/storageService.js';

const isDevelopment = !app.isPackaged;
const storageService = new StorageService();
let mainWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let floatingPinned = true;
let mainPinned = false;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: 'HetuSketch 河图速写',
    show: false,
    backgroundColor: '#f5efe3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  if (isDevelopment) {
    mainWindow.webContents.openDevTools({ mode: 'bottom' });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function ensureMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }

  return mainWindow!;
}

function createFloatingWindow(): void {
  floatingWindow = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 360,
    minHeight: 420,
    title: 'HetuSketch 速查',
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: true,
    backgroundColor: '#17140f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void floatingWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/quick-lookup`);
  } else {
    void floatingWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'quick-lookup' });
  }
}

function registerDesktopIntegrations(): void {
  const trayIcon = nativeImage.createEmpty();
  tray = new Tray(trayIcon);
  tray.setToolTip('HetuSketch 河图速写');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showMainWindow() },
    { label: '切换悬浮速查', accelerator: 'Ctrl+Shift+H', click: () => toggleFloatingWindow() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
  tray.on('click', () => showMainWindow());

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    toggleFloatingWindow();
  });
}

function showMainWindow(): void {
  const window = ensureMainWindow();
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

function floatingState(): { visible: boolean; pinned: boolean } {
  return { visible: Boolean(floatingWindow?.isVisible()), pinned: floatingPinned };
}

function showFloatingWindow(): { visible: boolean; pinned: boolean } {
  if (!floatingWindow || floatingWindow.isDestroyed()) {
    createFloatingWindow();
  }
  floatingWindow!.setAlwaysOnTop(floatingPinned, 'floating');
  floatingWindow!.show();
  floatingWindow!.focus();
  return floatingState();
}

function hideFloatingWindow(): { visible: boolean; pinned: boolean } {
  floatingWindow?.hide();
  return floatingState();
}

function toggleFloatingWindow(): { visible: boolean; pinned: boolean } {
  if (floatingWindow?.isVisible()) {
    return hideFloatingWindow();
  }
  return showFloatingWindow();
}

function setFloatingPinned(pinned: boolean): { visible: boolean; pinned: boolean } {
  floatingPinned = pinned;
  floatingWindow?.setAlwaysOnTop(pinned, 'floating');
  return floatingState();
}

function setMainPinned(pinned: boolean): { pinned: boolean } {
  mainPinned = pinned;
  mainWindow?.setAlwaysOnTop(pinned, 'normal');
  return { pinned: mainPinned };
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged
  }));

  ipcMain.handle(IPC_CHANNELS.ping, () => ({ ok: true, timestamp: Date.now() }));

  ipcMain.handle(IPC_CHANNELS.searchPreview, (_event, keyword: unknown) => {
    const safeKeyword = typeof keyword === 'string' ? keyword.trim().slice(0, 80) : '';
    return storageService.search({ keyword: safeKeyword, limit: 8 });
  });

  ipcMain.handle(IPC_CHANNELS.searchGlobal, (_event, query: unknown) => storageService.search(toSearchQuery(query)));
  ipcMain.handle(IPC_CHANNELS.recentList, (_event, projectId: unknown, limit: unknown) =>
    storageService.listRecentAccess(asOptionalString(projectId), asOptionalLimit(limit))
  );
  ipcMain.handle(IPC_CHANNELS.dashboardStats, (_event, projectId: unknown) => storageService.getDashboardStats(asOptionalString(projectId)));

  ipcMain.handle(IPC_CHANNELS.projectsList, () => storageService.listProjects());
  ipcMain.handle(IPC_CHANNELS.projectsGet, (_event, projectId: unknown) => storageService.getProject(asRequiredString(projectId, 'projectId')));

  ipcMain.handle(IPC_CHANNELS.projectsCreate, async (_event, input: unknown) => {
    if (!isProjectCreateInput(input)) {
      throw new Error('Invalid project create payload');
    }

    return storageService.createProject(input);
  });

  ipcMain.handle(IPC_CHANNELS.projectsUpdate, async (_event, input: unknown) => storageService.updateProject(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.projectsDelete, async (_event, projectId: unknown) => storageService.deleteProject(asRequiredString(projectId, 'projectId')));
  ipcMain.handle(IPC_CHANNELS.projectsExport, async (_event, projectId: unknown) => {
    const safeProjectId = asRequiredString(projectId, 'projectId');
    const project = storageService.getProject(safeProjectId);
    const target = await dialog.showSaveDialog(ensureMainWindow(), {
      title: '导出作品',
      defaultPath: `${project.id}.zip`,
      filters: [{ name: 'HetuSketch Project Zip', extensions: ['zip'] }]
    });
    if (target.canceled || !target.filePath) return undefined;
    const destinationPath = await storageService.exportProject(safeProjectId, target.filePath);
    return { projectId: safeProjectId, destinationPath };
  });
  ipcMain.handle(IPC_CHANNELS.projectsImportFolder, async () => {
    const target = await dialog.showOpenDialog(ensureMainWindow(), { title: '导入作品目录', properties: ['openDirectory'] });
    if (target.canceled || !target.filePaths[0]) return undefined;
    return storageService.importFromFolder(target.filePaths[0]);
  });
  ipcMain.handle(IPC_CHANNELS.projectsImportZip, async () => {
    const target = await dialog.showOpenDialog(ensureMainWindow(), { title: '导入作品 Zip', properties: ['openFile'], filters: [{ name: 'HetuSketch Project Zip', extensions: ['zip'] }] });
    if (target.canceled || !target.filePaths[0]) return undefined;
    return storageService.importFromZip(target.filePaths[0]);
  });

  ipcMain.handle(IPC_CHANNELS.entriesList, (_event, query: unknown) => storageService.listEntries(asObject(query)));
  ipcMain.handle(IPC_CHANNELS.entriesGet, (_event, projectId: unknown, type: unknown, entryId: unknown) =>
    storageService.readEntry(asRequiredString(projectId, 'projectId'), asEntryType(type), asRequiredString(entryId, 'entryId'))
  );
  ipcMain.handle(IPC_CHANNELS.entriesCreate, async (_event, input: unknown) => storageService.createEntry(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.entriesUpdate, async (_event, input: unknown) => storageService.updateEntry(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.entriesDelete, async (_event, projectId: unknown, type: unknown, entryId: unknown) =>
    storageService.deleteEntry(asRequiredString(projectId, 'projectId'), asEntryType(type), asRequiredString(entryId, 'entryId'))
  );

  ipcMain.handle(IPC_CHANNELS.validationBasic, async (_event, request: unknown) => storageService.validateContent(asValidationRequest(request)));
  ipcMain.handle(IPC_CHANNELS.validationEnhanced, async (_event, request: unknown) => storageService.validateContentEnhanced(asValidationRequest(request)));

  ipcMain.handle(IPC_CHANNELS.aiConfigGet, () => storageService.getAiConfig());
  ipcMain.handle(IPC_CHANNELS.aiConfigSave, (_event, input: unknown) => storageService.saveAiConfig(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.aiConnectionTest, (_event, kind: unknown) => storageService.testAiConnection(asAiConnectionKind(kind)));
  ipcMain.handle(IPC_CHANNELS.aiPromptsGet, () => storageService.getAiPrompts());
  ipcMain.handle(IPC_CHANNELS.aiPromptsSave, (_event, input: unknown) => storageService.saveAiPrompts(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.aiSkillsList, () => storageService.listAiSkills());
  ipcMain.handle(IPC_CHANNELS.aiSkillsSave, (_event, input: unknown) => storageService.saveAiSkills(asArray(input)));
  ipcMain.handle(IPC_CHANNELS.aiHttpToolsList, () => storageService.listHttpTools());
  ipcMain.handle(IPC_CHANNELS.aiHttpToolsSave, (_event, input: unknown) => storageService.saveHttpTool(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.aiHttpToolsDelete, (_event, toolId: unknown) => storageService.deleteHttpTool(asRequiredString(toolId, 'toolId')));
  ipcMain.handle(IPC_CHANNELS.ragBuild, (_event, projectId: unknown) => storageService.buildVectorIndex(asRequiredString(projectId, 'projectId')));
  ipcMain.handle(IPC_CHANNELS.ragState, (_event, projectId: unknown) => storageService.getVectorIndexState(asRequiredString(projectId, 'projectId')));
  ipcMain.handle(IPC_CHANNELS.ragQuery, (_event, request: unknown) => storageService.ragQuery(asRagQueryRequest(request)));
  ipcMain.handle(IPC_CHANNELS.ragAnswer, (_event, request: unknown) => storageService.ragAnswer(asRagQueryRequest(request)));
  ipcMain.handle(IPC_CHANNELS.aiSettingComplete, (_event, request: unknown) => storageService.completeSetting(asObject(request)));
  ipcMain.handle(IPC_CHANNELS.aiForeshadowing, (_event, projectId: unknown, text: unknown, requestId: unknown) =>
    storageService.foreshadowingReminder(asRequiredString(projectId, 'projectId'), typeof text === 'string' ? text.slice(0, 50_000) : '', asOptionalString(requestId))
  );

  ipcMain.handle(IPC_CHANNELS.indexRebuild, async (_event, projectId: unknown) =>
    storageService.rebuildIndex(typeof projectId === 'string' ? projectId : undefined)
  );

  ipcMain.handle(IPC_CHANNELS.desktopFloatingToggle, () => toggleFloatingWindow());
  ipcMain.handle(IPC_CHANNELS.desktopFloatingShow, () => showFloatingWindow());
  ipcMain.handle(IPC_CHANNELS.desktopFloatingHide, () => hideFloatingWindow());
  ipcMain.handle(IPC_CHANNELS.desktopFloatingPin, (_event, pinned: unknown) => setFloatingPinned(Boolean(pinned)));
  ipcMain.handle(IPC_CHANNELS.desktopMainPin, (_event, pinned: unknown) => setMainPinned(Boolean(pinned)));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  registerDesktopIntegrations();
  void storageService.initialize({ watch: true });
  createMainWindow();
  createFloatingWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  void storageService.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function isProjectCreateInput(input: unknown): input is ProjectCreateInput {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const candidate = input as { name?: unknown; type?: unknown };
  return typeof candidate.name === 'string' && (candidate.type === 'original' || candidate.type === 'fanfiction');
}

function asObject<T extends object>(input: unknown): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid payload');
  }

  return input as T;
}

function asArray<T>(input: unknown): T[] {
  if (!Array.isArray(input)) {
    throw new Error('Invalid array payload');
  }

  return input as T[];
}

function asRequiredString(input: unknown, name: string): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error(`Invalid ${name}`);
  }

  return input.trim().slice(0, 128);
}

function asOptionalString(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim().slice(0, 128) : undefined;
}

function asOptionalLimit(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isFinite(input) ? Math.min(Math.max(Math.trunc(input), 1), 50) : undefined;
}

function asEntryType(input: unknown): EntryType {
  if (input === 'character' || input === 'world' || input === 'plot') {
    return input;
  }

  throw new Error('Invalid entry type');
}

function toSearchQuery(input: unknown): SearchQuery {
  const query = asObject<SearchQuery>(input);
  return {
    projectId: asOptionalString(query.projectId),
    keyword: typeof query.keyword === 'string' ? query.keyword.trim().slice(0, 120) : '',
    limit: asOptionalLimit(query.limit)
  };
}

function asRagQueryRequest(input: unknown): RagQueryRequest {
  const request = asObject<RagQueryRequest>(input);
  if (typeof request.projectId !== 'string' || typeof request.query !== 'string') {
    throw new Error('Invalid RAG request');
  }

  return {
    ...request,
    projectId: request.projectId.trim().slice(0, 128),
    query: request.query.trim().slice(0, 10_000),
    topK: asOptionalLimit(request.topK),
    maxContextChars: typeof request.maxContextChars === 'number' ? Math.min(Math.max(Math.trunc(request.maxContextChars), 500), 20_000) : undefined,
    retrievalMode: request.retrievalMode === 'fts' || request.retrievalMode === 'vector' || request.retrievalMode === 'hybrid' ? request.retrievalMode : 'hybrid'
  };
}

function asAiConnectionKind(input: unknown): 'llm' | 'embedding' {
  if (input === 'llm' || input === 'embedding') {
    return input;
  }
  throw new Error('Invalid AI connection kind');
}

function asValidationRequest(input: unknown): ValidationRequest {
  const request = asObject<ValidationRequest>(input);
  if (typeof request.projectId !== 'string' || typeof request.text !== 'string') {
    throw new Error('Invalid validation request');
  }

  return {
    ...request,
    projectId: request.projectId.trim().slice(0, 128),
    text: request.text.slice(0, 50_000),
    characterIds: normalizeIdList(request.characterIds),
    worldEntryIds: normalizeIdList(request.worldEntryIds),
    includePlotReminders: request.includePlotReminders !== false
  };
}

function normalizeIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 128)).filter(Boolean);
}
