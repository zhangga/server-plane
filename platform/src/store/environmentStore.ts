import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSyncInstance;
};

interface DatabaseSyncInstance {
  exec(sql: string): void;
  prepare(sql: string): StatementSyncInstance;
  close(): void;
}

interface StatementSyncInstance {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export type EnvironmentState = 'creating' | 'running' | 'stopped' | 'failed' | 'destroying' | 'destroyed';

export interface EnvironmentRecord {
  id: string;
  name: string;
  owner: string;
  slot: number;
  imageTag: string;
  state: EnvironmentState;
  createdAt: string;
  updatedAt: string;
}

interface EnvironmentRow {
  id: string;
  name: string;
  owner: string;
  slot: number;
  image_tag: string;
  state: EnvironmentState;
  created_at: string;
  updated_at: string;
}

function toRecord(row: EnvironmentRow): EnvironmentRecord {
  return {
    id: row.id,
    name: row.name,
    owner: row.owner,
    slot: row.slot,
    imageTag: row.image_tag,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateEnvironmentRecordInput {
  id: string;
  name: string;
  owner: string;
  slot: number;
  imageTag: string;
  state: EnvironmentState;
  now: string;
}

export class EnvironmentStore {
  private readonly db: DatabaseSyncInstance;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS environments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        slot INTEGER NOT NULL,
        image_tag TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_environments_name ON environments(name);
      CREATE INDEX IF NOT EXISTS idx_environments_state ON environments(state);
    `);
  }

  close(): void {
    this.db.close();
  }

  create(input: CreateEnvironmentRecordInput): EnvironmentRecord {
    this.db
      .prepare(
        `INSERT INTO environments (id, name, owner, slot, image_tag, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.name,
        input.owner,
        input.slot,
        input.imageTag,
        input.state,
        input.now,
        input.now,
      );
    const created = this.findById(input.id);
    if (!created) {
      throw new Error(`Failed to read created environment ${input.id}`);
    }
    return created;
  }

  findById(id: string): EnvironmentRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM environments WHERE id = ?')
      .get(id) as EnvironmentRow | undefined;
    return row ? toRecord(row) : undefined;
  }

  findActiveByName(name: string): EnvironmentRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM environments WHERE name = ? AND state != 'destroyed' ORDER BY created_at DESC LIMIT 1")
      .get(name) as EnvironmentRow | undefined;
    return row ? toRecord(row) : undefined;
  }

  list(opts: { state?: EnvironmentState } = {}): EnvironmentRecord[] {
    const rows = opts.state
      ? (this.db
          .prepare('SELECT * FROM environments WHERE state = ? ORDER BY created_at ASC')
          .all(opts.state) as EnvironmentRow[])
      : (this.db
          .prepare("SELECT * FROM environments WHERE state != 'destroyed' ORDER BY created_at ASC")
          .all() as EnvironmentRow[]);
    return rows.map(toRecord);
  }

  occupiedSlots(): number[] {
    const rows = this.db
      .prepare(
        "SELECT slot FROM environments WHERE state IN ('creating', 'running', 'stopped', 'failed', 'destroying')",
      )
      .all() as Array<{ slot: number }>;
    return rows.map((row) => row.slot);
  }

  updateState(id: string, state: EnvironmentState, now: string): EnvironmentRecord | undefined {
    this.db
      .prepare('UPDATE environments SET state = ?, updated_at = ? WHERE id = ?')
      .run(state, now, id);
    return this.findById(id);
  }
}
