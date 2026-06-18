import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import AdmZip from 'adm-zip';
import type {
  EntryType,
  ProjectCreateInput,
  ProjectEntry,
  ProjectImportResult,
  ProjectManifest
} from '../../shared/storageTypes.js';
import { extensionToFormat, parseEntry, serializeEntry } from './entrySerialization.js';
import {
  ENTRY_DIR_BY_TYPE,
  assertInside,
  assertSafeSegment,
  createProjectSlug,
  ensureProjectStructure,
  getEntryFilePath,
  getProjectManifestPath,
  getProjectRoot,
  type StoragePaths
} from './storagePaths.js';

export interface ReadEntryResult {
  entry: ProjectEntry;
  filePath: string;
  stats: FileStats;
}

export interface FileStats {
  mtimeMs: number;
  size: number;
  sha256: string;
}

export class ProjectFileStore {
  constructor(private readonly paths: StoragePaths) {}

  async createProject(input: ProjectCreateInput): Promise<ProjectManifest> {
    const now = new Date().toISOString();
    const safeInputId = typeof input.id === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(input.id) ? input.id : undefined;
    const project: ProjectManifest = {
      id: safeInputId ?? `${createProjectSlug(input.name)}-${randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      type: input.type,
      summary: input.summary?.trim() ?? '',
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1
    };

    assertSafeSegment(project.id, 'projectId');
    await ensureProjectStructure(this.paths, project);
    await this.writeProject(project);
    return project;
  }

  async writeProject(project: ProjectManifest): Promise<string> {
    assertSafeSegment(project.id, 'projectId');
    await ensureProjectStructure(this.paths, project);
    const filePath = getProjectManifestPath(this.paths, project.id);
    await writeJson(filePath, project);
    return filePath;
  }

  async readProject(projectId: string): Promise<ProjectManifest> {
    const filePath = getProjectManifestPath(this.paths, projectId);
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as ProjectManifest;
  }

  async updateProject(project: ProjectManifest): Promise<string> {
    return this.writeProject(project);
  }

  async listProjectManifests(): Promise<Array<{ project: ProjectManifest; filePath: string; stats: FileStats }>> {
    await mkdir(this.paths.projectsRoot, { recursive: true });
    const children = await readdir(this.paths.projectsRoot, { withFileTypes: true });
    const projects: Array<{ project: ProjectManifest; filePath: string; stats: FileStats }> = [];

    for (const child of children) {
      if (!child.isDirectory()) {
        continue;
      }

      const filePath = join(this.paths.projectsRoot, child.name, 'project.json');

      try {
        const raw = await readFile(filePath, 'utf8');
        projects.push({ project: JSON.parse(raw) as ProjectManifest, filePath, stats: await getFileStats(filePath) });
      } catch {
        // 非标准目录忽略，导入/扫描时由显式错误处理负责。
      }
    }

    return projects;
  }

  async saveEntry(entry: ProjectEntry): Promise<string> {
    assertSafeSegment(entry.projectId, 'projectId');
    assertSafeSegment(entry.id, 'entryId');
    const extension = entry.format === 'markdown' ? 'md' : 'json';
    const filePath = getEntryFilePath(this.paths, entry.projectId, entry.type, entry.id, extension);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, serializeEntry(entry), 'utf8');
    return filePath;
  }

  async readEntryFile(filePath: string): Promise<ReadEntryResult> {
    assertInside(this.paths.projectsRoot, filePath);
    const format = extensionToFormat(filePath);

    if (!format) {
      throw new Error(`Unsupported entry file extension: ${filePath}`);
    }

    const raw = await readFile(filePath, 'utf8');
    const entry = parseEntry(raw, format);
    return { entry, filePath, stats: await getFileStats(filePath) };
  }

  async readEntry(projectId: string, type: EntryType, entryId: string, extension: 'json' | 'md' = 'json'): Promise<ReadEntryResult> {
    const filePath = getEntryFilePath(this.paths, projectId, type, entryId, extension);
    return this.readEntryFile(filePath);
  }

  async deleteEntry(projectId: string, type: EntryType, entryId: string): Promise<void> {
    const candidates = [
      getEntryFilePath(this.paths, projectId, type, entryId, 'json'),
      getEntryFilePath(this.paths, projectId, type, entryId, 'md')
    ];

    await Promise.all(candidates.map((filePath) => unlink(filePath).catch(() => undefined)));
  }

  async listEntryFiles(projectId: string): Promise<string[]> {
    const files: string[] = [];

    for (const dirName of Object.values(ENTRY_DIR_BY_TYPE)) {
      await collectEntryFiles(join(getProjectRoot(this.paths, projectId), dirName), files);
    }

    return files;
  }

  async listAllEntryFiles(): Promise<string[]> {
    const projects = await this.listProjectManifests();
    const nested = await Promise.all(projects.map(({ project }) => this.listEntryFiles(project.id)));
    return nested.flat();
  }

  async removeProject(projectId: string): Promise<void> {
    await rm(getProjectRoot(this.paths, projectId), { recursive: true, force: true });
  }

  async exportProject(projectId: string, destinationZipPath: string): Promise<string> {
    const projectRoot = getProjectRoot(this.paths, projectId);
    assertInside(this.paths.projectsRoot, projectRoot);
    const zip = new AdmZip();
    zip.addLocalFolder(projectRoot, basename(projectRoot));
    await mkdir(dirname(destinationZipPath), { recursive: true });
    zip.writeZip(destinationZipPath);
    return destinationZipPath;
  }

  async importFromFolder(sourceFolderPath: string): Promise<ProjectImportResult> {
    const manifestPath = join(sourceFolderPath, 'project.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as ProjectManifest;
    assertSafeSegment(manifest.id, 'projectId');
    const destination = getProjectRoot(this.paths, manifest.id);
    await rm(destination, { recursive: true, force: true });
    await cp(sourceFolderPath, destination, { recursive: true, force: true });
    await ensureProjectStructure(this.paths, manifest);

    return {
      project: manifest,
      summary: { scannedFiles: 0, indexedEntries: 0, indexedProjects: 0, removedFiles: 0, errors: [] }
    };
  }

  async importFromZip(zipPath: string): Promise<ProjectImportResult> {
    const zip = new AdmZip(zipPath);
    const extractRoot = join(this.paths.dataRoot, 'imports', randomUUID());
    await mkdir(extractRoot, { recursive: true });

    for (const entry of zip.getEntries()) {
      validateZipEntry(entry.entryName);
    }

    zip.extractAllTo(extractRoot, true);
    const root = await findImportedProjectRoot(extractRoot);
    return this.importFromFolder(root);
  }
}

export async function getFileStats(filePath: string): Promise<FileStats> {
  const [metadata, content] = await Promise.all([stat(filePath), readFile(filePath)]);

  return {
    mtimeMs: metadata.mtimeMs,
    size: metadata.size,
    sha256: createHash('sha256').update(content).digest('hex')
  };
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function collectEntryFiles(root: string, output: string[]): Promise<void> {
  let children: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;

  try {
    children = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const child of children) {
    const childPath = join(root, child.name);

    if (child.isDirectory()) {
      await collectEntryFiles(childPath, output);
      continue;
    }

    if (child.isFile() && !child.name.toLowerCase().endsWith('project.json') && extensionToFormat(child.name)) {
      output.push(childPath);
    }
  }
}

function validateZipEntry(entryName: string): void {
  if (entryName.includes('..') || entryName.startsWith('/') || /^[a-zA-Z]:/.test(entryName)) {
    throw new Error(`Unsafe zip entry path: ${entryName}`);
  }
}

async function findImportedProjectRoot(root: string): Promise<string> {
  const directManifest = join(root, 'project.json');

  try {
    await stat(directManifest);
    return root;
  } catch {
    const children = await readdir(root, { withFileTypes: true });

    for (const child of children) {
      if (!child.isDirectory()) {
        continue;
      }

      const candidate = join(root, child.name);

      try {
        await stat(join(candidate, 'project.json'));
        return candidate;
      } catch {
        // keep searching
      }
    }
  }

  throw new Error('Imported folder does not contain project.json');
}
