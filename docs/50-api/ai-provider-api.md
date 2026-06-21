# AI Provider API

AI Provider 由用户在设置页配置，主进程 `AiService` 负责调用。

## LLM 配置

| 字段 | 说明 |
| --- | --- |
| `enabled` | 是否启用。 |
| `provider` | `openai-compatible` 或 Anthropic 风格 Provider。 |
| `baseUrl` | API Base URL。 |
| `model` | 默认模型名。 |
| `apiKey` | 保存时可传入，读取时不返回明文。 |
| `timeoutMs` | 超时时间。 |

## Embedding 配置

Embedding 与 LLM 独立配置，用于向量索引构建和向量检索。

## OpenAI 兼容接口

- Chat：`POST /chat/completions`
- Embedding：`POST /embeddings`

## Anthropic 风格接口

- Messages：`POST /messages`
- system prompt 与 messages 分离处理。

## 安全规则

- API Key 仅主进程可见。
- 读取配置只返回 `apiKeySet`。
- 请求超时由 AbortController 控制。
- 错误信息不回显密钥。
