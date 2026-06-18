import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
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
  HttpToolConfig,
  HttpToolSaveInput,
  RagBuildResult,
  RagQueryRequest,
  RagQueryResult,
  RetrievedContext,
  VectorIndexState,
  SettingCompletionRequest,
  SettingCompletionResult,
  ValidationFinding,
  ValidationResult
} from '../../shared/storageTypes.js';
import type { IndexDatabase, VectorChunkInput } from './indexDatabase.js';
import type { ProjectFileStore } from './projectFileStore.js';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface AiServiceOptions {
  fetch?: FetchLike;
  encryptionScope?: string;
}

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmJsonResult {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
}

const DEFAULT_GLOBAL_PROMPT = '你是 HetuSketch 的小说设定逻辑校验助手。只提供校验、提醒、补全建议，不代写正文。输出必须是可解析 JSON。';

const DEFAULT_SCENARIO_PROMPTS: AiPromptConfig['scenarios'] = {
  logic_check: '基于基础规则命中和召回设定，找出潜在逻辑冲突。返回 findings 数组，字段包含 category、severity、entryId、entryType、title、rule、message、suggestion、excerpt。',
  setting_completion: '根据草稿和已有设定补全结构化字段。只返回 proposedFields、missingQuestions、possibleConflicts、adoptionMode。',
  foreshadowing: '识别文本中涉及的未回收伏笔，提醒推进、冲突或遗忘风险。返回 reminders 数组。',
  rag_qa: '只依据提供的设定上下文回答问题。若上下文不足，请说明无法确认。返回 answer 与 citations。'
};

const DEFAULT_SKILLS: AiSkillConfig[] = [
  { id: 'basic_rule_check', name: '基础规则校验', description: '本地匹配角色红线、世界观规则与伏笔', enabled: true, builtIn: true },
  { id: 'rag_search', name: 'RAG 检索', description: '召回相关设定片段作为 AI 上下文', enabled: true, builtIn: true },
  { id: 'setting_completion', name: '设定补全', description: '生成结构化设定字段建议', enabled: true, builtIn: true },
  { id: 'foreshadowing', name: '伏笔提醒', description: '提示未回收伏笔和相关风险', enabled: true, builtIn: true },
  { id: 'http_tools', name: 'HTTP 工具调用', description: '允许调用用户显式注册的 HTTP 回调工具', enabled: false, builtIn: true }
];

export class AiService {
  private readonly fetchImpl: FetchLike;
  private readonly keyMaterial: Buffer;

  constructor(
    private readonly indexDb: IndexDatabase,
    private readonly fileStore: ProjectFileStore,
    options: AiServiceOptions = {}
  ) {
    this.fetchImpl = options.fetch ?? fetch;
    this.keyMaterial = deriveKey(options.encryptionScope ?? 'hetusketch-ai-config');
  }

  getConfig(): AiConfig {
    const llm = this.indexDb.getConfigRecord('ai.llm');
    const embedding = this.indexDb.getConfigRecord('ai.embedding');

    return {
      llm: normalizeModelConfig(llm, 'openai-compatible', 'https://api.openai.com/v1', 'gpt-4o-mini'),
      embedding: normalizeModelConfig(embedding, 'openai-compatible', 'https://api.openai.com/v1', 'text-embedding-3-small')
    };
  }

  saveConfig(input: AiConfigSaveInput): AiConfig {
    if (input.llm) {
      this.indexDb.setConfigRecord('ai.llm', JSON.stringify(this.mergeModelConfig('ai.llm', input.llm)));
    }

    if (input.embedding) {
      this.indexDb.setConfigRecord('ai.embedding', JSON.stringify(this.mergeModelConfig('ai.embedding', input.embedding)));
    }

    return this.getConfig();
  }

  getPrompts(): AiPromptConfig {
    const record = this.indexDb.getConfigRecord('ai.prompts');
    if (!record) {
      return { globalSystemPrompt: DEFAULT_GLOBAL_PROMPT, scenarios: { ...DEFAULT_SCENARIO_PROMPTS }, updatedAt: new Date().toISOString() };
    }

    const parsed = safeJson<AiPromptConfig>(record);
    return {
      globalSystemPrompt: parsed?.globalSystemPrompt?.trim() || DEFAULT_GLOBAL_PROMPT,
      scenarios: { ...DEFAULT_SCENARIO_PROMPTS, ...(parsed?.scenarios ?? {}) },
      updatedAt: parsed?.updatedAt ?? new Date().toISOString()
    };
  }

