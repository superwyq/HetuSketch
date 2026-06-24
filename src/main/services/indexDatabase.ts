import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseHandle } from 'better-sqlite3';
import type {
  DashboardStats,
  EntryListQuery,
  EntryType,
  HttpToolConfig,
  Plotboard,
  PlotStatus,
  ProjectEntry,
  StateSnapshot,
  ProjectManifest,
  RecentAccessItem,
  VectorIndexState,
  SearchQuery,
  SearchResultItem
} from '../../shared/storageTypes.js';
import { collectSearchableText } from './entrySerialization.js';

export interface FileIndexRecord {
  projectId: string;
  entryId?: string;
  entryType?: string;
  filePath: string;
  fileKind: 'project' | 'entry' | 'plotboard' | 'state-snapshot';
  mtimeMs: number;
  size: number;
  sha256: string;
  indexedAt: string;
}

export interface VectorChunkInput {
  projectId: string;
  entryId: string;
  entryType: EntryType;
  title: string;
  sourcePath: string;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

export interface VectorSearchRow extends VectorChunkInput {
  score: number;
}

interface SearchRow {
  id: string;
  project_id: string;
  type: SearchResultItem['type'];
  title: string;
  excerpt: string;
  rank: number;
  file_path: string | null;
  updated_at: string;
}

interface EntryListRow {
  id: string;
  project_id: string;
  type: EntryType;
  title: string;
  summary: string;
  tags: string;
  file_path: string;
  updated_at: string;
  metadata_json: string;
}

export class IndexDatabase {
  private readonly db: DatabaseHandle;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  upsertProject(project: ProjectManifest, rootPath: string, filePath: string): void {
    this.db
      .prepare(
        `INSERT INTO projects (id, name, type, summary, root_path, file_path, created_at, updated_at)
         VALUES (@id, @name, @type, @summary, @rootPath, @filePath, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           type = excluded.type,
           summary = excluded.summary,
           root_path = excluded.root_path,
           file_path = excluded.file_path,
           updated_at = excluded.updated_at`
      )
      .run({
        id: project.id,
        name: project.name,
        type: project.type,
        summary: project.summary,
        rootPath,
        filePath,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      });

    this.upsertFtsDocument({
      id: project.id,
      projectId: project.id,
      type: 'project',
      title: project.name,
      summary: project.summary,
      content: project.summary,
      tags: project.type,
      filePath,
      updatedAt: project.updatedAt
    });
  }

