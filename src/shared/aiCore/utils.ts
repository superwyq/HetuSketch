/**
 * 匹配路径中的版本段（如 /v1、/v2beta），后面可跟 / 或字符串结尾。
 */
const VERSION_REGEX = /\/v\d+(?:alpha|beta)?(?:\/|$)/i

/**
 * 判断主机或路径字符串是否包含版本段（如 /v1、/v2beta）。
 */
export function hasAPIVersion(host?: string): boolean {
  if (!host) return false
  try {
    const url = new URL(host)
    return VERSION_REGEX.test(url.pathname)
  } catch {
    // 无法解析为完整 URL 时，直接作为路径测试
    return VERSION_REGEX.test(host)
  }
}

/**
 * 移除 URL 字符串末尾的斜杠。
 */
export function withoutTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

/**
 * 判断 URL 字符串是否以 '#' 结尾。
 */
export function isWithTrailingSharp<T extends string>(url: T): boolean {
  return url.endsWith('#')
}

/**
 * 移除 URL 字符串末尾的 '#'。
 */
export function withoutTrailingSharp<T extends string>(url: T): T {
  return url.replace(/#$/, '') as T
}

/**
 * 格式化 API 主机地址，规范化并按需追加 API 版本号。
 *
 * @param host - API 主机地址，会去除首尾空白和末尾斜杠
 * @param supportApiVersion - 是否支持追加 API 版本，默认 true
 * @param apiVersion - 要追加的 API 版本号，默认 'v1'
 * @returns 格式化后的 API 主机地址；若规范化后为空则返回空字符串。
 *          若地址以 '#' 结尾、不支持版本或已包含版本，则返回去除 '#' 后的规范化地址；
 *          否则返回追加了版本号的地址。
 */
export function formatApiHost(host?: string, supportApiVersion: boolean = true, apiVersion: string = 'v1'): string {
  const normalizedHost = withoutTrailingSlash((host ?? '').trim())
  if (!normalizedHost) {
    return ''
  }
  const shouldAppendApiVersion = !(normalizedHost.endsWith('#') || !supportApiVersion || hasAPIVersion(normalizedHost))
  if (shouldAppendApiVersion) {
    return `${normalizedHost}/${apiVersion}`
  } else {
    return withoutTrailingSharp(normalizedHost)
  }
}
