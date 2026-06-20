import { randomUUID } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type {
  SettingSetManifest,
  SettingSetCreateInput,
  SettingSetUpdateInput,
  DeleteSettingSetStrategy
} from '../../shared/storageTypes.js';
import {
  getStoragePaths,
  getSettingSetRoot,
  getSettingSetManifestPath,
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

export class SettingSetService {
  private readonly paths: StoragePaths;

  constructor(paths?: StoragePaths) {
    this.paths = paths ?? getStoragePaths();
  }

  async list(): Promise<SettingSetManifest[]> {
    await mkdir(this.paths.settingSetsRoot, { recursive: true });
    const children = await readdir(this.paths.settingSetsRoot, { withFileTypes: true });
    const results: SettingSetManifest[] = [];

    for (const child of children) {
      if (!child.isDirectory()) continue;
      try {
        const manifest = await readJson<SettingSetManifest>(
          getSettingSetManifestPath(this.paths, child.name)
        );
        results.push(manifest);
      } catch {
        // skip invalid directories
      }
    }

    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<SettingSetManifest> {
    assertSafeSegment(id, 'settingSetId');
    const filePath = getSettingSetManifestPath(this.paths, id);
    return readJson<SettingSetManifest>(filePath);
  }

  async create(input: SettingSetCreateInput): Promise<SettingSetManifest> {
    const now = new Date().toISOString();
    const manifest: SettingSetManifest = {
      id: input.id ?? `set-${randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      summary: input.summary?.trim() ?? '',
      cover: input.cover,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      schemaVersion: 2
    };

    assertSafeSegment(manifest.id, 'settingSetId');
    const root = getSettingSetRoot(this.paths, manifest.id);
    await mkdir(join(root, 'characters'), { recursive: true });
    await mkdir(join(root, 'worlds'), { recursive: true });
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeJson(getSettingSetManifestPath(this.paths, manifest.id), manifest);
    return manifest;
  }

  async update(input: SettingSetUpdateInput): Promise<SettingSetManifest> {
    const current = await this.get(input.id);
    const next: SettingSetManifest = {
      ...current,
      name: input.name?.trim() ?? current.name,
      summary: input.summary?.trim() ?? current.summary,
      cover: input.cover !== undefined ? input.cover : current.cover,
      tags: input.tags ?? current.tags,
      updatedAt: new Date().toISOString()
    };
    await writeJson(getSettingSetManifestPath(this.paths, input.id), next);
    return next;
  }

  async delete(id: string, strategy: DeleteSettingSetStrategy): Promise<void> {
    void strategy;
    assertSafeSegment(id, 'settingSetId');
    const root = getSettingSetRoot(this.paths, id);
    await rm(root, { recursive: true, force: true });
  }
}