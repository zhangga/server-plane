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
export type TaskType =
  | 'env.create'
  | 'env.start'
  | 'env.stop'
  | 'env.restart'
  | 'env.destroy'
  | 'env.wipe'
  | 'env.update_images';
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

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

export interface TaskRecord {
  id: string;
  envId: string;
  type: TaskType;
  status: TaskStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface TaskLogRecord {
  taskId: string;
  seq: number;
  message: string;
  createdAt: string;
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

interface TaskRow {
  id: string;
  env_id: string;
  type: TaskType;
  status: TaskStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

interface TaskLogRow {
  task_id: string;
  seq: number;
  message: string;
  created_at: string;
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

function toTaskRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    envId: row.env_id,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
  };
}

function toTaskLogRecord(row: TaskLogRow): TaskLogRecord {
  return {
    taskId: row.task_id,
    seq: row.seq,
    message: row.message,
    createdAt: row.created_at,
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

export interface CreateTaskInput {
  id: string;
  envId: string;
  type: TaskType;
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

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        env_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        error TEXT,
        FOREIGN KEY(env_id) REFERENCES environments(id)
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_env_id ON tasks(env_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

      CREATE TABLE IF NOT EXISTS task_logs (
        task_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(task_id, seq),
        FOREIGN KEY(task_id) REFERENCES tasks(id)
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  healthCheck(): boolean {
    this.db.prepare('SELECT 1').get();
    return true;
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

  list(opts: { state?: EnvironmentState; owner?: string } = {}): EnvironmentRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (opts.state) {
      clauses.push('state = ?');
      params.push(opts.state);
    } else {
      clauses.push("state != 'destroyed'");
    }

    if (opts.owner) {
      clauses.push('owner = ?');
      params.push(opts.owner);
    }

    const rows = this.db
      .prepare(`SELECT * FROM environments WHERE ${clauses.join(' AND ')} ORDER BY created_at ASC`)
      .all(...params) as EnvironmentRow[];
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

  createTask(input: CreateTaskInput): TaskRecord {
    this.db
      .prepare(
        `INSERT INTO tasks (id, env_id, type, status, created_at, started_at, finished_at, error)
         VALUES (?, ?, ?, 'queued', ?, NULL, NULL, NULL)`,
      )
      .run(input.id, input.envId, input.type, input.now);
    const task = this.findTaskById(input.id);
    if (!task) {
      throw new Error(`Failed to read created task ${input.id}`);
    }
    return task;
  }

  findTaskById(id: string): TaskRecord | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? toTaskRecord(row) : undefined;
  }

  latestTaskForEnv(envId: string): TaskRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM tasks WHERE env_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(envId) as TaskRow | undefined;
    return row ? toTaskRecord(row) : undefined;
  }

  findInFlightTaskForEnv(envId: string): TaskRecord | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM tasks WHERE env_id = ? AND status IN ('queued', 'running') ORDER BY created_at ASC LIMIT 1",
      )
      .get(envId) as TaskRow | undefined;
    return row ? toTaskRecord(row) : undefined;
  }

  updateTaskStatus(
    id: string,
    status: TaskStatus,
    now: string,
    opts: { error?: string | null } = {},
  ): TaskRecord | undefined {
    if (status === 'running') {
      this.db
        .prepare('UPDATE tasks SET status = ?, started_at = ?, error = NULL WHERE id = ?')
        .run(status, now, id);
    } else if (status === 'succeeded' || status === 'failed') {
      this.db
        .prepare('UPDATE tasks SET status = ?, finished_at = ?, error = ? WHERE id = ?')
        .run(status, now, opts.error ?? null, id);
    } else {
      this.db.prepare('UPDATE tasks SET status = ?, error = ? WHERE id = ?').run(status, opts.error ?? null, id);
    }
    return this.findTaskById(id);
  }

  appendTaskLog(taskId: string, message: string, now: string): TaskLogRecord {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS nextSeq FROM task_logs WHERE task_id = ?')
      .get(taskId) as { nextSeq: number };
    this.db
      .prepare('INSERT INTO task_logs (task_id, seq, message, created_at) VALUES (?, ?, ?, ?)')
      .run(taskId, row.nextSeq, message, now);
    return {
      taskId,
      seq: row.nextSeq,
      message,
      createdAt: now,
    };
  }

  listTaskLogs(taskId: string, afterSeq = 0): TaskLogRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM task_logs WHERE task_id = ? AND seq > ? ORDER BY seq ASC')
      .all(taskId, afterSeq) as TaskLogRow[];
    return rows.map(toTaskLogRecord);
  }
}
