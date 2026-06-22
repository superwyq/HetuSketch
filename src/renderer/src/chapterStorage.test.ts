import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookManifest, BookTree, ChapterNode, VolumeNode } from '@shared/storageTypes';
import { migrateLegacyChapters } from './chapterStorage';

const now = '2026-01-01T00:00:00.000Z';

function book(id: string, title = '作品'): BookManifest {
  return { id, title, type: 'original', summary: '', status: 'drafting', createdAt: now, updatedAt: now, schemaVersion: 2 };
}

function volume(bookId: string, id: string, title: string, order: number): VolumeNode {
  return { id, bookId, title, order, actualWords: 0, status: 'drafting', createdAt: now, updatedAt: now };
}

function chapter(bookId: string, volumeId: string, id: string, title: string, order: number, content = ''): ChapterNode {
  return {
    id,
    bookId,
    volumeId,
    title,
    content,
    format: 'markdown',
    order,
    actualWords: content.length,
    status: 'drafting',
    relatedCharacterIds: [],
    relatedWorldEntryIds: [],
    relatedPlotIds: [],
    createdAt: now,
    updatedAt: now
  };
}

describe('migrateLegacyChapters', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy localStorage chapters into books, volumes and chapters once', async () => {
    const trees = new Map<string, BookTree>();
    const createBook = vi.fn(async (input: { id?: string; title: string }) => {
      const nextBook = book(input.id ?? 'book-1', input.title);
      trees.set(nextBook.id, { book: nextBook, volumes: [], chapters: [] });
      return nextBook;
    });
    const getBook = vi.fn(async (bookId: string) => {
      const tree = trees.get(bookId);
      if (!tree) throw new Error('not found');
      return tree.book;
    });
    const listTree = vi.fn(async (bookId: string) => {
      const tree = trees.get(bookId);
      if (!tree) throw new Error('not found');
      return tree;
    });
    const createVolume = vi.fn(async (input: { bookId: string; id?: string; title: string; order?: number }) => {
      const tree = trees.get(input.bookId);
      if (!tree) throw new Error('not found');
      const nextVolume = volume(input.bookId, input.id ?? 'vol-1', input.title, input.order ?? 1);
      tree.volumes.push(nextVolume);
      return nextVolume;
    });
    const updateVolume = vi.fn(async (input: { bookId: string; id: string; title?: string; order?: number }) => {
      const tree = trees.get(input.bookId);
      const current = tree?.volumes.find((item) => item.id === input.id);
      if (!current) throw new Error('not found');
      Object.assign(current, { title: input.title ?? current.title, order: input.order ?? current.order });
      return current;
    });
    const createChapter = vi.fn(async (input: { bookId: string; id?: string; volumeId: string; title: string; content?: string; order?: number; relatedPlotIds?: string[] }) => {
      const tree = trees.get(input.bookId);
      if (!tree) throw new Error('not found');
      const nextChapter = chapter(input.bookId, input.volumeId, input.id ?? 'ch-1', input.title, input.order ?? 1, input.content);
      nextChapter.relatedPlotIds = input.relatedPlotIds ?? [];
      tree.chapters.push(nextChapter);
      return nextChapter;
    });
    const updateChapter = vi.fn();

    window.hetuSketch.books.get = getBook;
    window.hetuSketch.books.create = createBook;
    window.hetuSketch.chapters.listTree = listTree;
    window.hetuSketch.chapters.createVolume = createVolume;
    window.hetuSketch.chapters.updateVolume = updateVolume;
    window.hetuSketch.chapters.createChapter = createChapter;
    window.hetuSketch.chapters.updateChapter = updateChapter;

    localStorage.setItem('hetusketch.iteration.chapters', JSON.stringify([
      { id: 'book-old', projectId: 'project-1', kind: 'book', title: '旧书', status: 'drafting', content: '', order: 0, plotIds: [], updatedAt: now },
      { id: 'volume-old', projectId: 'project-1', parentId: 'book-old', kind: 'volume', title: '旧卷', status: 'drafting', content: '', order: 0, plotIds: [], updatedAt: now },
      { id: 'chapter-old', projectId: 'project-1', parentId: 'volume-old', kind: 'chapter', title: '旧章', status: 'done', content: '旧正文', order: 0, plotIds: ['plot-1'], updatedAt: now }
    ]));

    const result = await migrateLegacyChapters([{ id: 'project-1', name: '作品一', type: 'original', summary: '', createdAt: now, updatedAt: now, schemaVersion: 1 }]);

    expect(result).toEqual({ migrated: true, projectCount: 1, volumeCount: 1, chapterCount: 1 });
    expect(createBook).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1', title: '旧书' }));
    expect(createVolume).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'project-1', id: 'volume-old', title: '旧卷', order: 1 }));
    expect(createChapter).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'project-1', id: 'chapter-old', volumeId: 'volume-old', title: '旧章', content: '旧正文', order: 1, relatedPlotIds: ['plot-1'] }));
    expect(localStorage.getItem('hetusketch.iteration.chapters')).not.toBeNull();
    expect(localStorage.getItem('hetusketch.iteration.chapters.migrated.v1')).toBe('1');

    await migrateLegacyChapters([{ id: 'project-1', name: '作品一', type: 'original', summary: '', createdAt: now, updatedAt: now, schemaVersion: 1 }]);
    expect(createChapter).toHaveBeenCalledTimes(1);
  });

  it('keeps legacy data and does not mark migration when migration fails', async () => {
    const legacy = JSON.stringify([
      { id: 'chapter-old', projectId: 'project-1', kind: 'chapter', title: '旧章', content: '旧正文', order: 0, plotIds: [], updatedAt: now }
    ]);
    localStorage.setItem('hetusketch.iteration.chapters', legacy);
    window.hetuSketch.books.get = vi.fn(async () => { throw new Error('not found'); });
    window.hetuSketch.books.create = vi.fn(async () => { throw new Error('disk full'); });

    await expect(migrateLegacyChapters([{ id: 'project-1', name: '作品一', type: 'original', summary: '', createdAt: now, updatedAt: now, schemaVersion: 1 }])).rejects.toThrow('disk full');

    expect(localStorage.getItem('hetusketch.iteration.chapters')).toBe(legacy);
    expect(localStorage.getItem('hetusketch.iteration.chapters.migrated.v1')).toBeNull();
  });
});
