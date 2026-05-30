#!/usr/bin/env tsx
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const runtimeRoot = resolve(process.env.PST_RUNTIME_ROOT ?? 'runtime');
const dbPath = resolve(process.env.PST_DB_PATH ?? `${runtimeRoot}/metadata.sqlite`);
const redisUrl = process.env.PST_REDIS_URL ?? 'redis://127.0.0.1:6379';
const templateRoot = resolve(process.env.PST_TEMPLATE_ROOT ?? 'templates');
const redisContainerName = process.env.PST_REDIS_CONTAINER ?? 'pst-platform-redis';

mkdirSync(runtimeRoot, { recursive: true });

await runOnce('vite', ['build', '--config', 'web/vite.config.ts']);
ensureLocalRedis(redisUrl);

const childEnv = {
  ...process.env,
  PST_RUNTIME_ROOT: runtimeRoot,
  PST_DB_PATH: dbPath,
  PST_REDIS_URL: redisUrl,
  PST_TEMPLATE_ROOT: templateRoot,
};

console.log('');
console.log('PST platform is starting...');
console.log('  UI/API: http://localhost:3000');
console.log(`  Runtime: ${runtimeRoot}`);
console.log('  Press Ctrl+C to stop API and worker.');
console.log('');

const children = [
  spawnChild('api', 'tsx', ['src/server.ts'], childEnv),
  spawnChild('worker', 'tsx', ['src/worker.ts'], childEnv),
];

let shuttingDown = false;

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.error(`\n${child.spawnargs.join(' ')} exited with ${signal ?? code ?? 0}; stopping local dev stack.`);
    stopChildren();
    process.exit(code ?? 1);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown(): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log('\nStopping local dev stack...');
  stopChildren();
}

function stopChildren(): void {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

async function runOnce(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function spawnChild(name: string, command: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawn(command, args, {
    env,
    stdio: ['inherit', 'inherit', 'inherit'],
  }).on('spawn', () => {
    console.log(`[${name}] started`);
  });
}

function ensureLocalRedis(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname;

  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.log(`Using external Redis at ${url}; skipping Docker Redis startup.`);
    return;
  }

  const port = parsed.port || '6379';
  const inspect = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', redisContainerName], {
    encoding: 'utf8',
  });

  if (inspect.status === 0) {
    if (inspect.stdout.trim() === 'true') {
      console.log(`Redis container ${redisContainerName} is already running.`);
      return;
    }

    runDocker(['start', redisContainerName], `start Redis container ${redisContainerName}`);
    return;
  }

  runDocker(
    ['run', '-d', '--name', redisContainerName, '-p', `${port}:6379`, 'redis:7.4-alpine'],
    `create Redis container ${redisContainerName}`,
  );
}

function runDocker(args: string[], label: string): void {
  const result = spawnSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
  if (result.status === 0) {
    console.log(`${label}: ok`);
    return;
  }

  const detail = (result.stderr || result.stdout || '').trim();
  throw new Error(
    `Failed to ${label}. Start Redis manually or set PST_REDIS_URL. ${detail ? `Docker said: ${detail}` : ''}`,
  );
}
