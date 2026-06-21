import type { AiProvider, AiStreamChunk, ModelInfo } from '../../../shared/storageTypes.js'
import { formatProviderApiHost } from '../../../shared/aiCore/provider/providerConfig.js'
import {
  isAnthropicProvider,
  isOllamaProvider,
  isGeminiProvider,
  isAzureOpenAIProvider
} from '../../../shared/aiCore/provider/types.js'
import { withoutTrailingSlash } from '../../../shared/aiCore/utils.js'

/** fetch 函数类型 */
type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Provider 配置对象（用于类型判断函数） */
interface ProviderHint {
  provider: AiProvider
  baseUrl: string
}

// ---------------------------------------------------------------------------
// 请求/响应类型定义
// ---------------------------------------------------------------------------

export interface LlmRequestConfig {
  provider: AiProvider
  baseUrl: string
  model: string
  apiKey: string
  temperature?: number
  topP?: number
  maxTokens?: number
  timeoutMs?: number
  stream?: boolean
}

/** buildLlmRequest 返回的完整请求负载 */
export interface LlmRequestPayload {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** buildEmbeddingRequest 返回的完整请求负载 */
export interface EmbeddingRequestPayload {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** buildModelListRequest 返回的完整请求负载 */
export interface ModelListRequestPayload {
  url: string
  headers: Record<string, string>
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmResponse {
  content: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

export interface EmbeddingRequestConfig {
  provider: AiProvider
  baseUrl: string
  model: string
  apiKey: string
  timeoutMs?: number
}

export interface ModelListConfig {
  provider: AiProvider
  baseUrl: string
  apiKey: string
  timeoutMs?: number
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/** 格式化 baseUrl 并移除末尾斜杠 */
function formatHost(hint: ProviderHint): string {
  return withoutTrailingSlash(formatProviderApiHost(hint))
}

// ---------------------------------------------------------------------------
// LLM 请求构建
// ---------------------------------------------------------------------------

/** 构建非流式/流式 LLM 请求 URL */
export function buildLlmUrl(config: LlmRequestConfig): string {
  const hint: ProviderHint = { provider: config.provider, baseUrl: config.baseUrl }
  const host = formatHost(hint)

  if (isAnthropicProvider(hint)) {
    return `${host}/messages`
  }

  if (isAzureOpenAIProvider(hint)) {
    return `${host}/deployments/${encodeURIComponent(config.model)}/chat/completions?api-version=2024-02-15-preview`
  }

  if (isGeminiProvider(hint)) {
    const action = config.stream ? 'streamGenerateContent' : 'generateContent'
    const suffix = config.stream ? '&alt=sse' : ''
    return `${host}/models/${encodeURIComponent(config.model)}:${action}?key=${encodeURIComponent(config.apiKey)}${suffix}`
  }

  if (isOllamaProvider(hint)) {
    return `${host}/chat`
  }

  // openai / deepseek / qwen / openai-compatible
  return `${host}/chat/completions`
}

/** 构建 LLM 请求头（不含 content-type，由调用方补充） */
export function buildLlmHeaders(config: LlmRequestConfig): Record<string, string> {
  const hint: ProviderHint = { provider: config.provider, baseUrl: config.baseUrl }
  const headers: Record<string, string> = {}

  if (isAnthropicProvider(hint)) {
    headers['x-api-key'] = config.apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (isAzureOpenAIProvider(hint)) {
    headers['api-key'] = config.apiKey
  } else if (isGeminiProvider(hint)) {
    // Gemini 认证在 query 参数中，无需 header
  } else if (isOllamaProvider(hint)) {
    // Ollama 无需认证
  } else {
    // openai / deepseek / qwen / openai-compatible
    headers['authorization'] = `Bearer ${config.apiKey}`
  }

  return headers
}

/** 构建 LLM 请求体对象（Record），供 buildLlmBody 和 buildLlmRequest 复用 */
function buildLlmBodyRecord(config: LlmRequestConfig, messages: LlmMessage[], stream: boolean): Record<string, unknown> {
  const hint: ProviderHint = { provider: config.provider, baseUrl: config.baseUrl }

  if (isAnthropicProvider(hint)) {
    // Anthropic：system 单独提取，max_tokens 必填
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n')
    const userMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }))
    const body: Record<string, unknown> = {
      model: config.model,
      messages: userMessages,
      max_tokens: config.maxTokens ?? 1_000,
      stream
    }
    if (system) {
      body.system = system
    }
    if (config.temperature !== undefined) {
      body.temperature = config.temperature
    }
    if (config.topP !== undefined) {
      body.top_p = config.topP
    }
    return body
  }

  if (isGeminiProvider(hint)) {
    // Gemini：contents + systemInstruction + generationConfig
    const systemParts: Array<{ text: string }> = []
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = []
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push({ text: msg.content })
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        })
      }
    }
    const body: Record<string, unknown> = { contents }
    if (systemParts.length > 0) {
      body.systemInstruction = { parts: systemParts }
    }
    const generationConfig: Record<string, unknown> = {}
    if (config.temperature !== undefined) {
      generationConfig.temperature = config.temperature
    }
    if (config.topP !== undefined) {
      generationConfig.topP = config.topP
    }
    if (config.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = config.maxTokens
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig
    }
    return body
  }

  if (isOllamaProvider(hint)) {
    // Ollama：options 包含 temperature/top_p
    const body: Record<string, unknown> = {
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream
    }
    const options: Record<string, unknown> = {}
    if (config.temperature !== undefined) {
      options.temperature = config.temperature
    }
    if (config.topP !== undefined) {
      options.top_p = config.topP
    }
    if (Object.keys(options).length > 0) {
      body.options = options
    }
    return body
  }

  // openai / deepseek / qwen / openai-compatible / azure-openai
  const body: Record<string, unknown> = {
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: config.temperature ?? 0.2,
    stream
  }

  // Azure OpenAI 不在 body 中包含 model 字段
  if (!isAzureOpenAIProvider(hint)) {
    body.model = config.model
  }

  if (config.maxTokens !== undefined) {
    body.max_tokens = config.maxTokens
  }
  if (config.topP !== undefined) {
    body.top_p = config.topP
  }
  return body
}

