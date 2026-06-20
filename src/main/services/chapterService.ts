import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type {
  VolumeNode,
  ChapterNode,
  BookTree,
  VolumeCreateInput,
  VolumeUpdateInput,
  ChapterCreateInput,
  ChapterUpdateInput,
  ChapterMoveInput,
  ChapterStatus
} from '../../shared/storageTypes.js';
import {
  getStoragePaths,
  getBookRoot,
  getVolumeFilePath,
  assertSafeSegment,
  type StoragePaths
} from './storagePaths.js';
import type { BookService } from './bookService.js';

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[a-zA-Z0-9_]+/g) ?? []).length;
  return cjk + words;
}

export class ChapterService {
  private readonly paths: StoragePaths;
  private readonly bookService: BookService;

  constructor(bookService: BookService, paths?: StoragePaths) {
    this.paths = paths ?? getStoragePaths();
    this.bookService = bookService;
  }

  async listTree(bookId: string): Promise<BookTree> {
    const book = await this.bookService.get(bookId);
    const root = getBookRoot(this.paths, bookId);

    // Read volumes
    const volumesDir = join(root, 'volumes');
    const volumeFiles: string[] = [];
    try {
      const children = await readdir(volumesDir, { withFileTypes: true });
      for (const child of children) {
        if (child.isFile() && child.name.endsWith('.json')) {
          volumeFiles.push(join(volumesDir, child.name));
        }
      }
    } catch {
      // no volumes yet
    }

    const volumes: VolumeNode[] = [];
    for (const vf of volumeFiles) {
      try {
        volumes.push(await readJson<VolumeNode>(vf));
      } catch { /* skip */ }
    }
    volumes.sort((a, b) => a.order - b.order);

    // Read chapters
    const chaptersDir = join(root, 'chapters');
    const chapters: ChapterNode[] = [];
    try {
      const children = await readdir(chaptersDir, { withFileTypes: true });
      for (const child of children) {
        if (child.isFile() && child.name.endsWith('.md')) {
          const chapterId = child.name.replace(/\.md$/, '');
          assertSafeSegment(chapterId, 'chapterId');
          const metaPath = join(chaptersDir, child.name.replace(/\.md$/, '.json'));
          try {
            const meta = await readJson<{
              bookId: string; volumeId: string; title: string; summary?: string;
              order: number; targetWords?: number; status: ChapterStatus;
              relatedCharacterIds: string[]; relatedWorldEntryIds: string[];
              relatedPlotIds: string[]; createdAt: string; updatedAt: string;
            }>(metaPath);
            const content = await readFile(join(chaptersDir, child.name), 'utf8');
            chapters.push({
              id: chapterId,
              bookId: meta.bookId,
              volumeId: meta.volumeId,
              title: meta.title,
              summary: meta.summary,
              content,
              format: 'markdown',
              order: meta.order,
              targetWords: meta.targetWords,
              actualWords: countWords(content),
              status: meta.status,
              relatedCharacterIds: meta.relatedCharacterIds,
              relatedWorldEntryIds: meta.relatedWorldEntryIds,
              relatedPlotIds: meta.relatedPlotIds,
              createdAt: meta.createdAt,
              updatedAt: meta.updatedAt
            });
          } catch { /* skip */ }
        }
      }
    } catch { /* no chapters yet */ }

    chapters.sort((a, b) => a.order - b.order);

    return { book, volumes, chapters };
  }

  async createVolume(input: VolumeCreateInput): Promise<VolumeNode> {
    const now = new Date().toISOString();
    const tree = await this.listTree(input.bookId);
    const volume: VolumeNode = {
      id: input.id ?? `vol-${randomUUID().slice(0, 8)}`,
      bookId: input.bookId,
      title: input.title.trim(),
      summary: input.summary?.trim(),
      order: input.order ?? tree.volumes.length + 1,
      targetWords: input.targetWords,
      actualWords: 0,
      status: input.status ?? 'planning',
      createdAt: now,
      updatedAt: now
    };
    await writeJson(getVolumeFilePath(this.paths, input.bookId, volume.id), volume);
    return volume;
  }