  savePrompts(input: AiPromptSaveInput): AiPromptConfig {
    const current = this.getPrompts();
    const next: AiPromptConfig = {
      globalSystemPrompt: input.globalSystemPrompt?.trim() || current.globalSystemPrompt,
      scenarios: { ...current.scenarios, ...(input.scenarios ?? {}) },
      updatedAt: new Date().toISOString()
    };
    this.indexDb.setConfigRecord('ai.prompts', JSON.stringify(next));
    return next;
  }

  listSkills(): AiSkillConfig[] {
    const configured = safeJson<AiSkillConfig[]>(this.indexDb.getConfigRecord('ai.skills') ?? '[]') ?? [];
    const byId = new Map(DEFAULT_SKILLS.map((skill) => [skill.id, skill]));
    for (const skill of configured) {
      byId.set(skill.id, { ...byId.get(skill.id), ...skill, builtIn: byId.get(skill.id)?.builtIn ?? false });
    }
    return [...byId.values()];
  }

  saveSkills(input: AiSkillSaveInput[]): AiSkillConfig[] {
    const current = new Map(this.listSkills().map((skill) => [skill.id, skill]));
    for (const item of input) {
      const id = sanitizeId(item.id);
      const existing = current.get(id);
      current.set(id, {
        id,
        name: item.name?.trim() || existing?.name || id,
        description: item.description?.trim() || existing?.description || '',
        enabled: Boolean(item.enabled),
        builtIn: existing?.builtIn ?? false
      });
    }
    const next = [...current.values()];
    this.indexDb.setConfigRecord('ai.skills', JSON.stringify(next));
    return next;
  }

  listHttpTools(): HttpToolConfig[] {
    return this.indexDb.listHttpTools();
  }

  saveHttpTool(input: HttpToolSaveInput): HttpToolConfig {
    const url = assertHttpUrl(input.url);
    const tool: HttpToolConfig = {
      id: input.id ? sanitizeId(input.id) : randomUUID(),
      name: input.name.trim().slice(0, 80),
      description: input.description?.trim().slice(0, 500) ?? '',
      url,
      method: input.method === 'GET' ? 'GET' : 'POST',
      headers: sanitizeHeaders(input.headers),
      enabled: Boolean(input.enabled),
      timeoutMs: clampNumber(input.timeoutMs, 1_000, 30_000, 10_000),
      updatedAt: new Date().toISOString()
    };
    this.indexDb.upsertHttpTool(tool);
    return tool;
  }

  deleteHttpTool(toolId: string): void {
    this.indexDb.deleteHttpTool(sanitizeId(toolId));
  }

  async testConnection(kind: 'llm' | 'embedding'): Promise<{ ok: boolean; message: string; provider?: string; model?: string }> {
    const config = kind === 'llm' ? this.getConfig().llm : this.getConfig().embedding;
    if (!config.enabled || !config.apiKeySet) {
      return { ok: false, message: `${kind} 未启用或未配置 API Key` };
    }

    try {
      if (kind === 'llm') {
        const result = await this.callLlm([{ role: 'user', content: '只返回 {"ok":true}' }], { maxTokens: 32 });
        return { ok: Boolean(result.content), message: '连接成功', provider: result.provider, model: result.model };
      }

      const vector = await this.embedText('连接测试');
      return { ok: vector.length > 0, message: '连接成功', provider: config.provider, model: config.model };
    } catch (error) {
      return { ok: false, message: summarizeError(error), provider: config.provider, model: config.model };
    }
  }