  listProjects(): ProjectManifest[] {
    const rows = this.db
      .prepare('SELECT id, name, type, summary, created_at, updated_at FROM projects ORDER BY updated_at DESC')
      .all() as Array<{
      id: string;
      name: string;
      type: ProjectManifest['type'];
      summary: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      summary: row.summary,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      schemaVersion: 1
    }));
  }

  getProject(projectId: string): ProjectManifest | undefined {
    const row = this.db.prepare('SELECT id, name, type, summary, created_at, updated_at FROM projects WHERE id = ?').get(projectId) as
      | {
          id: string;
          name: string;
          type: ProjectManifest['type'];
          summary: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    return row
      ? {
          id: row.id,
          name: row.name,
          type: row.type,
          summary: row.summary,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          schemaVersion: 1
        }
      : undefined;
  }

  getProjectRoot(projectId: string): string | undefined {
    const row = this.db.prepare('SELECT root_path FROM projects WHERE id = ?').get(projectId) as { root_path: string } | undefined;
    return row?.root_path;
  }

  listEntrySummaries(query: EntryListQuery): SearchResultItem[] {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const rows = this.db
      .prepare(
        `SELECT id, project_id, type, title, summary, tags, file_path, updated_at, metadata_json
         FROM entries
         WHERE project_id = @projectId
           AND (@type IS NULL OR type = @type)
         ORDER BY updated_at DESC
         LIMIT @limit`
      )
      .all({ projectId: query.projectId, type: query.type ?? null, limit }) as EntryListRow[];

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      title: row.title,
      excerpt: row.summary || row.tags || row.title,
      filePath: row.file_path,
      updatedAt: row.updated_at,
      metadata: safeJsonRecord(row.metadata_json)
    }));
  }

  listEntriesByType<T extends ProjectEntry>(projectId: string, type: T['type']): Array<{ id: string; filePath: string }> {
    return this.db
      .prepare('SELECT id, file_path AS filePath FROM entries WHERE project_id = ? AND type = ? ORDER BY updated_at DESC')
      .all(projectId, type) as Array<{ id: string; filePath: string }>;
  }

  upsertPlotboard(plotboard: Plotboard, filePath: string): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM plotboard_cards_index WHERE plotboard_id = ?').run(plotboard.plotboardId);
      this.db.prepare('DELETE FROM plotboard_time_index WHERE plotboard_id = ?').run(plotboard.plotboardId);
      this.db.prepare('DELETE FROM plot_thread_usage_index WHERE plotboard_id = ?').run(plotboard.plotboardId);

      const insertCard = this.db.prepare(
        `INSERT INTO plotboard_cards_index (plotboard_id, book_id, chapter_id, card_id, card_type, title, fact, character_ids, world_entry_ids, plot_entry_ids, updated_at, file_path)
         VALUES (@plotboardId, @bookId, @chapterId, @cardId, @cardType, @title, @fact, @characterIds, @worldEntryIds, @plotEntryIds, @updatedAt, @filePath)`
      );
      const insertTime = this.db.prepare(
        `INSERT INTO plotboard_time_index (plotboard_id, book_id, chapter_id, card_id, timecode, pov_character_id, location_world_entry_id, character_ids, sort_x, sort_y)
         VALUES (@plotboardId, @bookId, @chapterId, @cardId, @timecode, @povCharacterId, @locationWorldEntryId, @characterIds, @sortX, @sortY)`
      );
      const insertPlotUsage = this.db.prepare(
        `INSERT INTO plot_thread_usage_index (plotboard_id, book_id, chapter_id, card_id, plot_entry_id, usage_type, timecode)
         VALUES (@plotboardId, @bookId, @chapterId, @cardId, @plotEntryId, @usageType, @timecode)`
      );

      for (const card of plotboard.cards) {
        insertCard.run({
          plotboardId: plotboard.plotboardId,
          bookId: plotboard.bookId,
          chapterId: plotboard.chapterId,
          cardId: card.cardId,
          cardType: card.cardType,
          title: card.title,
          fact: card.fact,
          characterIds: JSON.stringify(card.characterIds ?? []),
          worldEntryIds: JSON.stringify(card.worldEntryIds ?? []),
          plotEntryIds: JSON.stringify(card.plotEntryIds ?? []),
          updatedAt: card.updatedAt ?? plotboard.updatedAt,
          filePath
        });
        insertTime.run({
          plotboardId: plotboard.plotboardId,
          bookId: plotboard.bookId,
          chapterId: plotboard.chapterId,
          cardId: card.cardId,
          timecode: card.timecode ?? '',
          povCharacterId: card.povCharacterId ?? '',
          locationWorldEntryId: card.locationWorldEntryId ?? '',
          characterIds: JSON.stringify(card.characterIds ?? []),
          sortX: card.x,
          sortY: card.y
        });
        for (const plotEntryId of card.plotEntryIds ?? []) {
          insertPlotUsage.run({
            plotboardId: plotboard.plotboardId,
            bookId: plotboard.bookId,
            chapterId: plotboard.chapterId,
            cardId: card.cardId,
            plotEntryId,
            usageType: card.cardType,
            timecode: card.timecode ?? ''
          });
        }
      }
    });
  }

  upsertStateSnapshot(snapshot: StateSnapshot, bookId: string, filePath: string): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM state_snapshot_index WHERE book_id = ? AND chapter_id = ?').run(bookId, snapshot.chapterId);
      const insert = this.db.prepare(
        `INSERT INTO state_snapshot_index (book_id, chapter_id, owner_type, owner_id, field_name, value_json, snapshot_timecode, updated_at, file_path)
         VALUES (@bookId, @chapterId, @ownerType, @ownerId, @fieldName, @valueJson, @snapshotTimecode, @updatedAt, @filePath)`
      );
      for (const state of snapshot.states ?? []) {
        for (const [fieldName, field] of Object.entries(state.fields ?? {})) {
          insert.run({
            bookId,
            chapterId: snapshot.chapterId,
            ownerType: state.ownerType,
            ownerId: state.ownerId,
            fieldName,
            valueJson: JSON.stringify(field),
            snapshotTimecode: snapshot.snapshotTimecode ?? '',
            updatedAt: snapshot.updatedAt ?? snapshot.createdAt ?? new Date().toISOString(),
            filePath
          });
        }
      }
    });
  }

  upsertEntry(entry: ProjectEntry, filePath: string): void {
    const searchable = collectSearchableText(entry);

    this.db
      .prepare(
        `INSERT INTO entries (id, project_id, type, title, summary, tags, file_path, content_text, metadata_json, created_at, updated_at)
         VALUES (@id, @projectId, @type, @title, @summary, @tags, @filePath, @contentText, @metadataJson, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           project_id = excluded.project_id,
           type = excluded.type,
           title = excluded.title,
           summary = excluded.summary,
           tags = excluded.tags,
           file_path = excluded.file_path,
           content_text = excluded.content_text,
           metadata_json = excluded.metadata_json,
           updated_at = excluded.updated_at`
      )
      .run({
        id: entry.id,
        projectId: entry.projectId,
        type: entry.type,
        title: entry.title,
        summary: entry.summary ?? '',
        tags: entry.tags.join(','),
        filePath,
        contentText: searchable,
        metadataJson: JSON.stringify(entryMetadata(entry)),
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt
      });

    this.markVectorIndexDirty(entry.projectId);
    this.upsertRelations(entry);
    this.upsertFtsDocument({
      id: entry.id,
      projectId: entry.projectId,
      type: entry.type,
      title: entry.title,
      summary: entry.summary ?? '',
      content: searchable,
      tags: entry.tags.join(' '),
      filePath,
      updatedAt: entry.updatedAt
    });
  }

  recordFile(record: FileIndexRecord): void {
    this.db
      .prepare(
        `INSERT INTO file_index (file_path, project_id, entry_id, entry_type, file_kind, mtime_ms, size, sha256, indexed_at)
         VALUES (@filePath, @projectId, @entryId, @entryType, @fileKind, @mtimeMs, @size, @sha256, @indexedAt)
         ON CONFLICT(file_path) DO UPDATE SET
           project_id = excluded.project_id,
           entry_id = excluded.entry_id,
           entry_type = excluded.entry_type,
           file_kind = excluded.file_kind,
           mtime_ms = excluded.mtime_ms,
           size = excluded.size,
           sha256 = excluded.sha256,
           indexed_at = excluded.indexed_at`
      )
      .run(record);
  }

  getFileRecord(filePath: string): FileIndexRecord | undefined {
    const row = this.db.prepare('SELECT * FROM file_index WHERE file_path = ?').get(filePath) as
      | {
          project_id: string;
          entry_id?: string;
          entry_type?: string;
          file_path: string;
          file_kind: FileIndexRecord['fileKind'];
          mtime_ms: number;
          size: number;
          sha256: string;
          indexed_at: string;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      projectId: row.project_id,
      entryId: row.entry_id,
      entryType: row.entry_type,
      filePath: row.file_path,
      fileKind: row.file_kind,
      mtimeMs: row.mtime_ms,
      size: row.size,
      sha256: row.sha256,
      indexedAt: row.indexed_at
    };
  }

  removeMissingFiles(existingFilePaths: Set<string>, projectId?: string, fileKinds?: FileIndexRecord['fileKind'][]): number {
    const rows = (projectId
      ? this.db.prepare('SELECT file_path, file_kind FROM file_index WHERE project_id = ?').all(projectId)
      : this.db.prepare('SELECT file_path, file_kind FROM file_index').all()) as Array<{ file_path: string; file_kind: FileIndexRecord['fileKind'] }>;
    const allowedKinds = fileKinds ? new Set(fileKinds) : undefined;
    let removed = 0;

    for (const row of rows) {
      if (allowedKinds && !allowedKinds.has(row.file_kind)) {
        continue;
      }
      if (!existingFilePaths.has(row.file_path)) {
        this.removeFile(row.file_path);
        removed += 1;
      }
    }

    return removed;
  }

  removeFile(filePath: string): void {
    const record = this.getFileRecord(filePath);

    if (!record) {
      return;
    }

    if (record.fileKind === 'plotboard') {
      this.removePlotboardIndexes(filePath);
    }

    if (record.fileKind === 'state-snapshot') {
      this.removeStateSnapshotIndexes(filePath);
    }

    if (record.fileKind === 'entry' && record.entryId) {
      this.removeEntry(record.entryId);
    }

    this.db.prepare('DELETE FROM vector_chunks WHERE entry_id = ?').run(record.entryId ?? '');
    if (record.fileKind === 'entry') {
      this.markVectorIndexDirty(record.projectId);
    }

    if (record.fileKind === 'project') {
      this.removeProject(record.projectId);
    }

    this.db.prepare('DELETE FROM file_index WHERE file_path = ?').run(filePath);
  }

  removeEntry(entryId: string): void {
    this.db.prepare('DELETE FROM relations WHERE source_id = ? OR target_id = ?').run(entryId, entryId);
    this.db.prepare('DELETE FROM recent_access WHERE entry_id = ?').run(entryId);
    this.db.prepare('DELETE FROM file_index WHERE entry_id = ?').run(entryId);
    const row = this.db.prepare('SELECT project_id FROM entries WHERE id = ?').get(entryId) as { project_id: string } | undefined;
    this.db.prepare('DELETE FROM vector_chunks WHERE entry_id = ?').run(entryId);
    if (row) {
      this.markVectorIndexDirty(row.project_id);
    }
    this.db.prepare('DELETE FROM entries WHERE id = ?').run(entryId);
    this.db.prepare('DELETE FROM search_index WHERE id = ?').run(entryId);
  }

  removeProject(projectId: string): void {
    this.db.prepare('DELETE FROM file_index WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM plotboard_cards_index WHERE book_id = ?').run(projectId);
    this.db.prepare('DELETE FROM plotboard_time_index WHERE book_id = ?').run(projectId);
    this.db.prepare('DELETE FROM state_snapshot_index WHERE book_id = ?').run(projectId);
    this.db.prepare('DELETE FROM plot_thread_usage_index WHERE book_id = ?').run(projectId);
    this.db.prepare('DELETE FROM relations WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM recent_access WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM vector_chunks WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM vector_index_state WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM entries WHERE project_id = ?').run(projectId);
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    this.db.prepare('DELETE FROM search_index WHERE project_id = ?').run(projectId);
  }

  recordRecentAccess(projectId: string, entryId: string, accessedAt = new Date().toISOString()): void {
    this.db
      .prepare(
        `INSERT INTO recent_access (project_id, entry_id, accessed_at)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id, entry_id) DO UPDATE SET accessed_at = excluded.accessed_at`
      )
      .run(projectId, entryId, accessedAt);
  }

  listRecentAccess(projectId?: string, limit = 20): RecentAccessItem[] {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const rows = this.db
      .prepare(
        `SELECT e.id, e.project_id, e.type, e.title, e.summary AS excerpt, e.file_path, e.updated_at, r.accessed_at
         FROM recent_access r
         JOIN entries e ON e.project_id = r.project_id AND e.id = r.entry_id
         WHERE (@projectId IS NULL OR r.project_id = @projectId)
         ORDER BY r.accessed_at DESC
         LIMIT @limit`
      )
      .all({ projectId: projectId ?? null, limit: safeLimit }) as Array<{
      id: string;
      project_id: string;
      type: EntryType;
      title: string;
      excerpt: string;
      file_path: string;
      updated_at: string;
      accessed_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      title: row.title,
      excerpt: row.excerpt || row.title,
      filePath: row.file_path,
      updatedAt: row.updated_at,
      accessedAt: row.accessed_at
    }));
  }

  getDashboardStats(projectId?: string): DashboardStats {
    const projectCount = (this.db.prepare('SELECT COUNT(*) AS count FROM projects').get() as { count: number }).count;
    const entryCount = (this.db
      .prepare(`SELECT COUNT(*) AS count FROM entries WHERE (@projectId IS NULL OR project_id = @projectId)`)
      .get({ projectId: projectId ?? null }) as { count: number }).count;

    const byType: Record<EntryType, number> = { character: 0, world: 0, plot: 0 };
    const typeRows = this.db
      .prepare(`SELECT type, COUNT(*) AS count FROM entries WHERE (@projectId IS NULL OR project_id = @projectId) GROUP BY type`)
      .all({ projectId: projectId ?? null }) as Array<{ type: EntryType; count: number }>;
    for (const row of typeRows) {
      byType[row.type] = row.count;
    }

    const plotStatus: Record<PlotStatus, number> = { open: byType.plot, resolved: 0, abandoned: 0 };

    const todayPrefix = new Date().toISOString().slice(0, 10);
    const updatedTodayCount = (this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM entries
         WHERE updated_at >= @todayStart AND (@projectId IS NULL OR project_id = @projectId)`
      )
      .get({ todayStart: `${todayPrefix}T00:00:00.000Z`, projectId: projectId ?? null }) as { count: number }).count;
    const latestRow = this.db
      .prepare(`SELECT MAX(updated_at) AS updatedAt FROM entries WHERE (@projectId IS NULL OR project_id = @projectId)`)
      .get({ projectId: projectId ?? null }) as { updatedAt?: string };

    return {
      projectCount,
      entryCount,
      byType,
      plotStatus,
      openPlotCount: plotStatus.open,
      updatedTodayCount,
      latestUpdatedAt: latestRow.updatedAt
    };
  }

  search(query: SearchQuery): SearchResultItem[] {
    const keyword = query.keyword.trim();

    if (!keyword) {
      return [];
    }

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const ftsQuery = toFtsQuery(keyword);
    const rows = this.db
      .prepare(
        `SELECT id, project_id, type, title,
                snippet(search_index, 4, '<mark>', '</mark>', '…', 12) AS excerpt,
                bm25(search_index) AS rank,
                file_path,
                updated_at
         FROM search_index
         WHERE search_index MATCH @keyword
           AND (@projectId IS NULL OR project_id = @projectId)
         ORDER BY rank
         LIMIT @limit`
      )
      .all({ keyword: ftsQuery, projectId: query.projectId ?? null, limit }) as SearchRow[];

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      title: row.title,
      excerpt: row.excerpt || row.title,
      score: row.rank,
      filePath: row.file_path ?? undefined,
      updatedAt: row.updated_at
    }));
  }

  getConfigRecord(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM app_config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setConfigRecord(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_config (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, new Date().toISOString());
  }

  listHttpTools(): HttpToolConfig[] {
    const rows = this.db.prepare('SELECT * FROM http_tools ORDER BY updated_at DESC').all() as Array<{
      id: string;
      name: string;
      description: string;
      url: string;
      method: 'GET' | 'POST';
      headers_json: string;
      enabled: number;
      timeout_ms: number;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      url: row.url,
      method: row.method,
      headers: JSON.parse(row.headers_json || '{}') as Record<string, string>,
      enabled: Boolean(row.enabled),
      timeoutMs: row.timeout_ms,
      updatedAt: row.updated_at
    }));
  }

  upsertHttpTool(tool: HttpToolConfig): void {
    this.db
      .prepare(
        `INSERT INTO http_tools (id, name, description, url, method, headers_json, enabled, timeout_ms, updated_at)
         VALUES (@id, @name, @description, @url, @method, @headersJson, @enabled, @timeoutMs, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           url = excluded.url,
           method = excluded.method,
           headers_json = excluded.headers_json,
           enabled = excluded.enabled,
           timeout_ms = excluded.timeout_ms,
           updated_at = excluded.updated_at`
      )
      .run({ ...tool, headersJson: JSON.stringify(tool.headers), enabled: tool.enabled ? 1 : 0 });
  }

  deleteHttpTool(toolId: string): void {
    this.db.prepare('DELETE FROM http_tools WHERE id = ?').run(toolId);
  }

  listAllEntryRefs(projectId: string): Array<{ id: string; type: EntryType; filePath: string }> {
    return this.db
      .prepare('SELECT id, type, file_path AS filePath FROM entries WHERE project_id = ? ORDER BY updated_at DESC')
      .all(projectId) as Array<{ id: string; type: EntryType; filePath: string }>;
  }

  replaceVectorChunks(projectId: string, chunks: VectorChunkInput[], model: string): void {
    const updatedAt = new Date().toISOString();
    this.transaction(() => {
      this.db.prepare('DELETE FROM vector_chunks WHERE project_id = ?').run(projectId);
      const insert = this.db.prepare(
        `INSERT INTO vector_chunks (project_id, entry_id, entry_type, title, source_path, chunk_index, text, embedding_json, embedding_model, updated_at)
         VALUES (@projectId, @entryId, @entryType, @title, @sourcePath, @chunkIndex, @text, @embeddingJson, @model, @updatedAt)`
      );
      for (const chunk of chunks) {
        insert.run({ ...chunk, embeddingJson: JSON.stringify(chunk.embedding), model, updatedAt });
      }
      this.setVectorIndexState({
        projectId,
        status: chunks.length ? 'ready' : 'empty',
        dirty: false,
        updatedAt,
        chunkCount: chunks.length,
        embeddedCount: chunks.length,
        warnings: []
      });
    });
  }

  markVectorIndexDirty(projectId: string): void {
    const current = this.getVectorIndexState(projectId);
    if (current.status === 'building') {
      return;
    }
    this.setVectorIndexState({ ...current, status: 'dirty', dirty: true, updatedAt: current.updatedAt ?? new Date().toISOString() });
  }

  setVectorIndexState(state: VectorIndexState): void {
    this.db
      .prepare(
        `INSERT INTO vector_index_state (project_id, status, dirty, updated_at, chunk_count, embedded_count, warnings_json)
         VALUES (@projectId, @status, @dirty, @updatedAt, @chunkCount, @embeddedCount, @warningsJson)
         ON CONFLICT(project_id) DO UPDATE SET
           status = excluded.status,
           dirty = excluded.dirty,
           updated_at = excluded.updated_at,
           chunk_count = excluded.chunk_count,
           embedded_count = excluded.embedded_count,
           warnings_json = excluded.warnings_json`
      )
      .run({
        projectId: state.projectId,
        status: state.status,
        dirty: state.dirty ? 1 : 0,
        updatedAt: state.updatedAt ?? new Date().toISOString(),
        chunkCount: state.chunkCount,
        embeddedCount: state.embeddedCount,
        warningsJson: JSON.stringify(state.warnings)
      });
  }

  getVectorIndexState(projectId: string): VectorIndexState {
    const row = this.db.prepare('SELECT * FROM vector_index_state WHERE project_id = ?').get(projectId) as
      | { project_id: string; status: VectorIndexState['status']; dirty: number; updated_at?: string; chunk_count: number; embedded_count: number; warnings_json: string }
      | undefined;

    if (!row) {
      const chunkCount = (this.db.prepare('SELECT COUNT(*) AS count FROM vector_chunks WHERE project_id = ?').get(projectId) as { count: number }).count;
      return { projectId, status: chunkCount ? 'dirty' : 'empty', dirty: chunkCount > 0, chunkCount, embeddedCount: chunkCount, warnings: [] };
    }

    return {
      projectId: row.project_id,
      status: row.status,
      dirty: Boolean(row.dirty),
      updatedAt: row.updated_at,
      chunkCount: row.chunk_count,
      embeddedCount: row.embedded_count,
      warnings: safeJsonArray(row.warnings_json)
    };
  }

  searchVectorChunks(query: { projectId: string; embedding: number[]; topK: number; entityTypes?: EntryType[] }): VectorSearchRow[] {
    const rows = this.db
      .prepare(
        `SELECT project_id, entry_id, entry_type, title, source_path, chunk_index, text, embedding_json
         FROM vector_chunks
         WHERE project_id = @projectId
         ORDER BY updated_at DESC`
      )
      .all({ projectId: query.projectId }) as Array<{
      project_id: string;
      entry_id: string;
      entry_type: EntryType;
      title: string;
      source_path: string;
      chunk_index: number;
      text: string;
      embedding_json: string;
    }>;

    return rows
      .filter((row) => !query.entityTypes?.length || query.entityTypes.includes(row.entry_type))
      .map((row) => {
        const embedding = JSON.parse(row.embedding_json) as number[];
        return {
          projectId: row.project_id,
          entryId: row.entry_id,
          entryType: row.entry_type,
          title: row.title,
          sourcePath: row.source_path,
          chunkIndex: row.chunk_index,
          text: row.text,
          embedding,
          score: cosineSimilarity(query.embedding, embedding)
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(query.topK, 1), 20));
  }

  transaction<T>(work: () => T): T {
    return this.db.transaction(work)();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        root_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL UNIQUE,
        content_text TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relations (
        project_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (source_id, target_id, label)
      );

      CREATE TABLE IF NOT EXISTS recent_access (
        project_id TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        accessed_at TEXT NOT NULL,
        PRIMARY KEY (project_id, entry_id)
      );

      CREATE TABLE IF NOT EXISTS file_index (
        file_path TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        entry_id TEXT,
        entry_type TEXT,
        file_kind TEXT NOT NULL,
        mtime_ms REAL NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        indexed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS http_tools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        method TEXT NOT NULL,
        headers_json TEXT NOT NULL DEFAULT '{}',
        enabled INTEGER NOT NULL DEFAULT 0,
        timeout_ms INTEGER NOT NULL DEFAULT 10000,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vector_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        title TEXT NOT NULL,
        source_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        embedding_json TEXT NOT NULL,
        embedding_model TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, entry_id, chunk_index)
      );

      CREATE TABLE IF NOT EXISTS vector_index_state (
        project_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        dirty INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        embedded_count INTEGER NOT NULL DEFAULT 0,
        warnings_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS plotboard_cards_index (
        plotboard_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        card_type TEXT NOT NULL,
        title TEXT NOT NULL,
        fact TEXT NOT NULL,
        character_ids TEXT NOT NULL DEFAULT '[]',
        world_entry_ids TEXT NOT NULL DEFAULT '[]',
        plot_entry_ids TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        file_path TEXT NOT NULL,
        PRIMARY KEY (plotboard_id, card_id)
      );

      CREATE TABLE IF NOT EXISTS plotboard_time_index (
        plotboard_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        timecode TEXT NOT NULL DEFAULT '',
        pov_character_id TEXT NOT NULL DEFAULT '',
        location_world_entry_id TEXT NOT NULL DEFAULT '',
        character_ids TEXT NOT NULL DEFAULT '[]',
        sort_x REAL NOT NULL DEFAULT 0,
        sort_y REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (plotboard_id, card_id)
      );

      CREATE TABLE IF NOT EXISTS state_snapshot_index (
        book_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        field_name TEXT NOT NULL,
        value_json TEXT NOT NULL,
        snapshot_timecode TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        file_path TEXT NOT NULL,
        PRIMARY KEY (book_id, chapter_id, owner_type, owner_id, field_name)
      );

      CREATE TABLE IF NOT EXISTS plot_thread_usage_index (
        plotboard_id TEXT NOT NULL,
        book_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        plot_entry_id TEXT NOT NULL,
        usage_type TEXT NOT NULL,
        timecode TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (plotboard_id, card_id, plot_entry_id)
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        id UNINDEXED,
        project_id UNINDEXED,
        type UNINDEXED,
        title,
        summary,
        content,
        tags,
        file_path UNINDEXED,
        updated_at UNINDEXED,
        tokenize = 'unicode61'
      );

      CREATE INDEX IF NOT EXISTS idx_entries_project_type ON entries(project_id, type);
      CREATE INDEX IF NOT EXISTS idx_entries_project_updated ON entries(project_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_file_index_project ON file_index(project_id);
      CREATE INDEX IF NOT EXISTS idx_recent_access_project ON recent_access(project_id, accessed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_vector_chunks_project ON vector_chunks(project_id, entry_type);
      CREATE INDEX IF NOT EXISTS idx_plotboard_cards_book_chapter ON plotboard_cards_index(book_id, chapter_id);
      CREATE INDEX IF NOT EXISTS idx_plotboard_time_lookup ON plotboard_time_index(book_id, chapter_id, timecode);
      CREATE INDEX IF NOT EXISTS idx_state_snapshot_lookup ON state_snapshot_index(book_id, chapter_id, owner_type, owner_id);
      CREATE INDEX IF NOT EXISTS idx_plot_thread_usage_lookup ON plot_thread_usage_index(plot_entry_id, book_id, chapter_id);
    `);

    const entryColumns = this.db.prepare('PRAGMA table_info(entries)').all() as Array<{ name: string }>;
    if (!entryColumns.some((column) => column.name === 'metadata_json')) {
      this.db.exec("ALTER TABLE entries ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'");
    }
  }

  private removePlotboardIndexes(filePath: string): void {
    const rows = this.db.prepare('SELECT plotboard_id FROM plotboard_cards_index WHERE file_path = ?').all(filePath) as Array<{ plotboard_id: string }>;
    for (const row of rows) {
      this.db.prepare('DELETE FROM plotboard_cards_index WHERE plotboard_id = ?').run(row.plotboard_id);
      this.db.prepare('DELETE FROM plotboard_time_index WHERE plotboard_id = ?').run(row.plotboard_id);
      this.db.prepare('DELETE FROM plot_thread_usage_index WHERE plotboard_id = ?').run(row.plotboard_id);
    }
  }

  private removeStateSnapshotIndexes(filePath: string): void {
    this.db.prepare('DELETE FROM state_snapshot_index WHERE file_path = ?').run(filePath);
  }

  private upsertRelations(entry: ProjectEntry): void {
    this.db.prepare('DELETE FROM relations WHERE source_id = ?').run(entry.id);
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO relations (project_id, source_id, source_type, target_id, target_type, label)
       VALUES (@projectId, @sourceId, @sourceType, @targetId, @targetType, @label)`
    );

    for (const relation of entry.relations) {
      insert.run({
        projectId: entry.projectId,
        sourceId: entry.id,
        sourceType: entry.type,
        targetId: relation.targetId,
        targetType: relation.targetType,
        label: relation.label ?? ''
      });
    }
  }

  private upsertFtsDocument(document: {
    id: string;
    projectId: string;
    type: SearchResultItem['type'];
    title: string;
    summary: string;
    content: string;
    tags: string;
    filePath: string;
    updatedAt: string;
  }): void {
    this.db.prepare('DELETE FROM search_index WHERE id = ?').run(document.id);
    this.db
      .prepare(
        `INSERT INTO search_index (id, project_id, type, title, summary, content, tags, file_path, updated_at)
         VALUES (@id, @projectId, @type, @title, @summary, @content, @tags, @filePath, @updatedAt)`
      )
      .run(document);
  }
}

function entryMetadata(entry: ProjectEntry): Record<string, string> {
  if (entry.type !== 'plot') {
    return {};
  }

  return {
    inspirationType: entry.inspirationType,
    relatedProjectIds: entry.relatedProjectIds.join(',')
  };
}

function safeJsonRecord(text: string): Record<string, string> {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

function safeJsonArray(text: string): string[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function toFtsQuery(keyword: string): string {
  return keyword
    .split(/\s+/)
    .map((term) => term.replace(/["']/g, '').trim())
    .filter(Boolean)
    .map((term) => `"${term}"*`)
    .join(' OR ');
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    aNorm += a[index] * a[index];
    bNorm += b[index] * b[index];
  }
  return aNorm && bNorm ? dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm)) : 0;
}