/** 构建 LLM 请求体 JSON 字符串 */
export function buildLlmBody(config: LlmRequestConfig, messages: LlmMessage[]): string {
  return JSON.stringify(buildLlmBodyRecord(config, messages, config.stream ?? false))
}

/** 构建完整的 LLM 聊天请求（URL + headers + body） */
export function buildLlmRequest(config: LlmRequestConfig, messages: LlmMessage[], stream: boolean = false): LlmRequestPayload {
  const urlConfig: LlmRequestConfig = { ...config, stream }
  return {
    url: buildLlmUrl(urlConfig),
    headers: buildLlmHeaders(config),
    body: buildLlmBodyRecord(config, messages, stream)
  }
}

/** 解析非流式 LLM 响应 */
export function parseLlmResponse(provider: AiProvider, json: Record<string, unknown>): LlmResponse {
  const hint: ProviderHint = { provider, baseUrl: '' }

  if (isAnthropicProvider(hint)) {
    const contentParts = Array.isArray(json.content) ? (json.content as Array<{ text?: string }>) : []
    const content = contentParts.map((item) => item.text ?? '').join('')
    const usage = json.usage as { input_tokens?: number; output_tokens?: number } | undefined
    return {
      content,
      usage: usage
        ? { promptTokens: usage.input_tokens, completionTokens: usage.output_tokens }
        : undefined
    }
  }

  if (isGeminiProvider(hint)) {
    const candidates = Array.isArray(json.candidates) ? (json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>) : []
    const parts = candidates[0]?.content?.parts ?? []
    const content = parts.map((p) => p.text ?? '').join('')
    const usageMetadata = json.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined
    return {
      content,
      usage: usageMetadata
        ? { promptTokens: usageMetadata.promptTokenCount, completionTokens: usageMetadata.candidatesTokenCount }
        : undefined
    }
  }

  if (isOllamaProvider(hint)) {
    const message = json.message as { content?: string } | undefined
    const content = message?.content ?? ''
    const promptEvalCount = json.prompt_eval_count as number | undefined
    const evalCount = json.eval_count as number | undefined
    return {
      content,
      usage:
        promptEvalCount !== undefined || evalCount !== undefined
          ? { promptTokens: promptEvalCount, completionTokens: evalCount }
          : undefined
    }
  }

  // openai / deepseek / qwen / openai-compatible / azure-openai
  const choices = Array.isArray(json.choices) ? (json.choices as Array<{ message?: { content?: string } }>) : []
  const content = choices[0]?.message?.content ?? ''
  const usage = json.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined
  return {
    content,
    usage: usage
      ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens
        }
      : undefined
  }
}

