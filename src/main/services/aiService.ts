import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { isIP } from 'node:net';
import { hostname, userInfo } from 'node:os';
import { createRequire } from 'node:module';
import type {
  AiAgentResponse,
  AiConfig,
  AiConfigSaveInput,
  AgentConfig,
  AgentReorderInput,
  AgentSaveInput,
  AiPromptConfig,
  AiPromptSaveInput,
  AiProvider,
  AiSkillConfig,
  AiSkillSaveInput,
  AiStreamChunk,
  AiValidationRequest,
  AiValidationResult,
  HttpToolConfig,
  HttpToolSaveInput,
  ModelInfo,
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
import {
  buildLlmRequest,
  buildEmbeddingRequest,
  buildModelListRequest,
  isSseProvider,
  parseEmbeddingResponse,
  parseLlmResponse,
  parseModelListResponse,
  parseStreamChunk,
  type LlmMessage,
  type LlmRequestConfig
} from './aiCore/providerAdapter.js';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type SafeStorageLike = {
  isEncryptionAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
};

export interface AiServiceOptions {
  fetch?: FetchLike;
  encryptionScope?: string;
}

interface LlmJsonResult {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

const DEFAULT_GLOBAL_PROMPT = '你是 HetuSketch 的小说设定逻辑校验助手。只提供校验、提醒、补全建议，不代写正文。输出必须是可解析 JSON。';

const DEFAULT_SCENARIO_PROMPTS: AiPromptConfig['scenarios'] = {
  logic_check: '基于基础规则命中和召回设定，找出潜在逻辑冲突。返回 findings 数组，字段包含 category、severity、entryId、entryType、title、rule、message、suggestion、excerpt。',
  setting_completion: '根据草稿和已有设定补全结构化字段。只返回 proposedFields、missingQuestions、possibleConflicts、adoptionMode。',
  foreshadowing: '识别文本中涉及的未回收伏笔，提醒推进、冲突或遗忘风险。返回 reminders 数组。',
  rag_qa: '只依据提供的设定上下文回答问题。若上下文不足，请说明无法确认。返回 answer 与 citations。'
};

const HTTP_TOOL_MAX_REDIRECTS = 3;
const HTTP_TOOL_MAX_RESPONSE_BYTES = 64 * 1024;
const HTTP_TOOL_ALLOWED_MIME_TYPES = [
  'application/json',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/problem+json'
];
const HTTP_TOOL_AUDIT_LOG_LIMIT = 100;
const SAFE_STORAGE_PREFIX = 'safe:v1:';
const AES_GCM_PREFIX = 'aes-gcm:v1:';
const requireOptional = createRequire(import.meta.url);

const DEFAULT_SKILLS: AiSkillConfig[] = [
  { id: 'basic_rule_check', name: '基础规则校验', description: '本地匹配角色红线、世界观规则与伏笔', enabled: true, builtIn: true },
  { id: 'rag_search', name: 'RAG 检索', description: '召回相关设定片段作为 AI 上下文', enabled: true, builtIn: true },
  { id: 'setting_completion', name: '设定补全', description: '生成结构化设定字段建议', enabled: true, builtIn: true },
  { id: 'foreshadowing', name: '伏笔提醒', description: '提示未回收伏笔和相关风险', enabled: true, builtIn: true },
  { id: 'http_tools', name: 'HTTP 工具调用', description: '允许调用用户显式注册的 HTTP 回调工具', enabled: false, builtIn: true }
];

const DEFAULT_AGENTS: AgentConfig[] = [
  {
    id: 'agent-logic-check',
    name: '逻辑校验',
    description: '检查文本中的逻辑冲突与设定矛盾',
    systemPrompt: '',
    scenarios: { logic_check: DEFAULT_SCENARIO_PROMPTS.logic_check },
    model: '',
    temperature: 0.2,
    topP: 0.9,
    maxTokens: 1000,
    enabledSkills: [],
    enabledTools: [],
    order: 0,
    builtIn: true,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'agent-setting-completion',
    name: '设定补全',
    description: '基于已有设定补全角色/世界观细节',
    systemPrompt: '',
    scenarios: { setting_completion: DEFAULT_SCENARIO_PROMPTS.setting_completion },
    model: '',
    temperature: 0.4,
    topP: 0.9,
    maxTokens: 1500,
    enabledSkills: [],
    enabledTools: [],
    order: 1,
    builtIn: true,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'agent-rag-qa',
    name: 'RAG 问答',
    description: '基于向量检索的回答与素材查询',
    systemPrompt: '',
    scenarios: { rag_qa: DEFAULT_SCENARIO_PROMPTS.rag_qa },
    model: '',
    temperature: 0.3,
    topP: 0.9,
    maxTokens: 1000,
    enabledSkills: ['rag_search'],
    enabledTools: [],
    order: 2,
    builtIn: true,
    updatedAt: new Date().toISOString()
  }
];

export class AiService {
  private readonly fetchImpl: FetchLike;
  private readonly keyMaterial: Buffer;
  private readonly httpToolAuditLog: Array<{ timestamp: string; toolId: string; url: string; action: 'allow' | 'reject'; reason: string }> = [];

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
    const targetValidation = validateHttpToolTarget(url);
    if (!targetValidation.ok) {
      throw new Error(targetValidation.reason);
    }
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

  getHttpToolAuditLog(): Array<{ timestamp: string; toolId: string; url: string; action: 'allow' | 'reject'; reason: string }> {
    return [...this.httpToolAuditLog];
  }

  listAgents(): AgentConfig[] {
    const stored = safeJson<AgentConfig[]>(this.indexDb.getConfigRecord('agents') ?? '[]') ?? [];
    // Ensure default agents exist
    const defaults = DEFAULT_AGENTS;
    const byId = new Map(stored.map((a) => [a.id, a]));
    for (const def of defaults) {
      if (!byId.has(def.id)) {
        byId.set(def.id, def);
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.order - b.order);
  }

  getAgent(id: string): AgentConfig | null {
    return this.listAgents().find((a) => a.id === id) ?? null;
  }

  createAgent(input: AgentSaveInput): AgentConfig {
    const agents = this.listAgents();
    const id = input.id ? sanitizeId(input.id) : randomUUID();
    const now = new Date().toISOString();
    const agent: AgentConfig = {
      id,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      systemPrompt: input.systemPrompt ?? '',
      scenarios: input.scenarios ?? {},
      model: input.model ?? '',
      temperature: input.temperature ?? 0.2,
      topP: input.topP ?? 0.9,
      maxTokens: input.maxTokens ?? 1000,
      enabledSkills: input.enabledSkills ?? [],
      enabledTools: input.enabledTools ?? [],
      order: input.order ?? agents.length,
      builtIn: false,
      updatedAt: now
    };
    this.saveAgents([...agents, agent]);
    return agent;
  }

  updateAgent(input: AgentSaveInput): AgentConfig {
    if (!input.id) throw new Error('Agent id required');
    const agents = this.listAgents();
    const idx = agents.findIndex((a) => a.id === input.id);
    if (idx === -1) throw new Error(`Agent ${input.id} not found`);
    const existing = agents[idx];
    const updated: AgentConfig = {
      ...existing,
      name: input.name?.trim() ?? existing.name,
      description: input.description?.trim() ?? existing.description,
      systemPrompt: input.systemPrompt ?? existing.systemPrompt,
      scenarios: { ...existing.scenarios, ...(input.scenarios ?? {}) },
      model: input.model ?? existing.model,
      temperature: input.temperature ?? existing.temperature,
      topP: input.topP ?? existing.topP,
      maxTokens: input.maxTokens ?? existing.maxTokens,
      enabledSkills: input.enabledSkills ?? existing.enabledSkills,
      enabledTools: input.enabledTools ?? existing.enabledTools,
      updatedAt: new Date().toISOString()
    };
    agents[idx] = updated;
    this.saveAgents(agents);
    return updated;
  }

  deleteAgent(id: string): void {
    const agents = this.listAgents();
    const target = agents.find((a) => a.id === id);
    if (target?.builtIn) throw new Error('内置智能体不可删除');
    this.saveAgents(agents.filter((a) => a.id !== id));
  }

  reorderAgents(input: AgentReorderInput[]): AgentConfig[] {
    const agents = this.listAgents();
    const orderMap = new Map(input.map((i) => [i.id, i.order]));
    const reordered = agents.map((a) => ({ ...a, order: orderMap.get(a.id) ?? a.order }));
    reordered.sort((a, b) => a.order - b.order);
    // Re-assign sequential order
    reordered.forEach((a, i) => { a.order = i; });
    this.saveAgents(reordered);
    return reordered;
  }

  private saveAgents(agents: AgentConfig[]): void {
    this.indexDb.setConfigRecord('agents', JSON.stringify(agents));
  }

  async testConnection(kind: 'llm' | 'embedding', input?: AiConfigSaveInput['llm']): Promise<{ ok: boolean; message: string; provider?: string; model?: string }> {
    const stored = kind === 'llm' ? this.getConfig().llm : this.getConfig().embedding;
    const config = {
      ...stored,
      ...input,
      baseUrl: input?.baseUrl?.trim() || stored.baseUrl,
      model: input?.model?.trim() || stored.model
    };
    const apiKey = input?.apiKey?.trim() || this.decryptApiKey(kind === 'llm' ? 'ai.llm' : 'ai.embedding') || '';
    if (!config.enabled || (!apiKey && config.provider !== 'ollama')) {
      return { ok: false, message: `${kind} 未启用或未配置 API Key`, provider: config.provider, model: config.model };
    }

    try {
      if (kind === 'llm') {
        const requestConfig: LlmRequestConfig = {
          provider: config.provider,
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey,
          temperature: config.temperature,
          topP: config.topP,
          maxTokens: 32,
          timeoutMs: config.timeoutMs
        };
        const { url, headers, body } = buildLlmRequest(requestConfig, [{ role: 'user', content: '只返回 {"ok":true}' }], false);
        const response = await this.fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
        const parsed = parseLlmResponse(config.provider, await parseJsonResponse(response));
        return { ok: Boolean(parsed.content), message: '连接成功', provider: config.provider, model: config.model };
      }

      const requestConfig: LlmRequestConfig = {
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey,
        timeoutMs: config.timeoutMs
      };
      const { url, headers, body } = buildEmbeddingRequest(requestConfig, '连接测试');
      const response = await this.fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
      const vector = parseEmbeddingResponse(config.provider, await parseJsonResponse(response));
      return { ok: vector.length > 0, message: '连接成功', provider: config.provider, model: config.model };
    } catch (error) {
      return { ok: false, message: summarizeError(error), provider: config.provider, model: config.model };
    }
  }

  async listModels(kind: 'llm' | 'embedding', input?: AiConfigSaveInput['llm']): Promise<ModelInfo[]> {
    const stored = kind === 'llm' ? this.getConfig().llm : this.getConfig().embedding;
    const config = {
      ...stored,
      ...input,
      baseUrl: input?.baseUrl?.trim() || stored.baseUrl,
      model: input?.model?.trim() || stored.model
    };
    const apiKey = input?.apiKey?.trim() || this.decryptApiKey(kind === 'llm' ? 'ai.llm' : 'ai.embedding') || '';
    if (!apiKey && config.provider !== 'ollama') {
      throw new Error('请先填写或保存 API Key');
    }

    const requestConfig: LlmRequestConfig = {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey
    };
    const { url, headers } = buildModelListRequest(requestConfig);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);
    try {
      const response = await this.fetchImpl(url, { method: 'GET', headers, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
      }
      const json = JSON.parse(text) as Record<string, unknown>;
      return mergeModels(config.customModels ?? [], parseModelListResponse(config.provider, json));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('模型列表响应不是有效 JSON');
      }
      throw error;
    } finally {
      clearTimeout(timer);
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

    await runLimited(chunks, 4, async (chunk) => {
      try {
        const embedding = await this.embedText(chunk.text);
        records.push({ ...chunk, embedding });
        embeddedCount += 1;
      } catch (error) {
        warnings.push(`分块 ${chunk.entryId}:${chunk.chunkIndex} 嵌入失败：${summarizeError(error)}`);
      }
    });

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
    const ragEnabled = this.isSkillEnabled('rag_search');
    const contexts = ragEnabled
      ? await this.ragQuery({
          projectId: request.projectId,
          query: request.text.slice(0, 2_000),
          topK: request.topK ?? 5,
          retrievalMode: request.retrievalMode ?? 'hybrid',
          maxContextChars: 6_000
        })
      : { status: 'ok' as const, query: request.text.slice(0, 2_000), contexts: [] as RetrievedContext[], warnings: ['RAG 检索技能已禁用，跳过设定召回'] };

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
        usage: { provider: result.provider, model: result.model, latencyMs: Date.now() - started, promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens },
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
    if (!this.isSkillEnabled('setting_completion')) {
      return degradedAgentResponse(request.requestId, '设定补全技能已禁用', []);
    }
    const ragEnabled = this.isSkillEnabled('rag_search');
    const contexts = ragEnabled
      ? await this.ragQuery({ projectId: request.projectId, query: request.draft, topK: request.topK ?? 5, retrievalMode: 'hybrid', maxContextChars: 5_000 })
      : { status: 'ok' as const, query: request.draft, contexts: [] as RetrievedContext[], warnings: ['RAG 检索技能已禁用'] };
    if (!this.canUseLlm()) {
      return degradedAgentResponse(request.requestId, 'LLM 未配置，无法执行设定补全', contexts.contexts);
    }

    try {
      const prompts = this.getPrompts();
      const started = Date.now();
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
      return { requestId: request.requestId ?? randomUUID(), status: 'ok', warnings: contexts.warnings, evidence: contexts.contexts, usage: { provider: result.provider, model: result.model, latencyMs: Date.now() - started, promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens }, data };
    } catch (error) {
      return errorAgentResponse(request.requestId, summarizeError(error), contexts.contexts);
    }
  }

  async foreshadowingReminder(projectId: string, text: string, requestId?: string): Promise<AiAgentResponse<{ reminders: ValidationFinding[] }>> {
    if (!this.isSkillEnabled('foreshadowing')) {
      return {
        requestId: requestId ?? randomUUID(),
        status: 'ok',
        warnings: ['伏笔提醒技能已禁用'],
        evidence: [],
        data: { reminders: [] }
      };
    }

    const contexts = await this.ragQuery({
      projectId,
      query: text.slice(0, 2_000),
      filters: { entityTypes: ['plot'] },
      topK: 8,
      retrievalMode: 'hybrid',
      maxContextChars: 4_000
    });

    if (!this.canUseLlm()) {
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
      return {
        requestId: requestId ?? randomUUID(),
        status: contexts.warnings.length ? 'degraded' : 'ok',
        warnings: ['LLM 未配置，仅返回 RAG 检索的伏笔提醒', ...contexts.warnings],
        evidence: contexts.contexts,
        data: { reminders }
      };
    }

    try {
      const prompts = this.getPrompts();
      const result = await this.callLlm([
        { role: 'system', content: `${prompts.globalSystemPrompt}\n${prompts.scenarios.foreshadowing}` },
        { role: 'user', content: JSON.stringify({ text: text.slice(0, 20_000), contexts: contexts.contexts }) }
      ]);
      const parsed = extractJson<{ reminders?: Partial<ValidationFinding>[] }>(result.content);
      const reminders = normalizeAiFindings(parsed?.reminders ?? []).map((r) => ({
        ...r,
        category: 'plot-reminder' as const
      }));
      return {
        requestId: requestId ?? randomUUID(),
        status: 'ok',
        warnings: contexts.warnings,
        evidence: contexts.contexts,
        usage: { provider: result.provider, model: result.model, promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens, latencyMs: result.latencyMs },
        data: { reminders }
      };
    } catch (error) {
      return errorAgentResponse(requestId, summarizeError(error), contexts.contexts);
    }
  }

  async ragAnswer(request: RagQueryRequest): Promise<AiAgentResponse<{ answer: string; citations: RetrievedContext[] }>> {
    const ragEnabled = this.isSkillEnabled('rag_search');
    const contexts = ragEnabled
      ? await this.ragQuery(request)
      : { status: 'ok' as const, query: request.query, contexts: [] as RetrievedContext[], warnings: ['RAG 检索技能已禁用，仅基于 LLM 自身知识回答'] };
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
      const started = Date.now();
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
        usage: { provider: result.provider, model: result.model, latencyMs: Date.now() - started, promptTokens: result.usage?.promptTokens, completionTokens: result.usage?.completionTokens },
        data: { answer: parsed?.answer || result.content, citations: contexts.contexts }
      };
    } catch (error) {
      return errorAgentResponse(request.requestId, summarizeError(error), contexts.contexts);
    }
  }

  async *streamValidation(request: AiValidationRequest, basic: ValidationResult): AsyncGenerator<AiStreamChunk> {
    const contexts = this.isSkillEnabled('rag_search')
      ? await this.ragQuery({
          projectId: request.projectId,
          query: request.text.slice(0, 2_000),
          topK: request.topK ?? 5,
          retrievalMode: request.retrievalMode ?? 'hybrid',
          maxContextChars: 6_000
        })
      : { status: 'ok' as const, query: request.text.slice(0, 2_000), contexts: [] as RetrievedContext[], warnings: [] as string[] };

    if (!this.canUseLlm()) {
      yield { type: 'error', error: 'LLM 未配置' };
      return;
    }

    const prompts = this.getPrompts();
    for await (const chunk of this.callLlmStream(
      [
        { role: 'system', content: `${prompts.globalSystemPrompt}\n${prompts.scenarios.logic_check}` },
        { role: 'user', content: JSON.stringify({ text: request.text.slice(0, 20_000), basicFindings: basic.findings, contexts: contexts.contexts }) }
      ],
      { maxTokens: 2_000 }
    )) {
      yield chunk;
    }
  }

  async *streamRagAnswer(request: RagQueryRequest): AsyncGenerator<AiStreamChunk> {
    const contexts = this.isSkillEnabled('rag_search')
      ? await this.ragQuery(request)
      : { status: 'ok' as const, query: request.query, contexts: [] as RetrievedContext[], warnings: [] as string[] };

    if (!this.canUseLlm()) {
      yield { type: 'error', error: 'LLM 未配置' };
      return;
    }

    const prompts = this.getPrompts();
    for await (const chunk of this.callLlmStream(
      [
        { role: 'system', content: `${prompts.globalSystemPrompt}\n${prompts.scenarios.rag_qa}` },
        { role: 'user', content: JSON.stringify({ question: request.query, contexts: contexts.contexts }) }
      ],
      { maxTokens: 2_000 }
    )) {
      yield chunk;
    }
  }

  async *streamCompleteSetting(request: SettingCompletionRequest): AsyncGenerator<AiStreamChunk> {
    if (!this.isSkillEnabled('setting_completion')) {
      yield { type: 'error', error: '设定补全技能已禁用' };
      return;
    }
    const contexts = this.isSkillEnabled('rag_search')
      ? await this.ragQuery({ projectId: request.projectId, query: request.draft, topK: request.topK ?? 5, retrievalMode: 'hybrid', maxContextChars: 5_000 })
      : { status: 'ok' as const, query: request.draft, contexts: [] as RetrievedContext[], warnings: [] as string[] };

    if (!this.canUseLlm()) {
      yield { type: 'error', error: 'LLM 未配置' };
      return;
    }

    const prompts = this.getPrompts();
    for await (const chunk of this.callLlmStream(
      [
        { role: 'system', content: `${prompts.globalSystemPrompt}\n${prompts.scenarios.setting_completion}` },
        { role: 'user', content: JSON.stringify({ entityType: request.entityType, draft: request.draft, existingFields: request.existingFields ?? {}, contexts: contexts.contexts }) }
      ],
      { maxTokens: 2_000 }
    )) {
      yield chunk;
    }
  }

  isLlmReady(): boolean {
    return this.canUseLlm();
  }

  generateText(messages: LlmMessage[], options: { maxTokens?: number } = {}): Promise<LlmJsonResult> {
    return this.callLlm(messages, options);
  }

  streamText(messages: LlmMessage[], options: { maxTokens?: number } = {}): AsyncGenerator<AiStreamChunk> {
    return this.callLlmStream(messages, options);
  }

  async *streamForeshadowingReminder(projectId: string, text: string, _requestId?: string): AsyncGenerator<AiStreamChunk> {
    if (!this.isSkillEnabled('foreshadowing')) {
      yield { type: 'error', error: '伏笔提醒技能已禁用' };
      return;
    }
    const contexts = await this.ragQuery({ projectId, query: text.slice(0, 2_000), filters: { entityTypes: ['plot'] }, topK: 8, retrievalMode: 'hybrid', maxContextChars: 4_000 });
    if (!this.canUseLlm()) {
      yield { type: 'error', error: 'LLM 未配置' };
      return;
    }
    const prompts = this.getPrompts();
    for await (const chunk of this.callLlmStream([
      { role: 'system', content: `${prompts.globalSystemPrompt}\n${prompts.scenarios.foreshadowing}` },
      { role: 'user', content: JSON.stringify({ text: text.slice(0, 20_000), contexts: contexts.contexts }) }
    ], { maxTokens: 2_000 })) {
      yield chunk;
    }
  }

  private canUseLlm(): boolean {
    const config = this.getConfig().llm;
    return config.enabled && config.apiKeySet;
  }

  private isSkillEnabled(skillId: string): boolean {
    return this.listSkills().some((s) => s.id === skillId && s.enabled);
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

    if (input.temperature !== undefined) {
      next.temperature = clampNumber(input.temperature, 0, 2, 0.2);
    }
    if (input.topP !== undefined) {
      next.topP = clampNumber(input.topP, 0, 1, 0.9);
    }
    if (input.maxTokens !== undefined) {
      next.maxTokens = clampNumber(input.maxTokens, 1, 32_000, 1_000);
    }
    if (input.customModels !== undefined) {
      next.customModels = normalizeModelList(input.customModels);
    }

    if (input.apiKey !== undefined) {
      next.encryptedApiKey = input.apiKey ? encryptSecret(input.apiKey, this.keyMaterial) : '';
    }

    return next;
  }

  private async callLlm(messages: LlmMessage[], options: { maxTokens?: number } = {}): Promise<LlmJsonResult> {
    const config = this.getConfig().llm;
    const apiKey = this.decryptApiKey('ai.llm');
    if (!config.enabled || !apiKey) {
      throw new Error('LLM 未配置');
    }

    const tools = this.buildHttpTools();
    if (tools.length > 0 && isOpenAiCompatibleProvider(config.provider)) {
      return this.callLlmWithTools(messages, options, tools);
    }

    const started = Date.now();
    const requestConfig: LlmRequestConfig = {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: options.maxTokens ?? config.maxTokens,
      timeoutMs: config.timeoutMs
    };

    const { url, headers, body } = buildLlmRequest(requestConfig, messages, false);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const json = await parseJsonResponse(response);
      const parsed = parseLlmResponse(config.provider, json);
      return { content: parsed.content, provider: config.provider, model: config.model, latencyMs: Date.now() - started, usage: parsed.usage };
    } finally {
      clearTimeout(timer);
    }
  }

  private async *callLlmStream(messages: LlmMessage[], options: { maxTokens?: number } = {}): AsyncGenerator<AiStreamChunk> {
    const config = this.getConfig().llm;
    const apiKey = this.decryptApiKey('ai.llm');
    if (!config.enabled || !apiKey) {
      throw new Error('LLM 未配置');
    }

    const requestConfig: LlmRequestConfig = {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: options.maxTokens ?? config.maxTokens,
      timeoutMs: config.timeoutMs
    };

    const { url, headers, body } = buildLlmRequest(requestConfig, messages, true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取流式响应');

      const decoder = new TextDecoder();
      let buffer = '';
      const sse = isSseProvider(config.provider);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let data: string;
          if (sse) {
            if (!trimmed.startsWith('data:')) continue;
            data = trimmed.slice(5).trim();
            if (data === '[DONE]') {
              yield { type: 'finish' };
              return;
            }
          } else {
            data = trimmed;
          }
          const chunk = parseStreamChunk(config.provider, data);
          if (chunk) yield chunk;
        }
      }
      yield { type: 'finish' };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildHttpTools(): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    if (!this.isSkillEnabled('http_tools')) return [];
    const tools = this.indexDb.listHttpTools().filter((t) => t.enabled);
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.id,
        description: tool.description || tool.name,
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: `输入参数，将作为 ${tool.method} 请求的 body` }
          }
        }
      }
    }));
  }

  private async executeHttpTool(toolCallId: string, args: string): Promise<string> {
    const tools = this.indexDb.listHttpTools();
    const tool = tools.find((t) => t.id === toolCallId);
    if (!tool) return JSON.stringify({ error: `Tool ${toolCallId} not found` });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), tool.timeoutMs);
    try {
      let currentUrl = assertHttpUrl(tool.url);
      for (let redirectCount = 0; redirectCount <= HTTP_TOOL_MAX_REDIRECTS;) {
        const validation = validateHttpToolTarget(currentUrl);
        if (!validation.ok) {
          this.auditHttpTool(tool.id, currentUrl, 'reject', validation.reason);
          return JSON.stringify({ error: validation.reason });
        }

        const init: RequestInit = {
          method: tool.method,
          headers: { 'content-type': 'application/json', ...tool.headers },
          redirect: 'manual',
          signal: controller.signal
        };
        if (tool.method === 'POST') {
          init.body = args;
        }

        this.auditHttpTool(tool.id, currentUrl, 'allow', 'request');
        const response = await this.fetchImpl(currentUrl, init);
        if (isRedirectStatus(response.status)) {
          const location = response.headers.get('location');
          if (!location) {
            const reason = `HTTP 工具重定向缺少 Location: ${response.status}`;
            this.auditHttpTool(tool.id, currentUrl, 'reject', reason);
            return JSON.stringify({ error: reason });
          }
          if (redirectCount >= HTTP_TOOL_MAX_REDIRECTS) {
            const reason = 'HTTP 工具重定向次数过多';
            this.auditHttpTool(tool.id, currentUrl, 'reject', reason);
            return JSON.stringify({ error: reason });
          }
          const nextUrl = new URL(location, currentUrl).toString();
          const redirectValidation = validateHttpToolRedirect(currentUrl, nextUrl);
          if (!redirectValidation.ok) {
            this.auditHttpTool(tool.id, nextUrl, 'reject', redirectValidation.reason);
            return JSON.stringify({ error: redirectValidation.reason });
          }
          redirectCount += 1;
          currentUrl = nextUrl;
          continue;
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!isAllowedHttpToolMime(contentType)) {
          const reason = `HTTP 工具响应 MIME 不被允许: ${contentType || 'unknown'}`;
          this.auditHttpTool(tool.id, currentUrl, 'reject', reason);
          return JSON.stringify({ error: reason });
        }
        const text = await readLimitedResponseText(response, HTTP_TOOL_MAX_RESPONSE_BYTES);
        return text.slice(0, 4_000);
      }

      const reason = 'HTTP 工具重定向次数过多';
      this.auditHttpTool(tool.id, tool.url, 'reject', reason);
      return JSON.stringify({ error: reason });
    } catch (error) {
      const reason = summarizeError(error);
      this.auditHttpTool(tool.id, tool.url, 'reject', reason);
      return JSON.stringify({ error: reason });
    } finally {
      clearTimeout(timer);
    }
  }

  private auditHttpTool(toolId: string, url: string, action: 'allow' | 'reject', reason: string): void {
    const entry = { timestamp: new Date().toISOString(), toolId, url, action, reason };
    this.httpToolAuditLog.push(entry);
    if (this.httpToolAuditLog.length > HTTP_TOOL_AUDIT_LOG_LIMIT) {
      this.httpToolAuditLog.splice(0, this.httpToolAuditLog.length - HTTP_TOOL_AUDIT_LOG_LIMIT);
    }
    if (action === 'reject') {
      console.warn('[AiService] HTTP tool request rejected', entry);
    }
  }

  private async callLlmWithTools(
    messages: LlmMessage[],
    options: { maxTokens?: number },
    tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>
  ): Promise<LlmJsonResult> {
    const config = this.getConfig().llm;
    const apiKey = this.decryptApiKey('ai.llm');
    if (!config.enabled || !apiKey) {
      throw new Error('LLM 未配置');
    }

    const requestConfig: LlmRequestConfig = {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: options.maxTokens ?? config.maxTokens,
      timeoutMs: config.timeoutMs
    };

    const { url, headers } = buildLlmRequest(requestConfig, messages, false);
    const isAzure = config.provider === 'azure-openai';
    const messageHistory: Array<Record<string, unknown>> = messages.map((m) => ({ role: m.role, content: m.content }));
    const started = Date.now();
    let lastContent = '';
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let hasUsage = false;

    for (let round = 0; round < 3; round += 1) {
      const body: Record<string, unknown> = {
        messages: messageHistory,
        temperature: config.temperature ?? 0.2,
        stream: false,
        tools
      };
      if (!isAzure) {
        body.model = config.model;
      }
      const maxTokens = options.maxTokens ?? config.maxTokens;
      if (maxTokens !== undefined) {
        body.max_tokens = maxTokens;
      }
      if (config.topP !== undefined) {
        body.top_p = config.topP;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);
      let json: Record<string, unknown>;
      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        json = await parseJsonResponse(response);
      } finally {
        clearTimeout(timer);
      }

      const choices = Array.isArray(json.choices) ? (json.choices as Array<Record<string, unknown>>) : [];
      const choice = choices[0] ?? {};
      const message = (choice.message ?? {}) as Record<string, unknown>;
      lastContent = typeof message.content === 'string' ? message.content : '';

      const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
      if (usage) {
        hasUsage = true;
        totalPromptTokens += usage.prompt_tokens ?? 0;
        totalCompletionTokens += usage.completion_tokens ?? 0;
      }

      const toolCalls = Array.isArray(message.tool_calls) ? (message.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>) : undefined;
      if (!toolCalls?.length) {
        break;
      }

      messageHistory.push({
        role: 'assistant',
        content: lastContent || null,
        tool_calls: toolCalls
      });

      for (const tc of toolCalls) {
        const toolResult = await this.executeHttpTool(tc.function.name, tc.function.arguments);
        messageHistory.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: toolResult
        });
      }
    }

    return {
      content: lastContent,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - started,
      usage: hasUsage ? { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens } : undefined
    };
  }

  private async embedText(text: string): Promise<number[]> {
    const config = this.getConfig().embedding;
    const apiKey = this.decryptApiKey('ai.embedding');
    if (!config.enabled || !apiKey) {
      throw new Error('Embedding 未配置');
    }

    const requestConfig: LlmRequestConfig = {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey,
      timeoutMs: config.timeoutMs
    };

    const { url, headers, body } = buildEmbeddingRequest(requestConfig, text);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const json = await parseJsonResponse(response);
      return parseEmbeddingResponse(config.provider, json);
    } finally {
      clearTimeout(timer);
    }
  }

  private decryptApiKey(key: string): string | undefined {
    const record = safeJson<Record<string, unknown>>(this.indexDb.getConfigRecord(key) ?? '{}');
    const encrypted = typeof record?.encryptedApiKey === 'string' ? record.encryptedApiKey : '';
    return encrypted ? decryptSecret(encrypted, this.keyMaterial) : undefined;
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

async function runLimited<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
}

