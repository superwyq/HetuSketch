import { describe, expect, it } from 'vitest';
import { AiService, type FetchLike } from './aiService.js';
import type { AiProvider } from '../../shared/storageTypes.js';

const TEST_API_KEY_PLACEHOLDER = 'TEST_API_KEY_PLACEHOLDER_DO_NOT_USE';

function createService(fetchImpl: FetchLike, records: Record<string, string> = {}): AiService {
  return new AiService(
    {
      getConfigRecord: (key: string) => records[key],
      setConfigRecord: (key: string, value: string) => { records[key] = value; }
    } as never,
    {} as never,
    { fetch: fetchImpl, encryptionScope: 'ai-service-test' }
  );
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init, headers: { 'content-type': 'application/json', ...init.headers } });
}

describe('AiService model management', () => {
  it('fetches provider models using unsaved form config and keeps manual models', async () => {
    let requestedUrl = '';
    let requestedAuth = '';
    const fetchImpl: FetchLike = async (input, init) => {
      requestedUrl = String(input);
      requestedAuth = String((init?.headers as Record<string, string>).authorization);
      return jsonResponse({ data: [{ id: 'remote-model', owned_by: 'provider' }] });
    };
    const service = createService(fetchImpl);

    const models = await service.listModels('llm', {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://example.test/v1',
      model: 'fallback',
      apiKey: TEST_API_KEY_PLACEHOLDER,
      customModels: [{ id: 'manual-model', name: 'Manual Model', source: 'manual' }]
    });

    expect(requestedUrl).toBe('https://example.test/v1/models');
    expect(requestedAuth).toBe(`Bearer ${TEST_API_KEY_PLACEHOLDER}`);
    expect(models).toEqual([
      { id: 'manual-model', name: 'Manual Model', source: 'manual' },
      { id: 'remote-model', name: 'remote-model', ownedBy: 'provider', source: 'remote' }
    ]);
  });

  it('tests connection with a manually selected unsaved model', async () => {
    let requestBody: Record<string, unknown> = {};
    const service = createService(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] });
    });

    const result = await service.testConnection('llm', {
      enabled: true,
      provider: 'openai-compatible',
      baseUrl: 'https://example.test/v1',
      model: 'manual-model',
      apiKey: TEST_API_KEY_PLACEHOLDER,
      customModels: [{ id: 'manual-model', name: 'Manual Model', source: 'manual' }]
    });

    expect(result).toMatchObject({ ok: true, model: 'manual-model' });
    expect(requestBody.model).toBe('manual-model');
  });

  it('normalizes and persists custom model display names', () => {
    const records: Record<string, string> = {};
    const service = createService(async () => jsonResponse({}), records);

    const config = service.saveConfig({
      llm: {
        enabled: true,
        provider: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        model: 'manual-model',
        customModels: [
          { id: ' manual-model ', name: ' 我的模型 ', ownedBy: ' custom ', source: 'manual' },
          { id: '', name: 'invalid' }
        ]
      }
    });

    expect(config.llm.customModels).toEqual([
      { id: 'manual-model', name: '我的模型', ownedBy: 'custom', source: 'manual' }
    ]);
    expect(JSON.parse(records['ai.llm']).customModels).toEqual(config.llm.customModels);
  });

  it.each<[AiProvider, unknown, string[]]>([
    ['gemini', { models: [{ name: 'models/gemini-2.0-flash' }] }, ['gemini-2.0-flash']],
    ['ollama', { models: [{ name: 'llama3.2' }] }, ['llama3.2']],
    ['openai', { data: [{ id: 'gpt-4o-mini' }] }, ['gpt-4o-mini']]
  ])('parses %s model list responses', async (provider, body, expectedIds) => {
    const service = createService(async () => jsonResponse(body));

    const models = await service.listModels('llm', {
      enabled: true,
      provider,
      baseUrl: provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://example.test',
      model: 'fallback',
      apiKey: provider === 'ollama' ? '' : TEST_API_KEY_PLACEHOLDER
    });

    expect(models.map((model) => model.id)).toEqual(expectedIds);
  });
});
