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
        apiKey: 'anthropic-key',
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
    expect(JSON.stringify(config)).not.toContain('anthropic-key');

    // Gemini Provider
    service.saveAiConfig({
      llm: {
        enabled: true,
        provider: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'gemini-1.5-flash',
        apiKey: 'gemini-key'
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
        apiKey: 'azure-key'
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
        apiKey: 'unused'
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
        apiKey: 'unused'
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
      llm: { enabled: true, provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiKey: 'list-key' }
    });

    const models = await service.listAiModels('llm');
    expect(models).toEqual([
      { id: 'gpt-4o', ownedBy: 'openai' },
      { id: 'gpt-4o-mini', ownedBy: 'openai' }
    ]);
    expect(fetchCalls[0]).toContain('/models');

    // 未配置时返回空数组
    service.saveAiConfig({ llm: { enabled: false, apiKey: '' } });
    const empty = await service.listAiModels('llm');
    expect(empty).toEqual([]);

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
      llm: { enabled: true, provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3', apiKey: 'unused' }
    });

    const models = await service.listAiModels('llm');
    expect(models).toEqual([{ id: 'llama3:latest' }, { id: 'qwen2:7b' }]);
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
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: 'stream-key' }
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
      embedding: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://embed.example/v1', model: 'mock-embed', apiKey: 'embed-key' }
    });
    await service.buildVectorIndex(project.id);

    // LLM 未启用，应返回 error chunk
    const degradedChunks = await collectChunks(
      service.streamRagAnswer({ projectId: project.id, query: '玉佩作用', topK: 1, retrievalMode: 'hybrid' })
    );
    expect(degradedChunks.some((c) => c.type === 'error' && c.error?.includes('LLM 未配置'))).toBe(true);

    // 启用 LLM 后应能流式输出
    service.saveAiConfig({
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: 'stream-key' }
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
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: 'skill-key' }
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
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: 'tool-key' }
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
      llm: { enabled: true, provider: 'openai-compatible', baseUrl: 'https://llm.example/v1', model: 'mock-llm', apiKey: 'tool-key' }
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
});