function normalizeModelConfig(record: string | undefined, fallbackProvider: AiConfig['llm']['provider'], fallbackBaseUrl: string, fallbackModel: string): AiConfig['llm'] {
  const parsed = safeJson<Record<string, unknown>>(record ?? '{}') ?? {};
  return {
    enabled: Boolean(parsed.enabled),
    provider: (parsed.provider as AiProvider) ?? fallbackProvider,
    baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : fallbackBaseUrl,
    model: typeof parsed.model === 'string' && parsed.model ? parsed.model : fallbackModel,
    timeoutMs: clampNumber(Number(parsed.timeoutMs), 1_000, 120_000, 30_000),
    apiKeySet: typeof parsed.encryptedApiKey === 'string' && parsed.encryptedApiKey.length > 0,
    temperature: parsed.temperature !== undefined ? clampNumber(Number(parsed.temperature), 0, 2, 0.2) : undefined,
    topP: parsed.topP !== undefined ? clampNumber(Number(parsed.topP), 0, 1, 0.9) : undefined,
    maxTokens: parsed.maxTokens !== undefined ? clampNumber(Number(parsed.maxTokens), 1, 32_000, 1_000) : undefined,
    customModels: normalizeModelList(parsed.customModels)
  };
}

function normalizeModelList(value: unknown): ModelInfo[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, ModelInfo>();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id.trim().slice(0, 200) : '';
    if (!id) continue;
    const name = typeof record.name === 'string' ? record.name.trim().slice(0, 200) : undefined;
    const ownedBy = typeof record.ownedBy === 'string' ? record.ownedBy.trim().slice(0, 120) : undefined;
    const source = record.source === 'remote' ? 'remote' : 'manual';
    byId.set(id, { id, name: name || id, ownedBy, source });
  }
  return [...byId.values()];
}

