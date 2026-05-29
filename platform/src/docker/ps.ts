import { spawn } from 'node:child_process';

export interface ComposePsCommand {
  projectName: string;
  composeFile: string;
  cwd: string;
}

export interface ComposePsPublisher {
  publishedPort: number | null;
  targetPort: number | null;
  protocol: string | null;
}

export interface ComposePsService {
  service: string;
  name: string | null;
  image: string | null;
  state: string | null;
  status: string | null;
  health: string | null;
  exitCode: number | null;
  publishers: ComposePsPublisher[];
}

export type ComposePsReader = (command: ComposePsCommand) => Promise<ComposePsService[]>;

export const runDockerComposePs: ComposePsReader = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['compose', '-p', command.projectName, '-f', command.composeFile, 'ps', '--format', 'json'],
      {
        cwd: command.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(parseComposePsJson(stdout));
        return;
      }
      reject(new Error(`docker compose ps failed with code ${code}: ${(stderr || stdout).trim()}`));
    });
  });

export function parseComposePsJson(output: string): ComposePsService[] {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }

  const rows = parseRows(trimmed);
  return rows.map(normalizeService);
}

function parseRows(output: string): unknown[] {
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return output
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  }
}

function normalizeService(row: unknown): ComposePsService {
  const record = asRecord(row);
  return {
    service: stringField(record, 'Service', 'service') ?? '',
    name: stringField(record, 'Name', 'name'),
    image: stringField(record, 'Image', 'image'),
    state: stringField(record, 'State', 'state'),
    status: stringField(record, 'Status', 'status'),
    health: stringField(record, 'Health', 'health'),
    exitCode: numberField(record, 'ExitCode', 'exitCode'),
    publishers: arrayField(record, 'Publishers', 'publishers').map(normalizePublisher),
  };
}

function normalizePublisher(row: unknown): ComposePsPublisher {
  const record = asRecord(row);
  return {
    publishedPort: numberField(record, 'PublishedPort', 'publishedPort'),
    targetPort: numberField(record, 'TargetPort', 'targetPort'),
    protocol: stringField(record, 'Protocol', 'protocol'),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }
  return null;
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function arrayField(record: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}
