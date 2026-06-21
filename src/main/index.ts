import { app, BrowserWindow, Tray, Menu, dialog, globalShortcut, ipcMain, nativeImage, shell } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../shared/ipc.js';
import type { AiValidationRequest, EntryType, ProjectCreateInput, RagQueryRequest, SearchQuery, SettingCompletionRequest, ValidationRequest } from '../shared/storageTypes.js';
import { StorageService } from './services/storageService.js';
import { getSystemFonts } from './services/fontService.js';

const isDevelopment = !app.isPackaged;
let storageService: StorageService;
let mainWindow: BrowserWindow | null = null;
let floatingWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let floatingPinned = true;
let mainPinned = false;

// ===== 启动性能计时（性能监控机制）=====
// 记录关键阶段时间戳，启动完成后输出时间线，便于定位回归
const perfMarks: Array<{ name: string; time: number }> = [{ name: 'process.start', time: Date.now() }];
function mark(name: string): void {
  perfMarks.push({ name, time: Date.now() });
}
function logPerf(): void {
  const origin = perfMarks[0].time;
  const lines = perfMarks.map((entry, index) => {
    const delta = index > 0 ? entry.time - perfMarks[index - 1].time : 0;
    return `  +${String(entry.time - origin).padStart(6)}ms  ${entry.name} (Δ${delta}ms)`;
  });
  const total = perfMarks[perfMarks.length - 1].time - origin;
  console.log(`[HetuSketch:perf] startup timeline (total ${total}ms)\n${lines.join('\n')}`);
}

function createMainWindow(): void {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: 'HetuSketch 河图速写',
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#1f1a14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mark('mainWindow.ready-to-show');
    mainWindow?.show();
    mark('mainWindow.shown');
    // storage 初始化推迟到主窗口就绪后，避免全量文件扫描与窗口加载争抢 I/O
    void storageService.initialize({ watch: true }).then(() => {
      mark('storage.initialized');
      logPerf();
    });
  });

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

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