function mergeModels(customModels: ModelInfo[], remoteModels: ModelInfo[]): ModelInfo[] {
  const merged = new Map<string, ModelInfo>();
  for (const model of remoteModels) {
    merged.set(model.id, { ...model, name: model.name || model.id, source: 'remote' });
  }
  for (const model of customModels) {
    merged.set(model.id, { ...merged.get(model.id), ...model, name: model.name || model.id, source: model.source ?? 'manual' });
  }
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function isOpenAiCompatibleProvider(provider: AiProvider): boolean {
  return provider === 'openai' || provider === 'openai-compatible' || provider === 'deepseek' || provider === 'qwen' || provider === 'azure-openai';
}

function splitText(text: string, chunkSize = 900, overlap = 120): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.split(/(?<=[。！？；\n.!?])/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if (trimmedSentence.length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = currentChunk.slice(-overlap);
      }
      for (let i = 0; i < trimmedSentence.length; i += chunkSize - overlap) {
        chunks.push(trimmedSentence.slice(i, i + chunkSize));
      }
      currentChunk = '';
      continue;
    }

    if (currentChunk.length + trimmedSentence.length <= chunkSize) {
      currentChunk += trimmedSentence;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = trimmedSentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function deriveKey(scope: string): Buffer {
  const user = userInfo().username;
  return scryptSync(`${user}:${hostname()}:${scope}`, createHash('sha256').update(scope).digest('hex'), 32);
}

function encryptSecret(plainText: string, key: Buffer): string {
  const safeStorage = getSafeStorage();
  if (safeStorage?.isEncryptionAvailable()) {
    try {
      return `${SAFE_STORAGE_PREFIX}${safeStorage.encryptString(plainText).toString('base64')}`;
    } catch (error) {
      console.warn('[AiService] safeStorage encryption failed, falling back to AES-GCM', summarizeError(error));
    }
  }
  return `${AES_GCM_PREFIX}${encryptAesGcm(plainText, key)}`;
}

function decryptSecret(payload: string, key: Buffer): string {
  if (payload.startsWith(SAFE_STORAGE_PREFIX)) {
    const safeStorage = getSafeStorage();
    if (!safeStorage?.isEncryptionAvailable()) {
      throw new Error('Electron safeStorage is unavailable for this encrypted key');
    }
    return safeStorage.decryptString(Buffer.from(payload.slice(SAFE_STORAGE_PREFIX.length), 'base64'));
  }
  if (payload.startsWith(AES_GCM_PREFIX)) {
    return decryptAesGcm(payload.slice(AES_GCM_PREFIX.length), key);
  }
  // 兼容历史版本未带前缀的 AES-GCM 密文。
  return decryptAesGcm(payload, key);
}

function encryptAesGcm(plainText: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptAesGcm(payload: string, key: Buffer): string {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function getSafeStorage(): SafeStorageLike | undefined {
  try {
    const electron = requireOptional('electron') as { safeStorage?: SafeStorageLike };
    return electron.safeStorage;
  } catch {
    return undefined;
  }
}

function assertHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP/HTTPS URLs are allowed');
  }
  return url.toString().replace(/\/$/, '');
}

function validateHttpToolTarget(value: string): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'HTTP 工具 URL 无效' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'HTTP 工具仅允许 HTTP/HTTPS URL' };
  }

  const hostname = stripHostnameBrackets(url.hostname).toLowerCase();
  const normalizedIp = normalizeIpLiteral(hostname);
  if (!hostname || isBlockedHostname(hostname)) {
    return { ok: false, reason: `HTTP 工具目标被阻断: ${hostname || 'empty-host'}` };
  }

  if (normalizedIp && isBlockedIp(normalizedIp)) {
    return { ok: false, reason: `HTTP 工具目标被阻断: ${hostname}` };
  }

  return { ok: true };
}