  async updateVolume(input: VolumeUpdateInput): Promise<VolumeNode> {
    const filePath = getVolumeFilePath(this.paths, input.bookId, input.id);
    const current = await readJson<VolumeNode>(filePath);
    const next: VolumeNode = {
      ...current,
      title: input.title?.trim() ?? current.title,
      summary: input.summary !== undefined ? input.summary?.trim() : current.summary,
      order: input.order ?? current.order,
      targetWords: input.targetWords !== undefined ? input.targetWords : current.targetWords,
      status: input.status ?? current.status,
      updatedAt: new Date().toISOString()
    };
    await writeJson(filePath, next);
    return next;
  }

  async deleteVolume(bookId: string, volumeId: string): Promise<void> {
    const filePath = getVolumeFilePath(this.paths, bookId, volumeId);
    await unlink(filePath).catch(() => undefined);
  }

  async createChapter(input: ChapterCreateInput): Promise<ChapterNode> {
    const now = new Date().toISOString();
    const tree = await this.listTree(input.bookId);
    const siblings = tree.chapters.filter((c) => c.volumeId === input.volumeId);
    const chapterId = input.id ?? `ch-${randomUUID().slice(0, 8)}`;
    const content = input.content ?? '';

    const meta = {
      bookId: input.bookId,
      volumeId: input.volumeId,
      title: input.title.trim(),
      summary: input.summary?.trim(),
      order: input.order ?? siblings.length + 1,
      targetWords: input.targetWords,
      status: input.status ?? 'not_started',
      relatedCharacterIds: input.relatedCharacterIds ?? [],
      relatedWorldEntryIds: input.relatedWorldEntryIds ?? [],
      relatedPlotIds: input.relatedPlotIds ?? [],
      createdAt: now,
      updatedAt: now
    };

    const chaptersDir = join(getBookRoot(this.paths, input.bookId), 'chapters');
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(join(chaptersDir, `${chapterId}.md`), content, 'utf8');
    await writeJson(join(chaptersDir, `${chapterId}.json`), meta);

    return {
      id: chapterId,
      ...meta,
      content,
      format: 'markdown',
      actualWords: countWords(content)
    };
  }

  async updateChapter(input: ChapterUpdateInput): Promise<ChapterNode> {
    const tree = await this.listTree(input.bookId);
    const current = tree.chapters.find((c) => c.id === input.id);
    if (!current) throw new Error(`Chapter not found: ${input.id}`);

    const chaptersDir = join(getBookRoot(this.paths, input.bookId), 'chapters');
    const metaPath = join(chaptersDir, `${input.id}.json`);
    const mdPath = join(chaptersDir, `${input.id}.md`);

    const meta = await readJson<Record<string, unknown>>(metaPath);
    const nextMeta = {
      ...meta,
      volumeId: input.volumeId ?? meta.volumeId,
      title: input.title?.trim() ?? meta.title,
      summary: input.summary !== undefined ? input.summary?.trim() : meta.summary,
      order: input.order ?? meta.order,
      targetWords: input.targetWords !== undefined ? input.targetWords : meta.targetWords,
      status: input.status ?? meta.status,
      relatedCharacterIds: input.relatedCharacterIds ?? meta.relatedCharacterIds,
      relatedWorldEntryIds: input.relatedWorldEntryIds ?? meta.relatedWorldEntryIds,
      relatedPlotIds: input.relatedPlotIds ?? meta.relatedPlotIds,
      updatedAt: new Date().toISOString()
    };
    await writeJson(metaPath, nextMeta);

    if (input.content !== undefined) {
      await writeFile(mdPath, input.content, 'utf8');
    }

    const content = input.content ?? current.content;
    return {
      id: input.id,
      ...nextMeta as Omit<typeof nextMeta, 'actualWords'>,
      content,
      format: 'markdown',
      actualWords: countWords(content)
    } as ChapterNode;
  }

  async moveChapter(input: ChapterMoveInput): Promise<BookTree> {
    return this.updateChapter({
      bookId: input.bookId,
      id: input.chapterId,
      volumeId: input.volumeId,
      order: input.order
    }).then(() => this.listTree(input.bookId));
  }

  async deleteChapter(bookId: string, chapterId: string): Promise<void> {
    assertSafeSegment(chapterId, 'chapterId');
    const chaptersDir = join(getBookRoot(this.paths, bookId), 'chapters');
    await Promise.all([
      unlink(join(chaptersDir, `${chapterId}.md`)).catch(() => undefined),
      unlink(join(chaptersDir, `${chapterId}.json`)).catch(() => undefined)
    ]);
  }
}