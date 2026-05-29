import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './api/app.js';
import { runDockerCompose } from './docker/compose.js';
import { EnvironmentStore } from './store/environmentStore.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const runtimeRoot = resolve(process.env.PST_RUNTIME_ROOT ?? 'runtime');
const templateRoot = resolve(process.env.PST_TEMPLATE_ROOT ?? 'templates');
const dbPath = resolve(process.env.PST_DB_PATH ?? 'runtime/metadata.sqlite');

mkdirSync(runtimeRoot, { recursive: true });

const store = new EnvironmentStore(dbPath);
const app = createApp({
  store,
  dockerRunner: runDockerCompose,
  runtimeRoot,
  templateRoot,
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`PST platform API listening on http://localhost:${info.port}`);
});

function shutdown(): void {
  store.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