function validateHttpToolRedirect(fromUrl: string, toUrl: string): { ok: true } | { ok: false; reason: string } {
  let from: URL;
  let to: URL;
  try {
    from = new URL(fromUrl);
    to = new URL(toUrl);
  } catch {
    return { ok: false, reason: 'HTTP 工具重定向 URL 无效' };
  }

  const targetValidation = validateHttpToolTarget(to.toString());
  if (!targetValidation.ok) return targetValidation;

  if (from.protocol !== to.protocol || from.hostname.toLowerCase() !== to.hostname.toLowerCase() || getEffectivePort(from) !== getEffectivePort(to)) {
    return { ok: false, reason: `HTTP 工具禁止跨域重定向: ${from.origin} -> ${to.origin}` };
  }
  return { ok: true };
}

function stripHostnameBrackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.metadata.google.internal')
  );
}

function normalizeIpLiteral(hostname: string): string | undefined {
  if (isIP(hostname)) return hostname;
  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    const value = Number.parseInt(hostname.slice(2), 16);
    return Number.isFinite(value) ? intToIpv4(value) : undefined;
  }
  if (/^\d+$/.test(hostname)) {
    const value = Number.parseInt(hostname, 10);
    return Number.isFinite(value) ? intToIpv4(value) : undefined;
  }
  const ipv4Parts = hostname.split('.');
  if (ipv4Parts.length > 1 && ipv4Parts.length < 4 && ipv4Parts.every((part) => /^\d+$/.test(part))) {
    const parts = ipv4Parts.map((part) => Number.parseInt(part, 10));
    if (parts.every((part) => Number.isInteger(part) && part >= 0)) {
      if (parts.length === 2 && parts[0] <= 255 && parts[1] <= 0xffffff) return `${parts[0]}.${(parts[1] >> 16) & 255}.${(parts[1] >> 8) & 255}.${parts[1] & 255}`;
      if (parts.length === 3 && parts[0] <= 255 && parts[1] <= 255 && parts[2] <= 0xffff) return `${parts[0]}.${parts[1]}.${(parts[2] >> 8) & 255}.${parts[2] & 255}`;
    }
  }
  return undefined;
}

