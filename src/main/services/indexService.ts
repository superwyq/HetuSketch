import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { IndexSyncSummary, Plotboard, ProjectManifest, StateSnapshot } from '../../shared/storageTypes.js';
import { extensionToFormat } from './entrySerialization.js';
import type { IndexDatabase } from './indexDatabase.js';
import { getFileStats } from './projectFileStore.js';
import type { ProjectFileStore } from './projectFileStore.js';
import { getProjectManifestPath, getProjectRoot, type StoragePaths } from './storagePaths.js';

export class IndexService {
  private watcher: FSWatcher | undefined;
  private readonly pendingFiles = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly paths: StoragePaths,
    private readonly fileStore: ProjectFileStore,
    private readonly indexDb: IndexDatabase
  ) {}

  async scanAll(): Promise<IndexSyncSummary> {
    const summary = createSummary();
    const projects = await this.fileStore.listProjectManifests();
    const existingFiles = new Set<string>();

    for (const { project, filePath, stats } of projects) {
      existingFiles.add(filePath);
      await this.indexProject(project, filePath, stats, summary);
      const entryFiles = await this.fileStore.listEntryFiles(project.id);

      for (const entryFilePath of entryFiles) {
        existingFiles.add(entryFilePath);
        await this.indexEntryFile(entryFilePath, summary);
      }

      for (const plotboardFilePath of await this.listPlotboardFiles(project.id)) {
        existingFiles.add(plotboardFilePath);
        await this.indexPlotboardFile(plotboardFilePath, summary);
      }

      for (const snapshotFilePath of await this.listStateSnapshotFiles(project.id)) {
        existingFiles.add(snapshotFilePath);
        await this.indexStateSnapshotFile(project.id, snapshotFilePath, summary);
      }
    }

    summary.removedFiles += this.indexDb.removeMissingFiles(existingFiles);
    return summary;
  }

  async scanBook(bookId: string): Promise<IndexSyncSummary> {
    const summary = createSummary();
    const existingFiles = new Set<string>();

    for (const plotboardFilePath of await this.listPlotboardFiles(bookId)) {
      existingFiles.add(plotboardFilePath);
      await this.indexPlotboardFile(plotboardFilePath, summary);
    }

    for (const snapshotFilePath of await this.listStateSnapshotFiles(bookId)) {
      existingFiles.add(snapshotFilePath);
      await this.indexStateSnapshotFile(bookId, snapshotFilePath, summary);
    }

    summary.removedFiles += this.indexDb.removeMissingFiles(existingFiles, bookId, ['plotboard', 'state-snapshot']);
    return summary;
  }

  async scanProject(projectId: string): Promise<IndexSyncSummary> {
    const summary = createSummary();
    const existingFiles = new Set<string>();
    const project = await this.fileStore.readProject(projectId);
    const manifestPath = getProjectManifestPath(this.paths, projectId);
    existingFiles.add(manifestPath);
    await this.indexProject(project, manifestPath, await getFileStats(manifestPath), summary);

    for (const entryFilePath of await this.fileStore.listEntryFiles(projectId)) {
      existingFiles.add(entryFilePath);
      await this.indexEntryFile(entryFilePath, summary);
    }

    for (const plotboardFilePath of await this.listPlotboardFiles(projectId)) {
      existingFiles.add(plotboardFilePath);
      await this.indexPlotboardFile(plotboardFilePath, summary);
    }

    for (const snapshotFilePath of await this.listStateSnapshotFiles(projectId)) {
      existingFiles.add(snapshotFilePath);
      await this.indexStateSnapshotFile(projectId, snapshotFilePath, summary);
    }

    summary.removedFiles += this.indexDb.removeMissingFiles(existingFiles, projectId);
    return summary;
  }

  async syncFile(filePath: string): Promise<void> {
    try {
      const stats = await stat(filePath);

      if (!stats.isFile()) {
        return;
      }
    } catch {
      this.indexDb.removeFile(filePath);
      return;
    }

    if (filePath.endsWith('project.json')) {
      const project = JSON.parse(await readFile(filePath, 'utf8')) as ProjectManifest;
      await this.indexProject(project, filePath, await getFileStats(filePath), createSummary());
      return;
    }

    if (filePath.endsWith('.plotboard.json')) {
      await this.indexPlotboardFile(filePath, createSummary());
      return;
    }

    if (filePath.endsWith('.state-snapshot.json')) {
      const snapshot = JSON.parse(await readFile(filePath, 'utf8')) as StateSnapshot;
      await this.indexStateSnapshotFile(snapshot.bookId ?? inferBookIdFromPath(filePath), filePath, createSummary());
      return;
    }

    if (extensionToFormat(filePath)) {
      await this.indexEntryFile(filePath, createSummary());
    }
  }

  startWatching(): void {
    if (this.watcher) {
      return;
    }

    this.watcher = chokidar.watch([join(this.paths.projectsRoot, '**', '*.json'), join(this.paths.projectsRoot, '**', '*.md'), join(this.paths.booksRoot, '**', '*.json')], {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 }
    });

    this.watcher.on('add', (filePath) => this.scheduleSync(filePath));
    this.watcher.on('change', (filePath) => this.scheduleSync(filePath));
    this.watcher.on('unlink', (filePath) => this.scheduleSync(filePath));
  }

  async stopWatching(): Promise<void> {
    for (const timer of this.pendingFiles.values()) {
      clearTimeout(timer);
    }

    this.pendingFiles.clear();

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
  }

  private scheduleSync(filePath: string): void {
    const existingTimer = this.pendingFiles.get(filePath);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.pendingFiles.delete(filePath);
      void this.syncFile(filePath);
    }, 150);

    this.pendingFiles.set(filePath, timer);
  }

  private async indexProject(
    project: ProjectManifest,
    filePath: string,
    stats: { mtimeMs: number; size: number; sha256: string },
    summary: IndexSyncSummary
  ): Promise<void> {
    summary.scannedFiles += 1;
    const existing = this.indexDb.getFileRecord(filePath);

    if (existing?.sha256 === stats.sha256 && existing.mtimeMs === stats.mtimeMs) {
      return;
    }

    this.indexDb.upsertProject(project, getProjectRoot(this.paths, project.id), filePath);
    this.indexDb.recordFile({
      projectId: project.id,
      entryId: undefined,
      entryType: undefined,
      filePath,
      fileKind: 'project',
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      sha256: stats.sha256,
      indexedAt: new Date().toISOString()
    });
    summary.indexedProjects += 1;
  }

  private async indexPlotboardFile(filePath: string, summary: IndexSyncSummary): Promise<void> {
    summary.scannedFiles += 1;

    try {
      const stats = await getFileStats(filePath);
      const existing = this.indexDb.getFileRecord(filePath);
      if (existing?.sha256 === stats.sha256 && existing.mtimeMs === stats.mtimeMs) {
        return;
      }

      const plotboard = JSON.parse(await readFile(filePath, 'utf8')) as Plotboard;
      this.indexDb.upsertPlotboard(plotboard, filePath);
      this.indexDb.recordFile({
        projectId: plotboard.bookId,
        entryId: plotboard.chapterId,
        entryType: 'plotboard',
        filePath,
        fileKind: 'plotboard',
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        sha256: stats.sha256,
        indexedAt: new Date().toISOString()
      });
      summary.indexedEntries += 1;
    } catch (error) {
      summary.errors.push({ filePath, message: error instanceof Error ? error.message : String(error) });
    }
  }

  private async indexStateSnapshotFile(bookId: string, filePath: string, summary: IndexSyncSummary): Promise<void> {
    summary.scannedFiles += 1;

    try {
      const stats = await getFileStats(filePath);
      const existing = this.indexDb.getFileRecord(filePath);
      if (existing?.sha256 === stats.sha256 && existing.mtimeMs === stats.mtimeMs) {
        return;
      }

      const snapshot = JSON.parse(await readFile(filePath, 'utf8')) as StateSnapshot;
      this.indexDb.upsertStateSnapshot(snapshot, bookId, filePath);
      this.indexDb.recordFile({
        projectId: bookId,
        entryId: snapshot.chapterId,
        entryType: 'state-snapshot',
        filePath,
        fileKind: 'state-snapshot',
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        sha256: stats.sha256,
        indexedAt: new Date().toISOString()
      });
      summary.indexedEntries += 1;
    } catch (error) {
      summary.errors.push({ filePath, message: error instanceof Error ? error.message : String(error) });
    }
  }

  private async indexEntryFile(filePath: string, summary: IndexSyncSummary): Promise<void> {
    summary.scannedFiles += 1;

    try {
      const { entry, stats } = await this.fileStore.readEntryFile(filePath);
      const existing = this.indexDb.getFileRecord(filePath);

      if (existing?.sha256 === stats.sha256 && existing.mtimeMs === stats.mtimeMs) {
        return;
      }

      this.indexDb.upsertEntry(entry, filePath);
      this.indexDb.recordFile({
        projectId: entry.projectId,
        entryId: entry.id,
        entryType: entry.type,
        filePath,
        fileKind: 'entry',
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        sha256: stats.sha256,
        indexedAt: new Date().toISOString()
      });
      summary.indexedEntries += 1;
    } catch (error) {
      summary.errors.push({ filePath, message: error instanceof Error ? error.message : String(error) });
    }
  }

  private async listPlotboardFiles(bookId: string): Promise<string[]> {
    return listFiles(join(this.paths.booksRoot, bookId, 'plotboards'), '.plotboard.json');
  }

  private async listStateSnapshotFiles(bookId: string): Promise<string[]> {
    return listFiles(join(this.paths.booksRoot, bookId, 'states'), '.state-snapshot.json');
  }
}

async function listFiles(root: string, suffix: string): Promise<string[]> {
  try {
    const children = await readdir(root, { withFileTypes: true });
    return children.filter((child) => child.isFile() && child.name.endsWith(suffix)).map((child) => join(root, child.name));
  } catch {
    return [];
  }
}

function inferBookIdFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/\/books\/([^/]+)\//);
  return match?.[1] ?? '';
}

function createSummary(): IndexSyncSummary {
  return { scannedFiles: 0, indexedEntries: 0, indexedProjects: 0, removedFiles: 0, errors: [] };
}