  async buildVectorIndex(projectId: string): Promise<RagBuildResult> {
    const startedAt = new Date().toISOString();
    const config = this.getConfig().embedding;
    if (!config.enabled || !config.apiKeySet) {
      const state: VectorIndexState = { status: 'degraded', projectId, dirty: true, updatedAt: startedAt, chunkCount: 0, embeddedCount: 0, warnings: ['Embedding 未配置，已跳过向量索引构建'] };
      this.indexDb.setVectorIndexState(state);
      return state;
    }

    this.indexDb.setVectorIndexState({ ...this.indexDb.getVectorIndexState(projectId), status: 'building', dirty: true, updatedAt: startedAt });
    const chunks = await this.collectChunks(projectId);
    let embeddedCount = 0;
    const records: VectorChunkInput[] = [];
    const warnings: string[] = [];

    for (const chunk of chunks) {
      try {
        const embedding = await this.embedText(chunk.text);
        records.push({ ...chunk, embedding });
        embeddedCount += 1;
      } catch (error) {
        warnings.push(`分块 ${chunk.entryId}:${chunk.chunkIndex} 嵌入失败：${summarizeError(error)}`);
      }
    }

    this.indexDb.replaceVectorChunks(projectId, records, config.model);
    const state: VectorIndexState = {
      projectId,
      status: warnings.length ? 'degraded' : records.length ? 'ready' : 'empty',
      dirty: warnings.length > 0,
      updatedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      embeddedCount,
      warnings
    };
    this.indexDb.setVectorIndexState(state);
    return state;
  }

  getVectorIndexState(projectId: string): VectorIndexState {
    return this.indexDb.getVectorIndexState(projectId);
  }