function intToIpv4(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) return undefined;
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return false;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
  const value = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
  return (
    inIpv4Range(value, '0.0.0.0', 8) ||
    inIpv4Range(value, '10.0.0.0', 8) ||
    inIpv4Range(value, '100.64.0.0', 10) ||
    inIpv4Range(value, '127.0.0.0', 8) ||
    inIpv4Range(value, '169.254.0.0', 16) ||
    inIpv4Range(value, '172.16.0.0', 12) ||
    inIpv4Range(value, '192.168.0.0', 16)
  );
}

function inIpv4Range(value: number, base: string, prefix: number): boolean {
  const baseParts = base.split('.').map((part) => Number.parseInt(part, 10));
  const baseValue = ((baseParts[0] << 24) >>> 0) + (baseParts[1] << 16) + (baseParts[2] << 8) + baseParts[3];
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

function isBlockedIpv6(ip: string): boolean {
  const expanded = expandIpv6(ip);
  if (!expanded) return true;
  const first = Number.parseInt(expanded[0], 16);
  const isLoopback = expanded.slice(0, 7).every((part) => part === '0000') && expanded[7] === '0001';
  const isUnspecified = expanded.every((part) => part === '0000');
  const isUniqueLocal = (first & 0xfe00) === 0xfc00;
  const isLinkLocal = (first & 0xffc0) === 0xfe80;
  const ipv4Mapped = expanded.slice(0, 5).every((part) => part === '0000') && expanded[5] === 'ffff';
  if (ipv4Mapped) {
    const high = Number.parseInt(expanded[6], 16);
    const low = Number.parseInt(expanded[7], 16);
    const mapped = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    return isBlockedIpv4(mapped);
  }
  return isLoopback || isUnspecified || isUniqueLocal || isLinkLocal;
}

function expandIpv6(ip: string): string[] | undefined {
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  if (ip.split('::').length > 2) return undefined;
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) return undefined;
  const parts = ip.includes('::') ? [...headParts, ...Array(missing).fill('0'), ...tailParts] : headParts;
  if (parts.length !== 8) return undefined;
  return parts.map((part) => part.padStart(4, '0'));
}

