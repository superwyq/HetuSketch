import type { AiProvider } from '../../storageTypes.js'

/**
 * Provider 配置对象，包含 provider 类型和 baseUrl。
 * 类型判断函数基于此对象进行判断。
 */
export interface ProviderConfig {
  provider: AiProvider
  baseUrl: string
}

/**
 * 判断是否为 Anthropic Provider。
 */
export function isAnthropicProvider(config: ProviderConfig): boolean {
  return config.provider === 'anthropic'
}

/**
 * 判断是否为 Ollama Provider。
 */
export function isOllamaProvider(config: ProviderConfig): boolean {
  return config.provider === 'ollama'
}

/**
 * 判断是否为 Gemini Provider。
 */
export function isGeminiProvider(config: ProviderConfig): boolean {
  return config.provider === 'gemini'
}

/**
 * 判断是否为 Azure OpenAI Provider。
 */
export function isAzureOpenAIProvider(config: ProviderConfig): boolean {
  return config.provider === 'azure-openai'
}

/**
 * 判断是否为原生 OpenAI Provider。
 */
export function isOpenAIProvider(config: ProviderConfig): boolean {
  return config.provider === 'openai'
}

/**
 * 判断是否为 DeepSeek Provider。
 */
export function isDeepSeekProvider(config: ProviderConfig): boolean {
  return config.provider === 'deepseek'
}

/**
 * 判断是否为 Qwen（通义千问）Provider。
 */
export function isQwenProvider(config: ProviderConfig): boolean {
  return config.provider === 'qwen'
}

/**
 * 判断是否为 OpenAI 兼容 Provider（通用兜底类型）。
 */
export function isOpenAICompatibleProvider(config: ProviderConfig): boolean {
  return config.provider === 'openai-compatible'
}
