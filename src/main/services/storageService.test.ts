import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { join } from 'node:path';
import { hostname, tmpdir, userInfo } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { CharacterEntry, Plotboard, StateSnapshot } from '../../shared/storageTypes.js';
import { StorageService } from './storageService.js';

const TEST_API_KEY_PLACEHOLDER = 'TEST_API_KEY_PLACEHOLDER_DO_NOT_USE';
const TEST_LEGACY_API_KEY_PLACEHOLDER = 'TEST_LEGACY_API_KEY_PLACEHOLDER_DO_NOT_USE';
const TEST_OLLAMA_API_KEY_PLACEHOLDER = 'TEST_OLLAMA_NO_KEY_REQUIRED';
const TEST_TEMP_API_KEY_PLACEHOLDER = 'TEST_TEMP_API_KEY_PLACEHOLDER_DO_NOT_USE';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'hetusketch-storage-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** 构造 SSE 流式 Response，lines 为即将推送的 SSE 数据行（不含 data: 前缀） */
function buildSseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** 构造 JSON Response */
function buildJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** 收集异步生成器的所有 chunk */
async function collectChunks<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const chunks: T[] = [];
  for await (const chunk of gen) {
    chunks.push(chunk);
  }
  return chunks;
}

function encryptLegacyApiKey(plainText: string, scope: string): string {
  const key = scryptSync(`${userInfo().username}:${hostname()}:${scope}`, createHash('sha256').update(scope).digest('hex'), 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

describe('StorageService', () => {
  it('creates, stores, indexes and exports plotboards with state snapshots', async () => {
    const service = new StorageService(await createTempRoot());
    await service.initialize();
    const book = await service.createBook({ id: 'book-plotboard', title: '剧情画布作品' });
    const volume = await service.createVolume({ bookId: book.id, id: 'vol-main', title: '第一卷' });
    const chapter = await service.createChapter({ bookId: book.id, volumeId: volume.id, id: 'ch-plot', title: '第一章', content: '旧正文' });

    const created = await service.createPlotboard({ bookId: book.id, chapterId: chapter.id, projectId: 'project-1', settingSetId: 'setting-1' });
    expect(created).toMatchObject({ bookId: book.id, chapterId: chapter.id, cards: [], links: [] });

    const plotboard: Plotboard = {
      ...created,
      customFutureField: { preserved: true },
      cards: [{
        cardId: 'card-1',
        title: '发现密信',
        fact: '张三在密室发现李四的密信。',
        cardType: 'clue_setup',
        timecode: 'Day 3 / 18:00',
        povCharacterId: 'char-zhangsan',
        locationWorldEntryId: 'world-room',
        characterIds: ['char-zhangsan'],
        worldEntryIds: ['world-room'],
        plotEntryIds: ['plot-letter'],
        stateDeltas: [{ ownerType: 'character', ownerId: 'char-zhangsan', fieldName: '信任度_李四', operator: 'decrease', value: 10, reason: '密信暴露' }],
        narrativeTone: ['紧张'],
        detailLevel: 3,
        generationInstruction: '突出怀疑感',
        x: 120,
        y: 80,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        unknownCardField: 'keep'
      }],
      links: [{ linkId: 'link-1', sourceCardId: 'card-1', targetCardId: 'card-2', linkType: 'causal', motivation: '密信导致怀疑', unknownLinkField: 'keep' }]
    };

    const saved = await service.savePlotboard(plotboard);
    expect(saved.customFutureField).toEqual({ preserved: true });
    const loaded = await service.openPlotboard(book.id, chapter.id);
    expect(loaded.cards[0].unknownCardField).toBe('keep');
    expect(loaded.links[0].unknownLinkField).toBe('keep');
    expect(await readFile(join(service.paths.booksRoot, book.id, 'plotboards', `${chapter.id}.plotboard.json`), 'utf8')).toContain('customFutureField');

    const snapshot: StateSnapshot = {
      schemaVersion: 1,
      chapterId: chapter.id,
      snapshotTimecode: 'Day 3 / 00:00',
      states: [{ ownerType: 'character', ownerId: 'char-zhangsan', fields: { 伤势: { value: '轻伤', semanticPrompt: '行动略受影响' } } }],
      sourceDiffIds: ['diff-1'],
      extraSnapshotField: 'keep'
    };
    const savedSnapshot = await service.saveStateSnapshot(book.id, snapshot);
    expect(savedSnapshot.extraSnapshotField).toBe('keep');
    await expect(service.loadStateSnapshot(book.id, chapter.id)).resolves.toMatchObject({ snapshotTimecode: 'Day 3 / 00:00' });

    const outline = await service.exportPlotboardOutline(book.id, chapter.id);
    expect(outline).toContain('发现密信');
    expect(outline).toContain('张三在密室发现李四的密信。');

    const generated = await service.writeGeneratedMarkdown({ bookId: book.id, chapterId: chapter.id, markdown: '# 新正文' });
    expect(generated.snapshot?.filePath).toBeTruthy();
    await expect(readFile(generated.snapshot!.filePath, 'utf8')).resolves.toBe('旧正文');
    expect(generated.chapter.content).toBe('# 新正文');
    await expect(service.syncPlotboardIndex(book.id)).resolves.toMatchObject({ errors: [] });

    await service.close();
  });

  it('creates project structure, stores JSON entries and searches through FTS5', async () => {
    const service = new StorageService(await createTempRoot());
    await service.initialize();

    const project = await service.createProject({ id: 'test-book', name: '测试作品', type: 'original', summary: '东方玄幻故事' });
    const entry: CharacterEntry = {
      id: 'char-lingxi',
      projectId: project.id,
      type: 'character',
      title: '林溪',
      summary: '冷静的主角',
      content: '林溪持有星盘，可以读取河图碎片。',
      tags: ['主角', '河图'],
      relations: [],
      customFields: {},
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z',
      format: 'json',
      role: 'protagonist',
      personalityTags: ['冷静'],
      abilities: '星盘推演',
      background: '来自边城',
      redLines: ['绝不背叛同伴']
    };

    await service.saveEntry({ projectId: project.id, entry });

    expect(service.listProjects()).toHaveLength(1);
    expect(await service.readEntry(project.id, 'character', entry.id)).toMatchObject({ title: '林溪' });
    expect(service.search({ projectId: project.id, keyword: '河图', limit: 5 })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: entry.id, type: 'character', title: '林溪' })])
    );

    await service.close();
  });

  it('stores markdown entries, exports zip, imports folder and rebuilds index', async () => {
    const source = new StorageService(await createTempRoot());
    await source.initialize();
    const project = await source.createProject({ id: 'markdown-book', name: 'Markdown 作品', type: 'fanfiction' });

    await source.saveEntry({
      projectId: project.id,
      entry: {
        id: 'world-rules',
        projectId: project.id,
        type: 'world',
        title: '魔法规则',
        summary: '不可复活死者',
        content: '魔法只能转移生命力，不能凭空创造灵魂。',
        tags: ['魔法'],
        relations: [],
        customFields: {},
        createdAt: '2026-06-18T00:00:00.000Z',
        updatedAt: '2026-06-18T00:00:00.000Z',
        format: 'markdown',
        category: 'magic',
        rules: ['不能复活死者']
      }
    });

    const exportPath = join(await createTempRoot(), 'markdown-book.zip');
    await source.exportProject(project.id, exportPath);

    const imported = new StorageService(await createTempRoot());
    await imported.initialize();
    const result = await imported.importFromFolder(join(source.paths.projectsRoot, project.id));

    expect(result.project.id).toBe(project.id);
    expect(imported.search({ keyword: '魔法', limit: 5 })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'world-rules', type: 'world' })])
    );
    expect(result.summary.indexedEntries).toBe(1);

    await source.close();
    await imported.close();
  });

  it('stores AI configuration without exposing keys and degrades when AI is disabled', async () => {
    const service = new StorageService(await createTempRoot());
    await service.initialize();
    const project = await service.createProject({ id: 'ai-off-book', name: 'AI 降级作品', type: 'original' });
    await service.createEntry({ projectId: project.id, type: 'world', title: '灵气规则', content: '灵气不可凭空生成。', rules: ['灵气不可凭空生成'] });

    expect(service.getAiConfig().llm.apiKeySet).toBe(false);
    service.saveAiConfig({ llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://example.com/v1', model: 'mock-llm', apiKey: TEST_API_KEY_PLACEHOLDER } });
    const publicConfig = service.getAiConfig();
    expect(publicConfig.llm).toMatchObject({ enabled: true, apiKeySet: true, model: 'mock-llm' });
    expect(JSON.stringify(publicConfig)).not.toContain(TEST_API_KEY_PLACEHOLDER);

    service.saveAiConfig({ llm: { enabled: false, apiKey: '' } });
    const enhanced = await service.validateContentEnhanced({ projectId: project.id, text: '灵气规则显示：灵气不可凭空生成。' });
    expect(enhanced.status).toBe('degraded');
    expect(enhanced.data?.validation.findings).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'world-rule' })]));

    await service.close();
  });

  it('builds vector index with mocked embeddings and answers RAG queries with degraded LLM', async () => {
    const calls: string[] = [];
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-vector',
      fetch: async (input, init) => {
        calls.push(String(input));
        const body = JSON.parse(String(init?.body ?? '{}')) as { input?: string };
        const text = body.input ?? '';
        const embedding = text.includes('玉佩') ? [1, 0, 0] : [0, 1, 0];
        return new Response(JSON.stringify({ data: [{ embedding }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    });
    await service.initialize();
    const project = await service.createProject({ id: 'rag-book', name: 'RAG 作品', type: 'original' });
    const plot = await service.createEntry({ projectId: project.id, type: 'plot', title: '玉佩伏笔', content: '玉佩会在终章揭示主角身世。', status: 'open' });
    await service.createEntry({ projectId: project.id, type: 'world', title: '灵气规则', content: '灵气来自地脉。', rules: ['灵气来自地脉'] });

    service.saveAiConfig({ embedding: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://embed.example/v1', model: 'mock-embed', apiKey: TEST_API_KEY_PLACEHOLDER } });
    expect(service.getVectorIndexState(project.id)).toMatchObject({ status: 'dirty', dirty: true });
    const build = await service.buildVectorIndex(project.id);
    expect(build).toMatchObject({ status: 'ready', dirty: false, embeddedCount: 2 });

    const result = await service.ragQuery({ projectId: project.id, query: '玉佩身世', retrievalMode: 'vector', topK: 1 });
    expect(result.contexts[0]).toMatchObject({ title: '玉佩伏笔', matchReason: 'vector' });
    expect(calls.every((url) => url === 'https://embed.example/v1/embeddings')).toBe(true);
    await service.updateEntry({ projectId: project.id, type: 'plot', entryId: plot.id, changes: { content: '玉佩会在终章揭示主角身世和血脉。' } });
    expect(service.getVectorIndexState(project.id).dirty).toBe(true);

    const answer = await service.ragAnswer({ projectId: project.id, query: '玉佩有什么作用？', retrievalMode: 'vector', topK: 1 });
    expect(answer.status).toBe('degraded');
    expect(answer.data?.citations[0].title).toBe('玉佩伏笔');

    await service.close();
  });

  it('persists prompt, skill and HTTP tool configuration with URL/header safeguards', async () => {
    const service = new StorageService(await createTempRoot());
    await service.initialize();

    const prompts = service.saveAiPrompts({ scenarios: { rag_qa: '只根据上下文回答。' } });
    expect(prompts.scenarios.rag_qa).toBe('只根据上下文回答。');

    const skills = service.saveAiSkills([{ id: 'rag_search', enabled: false }]);
    expect(skills).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'rag_search', enabled: false })]));

    const tool = service.saveHttpTool({
      id: 'notify_tool',
      name: '通知工具',
      url: 'https://tool.example/callback',
      headers: { 'X-Trace': 'ok', Authorization: 'blocked' },
      enabled: true
    });
    expect(tool.headers).toEqual({ 'X-Trace': 'ok' });
    expect(service.listHttpTools()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'notify_tool', enabled: true })]));
    expect(() => service.saveHttpTool({ name: 'bad', url: 'file:///tmp/a' })).toThrow(/HTTP\/HTTPS/);

    await service.close();
  });

  it('keeps character and world entries visible after plotboard index sync', async () => {
    const service = new StorageService(await createTempRoot());
    await service.initialize();
    const project = await service.createProject({ id: 'entry-visibility-book', name: '条目展示作品', type: 'original' });
    const book = await service.createBook({ id: project.id, title: project.name });
    const volume = await service.createVolume({ bookId: book.id, id: 'vol-main', title: '第一卷' });
    const chapter = await service.createChapter({ bookId: book.id, volumeId: volume.id, id: 'ch-main', title: '第一章' });

    const character = await service.createEntry({
      projectId: project.id,
      type: 'character',
      title: '林溪',
      summary: '冷静的主角',
      content: '林溪持有星盘。',
      role: 'protagonist',
      personalityTags: ['冷静'],
      redLines: ['绝不背叛同伴']
    });
    const world = await service.createEntry({
      projectId: project.id,
      type: 'world',
      title: '星盘规则',
      summary: '不可复活死者',
      content: '星盘只能观测命运。',
      category: 'magic',
      rules: ['不可复活死者']
    });

    await service.createPlotboard({ bookId: book.id, chapterId: chapter.id, projectId: project.id });
    await service.syncPlotboardIndex(book.id);

    await expect(service.listEntries({ projectId: project.id, type: 'character' })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: character.id, title: '林溪' })])
    );
    await expect(service.listEntries({ projectId: project.id, type: 'world' })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: world.id, title: '星盘规则' })])
    );
    await expect(service.readEntry(project.id, 'character', character.id)).resolves.toMatchObject({ role: 'protagonist', redLines: ['绝不背叛同伴'] });
    await expect(service.readEntry(project.id, 'world', world.id)).resolves.toMatchObject({ category: 'magic', rules: ['不可复活死者'] });

    await service.close();
  });

  it('manages entry CRUD, recent access, dashboard stats and basic validation', async () => {
    const service = new StorageService(await createTempRoot());
    await service.initialize();
    const project = await service.createProject({ id: 'business-book', name: '业务作品', type: 'original' });

    const character = await service.createEntry({
      projectId: project.id,
      type: 'character',
      title: '张三',
      content: '主角张三重视朋友。',
      redLines: ['绝不背叛朋友'],
      personalityTags: ['重情义']
    });
    const world = await service.createEntry({
      projectId: project.id,
      type: 'world',
      title: '魔法规则',
      content: '魔法体系规则。',
      category: 'magic',
      rules: ['魔法不能复活死者']
    });
    const plot = await service.createEntry({
      projectId: project.id,
      type: 'plot',
      title: '玉佩伏笔',
      content: '玉佩将在终章揭示身世。',
      status: 'open',
      relatedCharacters: [character.id]
    });

    await expect(service.listEntries({ projectId: project.id })).resolves.toHaveLength(3);
    await expect(service.getDashboardStats(project.id)).resolves.toMatchObject({
      entryCount: 3,
      byType: { character: 1, world: 1, plot: 1 },
      openPlotCount: 1
    });

    const updated = await service.updateEntry({
      projectId: project.id,
      type: 'plot',
      entryId: plot.id,
      changes: { status: 'resolved', content: '玉佩已经揭示身世。' }
    });
    expect(updated).toMatchObject({ type: 'plot', status: 'resolved' });

    await service.createEntry({
      projectId: project.id,
      type: 'plot',
      title: '玉佩伏笔二',
      content: '玉佩将在番外再次发挥作用。',
      status: 'open',
      relatedCharacters: [character.id]
    });
    await expect(service.getDashboardStats(project.id)).resolves.toMatchObject({
      plotStatus: { open: 1, resolved: 1, abandoned: 0 },
      openPlotCount: 1
    });

    await service.readEntry(project.id, 'character', character.id);
    expect(service.listRecentAccess(project.id, 5)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: character.id, type: 'character' })])
    );

    const validation = await service.validateContent({
      projectId: project.id,
      text: '张三为了活命背叛朋友，并用魔法复活死者。玉佩再次发光。'
    });

    expect(validation.ok).toBe(false);
    expect(validation.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'character-red-line', entryId: character.id }),
        expect.objectContaining({ category: 'plot-reminder' })
      ])
    );

    await service.deleteEntry(project.id, 'world', world.id);
    await expect(service.listEntries({ projectId: project.id, type: 'world' })).resolves.toHaveLength(0);

    await service.close();
  });

  it('saves and loads multi-provider AI configs (anthropic/gemini/ollama/azure)', async () => {
    const service = new StorageService(await createTempRoot());
    await service.initialize();

    // Anthropic Provider
    service.saveAiConfig({
      llm: {
        enabled: true,
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-3-5-sonnet-20241022',
        apiKey: TEST_API_KEY_PLACEHOLDER,
        temperature: 0.3,
        topP: 0.9,
        maxTokens: 4096,
        timeoutMs: 60_000
      }
    });
    let config = service.getAiConfig();
    expect(config.llm).toMatchObject({
      enabled: true,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      apiKeySet: true,
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 4096,
      timeoutMs: 60_000
    });
    expect(JSON.stringify(config)).not.toContain(TEST_API_KEY_PLACEHOLDER);

    // Gemini Provider
    service.saveAiConfig({
      llm: {
        enabled: true,
        provider: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'gemini-1.5-flash',
        apiKey: TEST_API_KEY_PLACEHOLDER
      }
    });
    config = service.getAiConfig();
    expect(config.llm).toMatchObject({ provider: 'gemini', model: 'gemini-1.5-flash', apiKeySet: true });

    // Azure OpenAI Provider
    service.saveAiConfig({
      llm: {
        enabled: true,
        provider: 'azure-openai',
        baseUrl: 'https://my-resource.openai.azure.com/openai/deployments/my-deployment',
        model: 'gpt-4o',
        apiKey: TEST_API_KEY_PLACEHOLDER
      }
    });
    config = service.getAiConfig();
    expect(config.llm).toMatchObject({ provider: 'azure-openai', apiKeySet: true });

    // Ollama Provider (no API key required)
    service.saveAiConfig({
      llm: {
        enabled: true,
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: 'llama3',
        apiKey: TEST_OLLAMA_API_KEY_PLACEHOLDER
      }
    });
    config = service.getAiConfig();
    expect(config.llm).toMatchObject({ provider: 'ollama', model: 'llama3' });

    // Embedding 多 Provider
    service.saveAiConfig({
      embedding: {
        enabled: true,
        provider: 'ollama',
        baseUrl: 'http://localhost:11434',
        model: 'nomic-embed-text',
        apiKey: TEST_OLLAMA_API_KEY_PLACEHOLDER
      }
    });
    config = service.getAiConfig();
    expect(config.embedding).toMatchObject({ provider: 'ollama', model: 'nomic-embed-text', enabled: true });

    await service.close();
  });

  it('lists models from OpenAI-compatible /models endpoint', async () => {
    const fetchCalls: string[] = [];
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-list-models',
      fetch: async (input) => {
        fetchCalls.push(String(input));
        return buildJsonResponse({
          data: [
            { id: 'gpt-4o', owned_by: 'openai' },
            { id: 'gpt-4o-mini', owned_by: 'openai' }
          ]
        });
      }
    });
    await service.initialize();

    service.saveAiConfig({
      llm: { enabled: true, provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiKey: TEST_API_KEY_PLACEHOLDER }
    });

    const models = await service.listAiModels('llm');
    expect(models).toEqual([
      { id: 'gpt-4o', name: 'gpt-4o', ownedBy: 'openai', source: 'remote' },
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini', ownedBy: 'openai', source: 'remote' }
    ]);
    expect(fetchCalls[0]).toContain('/models');

    service.saveAiConfig({ llm: { enabled: false, apiKey: '' } });
    await expect(service.listAiModels('llm')).rejects.toThrow('请先填写或保存 API Key');

    await service.close();
  });

  it('lists models from Ollama /api/tags endpoint', async () => {
    const fetchCalls: string[] = [];
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-ollama-models',
      fetch: async (input) => {
        fetchCalls.push(String(input));
        return buildJsonResponse({
          models: [{ name: 'llama3:latest' }, { name: 'qwen2:7b' }]
        });
      }
    });
    await service.initialize();

    service.saveAiConfig({
      llm: { enabled: true, provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3', apiKey: TEST_OLLAMA_API_KEY_PLACEHOLDER }
    });

    const models = await service.listAiModels('llm');
    expect(models).toEqual([
      { id: 'llama3:latest', name: 'llama3:latest', ownedBy: 'ollama', source: 'remote' },
      { id: 'qwen2:7b', name: 'qwen2:7b', ownedBy: 'ollama', source: 'remote' }
    ]);
    expect(fetchCalls[0]).toContain('/api/tags');

    await service.close();
  });

  it('streams validation chunks from OpenAI-compatible SSE endpoint', async () => {
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-stream-validation',
      fetch: async () =>
        buildSseResponse([
          JSON.stringify({ choices: [{ delta: { content: '校验中' } }] }),
          JSON.stringify({ choices: [{ delta: { content: '发现冲突' } }] }),
          JSON.stringify({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
          '[DONE]'
        ])
    });
    await service.initialize();
    const project = await service.createProject({ id: 'stream-validate-book', name: '流式校验作品', type: 'original' });
    await service.createEntry({ projectId: project.id, type: 'world', title: '规则', content: '不可违背。', rules: ['不可违背'] });

    service.saveAiConfig({
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: TEST_API_KEY_PLACEHOLDER }
    });

    const chunks = await collectChunks(
      service.streamValidation(
        { projectId: project.id, text: '违背规则的内容', requestId: 'req-1' },
        { ok: false, checkedAt: new Date().toISOString(), summary: { checkedCharacters: 0, checkedWorldRules: 1, checkedOpenPlots: 0, warningCount: 1, reminderCount: 0 }, findings: [] }
      )
    );

    const deltaContents = chunks.filter((c) => c.type === 'delta').map((c) => c.content ?? '').join('');
    expect(deltaContents).toBe('校验中发现冲突');
    expect(chunks.some((c) => c.type === 'usage' && c.usage?.totalTokens === 15)).toBe(true);
    expect(chunks.some((c) => c.type === 'finish')).toBe(true);

    await service.close();
  });

  it('streams rag answer chunks and degrades when LLM is disabled', async () => {
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-stream-rag',
      fetch: async () =>
        buildSseResponse([
          JSON.stringify({ choices: [{ delta: { content: '玉佩作用是' } }] }),
          JSON.stringify({ choices: [{ delta: { content: '揭示身世' } }] }),
          '[DONE]'
        ])
    });
    await service.initialize();
    const project = await service.createProject({ id: 'stream-rag-book', name: 'RAG 流式作品', type: 'original' });
    await service.createEntry({ projectId: project.id, type: 'plot', title: '玉佩伏笔', content: '玉佩揭示身世。', status: 'open' });

    // 先建向量索引
    service.saveAiConfig({
      embedding: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://embed.example/v1', model: 'mock-embed', apiKey: TEST_API_KEY_PLACEHOLDER }
    });
    await service.buildVectorIndex(project.id);

    // LLM 未启用，应返回 error chunk
    const degradedChunks = await collectChunks(
      service.streamRagAnswer({ projectId: project.id, query: '玉佩作用', topK: 1, retrievalMode: 'hybrid' })
    );
    expect(degradedChunks.some((c) => c.type === 'error' && c.error?.includes('LLM 未配置'))).toBe(true);

    // 启用 LLM 后应能流式输出
    service.saveAiConfig({
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: TEST_API_KEY_PLACEHOLDER }
    });
    const chunks = await collectChunks(
      service.streamRagAnswer({ projectId: project.id, query: '玉佩作用', topK: 1, retrievalMode: 'hybrid' })
    );
    const answer = chunks.filter((c) => c.type === 'delta').map((c) => c.content ?? '').join('');
    expect(answer).toBe('玉佩作用是揭示身世');
    expect(chunks.some((c) => c.type === 'finish')).toBe(true);

    await service.close();
  });

  it('respects skill switches in stream methods (setting_completion / foreshadowing)', async () => {
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-skill-switch',
      fetch: async () => buildSseResponse([JSON.stringify({ choices: [{ delta: { content: '不应到达' } }] }), '[DONE]'])
    });
    await service.initialize();
    const project = await service.createProject({ id: 'skill-book', name: '技能开关作品', type: 'original' });
    await service.createEntry({ projectId: project.id, type: 'character', title: '主角', content: '主角设定。' });

    service.saveAiConfig({
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: TEST_API_KEY_PLACEHOLDER }
    });

    // 禁用 setting_completion 技能
    service.saveAiSkills([{ id: 'setting_completion', enabled: false }]);

    const settingChunks = await collectChunks(
      service.streamCompleteSetting({
        projectId: project.id,
        entityType: 'character',
        draft: '主角',
        existingFields: {}
      })
    );
    expect(settingChunks).toEqual([{ type: 'error', error: '设定补全技能已禁用' }]);

    // 禁用 foreshadowing 技能
    service.saveAiSkills([{ id: 'foreshadowing', enabled: false }]);

    const foreshadowingChunks = await collectChunks(
      service.streamForeshadowingReminder(project.id, '主角拿起玉佩。', 'req-foreshadow')
    );
    expect(foreshadowingChunks).toEqual([{ type: 'error', error: '伏笔提醒技能已禁用' }]);

    // 重新启用后应能流式输出
    service.saveAiSkills([{ id: 'setting_completion', enabled: true }, { id: 'foreshadowing', enabled: true }]);

    const okChunks = await collectChunks(
      service.streamCompleteSetting({
        projectId: project.id,
        entityType: 'character',
        draft: '主角',
        existingFields: {}
      })
    );
    expect(okChunks.some((c) => c.type === 'delta')).toBe(true);

    await service.close();
  });

  it('invokes HTTP tools via function calling when http_tools skill is enabled', async () => {
    const fetchCalls: Array<{ url: string; body?: string }> = [];
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-http-tools',
      fetch: async (input, init) => {
        const url = String(input);
        fetchCalls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });

        // HTTP 工具回调端点
        if (url === 'https://tool.example/callback') {
          return buildJsonResponse({ ok: true, result: '工具执行成功' });
        }

        // LLM 端点：第一轮返回 tool_call，第二轮返回最终内容
        const body = init?.body ? JSON.parse(String(init.body)) as { messages?: Array<Record<string, unknown>> } : {};
        const lastMessage = body.messages?.[body.messages.length - 1];
        const isToolResult = lastMessage?.role === 'tool';

        if (!isToolResult) {
          return buildJsonResponse({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_1',
                  function: { name: 'notify_tool', arguments: JSON.stringify({ input: '需要查询' }) }
                }]
              }
            }],
            usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }
          });
        }

        return buildJsonResponse({
          choices: [{ message: { role: 'assistant', content: '已调用工具并整合结果' } }],
          usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 }
        });
      }
    });
    await service.initialize();
    const project = await service.createProject({ id: 'tool-book', name: '工具调用作品', type: 'original' });
    await service.createEntry({ projectId: project.id, type: 'world', title: '规则', content: '基础规则。', rules: ['基础规则'] });

    service.saveAiConfig({
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: TEST_API_KEY_PLACEHOLDER }
    });

    // 注册 HTTP 工具并启用 http_tools 技能
    service.saveHttpTool({
      id: 'notify_tool',
      name: '通知工具',
      url: 'https://tool.example/callback',
      method: 'POST',
      description: '向外部服务发送通知',
      enabled: true
    });
    service.saveAiSkills([{ id: 'http_tools', enabled: true }, { id: 'rag_search', enabled: true }]);

    const result = await service.validateContentEnhanced({
      projectId: project.id,
      text: '需要调用工具校验的内容。',
      requestId: 'req-tool'
    });

    expect(result.status).toBe('ok');
    expect(result.data?.validation).toBeDefined();

    // 应该有两次 LLM 调用 + 一次工具调用
    const llmCalls = fetchCalls.filter((c) => c.url === 'https://llm.example/v1/chat/completions');
    const toolCalls = fetchCalls.filter((c) => c.url === 'https://tool.example/callback');
    expect(llmCalls.length).toBeGreaterThanOrEqual(2);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].body).toContain('需要查询');

    await service.close();
  });

  it('skips HTTP tools when http_tools skill is disabled', async () => {
    const fetchCalls: string[] = [];
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-http-tools-disabled',
      fetch: async (input) => {
        fetchCalls.push(String(input));
        return buildJsonResponse({
          choices: [{ message: { role: 'assistant', content: '{"findings":[]}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        });
      }
    });
    await service.initialize();
    const project = await service.createProject({ id: 'tool-off-book', name: '工具禁用作品', type: 'original' });
    await service.createEntry({ projectId: project.id, type: 'world', title: '规则', content: '基础规则。', rules: ['基础规则'] });

    service.saveAiConfig({
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: TEST_API_KEY_PLACEHOLDER }
    });

    service.saveHttpTool({
      id: 'notify_tool',
      name: '通知工具',
      url: 'https://tool.example/callback',
      method: 'POST',
      enabled: true
    });
    // http_tools 技能默认禁用
    expect(service.listAiSkills().find((s) => s.id === 'http_tools')?.enabled).toBe(false);

    await service.validateContentEnhanced({
      projectId: project.id,
      text: '内容。',
      requestId: 'req-no-tool'
    });

    // 不应调用工具端点
    expect(fetchCalls.some((url) => url === 'https://tool.example/callback')).toBe(false);

    await service.close();
  });

  it('blocks SSRF-prone HTTP tool targets before saving or executing', async () => {
    const service = new StorageService(await createTempRoot());
    await service.initialize();

    const blockedUrls = [
      'http://localhost:3000/callback',
      'http://127.0.0.1:8080/callback',
      'http://[::1]/callback',
      'http://0.0.0.0/callback',
      'http://10.1.2.3/callback',
      'http://172.16.0.1/callback',
      'http://192.168.1.1/callback',
      'http://169.254.169.254/latest/meta-data',
      'http://[fc00::1]/callback',
      'http://[fe80::1]/callback'
    ];

    for (const url of blockedUrls) {
      expect(() => service.saveHttpTool({ name: 'bad', url })).toThrow(/目标被阻断/);
    }

    await service.close();
  });

  it('blocks unsafe HTTP tool redirects and records audit reasons', async () => {
    const fetchCalls: string[] = [];
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-http-redirect-block',
      fetch: async (input, init) => {
        const url = String(input);
        fetchCalls.push(url);
        if (url === 'https://tool.example/callback') {
          expect(init?.redirect).toBe('manual');
          return new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
        }
        const body = init?.body ? JSON.parse(String(init.body)) as { messages?: Array<Record<string, unknown>> } : {};
        const isToolResult = body.messages?.[body.messages.length - 1]?.role === 'tool';
        return buildJsonResponse({
          choices: [{ message: isToolResult ? { role: 'assistant', content: '{"findings":[]}' } : { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'notify_tool', arguments: '{"input":"x"}' } }] } }]
        });
      }
    });
    await service.initialize();
    const project = await service.createProject({ id: 'tool-redirect-book', name: '重定向阻断作品', type: 'original' });
    await service.createEntry({ projectId: project.id, type: 'world', title: '规则', content: '基础规则。', rules: ['基础规则'] });
    service.saveAiConfig({ llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: TEST_API_KEY_PLACEHOLDER } });
    service.saveHttpTool({ id: 'notify_tool', name: '通知工具', url: 'https://tool.example/callback', method: 'POST', enabled: true });
    service.saveAiSkills([{ id: 'http_tools', enabled: true }]);

    const result = await service.validateContentEnhanced({ projectId: project.id, text: '内容。' });

    expect(result.status).toBe('ok');
    expect(fetchCalls).not.toContain('http://169.254.169.254/latest/meta-data');
    expect(service.aiService.getHttpToolAuditLog()).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'reject', reason: expect.stringMatching(/目标被阻断/) })
    ]));

    await service.close();
  });

  it('limits HTTP tool response MIME type and size', async () => {
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: 'test-http-response-limits',
      fetch: async (input, init) => {
        const url = String(input);
        if (url === 'https://tool.example/callback') {
          return new Response('not allowed', { status: 200, headers: { 'content-type': 'text/html' } });
        }
        if (url === 'https://tool.example/large') {
          return new Response('x'.repeat(70 * 1024), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        const body = init?.body ? JSON.parse(String(init.body)) as { messages?: Array<Record<string, unknown>> } : {};
        const toolResults = body.messages?.filter((m) => m.role === 'tool').map((m) => String(m.content ?? '')) ?? [];
        const toolCallName = toolResults.length === 0 ? 'bad_mime_tool' : toolResults.length === 1 ? 'large_tool' : undefined;
        if (toolCallName) {
          return buildJsonResponse({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `call_${toolResults.length + 1}`, function: { name: toolCallName, arguments: '{"input":"x"}' } }] } }] });
        }
        return buildJsonResponse({ choices: [{ message: { role: 'assistant', content: '{"findings":[]}' } }] });
      }
    });
    await service.initialize();
    const project = await service.createProject({ id: 'tool-limit-book', name: '响应限制作品', type: 'original' });
    await service.createEntry({ projectId: project.id, type: 'world', title: '规则', content: '基础规则。', rules: ['基础规则'] });
    service.saveAiConfig({ llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: TEST_API_KEY_PLACEHOLDER } });
    service.saveHttpTool({ id: 'bad_mime_tool', name: 'MIME 工具', url: 'https://tool.example/callback', method: 'POST', enabled: true });
    service.saveHttpTool({ id: 'large_tool', name: '大响应工具', url: 'https://tool.example/large', method: 'POST', enabled: true });
    service.saveAiSkills([{ id: 'http_tools', enabled: true }]);

    await service.validateContentEnhanced({ projectId: project.id, text: '内容。' });

    const reasons = service.aiService.getHttpToolAuditLog().filter((entry) => entry.action === 'reject').map((entry) => entry.reason);
    expect(reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/MIME 不被允许/),
      expect.stringMatching(/响应超过大小限制/)
    ]));

    await service.close();
  });

  it('loads legacy AES-GCM API key ciphertext and never exposes plaintext key', async () => {
    const scope = 'test-legacy-ciphertext';
    const service = new StorageService(await createTempRoot(), {
      encryptionScope: scope,
      fetch: async (_input, init) => {
        expect(String(init?.headers instanceof Headers ? init.headers.get('authorization') : (init?.headers as Record<string, string>)?.authorization)).toContain(TEST_LEGACY_API_KEY_PLACEHOLDER);
        return buildJsonResponse({ data: [{ id: 'legacy-model' }] });
      }
    });
    await service.initialize();

    const legacyCiphertext = encryptLegacyApiKey(TEST_LEGACY_API_KEY_PLACEHOLDER, scope);
    service.saveAiConfig({ llm: { enabled: true, provider: 'openai', baseUrl: 'https://api.example/v1', model: 'legacy-model', apiKey: TEST_TEMP_API_KEY_PLACEHOLDER } });
    const record = JSON.parse(String(service['indexDb'].getConfigRecord('ai.llm'))) as Record<string, unknown>;
    service['indexDb'].setConfigRecord('ai.llm', JSON.stringify({ ...record, encryptedApiKey: legacyCiphertext }));

    expect(service.getAiConfig().llm).toMatchObject({ enabled: true, apiKeySet: true, model: 'legacy-model' });
    expect(JSON.stringify(service.getAiConfig())).not.toContain(TEST_LEGACY_API_KEY_PLACEHOLDER);
    await expect(service.listAiModels('llm')).resolves.toEqual([
      { id: 'legacy-model', name: 'legacy-model', ownedBy: undefined, source: 'remote' }
    ]);

    await service.close();
  });
});