// ---------------------------------------------------------------------------
// Embedding 请求构建
// ---------------------------------------------------------------------------

/** 构建 Embedding 请求 URL */
export function buildEmbeddingUrl(config: EmbeddingRequestConfig): string {
  const hint: ProviderHint = { provider: config.provider, baseUrl: config.baseUrl }

  if (isAnthropicProvider(hint)) {
    throw new Error('Anthropic 不支持 Embedding')
  }

  const host = formatHost(hint)

  if (isGeminiProvider(hint)) {
    return `${host}/models/${encodeURIComponent(config.model)}:embedContent?key=${encodeURIComponent(config.apiKey)}`
  }

  if (isOllamaProvider(hint)) {
    return `${host}/embeddings`
  }

  // openai / deepseek / qwen / openai-compatible / azure-openai
  return `${host}/embeddings`
}

/** 构建 Embedding 请求头（不含 content-type，由调用方补充） */
export function buildEmbeddingHeaders(config: EmbeddingRequestConfig): Record<string, string> {
  const hint: ProviderHint = { provider: config.provider, baseUrl: config.baseUrl }
  const headers: Record<string, string> = {}

  if (isAnthropicProvider(hint)) {
    throw new Error('Anthropic 不支持 Embedding')
  }

  if (isAzureOpenAIProvider(hint)) {
    headers['api-key'] = config.apiKey
  } else if (isGeminiProvider(hint) || isOllamaProvider(hint)) {
    // Gemini 认证在 query 中，Ollama 无需认证
  } else {
    headers['authorization'] = `Bearer ${config.apiKey}`
  }

  return headers
}

/** 构建 Embedding 请求体对象（Record），供 buildEmbeddingBody 和 buildEmbeddingRequest 复用 */
function buildEmbeddingBodyRecord(config: EmbeddingRequestConfig, text: string): Record<string, unknown> {
  const hint: ProviderHint = { provider: config.provider, baseUrl: config.baseUrl }

  if (isAnthropicProvider(hint)) {
    throw new Error('Anthropic 不支持 Embedding')
  }

  const truncatedText = text.slice(0, 8_000)

  if (isGeminiProvider(hint)) {
    return { content: { parts: [{ text: truncatedText }] } }
  }

  if (isOllamaProvider(hint)) {
    return { model: config.model, prompt: truncatedText }
  }

  // openai / deepseek / qwen / openai-compatible / azure-openai
  return { model: config.model, input: truncatedText }
}

/** 构建 Embedding 请求体 JSON 字符串 */
export function buildEmbeddingBody(config: EmbeddingRequestConfig, text: string): string {
  return JSON.stringify(buildEmbeddingBodyRecord(config, text))
}

/** 构建完整的 Embedding 请求（URL + headers + body） */
export function buildEmbeddingRequest(config: LlmRequestConfig, text: string): EmbeddingRequestPayload {
  const embConfig: EmbeddingRequestConfig = {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: config.apiKey,
    timeoutMs: config.timeoutMs
  }
  return {
    url: buildEmbeddingUrl(embConfig),
    headers: buildEmbeddingHeaders(embConfig),
    body: buildEmbeddingBodyRecord(embConfig, text)
  }
}