function getEffectivePort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === 'https:' ? '443' : '80';
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isAllowedHttpToolMime(contentType: string): boolean {
  const mime = contentType.split(';', 1)[0].trim().toLowerCase();
  return HTTP_TOOL_ALLOWED_MIME_TYPES.includes(mime) || mime.endsWith('+json');
}

async function readLimitedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`HTTP 工具响应超过大小限制: ${contentLength} > ${maxBytes}`);
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error(`HTTP 工具响应超过大小限制: > ${maxBytes}`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`HTTP 工具响应超过大小限制: ${total} > ${maxBytes}`);
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
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
  if (error instanceof Error) {
    const msg = error.message;
    return msg.length > 500 ? `${msg.slice(0, 500)}…` : msg;
  }
  return 'Unknown error';
}

function degradedAgentResponse<T>(requestId: string | undefined, warning: string, evidence: RetrievedContext[]): AiAgentResponse<T> {
  return { requestId: requestId ?? randomUUID(), status: 'degraded', warnings: [warning], evidence };
}

function errorAgentResponse<T>(requestId: string | undefined, message: string, evidence: RetrievedContext[]): AiAgentResponse<T> {
  return { requestId: requestId ?? randomUUID(), status: 'error', warnings: [], evidence, error: { code: 'AI_CALL_FAILED', message, recoverable: true } };
}
