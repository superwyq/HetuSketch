import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { CharacterEntry } from '../../shared/storageTypes.js';
import { StorageService } from './storageService.js';

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'hetusketch-storage-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('StorageService', () => {
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
    service.saveAiConfig({ llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://example.com/v1', model: 'mock-llm', apiKey: 'secret-key' } });
    const publicConfig = service.getAiConfig();
    expect(publicConfig.llm).toMatchObject({ enabled: true, apiKeySet: true, model: 'mock-llm' });
    expect(JSON.stringify(publicConfig)).not.toContain('secret-key');

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

    service.saveAiConfig({ embedding: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://embed.example/v1', model: 'mock-embed', apiKey: 'embed-key' } });
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

    expect(service.listEntries({ projectId: project.id })).toHaveLength(3);
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
    expect(service.listEntries({ projectId: project.id, type: 'world' })).toHaveLength(0);

    await service.close();
  });
});