function openAppWindow(path: string): void {
  const target = path.startsWith('/') ? path : `/${path}`;
  const newWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: 'HetuSketch 河图速写',
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#1f1a14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  newWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  newWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  newWindow.once('ready-to-show', () => {
    newWindow.show();
  });

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void newWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}${target}`);
  } else {
    void newWindow.loadFile(join(__dirname, '../renderer/index.html'));
    newWindow.webContents.on('did-finish-load', () => {
      newWindow.webContents.executeJavaScript(`
        window.history.pushState({}, '', ${JSON.stringify(target)});
        window.dispatchEvent(new PopStateEvent('popstate'));
      `).catch(() => {});
    });
  }
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

  ipcMain.handle(IPC_CHANNELS.settingSetsList, () => storageService.listSettingSets());
  ipcMain.handle(IPC_CHANNELS.settingSetsGet, (_event, id: unknown) => storageService.getSettingSet(asRequiredString(id, 'settingSetId')));
  ipcMain.handle(IPC_CHANNELS.settingSetsCreate, (_event, input: unknown) => storageService.createSettingSet(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.settingSetsUpdate, (_event, input: unknown) => storageService.updateSettingSet(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.settingSetsDelete, (_event, id: unknown, strategy: unknown) =>
    storageService.deleteSettingSet(asRequiredString(id, 'settingSetId'), strategy === 'detach_books' ? 'detach_books' : 'block')
  );

  ipcMain.handle(IPC_CHANNELS.booksList, () => storageService.listBooks());
  ipcMain.handle(IPC_CHANNELS.booksGet, (_event, bookId: unknown) => storageService.getBook(asRequiredString(bookId, 'bookId')));
  ipcMain.handle(IPC_CHANNELS.booksCreate, (_event, input: unknown) => storageService.createBook(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.booksUpdate, (_event, input: unknown) => storageService.updateBook(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.booksDelete, (_event, bookId: unknown) => storageService.deleteBook(asRequiredString(bookId, 'bookId')));
  ipcMain.handle(IPC_CHANNELS.booksBindSettingSet, (_event, bookId: unknown, settingSetId: unknown) =>
    storageService.bindBookSettingSet(asRequiredString(bookId, 'bookId'), asOptionalString(settingSetId))
  );

  ipcMain.handle(IPC_CHANNELS.chaptersListTree, (_event, bookId: unknown) => storageService.listBookTree(asRequiredString(bookId, 'bookId')));
  ipcMain.handle(IPC_CHANNELS.chaptersCreateVolume, (_event, input: unknown) => storageService.createVolume(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersUpdateVolume, (_event, input: unknown) => storageService.updateVolume(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersCreateChapter, (_event, input: unknown) => storageService.createChapter(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersUpdateChapter, (_event, input: unknown) => storageService.updateChapter(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersMoveChapter, (_event, input: unknown) => storageService.moveChapter(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersDeleteChapter, (_event, bookId: unknown, chapterId: unknown) =>
    storageService.deleteChapter(asRequiredString(bookId, 'bookId'), asRequiredString(chapterId, 'chapterId'))
  );

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
  ipcMain.handle(IPC_CHANNELS.agentList, () => storageService.listAgents());
  ipcMain.handle(IPC_CHANNELS.agentGet, (_event, id: unknown) => storageService.getAgent(asRequiredString(id, 'agentId')));
  ipcMain.handle(IPC_CHANNELS.agentCreate, (_event, input: unknown) => storageService.createAgent(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.agentUpdate, (_event, input: unknown) => storageService.updateAgent(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.agentDelete, (_event, id: unknown) => storageService.deleteAgent(asRequiredString(id, 'agentId')));
  ipcMain.handle(IPC_CHANNELS.agentReorder, (_event, input: unknown) => storageService.reorderAgents(asArray(input)));
  ipcMain.handle(IPC_CHANNELS.ragBuild, (_event, projectId: unknown) => storageService.buildVectorIndex(asRequiredString(projectId, 'projectId')));
  ipcMain.handle(IPC_CHANNELS.ragState, (_event, projectId: unknown) => storageService.getVectorIndexState(asRequiredString(projectId, 'projectId')));
  ipcMain.handle(IPC_CHANNELS.ragQuery, (_event, request: unknown) => storageService.ragQuery(asRagQueryRequest(request)));
  ipcMain.handle(IPC_CHANNELS.ragAnswer, (_event, request: unknown) => storageService.ragAnswer(asRagQueryRequest(request)));
  ipcMain.handle(IPC_CHANNELS.aiSettingComplete, (_event, request: unknown) => storageService.completeSetting(asObject(request)));
  ipcMain.handle(IPC_CHANNELS.aiForeshadowing, (_event, projectId: unknown, text: unknown, requestId: unknown) =>
    storageService.foreshadowingReminder(asRequiredString(projectId, 'projectId'), typeof text === 'string' ? text.slice(0, 50_000) : '', asOptionalString(requestId))
  );

  // AI 模型列表拉取
  ipcMain.handle(IPC_CHANNELS.aiModelsList, (_event, kind: unknown) =>
    storageService.listAiModels(kind === 'embedding' ? 'embedding' : 'llm')
  );

  // AI 流式校验
  ipcMain.on(IPC_CHANNELS.aiStreamValidation, async (event, request: unknown) => {
    const req = request as Record<string, unknown>;
    const requestId = typeof req.requestId === 'string' ? req.requestId : '';
    const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamValidation}:${suffix}:${requestId}`;
    try {
      const validationRequest = asValidationRequest(request) as AiValidationRequest;
      validationRequest.requestId = requestId;
      const basic = await storageService.validateContent(validationRequest);
      for await (const chunk of storageService.streamValidation(validationRequest, basic)) {
        event.sender.send(channel('chunk'), chunk);
      }
      event.sender.send(channel('end'));
    } catch (error) {
      event.sender.send(channel('error'), error instanceof Error ? error.message : '流式校验失败');
    }
  });

  // AI 流式 RAG 回答
  ipcMain.on(IPC_CHANNELS.aiStreamRagAnswer, async (event, request: unknown) => {
    const req = request as Record<string, unknown>;
    const requestId = typeof req.requestId === 'string' ? req.requestId : '';
    const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamRagAnswer}:${suffix}:${requestId}`;
    try {
      const ragRequest = asRagQueryRequest(request);
      ragRequest.requestId = requestId;
      for await (const chunk of storageService.streamRagAnswer(ragRequest)) {
        event.sender.send(channel('chunk'), chunk);
      }
      event.sender.send(channel('end'));
    } catch (error) {
      event.sender.send(channel('error'), error instanceof Error ? error.message : '流式回答失败');
    }
  });

  // AI 流式设定补全
  ipcMain.on(IPC_CHANNELS.aiStreamCompleteSetting, async (event, request: unknown) => {
    const req = request as Record<string, unknown>;
    const requestId = typeof req.requestId === 'string' ? req.requestId : '';
    const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamCompleteSetting}:${suffix}:${requestId}`;
    try {
      const completionRequest = request as SettingCompletionRequest;
      for await (const chunk of storageService.streamCompleteSetting(completionRequest)) {
        event.sender.send(channel('chunk'), chunk);
      }
      event.sender.send(channel('end'));
    } catch (error) {
      event.sender.send(channel('error'), error instanceof Error ? error.message : '流式补全失败');
    }
  });

  // AI 流式伏笔提醒
  ipcMain.on(IPC_CHANNELS.aiStreamForeshadowing, async (event, projectId: unknown, text: unknown, requestId: unknown) => {
    const id = typeof requestId === 'string' ? requestId : '';
    const channel = (suffix: string) => `${IPC_CHANNELS.aiStreamForeshadowing}:${suffix}:${id}`;
    try {
      for await (const chunk of storageService.streamForeshadowingReminder(asRequiredString(projectId, 'projectId'), typeof text === 'string' ? text.slice(0, 50_000) : '', id)) {
        event.sender.send(channel('chunk'), chunk);
      }
      event.sender.send(channel('end'));
    } catch (error) {
      event.sender.send(channel('error'), error instanceof Error ? error.message : '流式伏笔提醒失败');
    }
  });

  ipcMain.handle(IPC_CHANNELS.indexRebuild, async (_event, projectId: unknown) =>
    storageService.rebuildIndex(typeof projectId === 'string' ? projectId : undefined)
  );

  ipcMain.handle(IPC_CHANNELS.systemFonts, () => getSystemFonts());

  ipcMain.handle(IPC_CHANNELS.desktopFloatingToggle, () => toggleFloatingWindow());
  ipcMain.handle(IPC_CHANNELS.desktopFloatingShow, () => showFloatingWindow());
  ipcMain.handle(IPC_CHANNELS.desktopFloatingHide, () => hideFloatingWindow());
  ipcMain.handle(IPC_CHANNELS.desktopFloatingPin, (_event, pinned: unknown) => setFloatingPinned(Boolean(pinned)));
  ipcMain.handle(IPC_CHANNELS.desktopMainPin, (_event, pinned: unknown) => setMainPinned(Boolean(pinned)));
  ipcMain.handle(IPC_CHANNELS.desktopWindowMinimize, () => mainWindow?.minimize());
  ipcMain.handle(IPC_CHANNELS.desktopWindowMaximize, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
    return { maximized: Boolean(mainWindow?.isMaximized()) };
  });
  ipcMain.handle(IPC_CHANNELS.desktopWindowClose, () => mainWindow?.close());
  ipcMain.handle(IPC_CHANNELS.desktopOpenWindow, (_event, path: unknown) => {
    const safePath = typeof path === 'string' && path.trim() ? path.trim() : '/';
    openAppWindow(safePath);
  });
}

app.whenReady().then(() => {
  mark('app.ready');
  // StorageService 构造会打开 SQLite 并执行迁移，放在 app.ready 之后避免阻塞早期启动
  storageService = new StorageService();
  mark('storageService.ctor');
  registerIpcHandlers();
  mark('ipc.registered');
  registerDesktopIntegrations();
  mark('desktop.integrated');
  createMainWindow();
  mark('mainWindow.created');
  // 悬浮窗延迟创建：首次唤起时再加载渲染进程，避免启动时双倍渲染开销

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (storageService) {
    void storageService.close();
  }
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