  async ragQuery(request: RagQueryRequest): Promise<RagQueryResult> {
    const topK = clampNumber(request.topK, 1, 20, 5);
    const maxContextChars = clampNumber(request.maxContextChars, 500, 20_000, 4_000);
    const mode = request.retrievalMode ?? 'hybrid';
    const warnings: string[] = [];
    const byKey = new Map<string, RetrievedContext>();

    if (mode !== 'vector') {
      for (const item of this.indexDb.search({ projectId: request.projectId, keyword: request.query, limit: topK })) {
        if (item.type === 'project') continue;
        if (request.filters?.entityTypes?.length && !request.filters.entityTypes.includes(item.type)) continue;
        byKey.set(`${item.id}:keyword`, {
          id: item.id,
          projectId: item.projectId,
          entityType: item.type,
          title: item.title,
          snippet: trimText(stripMarkup(item.excerpt), maxContextChars / topK),
          sourcePath: item.filePath,
          score: Math.abs(item.score ?? 0),
          matchReason: 'keyword',
          fields: ['title', 'summary', 'content']
        });
      }
    }

    if (mode !== 'fts') {
      const config = this.getConfig().embedding;
      if (!config.enabled || !config.apiKeySet) {
        warnings.push('Embedding 未配置，向量检索已降级为关键词检索');
      } else {
        try {
          const queryEmbedding = await this.embedText(request.query);
          for (const item of this.indexDb.searchVectorChunks({ projectId: request.projectId, embedding: queryEmbedding, topK, entityTypes: request.filters?.entityTypes })) {
            byKey.set(`${item.entryId}:vector:${item.chunkIndex}`, {
              id: item.entryId,
              projectId: item.projectId,
              entityType: item.entryType,
              title: item.title,
              snippet: trimText(item.text, maxContextChars / topK),
              sourcePath: item.sourcePath,
              score: item.score,
              matchReason: 'vector',
              fields: ['content']
            });
          }
        } catch (error) {
          warnings.push(`向量检索失败，已降级：${summarizeError(error)}`);
        }
      }
    }

    const contexts = [...byKey.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return { status: warnings.length ? 'degraded' : 'ok', query: request.query, contexts, warnings };
  }

  async enhancedValidation(request: AiValidationRequest, basic: ValidationResult): Promise<AiAgentResponse<AiValidationResult>> {
    const started = Date.now();
    const prompts = this.getPrompts();
    const contexts = await this.ragQuery({
      projectId: request.projectId,
      query: request.text.slice(0, 2_000),
      topK: request.topK ?? 5,
      retrievalMode: request.retrievalMode ?? 'hybrid',
      maxContextChars: 6_000
    });

    if (!this.canUseLlm()) {
      return {
        requestId: request.requestId ?? randomUUID(),
        status: 'degraded',
        warnings: ['LLM 未配置，已返回基础校验和 RAG 召回结果'],
        evidence: contexts.contexts,
        data: { validation: basic, aiFindings: [], mergedFindings: basic.findings }
      };
    }

    try {
      const result = await this.callLlm([
        { role: 'system', content: `${prompts.globalSystemPrompt}\n${prompts.scenarios.logic_check}` },
        { role: 'user', content: JSON.stringify({ text: request.text.slice(0, 20_000), basicFindings: basic.findings, contexts: contexts.contexts }) }
      ]);
      const parsed = extractJson<{ findings?: Partial<ValidationFinding>[] }>(result.content);
      const aiFindings = normalizeAiFindings(parsed?.findings ?? []);
      return {
        requestId: request.requestId ?? randomUUID(),
        status: 'ok',
        warnings: contexts.warnings,
        evidence: contexts.contexts,
        usage: { provider: result.provider, model: result.model, latencyMs: Date.now() - started },
        data: { validation: basic, aiFindings, mergedFindings: [...basic.findings, ...aiFindings] }
      };
    } catch (error) {
      return {
        requestId: request.requestId ?? randomUUID(),
        status: 'degraded',
        warnings: [`AI 增强校验失败，已降级为基础校验：${summarizeError(error)}`],
        evidence: contexts.contexts,
        data: { validation: basic, aiFindings: [], mergedFindings: basic.findings },
        error: { code: 'AI_VALIDATION_FAILED', message: summarizeError(error), recoverable: true }
      };
    }
  }

  async completeSetting(request: SettingCompletionRequest): Promise<AiAgentResponse<SettingCompletionResult>> {
    const contexts = await this.ragQuery({ projectId: request.projectId, query: request.draft, topK: request.topK ?? 5, retrievalMode: 'hybrid', maxContextChars: 5_000 });
    if (!this.canUseLlm()) {
      return degradedAgentResponse(request.requestId, 'LLM 未配置，无法执行设定补全', contexts.contexts);
    }

    try {
      const prompts = this.getPrompts();
      const result = await this.callLlm([
        { role: 'system', content: `${prompts.globalSystemPrompt}\n${prompts.scenarios.setting_completion}` },
        { role: 'user', content: JSON.stringify({ entityType: request.entityType, draft: request.draft, existingFields: request.existingFields ?? {}, contexts: contexts.contexts }) }
      ]);
      const data = extractJson<SettingCompletionResult>(result.content) ?? {
        proposedFields: {},
        missingQuestions: ['AI 返回内容无法解析，请手动补充设定。'],
        possibleConflicts: [],
        adoptionMode: 'manual_review_required'
      };
      return { requestId: request.requestId ?? randomUUID(), status: 'ok', warnings: contexts.warnings, evidence: contexts.contexts, data };
    } catch (error) {
      return errorAgentResponse(request.requestId, summarizeError(error), contexts.contexts);
    }
  }

  async foreshadowingReminder(projectId: string, text: string, requestId?: string): Promise<AiAgentResponse<{ reminders: ValidationFinding[] }>> {
    const contexts = await this.ragQuery({ projectId, query: text, filters: { entityTypes: ['plot'] }, topK: 8, retrievalMode: 'hybrid', maxContextChars: 4_000 });
    const reminders = contexts.contexts.map((context) => ({
      id: randomUUID(),
      category: 'plot-reminder' as const,
      severity: 'info' as const,
      entryId: context.id,
      entryType: 'plot' as const,
      title: context.title,
      rule: '相关未回收伏笔',
      message: `文本可能关联伏笔“${context.title}”，请确认是否需要推进或回收。`,
      suggestion: '如已经回收，请更新伏笔状态；如只是重复提及，请确认后续回收计划。',
      excerpt: context.snippet
    }));
    return { requestId: requestId ?? randomUUID(), status: contexts.warnings.length ? 'degraded' : 'ok', warnings: contexts.warnings, evidence: contexts.contexts, data: { reminders } };
  }

  async ragAnswer(request: RagQueryRequest): Promise<AiAgentResponse<{ answer: string; citations: RetrievedContext[] }>> {
    const contexts = await this.ragQuery(request);
    if (!this.canUseLlm()) {
      return {
        requestId: request.requestId ?? randomUUID(),
        status: 'degraded',
        warnings: ['LLM 未配置，仅返回检索上下文'],
        evidence: contexts.contexts,
        data: { answer: '未配置 LLM，暂不能生成回答。请参考召回的相关设定。', citations: contexts.contexts }
      };
    }

    try {
      const prompts = this.getPrompts();
      const result = await this.callLlm([
        { role: 'system', content: `${prompts.globalSystemPrompt}\n${prompts.scenarios.rag_qa}` },
        { role: 'user', content: JSON.stringify({ question: request.query, contexts: contexts.contexts }) }
      ]);
      const parsed = extractJson<{ answer?: string }>(result.content);
      return {
        requestId: request.requestId ?? randomUUID(),
        status: 'ok',
        warnings: contexts.warnings,
        evidence: contexts.contexts,
        data: { answer: parsed?.answer || result.content, citations: contexts.contexts }
      };
    } catch (error) {
      return errorAgentResponse(request.requestId, summarizeError(error), contexts.contexts);
    }
  }

  private canUseLlm(): boolean {
    const config = this.getConfig().llm;
    return config.enabled && config.apiKeySet;
  }

  private mergeModelConfig(key: string, input: NonNullable<AiConfigSaveInput['llm']>): Record<string, unknown> {
    const existing = safeJson<Record<string, unknown>>(this.indexDb.getConfigRecord(key) ?? '{}') ?? {};
    const next: Record<string, unknown> = {
      ...existing,
      enabled: Boolean(input.enabled),
      provider: input.provider ?? existing.provider ?? 'openai-compatible',
      baseUrl: input.baseUrl ? assertHttpUrl(input.baseUrl) : existing.baseUrl,
      model: input.model?.trim() || existing.model,
      timeoutMs: clampNumber(input.timeoutMs, 1_000, 120_000, Number(existing.timeoutMs ?? 30_000))
    };

    if (input.apiKey !== undefined) {
      next.encryptedApiKey = input.apiKey ? encrypt(input.apiKey, this.keyMaterial) : '';
    }

    return next;
  }

  private async callLlm(messages: LlmMessage[], options: { maxTokens?: number } = {}): Promise<LlmJsonResult> {
    const config = this.getConfig().llm;
    const apiKey = this.decryptApiKey('ai.llm');
    if (!config.enabled || !apiKey) {
      throw new Error('LLM 未配置');
    }

    const started = Date.now();
    const timeoutMs = config.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (config.provider === 'anthropic') {
        const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
        const userMessages = messages.filter((message) => message.role !== 'system');
        const response = await this.fetchImpl(joinUrl(config.baseUrl, '/messages'), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({ model: config.model, system, messages: userMessages, max_tokens: options.maxTokens ?? 1_000 }),
          signal: controller.signal
        });
        const json = await parseJsonResponse(response);
        const content = Array.isArray(json.content) ? json.content.map((item: { text?: string }) => item.text ?? '').join('\n') : '';
        return { content, provider: config.provider, model: config.model, latencyMs: Date.now() - started };
      }

      const response = await this.fetchImpl(joinUrl(config.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: config.model, messages, temperature: 0.2, max_tokens: options.maxTokens ?? 1_000 }),
        signal: controller.signal
      });
      const json = await parseJsonResponse(response);
      return { content: json.choices?.[0]?.message?.content ?? '', provider: config.provider, model: config.model, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }

  private async embedText(text: string): Promise<number[]> {
    const config = this.getConfig().embedding;
    const apiKey = this.decryptApiKey('ai.embedding');
    if (!config.enabled || !apiKey) {
      throw new Error('Embedding 未配置');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);
    try {
      const response = await this.fetchImpl(joinUrl(config.baseUrl, '/embeddings'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: config.model, input: text.slice(0, 8_000) }),
        signal: controller.signal
      });
      const json = await parseJsonResponse(response);
      const embedding = json.data?.[0]?.embedding;
      if (!Array.isArray(embedding)) {
        throw new Error('Embedding 响应缺少向量');
      }
      return embedding.map(Number).filter((value: number) => Number.isFinite(value));
    } finally {
      clearTimeout(timer);
    }
  }

  private decryptApiKey(key: string): string | undefined {
    const record = safeJson<Record<string, unknown>>(this.indexDb.getConfigRecord(key) ?? '{}');
    const encrypted = typeof record?.encryptedApiKey === 'string' ? record.encryptedApiKey : '';
    return encrypted ? decrypt(encrypted, this.keyMaterial) : undefined;
  }

  private async collectChunks(projectId: string): Promise<Omit<VectorChunkInput, 'embedding'>[]> {
    const entries = this.indexDb.listAllEntryRefs(projectId);
    const chunks: Omit<VectorChunkInput, 'embedding'>[] = [];

    for (const ref of entries) {
      const entry = (await this.fileStore.readEntry(projectId, ref.type, ref.id, 'json').catch(() => this.fileStore.readEntry(projectId, ref.type, ref.id, 'md'))).entry;
      const text = [entry.title, entry.summary, entry.content, entry.tags.join(' '), JSON.stringify(entry.customFields)].filter(Boolean).join('\n');
      splitText(text).forEach((chunkText, chunkIndex) => {
        chunks.push({
          projectId,
          entryId: entry.id,
          entryType: entry.type,
          title: entry.title,
          sourcePath: ref.filePath,
          chunkIndex,
          text: chunkText
        });
      });
    }

    return chunks;
  }
}

