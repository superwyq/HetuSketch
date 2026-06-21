import { formatApiHost, isWithTrailingSharp } from '../utils.js'
import type { ProviderConfig } from './types.js'
import { isAnthropicProvider, isAzureOpenAIProvider, isGeminiProvider, isOllamaProvider } from './types.js'
import { formatAzureOpenAIApiHost, formatOllamaApiHost } from './utils/api.js'

/**
 * 格式化并规范化 Provider 的 API 主机地址。
 * 根据 Provider 类型应用对应的 URL 格式化规则。
 */
export function formatProviderApiHost(config: ProviderConfig): string {
  const appendApiVersion = !isWithTrailingSharp(config.baseUrl)

  if (isAnthropicProvider(config)) {
    return formatApiHost(config.baseUrl, appendApiVersion)
  }

  if (isOllamaProvider(config)) {
    return formatOllamaApiHost(config.baseUrl)
  }

  if (isAzureOpenAIProvider(config)) {
    return formatAzureOpenAIApiHost(config.baseUrl)
  }

  if (isGeminiProvider(config)) {
    return formatApiHost(config.baseUrl, appendApiVersion, 'v1beta')
  }

  // 默认：OpenAI 兼容、DeepSeek、Qwen 等
  return formatApiHost(config.baseUrl, appendApiVersion)
}
