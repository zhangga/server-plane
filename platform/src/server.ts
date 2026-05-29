import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './api/app.js';
import { runDockerComposeLogs } from './docker/logs.js';
import { runDockerComposePs } from './docker/ps.js';
import { BullTaskQueue } from './queue/bullmq.js';
import { EnvironmentStore } from './store/environmentStore.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const runtimeRoot = resolve(process.env.PST_RUNTIME_ROOT ?? 'runtime');
const dbPath = resolve(process.env.PST_DB_PATH ?? 'runtime/metadata.sqlite');
const redisUrl = process.env.PST_REDIS_URL ?? 'redis://127.0.0.1:6379';

mkdirSync(runtimeRoot, { recursive: true });

const store = new EnvironmentStore(dbPath);
const taskQueue = new BullTaskQueue(redisUrl);
const app = createApp({
  store,
  taskQueue,
  runtimeRoot,
  composeLogReader: runDockerComposeLogs,
  composePsReader: runDockerComposePs,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`PST platform API listening on http://localhost:${info.port}`);
});

async function shutdown(): Promise<void> {
  await taskQueue.close();
  store.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
