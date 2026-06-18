import { describe, expect, it } from 'vitest';
import type { ProjectEntry } from '../../shared/storageTypes.js';
import { collectSearchableText, extensionToFormat, parseEntry, parseMarkdownEntry, serializeEntry } from './entrySerialization.js';

const baseEntry: ProjectEntry = {
  id: 'char-lingxi',
  projectId: 'book-one',
  type: 'character',
  title: '林溪',
  summary: '冷静的主角',
  content: '林溪持有星盘，可以读取河图碎片。',
  tags: ['主角', '河图'],
  relations: [{ targetId: 'world-stars', targetType: 'world', label: '受星盘规则约束' }],
  customFields: { 口头禅: '先验算，再行动' },
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
  format: 'json',
  role: 'protagonist',
  appearance: '黑衣少年',
  personalityTags: ['冷静'],
  abilities: '星盘推演',
  background: '来自边城',
  redLines: ['绝不背叛同伴']
};

describe('entrySerialization', () => {
  it('serializes and parses JSON entries without dropping structured fields', () => {
    const raw = serializeEntry(baseEntry);
    const parsed = parseEntry(raw, 'json');

    expect(parsed).toEqual(baseEntry);
    expect(raw).toContain('绝不背叛同伴');
  });

  it('serializes markdown entries as JSON frontmatter plus content', () => {
    const markdownEntry: ProjectEntry = {
      ...baseEntry,
      format: 'markdown',
      content: '# 角色正文\n\n林溪不会背叛同伴。'
    };

    const raw = serializeEntry(markdownEntry);
    const parsed = parseMarkdownEntry(raw);

    expect(raw.startsWith('---\n')).toBe(true);
    expect(raw).not.toContain('"content"');
    expect(raw).toContain(markdownEntry.content);
    expect(parsed).toMatchObject({ id: markdownEntry.id, format: 'markdown', content: markdownEntry.content });
  });

  it('normalizes missing optional fields for imported legacy entries', () => {
    const raw = JSON.stringify({
      id: 'world-rules',
      projectId: 'book-one',
      type: 'world',
      title: '星盘规则',
      content: '星盘不能复活死者。',
      createdAt: '2026-06-18T00:00:00.000Z',
      updatedAt: '2026-06-18T00:00:00.000Z'
    });

    expect(parseEntry(raw, 'json')).toMatchObject({
      type: 'world',
      summary: '',
      tags: [],
      relations: [],
      customFields: {},
      format: 'json',
      category: 'other',
      rules: []
    });
  });

  it('collects searchable text from domain fields, relations and custom fields', () => {
    const searchable = collectSearchableText(baseEntry);

    expect(searchable).toContain('林溪');
    expect(searchable).toContain('绝不背叛同伴');
    expect(searchable).toContain('星盘推演');
    expect(searchable).toContain('受星盘规则约束');
    expect(searchable).toContain('先验算，再行动');
  });

  it('maps supported file extensions to entry formats', () => {
    expect(extensionToFormat('characters/a.json')).toBe('json');
    expect(extensionToFormat('worlds/a.md')).toBe('markdown');
    expect(extensionToFormat('plots/a.markdown')).toBe('markdown');
    expect(extensionToFormat('assets/a.txt')).toBeUndefined();
  });
});