/** 解析 Embedding 响应，返回向量数组 */
export function parseEmbeddingResponse(provider: AiProvider, json: Record<string, unknown>): number[] {
  const hint: ProviderHint = { provider, baseUrl: '' }

  if (isAnthropicProvider(hint)) {
    throw new Error('Anthropic 不支持 Embedding')
  }

  if (isGeminiProvider(hint)) {
    const embedding = json.embedding as { values?: number[] } | undefined
    const values = embedding?.values
    if (!Array.isArray(values)) {
      throw new Error('Embedding 响应缺少向量')
    }
    return values.map(Number).filter((v) => Number.isFinite(v))
  }

  if (isOllamaProvider(hint)) {
    const embedding = json.embedding as number[] | undefined
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding 响应缺少向量')
    }
    return embedding.map(Number).filter((v) => Number.isFinite(v))
  }

  // openai / deepseek / qwen / openai-compatible / azure-openai
  const data = Array.isArray(json.data) ? (json.data as Array<{ embedding?: number[] }>) : []
  const embedding = data[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding 响应缺少向量')
  }
  return embedding.map(Number).filter((v) => Number.isFinite(v))
}

// ---------------------------------------------------------------------------
// 模型列表
// ---------------------------------------------------------------------------

/** 构建模型列表请求 URL */
function buildModelListUrl(provider: AiProvider, host: string, apiKey: string): string {
  const hint: ProviderHint = { provider, baseUrl: '' }

  if (isAzureOpenAIProvider(hint)) {
    return `${host}/models?api-version=2024-02-15-preview`
  }

  if (isGeminiProvider(hint)) {
    return `${host}/models?key=${encodeURIComponent(apiKey)}`
  }

  if (isOllamaProvider(hint)) {
    return `${host}/tags`
  }

  // openai / anthropic / deepseek / qwen / openai-compatible
  return `${host}/models`
}

