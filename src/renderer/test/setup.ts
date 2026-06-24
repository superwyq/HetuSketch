import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'matchMedia', {
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  }),
  writable: true
});

const emptyStats = {
  projectCount: 0,
  entryCount: 0,
  byType: { character: 0, world: 0, plot: 0 },
  plotStatus: { open: 0, resolved: 0, abandoned: 0 },
  openPlotCount: 0,
  updatedTodayCount: 0
};

Object.defineProperty(window, 'hetuSketch', {
  value: {
    app: {
      getInfo: async () => ({ name: 'HetuSketch', version: '0.1.0', platform: 'win32', isPackaged: false }),
      ping: async () => ({ ok: true, timestamp: Date.now() })
    },
    search: {
      preview: async () => [],
      global: async () => [],
      recent: async () => []
    },
    dashboard: {
      stats: async () => emptyStats
    },
    books: {
      list: async () => [],
      get: async (bookId: string) => ({ id: bookId, title: '测试书目', type: 'original', summary: '', status: 'drafting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: 2 as const }),
      create: async (input: { id?: string; title: string; type?: 'original' | 'fanfiction'; summary?: string; status?: 'planning' | 'drafting' | 'revision' | 'completed' | 'archived' }) => ({ id: input.id ?? 'book-1', title: input.title, type: input.type ?? 'original', summary: input.summary ?? '', status: input.status ?? 'drafting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: 2 as const }),
      update: async (input: { id: string; title?: string; type?: 'original' | 'fanfiction'; summary?: string; status?: 'planning' | 'drafting' | 'revision' | 'completed' | 'archived' }) => ({ id: input.id, title: input.title ?? '测试书目', type: input.type ?? 'original', summary: input.summary ?? '', status: input.status ?? 'drafting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: 2 as const }),
      delete: async () => undefined,
      bindSettingSet: async (bookId: string, settingSetId?: string) => ({ book: { id: bookId, title: '测试书目', settingSetId, type: 'original', summary: '', status: 'drafting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: 2 as const }, conflictCount: 0, warnings: [] })
    },
    plotboards: {
      create: async (input: { bookId: string; chapterId: string; projectId?: string; settingSetId?: string }) => ({ schemaVersion: 1 as const, plotboardId: 'plotboard-1', bookId: input.bookId, chapterId: input.chapterId, projectId: input.projectId, settingSetId: input.settingSetId, cards: [], links: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      open: async (bookId: string, chapterId: string) => ({ schemaVersion: 1 as const, plotboardId: 'plotboard-1', bookId, chapterId, cards: [], links: [], viewport: { x: 0, y: 0, zoom: 1 }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      save: async (plotboard: unknown) => plotboard,
      saveSnapshot: async (_bookId: string, snapshot: unknown) => snapshot,
      loadSnapshot: async (_bookId: string, chapterId: string) => ({ schemaVersion: 1 as const, chapterId, states: [], sourceDiffIds: [] }),
      syncIndex: async () => ({ scannedFiles: 0, indexedEntries: 0, indexedProjects: 0, removedFiles: 0, errors: [] }),
      exportOutline: async () => '# 剧情画布大纲\n',
      saveChapterSnapshot: async () => ({ snapshotId: 'snapshot-1', filePath: 'snapshot.md', createdAt: new Date().toISOString() }),
      writeGeneratedMarkdown: async (input: { bookId: string; chapterId: string; markdown: string }) => ({ chapter: { id: input.chapterId, bookId: input.bookId, volumeId: 'vol-1', title: '章节', content: input.markdown, format: 'markdown' as const, order: 1, actualWords: 0, status: 'drafting' as const, relatedCharacterIds: [], relatedWorldEntryIds: [], relatedPlotIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }),
      buildAiContext: async () => ({ plotboard: { plotboardId: 'plotboard-1', bookId: 'book-1', chapterId: 'ch-1' }, mode: 'full_chapter' as const, cards: [], links: [], characters: [], worldRules: [], plotClues: [], stateTemplates: [], chapterSnapshot: { schemaVersion: 1 as const, chapterId: 'ch-1', states: [], sourceDiffIds: [] }, sceneDeltas: [], neighborSummaries: [], generationSettings: { mode: 'full_chapter' as const } }),
      generate: async () => ({ requestId: 'request-1', status: 'degraded' as const, markdown: '## 章节正文\n', stateDiffs: [], context: { plotboard: { plotboardId: 'plotboard-1', bookId: 'book-1', chapterId: 'ch-1' }, mode: 'full_chapter' as const, cards: [], links: [], characters: [], worldRules: [], plotClues: [], stateTemplates: [], chapterSnapshot: { schemaVersion: 1 as const, chapterId: 'ch-1', states: [], sourceDiffIds: [] }, sceneDeltas: [], neighborSummaries: [], generationSettings: { mode: 'full_chapter' as const } }, warnings: ['LLM 未配置'] }),
      streamGenerate: async (_request: unknown, onChunk?: (chunk: unknown) => void) => { onChunk?.({ type: 'delta', content: '## 章节正文\n' }); return { requestId: 'request-1', status: 'degraded' as const, markdown: '## 章节正文\n', stateDiffs: [], context: { plotboard: { plotboardId: 'plotboard-1', bookId: 'book-1', chapterId: 'ch-1' }, mode: 'full_chapter' as const, cards: [], links: [], characters: [], worldRules: [], plotClues: [], stateTemplates: [], chapterSnapshot: { schemaVersion: 1 as const, chapterId: 'ch-1', states: [], sourceDiffIds: [] }, sceneDeltas: [], neighborSummaries: [], generationSettings: { mode: 'full_chapter' as const } }, warnings: [] }; },
      settleDiffs: async (_input: unknown) => ({ snapshot: { schemaVersion: 1 as const, chapterId: 'ch-1', states: [], sourceDiffIds: [] }, appliedDiffIds: [], rejectedDiffIds: [] })
    },
    chapters: {
      listTree: async (bookId: string) => ({
        book: { id: bookId, title: '测试书目', type: 'original', summary: '', status: 'drafting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: 2 as const },
        volumes: [],
        chapters: []
      }),
      createVolume: async (input: { bookId: string; id?: string; title: string; order?: number; status?: 'planning' | 'drafting' | 'revision' | 'completed' | 'locked' }) => ({ id: input.id ?? 'vol-1', bookId: input.bookId, title: input.title, order: input.order ?? 1, actualWords: 0, status: input.status ?? 'drafting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      updateVolume: async (input: { bookId: string; id: string; title?: string; order?: number; status?: 'planning' | 'drafting' | 'revision' | 'completed' | 'locked' }) => ({ id: input.id, bookId: input.bookId, title: input.title ?? '第一卷', order: input.order ?? 1, actualWords: 0, status: input.status ?? 'drafting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      createChapter: async (input: { bookId: string; id?: string; volumeId: string; title: string; content?: string; order?: number; status?: 'not_started' | 'drafting' | 'revision' | 'done' | 'locked'; relatedPlotIds?: string[] }) => ({ id: input.id ?? 'ch-1', bookId: input.bookId, volumeId: input.volumeId, title: input.title, content: input.content ?? '', format: 'markdown' as const, order: input.order ?? 1, actualWords: 0, status: input.status ?? 'drafting', relatedCharacterIds: [], relatedWorldEntryIds: [], relatedPlotIds: input.relatedPlotIds ?? [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      updateChapter: async (input: { bookId: string; id: string; volumeId?: string; title?: string; content?: string; order?: number; status?: 'not_started' | 'drafting' | 'revision' | 'done' | 'locked'; relatedPlotIds?: string[] }) => ({ id: input.id, bookId: input.bookId, volumeId: input.volumeId ?? 'vol-1', title: input.title ?? '章节', content: input.content ?? '', format: 'markdown' as const, order: input.order ?? 1, actualWords: 0, status: input.status ?? 'drafting', relatedCharacterIds: [], relatedWorldEntryIds: [], relatedPlotIds: input.relatedPlotIds ?? [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      moveChapter: async (input: { bookId: string }) => ({ book: { id: input.bookId, title: '测试书目', type: 'original', summary: '', status: 'drafting', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: 2 as const }, volumes: [], chapters: [] }),
      deleteChapter: async () => undefined,
      deleteVolume: async () => undefined
    },
    projects: {
      list: async () => [],
      get: async () => { throw new Error('not found'); },
      create: async (input: { name: string; type: 'original' | 'fanfiction'; summary?: string }) => ({ id: 'project-1', name: input.name, type: input.type, summary: input.summary ?? '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), schemaVersion: 1 as const }),
      update: async () => { throw new Error('not implemented'); },
      delete: async () => undefined,
      export: async (projectId: string) => ({ projectId, destinationPath: 'mock.zip' }),
      importFolder: async () => undefined,
      importZip: async () => undefined
    },
    entries: {
      list: async () => [],
      get: async () => { throw new Error('not found'); },
      create: async () => { throw new Error('not implemented'); },
      update: async () => { throw new Error('not implemented'); },
      delete: async () => undefined
    },
    inspirationTypes: {
      list: async () => [
        { id: 'uncategorized', name: '待分类', builtIn: true },
        { id: 'character_setting', name: '人物设定', builtIn: true },
        { id: 'plot_setting', name: '剧情设定', builtIn: true },
        { id: 'world_setting', name: '世界观设定', builtIn: true }
      ],
      create: async (_projectId: string, name: string) => ({ id: 'custom-test', name, builtIn: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      update: async (_projectId: string, id: string, name: string) => ({ id, name, builtIn: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      delete: async () => undefined
    },
    validation: {
      basic: async () => ({ ok: true, checkedAt: new Date().toISOString(), summary: { checkedCharacters: 0, checkedWorldRules: 0, checkedOpenPlots: 0, warningCount: 0, reminderCount: 0 }, findings: [] }),
      enhanced: async () => ({ requestId: 'test', status: 'degraded', warnings: [], evidence: [], data: undefined })
    },
    ai: {
      getConfig: async () => ({
        llm: { enabled: false, provider: 'openai-compatible', baseUrl: '', model: '', timeoutMs: 30000, apiKeySet: false },
        embedding: { enabled: false, provider: 'openai-compatible', baseUrl: '', model: '', timeoutMs: 30000, apiKeySet: false }
      }),
      saveConfig: async () => ({
        llm: { enabled: false, provider: 'openai-compatible', baseUrl: '', model: '', timeoutMs: 30000, apiKeySet: false },
        embedding: { enabled: false, provider: 'openai-compatible', baseUrl: '', model: '', timeoutMs: 30000, apiKeySet: false }
      }),
      testConnection: async () => ({ ok: false, message: '未配置' }),
      getPrompts: async () => ({ globalSystemPrompt: '', scenarios: { logic_check: '', setting_completion: '', foreshadowing: '', rag_qa: '' }, updatedAt: new Date().toISOString() }),
      savePrompts: async () => ({ globalSystemPrompt: '', scenarios: { logic_check: '', setting_completion: '', foreshadowing: '', rag_qa: '' }, updatedAt: new Date().toISOString() }),
      listSkills: async () => [],
      saveSkills: async () => [],
      listHttpTools: async () => [],
      saveHttpTool: async (input: { name: string; url: string; method?: 'GET' | 'POST'; description?: string }) => ({ id: 'tool-1', name: input.name, description: input.description ?? '', url: input.url, method: input.method ?? 'POST', headers: {}, enabled: true, timeoutMs: 30000, updatedAt: new Date().toISOString() }),
      deleteHttpTool: async () => undefined,
      completeSetting: async () => ({ requestId: 'test', status: 'degraded', warnings: [], evidence: [], data: undefined }),
      foreshadowing: async () => ({ requestId: 'test', status: 'degraded', warnings: [], evidence: [], data: { reminders: [] } }),
      listModels: async () => [],
      streamValidation: async (_request: unknown, _basic: unknown, onChunk?: (chunk: unknown) => void) => {
        if (onChunk) {
          onChunk({ type: 'error', error: 'AI 未配置' });
        }
      },
      streamRagAnswer: async (_request: unknown, onChunk?: (chunk: unknown) => void) => {
        if (onChunk) {
          onChunk({ type: 'error', error: 'AI 未配置' });
        }
      },
      streamCompleteSetting: async (_request: unknown, onChunk?: (chunk: unknown) => void) => {
        if (onChunk) {
          onChunk({ type: 'error', error: 'AI 未配置' });
        }
      },
      streamForeshadowing: async (_projectId: string, _text: string, onChunk?: (chunk: unknown) => void, _requestId?: string) => {
        if (onChunk) {
          onChunk({ type: 'error', error: 'AI 未配置' });
        }
      }
    },
    rag: {
      build: async (projectId: string) => ({ status: 'degraded', projectId, dirty: true, updatedAt: new Date().toISOString(), chunkCount: 0, embeddedCount: 0, warnings: [] }),
      state: async (projectId: string) => ({ status: 'empty', projectId, dirty: false, chunkCount: 0, embeddedCount: 0, warnings: [] }),
      query: async () => ({ status: 'degraded', query: '', contexts: [], warnings: [] }),
      answer: async () => ({ requestId: 'test', status: 'degraded', warnings: [], evidence: [], data: { answer: '', citations: [] } })
    },
    index: {
      rebuild: async () => ({ scannedFiles: 0, indexedEntries: 0, indexedProjects: 0, removedFiles: 0, errors: [] })
    },
    system: {
      fonts: async () => []
    },
    desktop: {
      toggleFloating: async () => ({ visible: true, pinned: true }),
      showFloating: async () => ({ visible: true, pinned: true }),
      hideFloating: async () => ({ visible: false, pinned: true }),
      setFloatingPinned: async (pinned: boolean) => ({ visible: true, pinned }),
      setMainPinned: async (pinned: boolean) => ({ pinned }),
      minimize: async () => undefined,
      maximize: async () => ({ maximized: true }),
      close: async () => undefined,
      openWindow: async () => undefined
    }
  },
  writable: true
});
