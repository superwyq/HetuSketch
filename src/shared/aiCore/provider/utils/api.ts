import { formatApiHost, withoutTrailingSlash } from '../../utils.js'

/**
 * 格式化 Ollama 的 API 主机地址。
 * 移除已有的 /v1、/api、/chat 后缀，再以 /api 为基础格式化。
 */
export function formatOllamaApiHost(host: string): string {
  const normalizedHost = withoutTrailingSlash(host)
    ?.replace(/\/v1$/, '')
    ?.replace(/\/api$/, '')
    ?.replace(/\/chat$/, '')
  return formatApiHost(normalizedHost + '/api', false)
}

/**
 * 格式化 Azure OpenAI 的 API 主机地址。
 * 移除已有的 /v1、/openai 后缀，再以 /openai 为基础格式化。
 */
export function formatAzureOpenAIApiHost(host: string): string {
  const normalizedHost = withoutTrailingSlash(host)
    ?.replace(/\/v1$/, '')
    .replace(/\/openai$/, '')
  return formatApiHost(normalizedHost + '/openai', false)
}
