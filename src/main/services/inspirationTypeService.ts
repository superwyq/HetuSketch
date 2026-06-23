import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InspirationTypeDefinition } from '../../shared/storageTypes.js';
import { assertSafeSegment, getInspirationTypesPath, type StoragePaths } from './storagePaths.js';

export const BUILT_IN_INSPIRATION_TYPES: InspirationTypeDefinition[] = [
  { id: 'character_setting', name: '人物设定', builtIn: true },
  { id: 'plot_setting', name: '剧情设定', builtIn: true },
  { id: 'world_setting', name: '世界观设定', builtIn: true }
];

export class InspirationTypeService {
  constructor(private readonly paths: StoragePaths) {}

  async list(projectId: string): Promise<InspirationTypeDefinition[]> {
    assertSafeSegment(projectId, 'projectId');
    return [...BUILT_IN_INSPIRATION_TYPES, ...(await this.readCustomTypes(projectId))];
  }

  async create(projectId: string, name: string): Promise<InspirationTypeDefinition> {
    assertSafeSegment(projectId, 'projectId');
    const now = new Date().toISOString();
    const next: InspirationTypeDefinition = {
      id: `custom-${randomUUID().slice(0, 12)}`,
      name: normalizeName(name),
      builtIn: false,
      projectId,
      createdAt: now,
      updatedAt: now
    };
    const customTypes = await this.readCustomTypes(projectId);
    await this.writeCustomTypes(projectId, [...customTypes, next]);
    return next;
  }

  async update(projectId: string, id: string, name: string): Promise<InspirationTypeDefinition> {
    assertSafeSegment(projectId, 'projectId');
    const customTypes = await this.readCustomTypes(projectId);
    const index = customTypes.findIndex((item) => item.id === id && !item.builtIn);
    if (index < 0) {
      throw new Error('Custom inspiration type not found');
    }
    const updated = { ...customTypes[index], name: normalizeName(name), updatedAt: new Date().toISOString() };
    customTypes[index] = updated;
    await this.writeCustomTypes(projectId, customTypes);
    return updated;
  }

  async delete(projectId: string, id: string): Promise<void> {
    assertSafeSegment(projectId, 'projectId');
    const customTypes = await this.readCustomTypes(projectId);
    await this.writeCustomTypes(projectId, customTypes.filter((item) => item.id !== id || item.builtIn));
  }

  private async readCustomTypes(projectId: string): Promise<InspirationTypeDefinition[]> {
    try {
      const raw = await readFile(getInspirationTypesPath(this.paths, projectId), 'utf8');
      const parsed = JSON.parse(raw) as InspirationTypeDefinition[];
      return Array.isArray(parsed) ? parsed.filter((item) => item && !item.builtIn && typeof item.id === 'string' && typeof item.name === 'string') : [];
    } catch {
      return [];
    }
  }

  private async writeCustomTypes(projectId: string, types: InspirationTypeDefinition[]): Promise<void> {
    const filePath = getInspirationTypesPath(this.paths, projectId);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(types, null, 2)}\n`, 'utf8');
  }
}

function normalizeName(name: string): string {
  const normalized = name.trim().slice(0, 40);
  if (!normalized) {
    throw new Error('Inspiration type name is required');
  }
  return normalized;
}