function normalizeModelConfig(record: string | undefined, fallbackProvider: AiConfig['llm']['provider'], fallbackBaseUrl: string, fallbackModel: string): AiConfig['llm'] {
  const parsed = safeJson<Record<string, unknown>>(record ?? '{}') ?? {};
  return {
    enabled: Boolean(parsed.enabled),
    provider: parsed.provider === 'anthropic' ? 'anthropic' : fallbackProvider,
    baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : fallbackBaseUrl,
    model: typeof parsed.model === 'string' && parsed.model ? parsed.model : fallbackModel,
    timeoutMs: clampNumber(Number(parsed.timeoutMs), 1_000, 120_000, 30_000),
    apiKeySet: typeof parsed.encryptedApiKey === 'string' && parsed.encryptedApiKey.length > 0
  };
}

function splitText(text: string, chunkSize = 900, overlap = 120): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += chunkSize - overlap) {
    chunks.push(normalized.slice(start, start + chunkSize));
    if (start + chunkSize >= normalized.length) break;
  }
  return chunks;
}

function deriveKey(scope: string): Buffer {
  const user = userInfo().username;
  return scryptSync(`${user}:${hostname()}:${scope}`, createHash('sha256').update(scope).digest('hex'), 32);
}

function encrypt(plainText: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(payload: string, key: Buffer): string {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function assertHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP/HTTPS URLs are allowed');
  }
  return url.toString().replace(/\/$/, '');
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function sanitizeId(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(value)) {
    throw new Error('Invalid id');
  }
  return value;
}

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (/^[a-zA-Z0-9-]{1,64}$/.test(key) && !/authorization|api-key|token|secret/i.test(key)) {
      result[key] = String(value).slice(0, 500);
    }
  }
  return result;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Number(value), min), max);
}