/** 构建模型列表请求头 */
function buildModelListHeaders(provider: AiProvider, apiKey: string): Record<string, string> {
  const hint: ProviderHint = { provider, baseUrl: '' }
  const headers: Record<string, string> = {}

  if (isAnthropicProvider(hint)) {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (isAzureOpenAIProvider(hint)) {
    headers['api-key'] = apiKey
  } else if (isGeminiProvider(hint) || isOllamaProvider(hint)) {
    // Gemini 认证在 query 中，Ollama 无需认证
  } else {
    headers['authorization'] = `Bearer ${apiKey}`
  }

  return headers
}

/** 构建完整的模型列表请求（URL + headers） */
export function buildModelListRequest(config: LlmRequestConfig): ModelListRequestPayload {
  const hint: ProviderHint = { provider: config.provider, baseUrl: config.baseUrl }
  const host = formatHost(hint)
  return {
    url: buildModelListUrl(config.provider, host, config.apiKey),
    headers: buildModelListHeaders(config.provider, config.apiKey)
  }
}

/** 解析模型列表响应 */
export function parseModelListResponse(provider: AiProvider, json: Record<string, unknown>): ModelInfo[] {
  const hint: ProviderHint = { provider, baseUrl: '' }

  if (isGeminiProvider(hint)) {
    const models = Array.isArray(json.models) ? (json.models as Array<{ name?: string }>) : []
    return models
      .map((m) => {
        const name = m.name ?? ''
        // 去掉 "models/" 前缀
        return { id: name.startsWith('models/') ? name.slice(7) : name }
      })
      .filter((m) => m.id)
  }

  if (isOllamaProvider(hint)) {
    const models = Array.isArray(json.models) ? (json.models as Array<{ name?: string }>) : []
    return models
      .map((m) => ({ id: m.name ?? '' }))
      .filter((m) => m.id)
  }

  // openai / anthropic / deepseek / qwen / openai-compatible / azure-openai
  const data = Array.isArray(json.data) ? (json.data as Array<{ id?: string; owned_by?: string }>) : []
  return data
    .map((m) => ({ id: m.id ?? '', ownedBy: m.owned_by }))
    .filter((m) => m.id)
}

/** 拉取可用模型列表 */
export async function listModels(config: ModelListConfig, fetchImpl?: FetchFn): Promise<ModelInfo[]> {
  const hint: ProviderHint = { provider: config.provider, baseUrl: config.baseUrl }
  const host = formatHost(hint)
  const url = buildModelListUrl(config.provider, host, config.apiKey)
  const headers = buildModelListHeaders(config.provider, config.apiKey)
  const fetchFn = fetchImpl ?? fetch

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 30_000)

  try {
    const response = await fetchFn(url, { method: 'GET', headers, signal: controller.signal })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
    }
    const json = JSON.parse(text) as Record<string, unknown>
    return parseModelListResponse(config.provider, json)
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// 流式响应解析
// ---------------------------------------------------------------------------

/**
 * 解析单条流式数据（SSE data 负载或 NDJSON 行），返回 AiStreamChunk 或 null。
 * 调用方负责缓冲和分行，将完整的 data 负载传入此函数。
 */
export function parseStreamData(provider: AiProvider, data: string): AiStreamChunk | null {
  const hint: ProviderHint = { provider, baseUrl: '' }

  // OpenAI 兼容协议以 [DONE] 标记结束
  if (data === '[DONE]') {
    return { type: 'finish' }
  }

  let json: Record<string, unknown>
  try {
    json = JSON.parse(data) as Record<string, unknown>
  } catch {
    return null
  }

  if (isAnthropicProvider(hint)) {
    const type = json.type as string | undefined
    if (type === 'content_block_delta') {
      const delta = json.delta as { text?: string } | undefined
      return delta?.text ? { type: 'delta', content: delta.text } : null
    }
    if (type === 'message_delta') {
      const usage = json.usage as { output_tokens?: number } | undefined
      if (usage) {
        return { type: 'usage', usage: { completionTokens: usage.output_tokens } }
      }
      return null
    }
    if (type === 'message_start') {
      const message = json.message as { usage?: { input_tokens?: number } } | undefined
      if (message?.usage) {
        return { type: 'usage', usage: { promptTokens: message.usage.input_tokens } }
      }
      return null
    }
    if (type === 'message_stop') {
      return { type: 'finish' }
    }
    return null
  }

  if (isOllamaProvider(hint)) {
    const done = json.done as boolean | undefined
    if (done) {
      const promptEvalCount = json.prompt_eval_count as number | undefined
      const evalCount = json.eval_count as number | undefined
      return {
        type: 'finish',
        usage:
          promptEvalCount !== undefined || evalCount !== undefined
            ? { promptTokens: promptEvalCount, completionTokens: evalCount }
            : undefined
      }
    }
    const message = json.message as { content?: string } | undefined
    return message?.content ? { type: 'delta', content: message.content } : null
  }

  if (isGeminiProvider(hint)) {
    const candidates = Array.isArray(json.candidates)
      ? (json.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }>)
      : []
    const parts = candidates[0]?.content?.parts ?? []
    const text = parts.map((p) => p.text ?? '').join('')
    const usageMetadata = json.usageMetadata as
      | { promptTokenCount?: number; candidatesTokenCount?: number }
      | undefined
    if (usageMetadata) {
      return {
        type: 'usage',
        usage: {
          promptTokens: usageMetadata.promptTokenCount,
          completionTokens: usageMetadata.candidatesTokenCount
        }
      }
    }
    return text ? { type: 'delta', content: text } : null
  }

  // openai / deepseek / qwen / openai-compatible / azure-openai
  const choices = Array.isArray(json.choices)
    ? (json.choices as Array<{ delta?: { content?: string }; finish_reason?: string }>)
    : []
  const usage = json.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined

  if (usage) {
    return {
      type: 'usage',
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens
      }
    }
  }

  const deltaContent = choices[0]?.delta?.content
  if (deltaContent) {
    return { type: 'delta', content: deltaContent }
  }

  if (choices[0]?.finish_reason) {
    return { type: 'finish' }
  }

  return null
}

/** 判断指定 Provider 是否使用 SSE 流式格式（Ollama 使用 NDJSON） */
export function isSseProvider(provider: AiProvider): boolean {
  return !isOllamaProvider({ provider, baseUrl: '' })
}

/** parseStreamChunk 是 parseStreamData 的别名，用于从流式数据中解析 Chunk */
export { parseStreamData as parseStreamChunk }
