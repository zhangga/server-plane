import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(__dirname, '..');
const templateRoot = join(platformRoot, 'templates');

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn('pnpm', ['exec', 'tsx', 'scripts/render.ts', ...args], {
      cwd: platformRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
      resolveResult({ code, stdout, stderr });
    });
  });
}

describe('render CLI', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'pst-cli-'));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('renders an environment and prints the start command', async () => {
    const result = await runCli([
      '--name',
      'demo',
      '--slot',
      '1',
      '--runtime-root',
      tmpRoot,
      '--template-root',
      templateRoot,
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(join(tmpRoot, 'demo', 'docker-compose.yml'));
    expect(result.stdout).toContain('docker compose -p pst-demo');
  });

  it('returns exit code 2 for an invalid slot', async () => {
    const result = await runCli([
      '--name',
      'demo',
      '--slot',
      '99',
      '--runtime-root',
      tmpRoot,
      '--template-root',
      templateRoot,
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Slot 99 is out of valid range [1, 15]');
  });

  it('returns exit code 3 when the environment directory already exists', async () => {
    await runCli([
      '--name',
      'demo',
      '--slot',
      '1',
      '--runtime-root',
      tmpRoot,
      '--template-root',
      templateRoot,
    ]);

    const result = await runCli([
      '--name',
      'demo',
      '--slot',
      '1',
      '--runtime-root',
      tmpRoot,
      '--template-root',
      templateRoot,
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain('environment directory already exists');
  });
});