function safeJson<T>(text: string | undefined): T | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function extractJson<T>(text: string): T | undefined {
  const trimmed = text.trim();
  const direct = safeJson<T>(trimmed);
  if (direct) return direct;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? safeJson<T>(match[0]) : undefined;
}

function normalizeAiFindings(items: Partial<ValidationFinding>[]): ValidationFinding[] {
  return items.slice(0, 20).map((item) => ({
    id: item.id ?? randomUUID(),
    category: item.category ?? 'world-rule',
    severity: item.severity ?? 'warning',
    entryId: item.entryId ?? 'ai-generated',
    entryType: item.entryType ?? 'world',
    title: item.title ?? 'AI 增强发现',
    rule: item.rule ?? 'AI 推断',
    message: item.message ?? 'AI 提示存在潜在逻辑风险。',
    suggestion: item.suggestion,
    excerpt: item.excerpt,
    start: item.start,
    end: item.end
  }));
}

function stripMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, '');
}

function trimText(text: string, limit: number): string {
  const safeLimit = Math.max(100, Math.floor(limit));
  return text.length > safeLimit ? `${text.slice(0, safeLimit)}…` : text;
}

function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : 'Unknown error';
}

function degradedAgentResponse<T>(requestId: string | undefined, warning: string, evidence: RetrievedContext[]): AiAgentResponse<T> {
  return { requestId: requestId ?? randomUUID(), status: 'degraded', warnings: [warning], evidence };
}

function errorAgentResponse<T>(requestId: string | undefined, message: string, evidence: RetrievedContext[]): AiAgentResponse<T> {
  return { requestId: requestId ?? randomUUID(), status: 'error', warnings: [], evidence, error: { code: 'AI_CALL_FAILED', message, recoverable: true } };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] * a[index];
    bNorm += b[index] * b[index];
  }
  return aNorm && bNorm ? dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm)) : 0;
}
