import type { EntryFormat, EntryType, ProjectEntry } from '../../shared/storageTypes.js';

const FRONTMATTER_BOUNDARY = '---';

export function serializeEntry(entry: ProjectEntry): string {
  if (entry.format === 'markdown') {
    const metadata = { ...entry, content: undefined };
    return `${FRONTMATTER_BOUNDARY}\n${JSON.stringify(metadata, null, 2)}\n${FRONTMATTER_BOUNDARY}\n\n${entry.content}`;
  }

  return `${JSON.stringify(entry, null, 2)}\n`;
}

export function parseEntry(raw: string, fallbackFormat: EntryFormat): ProjectEntry {
  if (fallbackFormat === 'markdown') {
    return parseMarkdownEntry(raw);
  }

  return normalizeEntry(JSON.parse(raw) as ProjectEntry, fallbackFormat);
}

export function parseMarkdownEntry(raw: string): ProjectEntry {
  if (!raw.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    throw new Error('Markdown entry must start with JSON frontmatter');
  }

  const metadataStart = FRONTMATTER_BOUNDARY.length + 1;
  const metadataEnd = raw.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, metadataStart);

  if (metadataEnd < 0) {
    throw new Error('Markdown entry frontmatter is not closed');
  }

  const metadata = JSON.parse(raw.slice(metadataStart, metadataEnd)) as Omit<ProjectEntry, 'content'>;
  const content = raw.slice(metadataEnd + FRONTMATTER_BOUNDARY.length + 2).replace(/^\n/, '');

  return normalizeEntry({ ...metadata, content, format: 'markdown' } as ProjectEntry, 'markdown');
}

export function extensionToFormat(filePath: string): EntryFormat | undefined {
  const lower = filePath.toLowerCase();

  if (lower.endsWith('.json')) {
    return 'json';
  }

  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'markdown';
  }

  return undefined;
}

export function collectSearchableText(entry: ProjectEntry): string {
  const chunks = [JSON.stringify(entry), entry.title, entry.summary, entry.content, entry.tags.join(' ')];

  if (entry.type === 'character') {
    chunks.push(
      entry.role,
      entry.appearance,
      entry.abilities,
      entry.background,
      entry.personalityTags.join(' '),
      entry.redLines.join(' ')
    );
  }

  if (entry.type === 'world') {
    chunks.push(entry.category, entry.rules.join(' '));
  }

  if (entry.type === 'plot') {
    chunks.push(entry.setupChapter, entry.expectedPayoffChapter, entry.status, entry.relatedCharacters.join(' '));
  }

  chunks.push(Object.values(entry.customFields).join(' '));
  chunks.push(entry.relations.map((relation) => `${relation.targetType} ${relation.targetId} ${relation.label ?? ''}`).join(' '));

  return chunks.filter(Boolean).join('\n');
}

export function validateEntryType(type: string): type is EntryType {
  return type === 'character' || type === 'world' || type === 'plot';
}

function normalizeEntry(entry: ProjectEntry, fallbackFormat: EntryFormat): ProjectEntry {
  if (!validateEntryType(entry.type)) {
    throw new Error(`Unsupported entry type: ${(entry as { type?: string }).type ?? 'unknown'}`);
  }

  const normalizedBase = {
    ...entry,
    summary: entry.summary ?? '',
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    relations: Array.isArray(entry.relations) ? entry.relations : [],
    customFields: entry.customFields ?? {},
    format: entry.format ?? fallbackFormat
  };

  if (normalizedBase.type === 'character') {
    return {
      ...normalizedBase,
      role: normalizedBase.role ?? 'other',
      personalityTags: Array.isArray(normalizedBase.personalityTags) ? normalizedBase.personalityTags : [],
      redLines: Array.isArray(normalizedBase.redLines) ? normalizedBase.redLines : []
    };
  }

  if (normalizedBase.type === 'world') {
    return {
      ...normalizedBase,
      category: normalizedBase.category ?? 'other',
      rules: Array.isArray(normalizedBase.rules) ? normalizedBase.rules : []
    };
  }

  return {
    ...normalizedBase,
    status: normalizedBase.status ?? 'open',
    relatedCharacters: Array.isArray(normalizedBase.relatedCharacters) ? normalizedBase.relatedCharacters : []
  };
}
