import { join, normalize, relative, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { app } from 'electron';
import type { EntryType, ProjectManifest } from '../../shared/storageTypes.js';

export const ENTRY_DIR_BY_TYPE: Record<EntryType, string> = {
  character: 'characters',
  world: 'worlds',
  plot: 'plots'
};

export interface StoragePaths {
  dataRoot: string;
  projectsRoot: string;
  indexDbPath: string;
}

export function getStoragePaths(baseDataPath = app.getPath('userData')): StoragePaths {
  const dataRoot = join(baseDataPath, 'data');

  return {
    dataRoot,
    projectsRoot: join(dataRoot, 'projects'),
    indexDbPath: join(dataRoot, 'hetusketch-index.sqlite')
  };
}

export async function ensureStorageDirectories(paths: StoragePaths): Promise<void> {
  await mkdir(paths.projectsRoot, { recursive: true });
}

export function getProjectRoot(paths: StoragePaths, projectId: string): string {
  assertSafeSegment(projectId, 'projectId');
  return join(paths.projectsRoot, projectId);
}

export function getProjectManifestPath(paths: StoragePaths, projectId: string): string {
  return join(getProjectRoot(paths, projectId), 'project.json');
}

export function getEntryDirectory(paths: StoragePaths, projectId: string, type: EntryType): string {
  return join(getProjectRoot(paths, projectId), ENTRY_DIR_BY_TYPE[type]);
}

export function getEntryFilePath(
  paths: StoragePaths,
  projectId: string,
  type: EntryType,
  entryId: string,
  extension: 'json' | 'md'
): string {
  assertSafeSegment(entryId, 'entryId');
  return join(getEntryDirectory(paths, projectId, type), `${entryId}.${extension}`);
}

export function assertInside(parentPath: string, candidatePath: string): void {
  const parent = normalize(resolve(parentPath));
  const candidate = normalize(resolve(candidatePath));
  const pathDelta = relative(parent, candidate);

  if (pathDelta.startsWith('..') || resolve(pathDelta) === pathDelta) {
    throw new Error(`Path is outside allowed root: ${candidatePath}`);
  }
}

export function assertSafeSegment(value: string, name: string): void {
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(value)) {
    throw new Error(`Invalid ${name}: only letters, numbers, hyphen and underscore are allowed`);
  }
}

export function createProjectSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || 'project';
}

export async function ensureProjectStructure(paths: StoragePaths, project: ProjectManifest): Promise<void> {
  const projectRoot = getProjectRoot(paths, project.id);
  await Promise.all([
    mkdir(projectRoot, { recursive: true }),
    mkdir(getEntryDirectory(paths, project.id, 'character'), { recursive: true }),
    mkdir(getEntryDirectory(paths, project.id, 'world'), { recursive: true }),
    mkdir(getEntryDirectory(paths, project.id, 'plot'), { recursive: true }),
    mkdir(join(projectRoot, 'assets'), { recursive: true })
  ]);
}
