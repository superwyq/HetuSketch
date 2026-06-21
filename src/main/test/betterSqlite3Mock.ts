type MockRow = Record<string, unknown>;

type MockTable = { columns: string[]; rows: MockRow[] };

class MockStatement {
  constructor(private readonly db: MockDatabase, private readonly sql: string) {}

  run(...params: unknown[]): { changes: number; lastInsertRowid: number } {
    return this.db.executeRun(this.sql, params);
  }

  get(...params: unknown[]): MockRow | undefined {
    const rows = this.db.executeQuery(this.sql, params);
    return rows.length > 0 ? rows[0] : undefined;
  }

  all(...params: unknown[]): MockRow[] {
    return this.db.executeQuery(this.sql, params);
  }

  bind(...params: unknown[]): this {
    void params;
    return this;
  }
}

class MockDatabase {
  private tables: Map<string, MockTable> = new Map();
  private pragmas: Map<string, unknown> = new Map();

  constructor(filename: string) {
    void filename;
    this.pragmas.set('user_version', 0);
    this.pragmas.set('journal_mode', 'wal');
    this.pragmas.set('foreign_keys', 'ON');
  }

  pragma(key: string, value?: unknown): unknown {
    void value;
    return this.pragmas.get(key.split('=')[0].trim());
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }

  exec(sql: string): this {
    const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      this.executeRun(`${statement};`, []);
    }
    return this;
  }

  transaction<T>(work: () => T): () => T {
    return work;
  }

  close(): void {
    // mock: no-op
  }

  executeRun(sqlInput: string, params: unknown[]): { changes: number; lastInsertRowid: number } {
    const sql = sqlInput.trim();
    const upper = sql.toUpperCase();

    const createMatch = sql.match(/CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*(?:USING\s+\w+)?\s*\((.+)\)/is);
    if (createMatch) {
      const tableName = normalizeName(createMatch[1]);
      const columns = splitColumns(createMatch[2]).map((definition) => normalizeName(definition.split(/\s+/)[0].replace(/["`]/g, '')));
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, { columns, rows: [] });
      }
      return { changes: 0, lastInsertRowid: 0 };
    }

    if (upper.startsWith('INSERT')) {
      const tableMatch = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)/i);
      if (!tableMatch) return { changes: 1, lastInsertRowid: 1 };
      const tableName = normalizeName(tableMatch[1]);
      const table = this.ensureTable(tableName);
      const columns = tableMatch[2].split(',').map((column) => normalizeName(column.trim()));
      const paramObject = isRecord(params[0]) ? params[0] : undefined;
      const row: MockRow = {};

      columns.forEach((column, index) => {
        row[column] = paramObject ? pickParam(paramObject, column) : params[index] ?? null;
      });

      for (const column of table.columns) {
        if (!(column in row)) row[column] = null;
      }

      // 解析 ON CONFLICT(col) DO UPDATE 子句，按冲突列判断 upsert
      const conflictMatch = sql.match(/ON\s+CONFLICT\s*\(([^)]+)\)/i);
      const conflictColumns = conflictMatch
        ? conflictMatch[1].split(',').map((c) => normalizeName(c.trim()))
        : [];

      let existing: MockRow | undefined;
      if (conflictColumns.length > 0) {
        existing = table.rows.find((item) =>
          conflictColumns.every((col) => String(item[col]) === String(row[col]))
        );
      } else if (row.id !== undefined) {
        existing = table.rows.find((item) => item.id === row.id);
      }

      if (existing) {
        Object.assign(existing, row);
        return { changes: 1, lastInsertRowid: table.rows.indexOf(existing) + 1 };
      }

      table.rows.push(row);
      return { changes: 1, lastInsertRowid: table.rows.length };
    }

    if (upper.startsWith('UPDATE')) {
      const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
      const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/is);
      if (!tableMatch || !setMatch) return { changes: 0, lastInsertRowid: 0 };
      const table = this.tables.get(normalizeName(tableMatch[1]));
      if (!table) return { changes: 0, lastInsertRowid: 0 };
      const rows = filterRows(table.rows, sql, params);
      const paramObject = isRecord(params[0]) ? params[0] : undefined;
      const assignments = setMatch[1].split(',').map((part) => part.trim());
      for (const row of rows) {
        assignments.forEach((assignment, index) => {
          const colMatch = assignment.match(/^(\w+)\s*=/);
          if (!colMatch) return;
          const column = normalizeName(colMatch[1]);
          row[column] = paramObject ? pickParam(paramObject, column) : params[index] ?? null;
        });
      }
      return { changes: rows.length, lastInsertRowid: 0 };
    }

    if (upper.startsWith('DELETE')) {
      const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
      if (!tableMatch) return { changes: 0, lastInsertRowid: 0 };
      const table = this.tables.get(normalizeName(tableMatch[1]));
      if (!table) return { changes: 0, lastInsertRowid: 0 };
      const before = table.rows.length;
      if (!upper.includes('WHERE')) {
        table.rows = [];
      } else {
        const toDelete = new Set(filterRows(table.rows, sql, params));
        table.rows = table.rows.filter((row) => !toDelete.has(row));
      }
      return { changes: before - table.rows.length, lastInsertRowid: 0 };
    }

    if (upper.startsWith('DROP')) {
      const tableMatch = sql.match(/DROP\s+TABLE\s+IF\s+EXISTS\s+(\w+)/i);
      if (tableMatch) this.tables.delete(normalizeName(tableMatch[1]));
      return { changes: 0, lastInsertRowid: 0 };
    }

    return { changes: 0, lastInsertRowid: 0 };
  }

  executeQuery(sqlInput: string, params: unknown[]): MockRow[] {
    const sql = sqlInput.trim();
    const upper = sql.toUpperCase();

    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) return [];

    if (upper.includes('FROM RECENT_ACCESS') && upper.includes('JOIN ENTRIES')) {
      const recent = this.tables.get('recent_access')?.rows ?? [];
      const entries = this.tables.get('entries')?.rows ?? [];
      return filterRows(recent, sql, params).map((access) => {
        const entry = entries.find((item) => item.project_id === access.project_id && item.id === access.entry_id) ?? {};
        return { ...entry, excerpt: entry.summary, accessed_at: access.accessed_at };
      });
    }

    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return [];
    const tableName = normalizeName(fromMatch[1]);
    const table = this.tables.get(tableName);
    if (!table) return aggregateEmpty(sql);

    let rows = filterRows(table.rows, sql, params);

    if (tableName === 'search_index' && upper.includes('MATCH')) {
      const keyword = normalizeSearch(String(pickParamObject(params)?.keyword ?? params[0] ?? ''));
      rows = rows.filter((row) => searchableRow(row).includes(keyword));
    }

    if (upper.includes('GROUP BY TYPE')) {
      const grouped = new Map<string, number>();
      for (const row of rows) grouped.set(String(row.type), (grouped.get(String(row.type)) ?? 0) + 1);
      return Array.from(grouped, ([type, count]) => ({ type, count }));
    }

    if (upper.includes('COUNT(')) {
      const alias = sql.match(/COUNT\([^)]+\)\s+(?:AS\s+)?(\w+)/i)?.[1] ?? 'count';
      return [{ [normalizeName(alias)]: rows.length }];
    }

    if (upper.includes('MAX(UPDATED_AT)')) {
      const latest = rows.map((row) => String(row.updated_at ?? '')).sort().at(-1);
      return [{ updatedAt: latest }];
    }

    if (upper.includes('ORDER BY UPDATED_AT DESC')) {
      rows = [...rows].sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
    }

    const limit = Number(pickParamObject(params)?.limit ?? sql.match(/LIMIT\s+(\d+)/i)?.[1] ?? rows.length);
    return rows.slice(0, limit).map((row) => projectSelectedColumns(row, sql));
  }

  private ensureTable(name: string): MockTable {
    const table = this.tables.get(name);
    if (table) return table;
    const created: MockTable = { columns: [], rows: [] };
    this.tables.set(name, created);
    return created;
  }
}

