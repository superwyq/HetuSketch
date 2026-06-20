import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type {
  BookManifest,
  BookCreateInput,
  BookUpdateInput,
  BookBindingResult
} from '../../shared/storageTypes.js';
import {
  getStoragePaths,
  getBookRoot,
  getBookManifestPath,
  assertSafeSegment,
  type StoragePaths
} from './storagePaths.js';

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export class BookService {
  private readonly paths: StoragePaths;

  constructor(paths?: StoragePaths) {
    this.paths = paths ?? getStoragePaths();
  }

  async list(): Promise<BookManifest[]> {
    await mkdir(this.paths.booksRoot, { recursive: true });
    const children = await readdir(this.paths.booksRoot, { withFileTypes: true });
    const results: BookManifest[] = [];

    for (const child of children) {
      if (!child.isDirectory()) continue;
      try {
        const manifest = await readJson<BookManifest>(
          getBookManifestPath(this.paths, child.name)
        );
        results.push(manifest);
      } catch {
        // skip invalid directories
      }
    }

    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(bookId: string): Promise<BookManifest> {
    assertSafeSegment(bookId, 'bookId');
    return readJson<BookManifest>(getBookManifestPath(this.paths, bookId));
  }

  async create(input: BookCreateInput): Promise<BookManifest> {
    const now = new Date().toISOString();
    const manifest: BookManifest = {
      id: input.id ?? `book-${randomUUID().slice(0, 8)}`,
      settingSetId: input.settingSetId,
      title: input.title.trim(),
      subtitle: input.subtitle,
      type: input.type ?? 'original',
      summary: input.summary?.trim() ?? '',
      cover: input.cover,
      targetWords: input.targetWords,
      status: input.status ?? 'planning',
      createdAt: now,
      updatedAt: now,
      schemaVersion: 2
    };

    assertSafeSegment(manifest.id, 'bookId');
    const root = getBookRoot(this.paths, manifest.id);
    await mkdir(join(root, 'volumes'), { recursive: true });
    await mkdir(join(root, 'chapters'), { recursive: true });
    await mkdir(join(root, 'characters'), { recursive: true });
    await mkdir(join(root, 'worlds'), { recursive: true });
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeJson(getBookManifestPath(this.paths, manifest.id), manifest);
    return manifest;
  }

  async update(input: BookUpdateInput): Promise<BookManifest> {
    const current = await this.get(input.id);
    const next: BookManifest = {
      ...current,
      title: input.title?.trim() ?? current.title,
      subtitle: input.subtitle !== undefined ? input.subtitle : current.subtitle,
      settingSetId: input.settingSetId !== undefined ? input.settingSetId : current.settingSetId,
      type: input.type ?? current.type,
      summary: input.summary?.trim() ?? current.summary,
      cover: input.cover !== undefined ? input.cover : current.cover,
      targetWords: input.targetWords !== undefined ? input.targetWords : current.targetWords,
      status: input.status ?? current.status,
      updatedAt: new Date().toISOString()
    };
    await writeJson(getBookManifestPath(this.paths, input.id), next);
    return next;
  }

  async delete(bookId: string): Promise<void> {
    assertSafeSegment(bookId, 'bookId');
    const root = getBookRoot(this.paths, bookId);
    await rm(root, { recursive: true, force: true });
  }

  async bindSettingSet(bookId: string, settingSetId?: string): Promise<BookBindingResult> {
    const current = await this.get(bookId);
    const next: BookManifest = {
      ...current,
      settingSetId,
      updatedAt: new Date().toISOString()
    };
    await writeJson(getBookManifestPath(this.paths, bookId), next);
    return {
      book: next,
      conflictCount: 0,
      warnings: settingSetId ? [] : ['设定集绑定已解除']
    };
  }
}