type MockRow = Record<string, unknown>;

class MockStatement {
  private db: MockDatabase;
  private sql: string;

  constructor(db: MockDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  bind(..._params: unknown[]): this {
    return this;
  }
}

class MockDatabase {
  private tables: Map<string, { columns: string[]; rows: MockRow[] }> = new Map();
  private pragmas: Map<string, unknown> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_filename: string) {
    // Initialize standard pragmas
    this.pragmas.set('user_version', 0);
    this.pragmas.set('journal_mode', 'wal');
    this.pragmas.set('foreign_keys', 'ON');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pragma(key: string, _value?: unknown): unknown {
    return this.pragmas.get(key);
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql);
  }

  exec(sql: string): this {
    // Handle multi-statement SQL (for migrations/DDL)
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      this.executeRun(stmt + ';', []);
    }
    return this;
  }

  close(): void {
    // mock: no-op
  }

  // ---- Internal mock helpers ----

  executeRun(_sql: string, _params: unknown[]): { changes: number; lastInsertRowid: number } {
    const sql = _sql.trim().toUpperCase();

    // CREATE TABLE
    const createMatch = sql.match(/CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\((.+)\)/is);
    if (createMatch) {
      const tableName = createMatch[1];
      // Parse column names from the definition
      const colDefs = createMatch[2].split(',').map(c => c.trim());
      const columns = colDefs.map(c => c.split(/\s+/)[0].replace(/["`]/g, ''));
      if (!this.tables.has(tableName)) {
        this.tables.set(tableName, { columns, rows: [] });
      }
      return { changes: 0, lastInsertRowid: 0 };
    }

    // INSERT
    if (sql.startsWith('INSERT')) {
      const tableMatch = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        const table = this.tables.get(tableName);
        if (table) {
          const row: MockRow = {};
          // Parametrized INSERT: map ? placeholders to params
          for (const [i, col] of table.columns.entries()) {
            row[col] = _params[i] ?? null;
          }
          // Check UNIQUE constraints on 'id' column
          if ('id' in row && table.rows.some(r => r.id === row.id)) {
            const existing = table.rows.find(r => r.id === row.id);
            if (existing) {
              Object.assign(existing, row);
              return { changes: 1, lastInsertRowid: table.rows.indexOf(existing) + 1 };
            }
          }
          table.rows.push(row);
          return { changes: 1, lastInsertRowid: table.rows.length };
        }
      }
      return { changes: 1, lastInsertRowid: 1 };
    }

    // UPDATE
    if (sql.startsWith('UPDATE')) {
      const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
      if (tableMatch) {
        const table = this.tables.get(tableMatch[1]);
        if (table && table.rows.length > 0) {
          // Simply update the first row for mock purposes
          const row = table.rows[0];
          // Map set clause to params
          const setMatch = sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
          if (setMatch) {
            const setCols = setMatch[1].split(',').map(s => s.trim());
            for (const [i, sc] of setCols.entries()) {
              const colMatch = sc.match(/^(\w+)\s*=/);
              if (colMatch) {
                row[colMatch[1]] = _params[i] ?? null;
              }
            }
          }
          return { changes: 1, lastInsertRowid: 0 };
        }
      }
      return { changes: 0, lastInsertRowid: 0 };
    }

    // DELETE
    if (sql.startsWith('DELETE')) {
      const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
      if (tableMatch) {
        const table = this.tables.get(tableMatch[1]);
        if (table) {
          const len = table.rows.length;
          table.rows = [];
          return { changes: len, lastInsertRowid: 0 };
        }
      }
      return { changes: 0, lastInsertRowid: 0 };
    }

    // DROP TABLE
    if (sql.startsWith('DROP')) {
      const tableMatch = sql.match(/DROP\s+TABLE\s+IF\s+EXISTS\s+(\w+)/i);
      if (tableMatch) {
        this.tables.delete(tableMatch[1]);
      }
      return { changes: 0, lastInsertRowid: 0 };
    }

    return { changes: 0, lastInsertRowid: 0 };
  }

  executeQuery(_sql: string, _params: unknown[]): MockRow[] {
    const sql = _sql.trim().toUpperCase();

    // SELECT
    if (sql.startsWith('SELECT') || sql.startsWith('WITH')) {
      // Try to match table name from FROM clause
      const fromMatch = sql.match(/FROM\s+(\w+)/i);
      if (fromMatch) {
        const table = this.tables.get(fromMatch[1]);
        if (table) {
          // WHERE clause filtering
          if (sql.includes('WHERE')) {
            const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
            if (whereMatch) {
              const condition = whereMatch[1].trim();
              // Simple equality filter: col = ?
              const eqMatch = condition.match(/(\w+)\s*=\s*\?/);
              if (eqMatch) {
                const col = eqMatch[1];
                const val = _params[0];
                return table.rows.filter(r => String(r[col]) === String(val));
              }
              // IN filter with FTS5 match
              if (condition.includes('IN') && condition.includes('search_index')) {
                const ftsTable = this.tables.get('search_index');
                if (ftsTable) {
                  // Return rows from the main table based on FTS5 match
                  const searchTerm = _params[0] as string;
                  const ftsMatches = ftsTable.rows.filter(r => 
                    Object.values(r).some(v => String(v).toLowerCase().includes(String(searchTerm).toLowerCase()))
                  );
                  const matchedIds = ftsMatches.map(r => r.id);
                  return table.rows.filter(r => matchedIds.includes(r.id));
                }
              }
              // GLOB pattern for LIKE
              const likeMatch = condition.match(/(\w+)\s+(?:NOT\s+)?LIKE\s+\?/i);
              if (likeMatch) {
                const col = likeMatch[1];
                const pattern = String(_params[0]);
                const regex = new RegExp(pattern.replace(/_/g, '.').replace(/%/g, '.*'), 'i');
                return table.rows.filter(r => regex.test(String(r[col])));
              }
              // Simple count with condition
              if (condition.includes('COUNT(')) {
                const countCol = condition.match(/COUNT\(\*\)\s*=\s*(\d+)/);
                if (countCol) {
                  const expected = parseInt(countCol[1], 10);
                  return table.rows.length > 0 === (expected > 0) ? table.rows : [];
                }
              }
            }
          }

          // Handle aggregate functions
          if (sql.includes('COUNT(')) {
            const countAlias = sql.match(/COUNT\([^)]+\)\s+(?:as\s+)?(\w+)/i);
            if (countAlias || sql.includes('COUNT')) {
              const alias = countAlias?.[1] ?? 'count';
              return [{ [alias]: table.rows.length }];
            }
          }

          // LIMIT
          const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
          if (limitMatch) {
            return table.rows.slice(0, parseInt(limitMatch[1], 10));
          }

          return [...table.rows];
        }
      }
    }

    return [];
  }
}

const Database = MockDatabase as unknown as new (filename: string) => MockDatabase;

export default Database;
export { Database };
