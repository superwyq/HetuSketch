import type {
  EntryType,
  ProjectCreateInput,
  RagQueryRequest,
  SearchQuery,
  ValidationRequest
} from '../../shared/storageTypes.js';

export function isProjectCreateInput(input: unknown): input is ProjectCreateInput {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const candidate = input as { name?: unknown; type?: unknown };
  return typeof candidate.name === 'string' && (candidate.type === 'original' || candidate.type === 'fanfiction');
}

export function asObject<T extends object>(input: unknown): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid payload');
  }

  return input as T;
}

export function asArray<T>(input: unknown): T[] {
  if (!Array.isArray(input)) {
    throw new Error('Invalid array payload');
  }

  return input as T[];
}

export function asRequiredString(input: unknown, name: string): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error(`Invalid ${name}`);
  }

  return input.trim().slice(0, 128);
}

export function asOptionalString(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim().slice(0, 128) : undefined;
}

export function asOptionalLimit(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isFinite(input) ? Math.min(Math.max(Math.trunc(input), 1), 50) : undefined;
}

export function asEntryType(input: unknown): EntryType {
  if (input === 'character' || input === 'world' || input === 'plot') {
    return input;
  }

  throw new Error('Invalid entry type');
}

export function toSearchQuery(input: unknown): SearchQuery {
  const query = asObject<SearchQuery>(input);
  return {
    projectId: asOptionalString(query.projectId),
    keyword: typeof query.keyword === 'string' ? query.keyword.trim().slice(0, 120) : '',
    limit: asOptionalLimit(query.limit)
  };
}

export function asRagQueryRequest(input: unknown): RagQueryRequest {
  const request = asObject<RagQueryRequest>(input);
  if (typeof request.projectId !== 'string' || typeof request.query !== 'string') {
    throw new Error('Invalid RAG request');
  }

  return {
    ...request,
    projectId: request.projectId.trim().slice(0, 128),
    query: request.query.trim().slice(0, 10_000),
    topK: asOptionalLimit(request.topK),
    maxContextChars: typeof request.maxContextChars === 'number' ? Math.min(Math.max(Math.trunc(request.maxContextChars), 500), 20_000) : undefined,
    retrievalMode: request.retrievalMode === 'fts' || request.retrievalMode === 'vector' || request.retrievalMode === 'hybrid' ? request.retrievalMode : 'hybrid'
  };
}

export function asAiConnectionKind(input: unknown): 'llm' | 'embedding' {
  if (input === 'llm' || input === 'embedding') {
    return input;
  }
  throw new Error('Invalid AI connection kind');
}

export function asValidationRequest(input: unknown): ValidationRequest {
  const request = asObject<ValidationRequest>(input);
  if (typeof request.projectId !== 'string' || typeof request.text !== 'string') {
    throw new Error('Invalid validation request');
  }

  return {
    ...request,
    projectId: request.projectId.trim().slice(0, 128),
    text: request.text.slice(0, 50_000),
    characterIds: normalizeIdList(request.characterIds),
    worldEntryIds: normalizeIdList(request.worldEntryIds),
    includePlotReminders: request.includePlotReminders !== false
  };
}

function normalizeIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 128)).filter(Boolean);
}