function filterRows(rows: MockRow[], sql: string, params: unknown[]): MockRow[] {
  const paramObject = pickParamObject(params);
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/is);
  if (!whereMatch) return [...rows];
  const where = whereMatch[1];

  return rows.filter((row) => {
    const equalityMatches = [...where.matchAll(/(\w+)\s*=\s*(?:@?(\w+)|\?)/g)];
    for (let index = 0; index < equalityMatches.length; index += 1) {
      const [, columnRaw, paramName] = equalityMatches[index];
      const column = normalizeName(columnRaw);
      const value = paramName ? pickParam(paramObject ?? {}, paramName) : params[index];
      if (value !== null && value !== undefined && String(row[column]) !== String(value)) return false;
    }

    if (where.includes('@projectId IS NULL') && paramObject?.projectId) {
      return String(row.project_id) === String(paramObject.projectId);
    }

    if (where.includes('@type IS NULL') && paramObject?.type) {
      return String(row.type) === String(paramObject.type);
    }

    if (where.includes('@todayStart')) {
      return String(row.updated_at ?? '') >= String(paramObject?.todayStart ?? '');
    }

    return true;
  });
}

function projectSelectedColumns(row: MockRow, sql: string): MockRow {
  if (!sql.toUpperCase().startsWith('SELECT *')) return { ...row };
  return { ...row };
}

function aggregateEmpty(sql: string): MockRow[] {
  if (sql.toUpperCase().includes('COUNT(')) return [{ count: 0 }];
  return [];
}

function splitColumns(input: string): string[] {
  const columns: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      columns.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) columns.push(current.trim());
  return columns.filter((column) => !/^(PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(column));
}

function normalizeName(name: string): string {
  return name.replace(/["`]/g, '').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickParamObject(params: unknown[]): Record<string, unknown> | undefined {
  return isRecord(params[0]) ? params[0] : undefined;
}

function pickParam(params: Record<string, unknown>, column: string): unknown {
  if (column in params) return params[column];
  const camel = column.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  if (camel in params) return params[camel];
  return undefined;
}

function normalizeSearch(value: string): string {
  return value.replace(/["*]/g, '').toLowerCase();
}

function searchableRow(row: MockRow): string {
  return Object.values(row).map((value) => String(value ?? '').toLowerCase()).join(' ');
}

const Database = MockDatabase as unknown as new (filename: string) => MockDatabase;

export default Database;
export { Database };
