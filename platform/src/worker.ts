import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBullTaskWorker } from './queue/bullmq.js';
import { runDockerCompose } from './docker/compose.js';
import { createTtgopsImagePuller } from './docker/ttgops.js';
import { EnvironmentStore } from './store/environmentStore.js';
import { TaskProcessor } from './worker/taskProcessor.js';

const runtimeRoot = resolve(process.env.PST_RUNTIME_ROOT ?? 'runtime');
const templateRoot = resolve(process.env.PST_TEMPLATE_ROOT ?? 'templates');
const dbPath = resolve(process.env.PST_DB_PATH ?? 'runtime/metadata.sqlite');
const redisUrl = process.env.PST_REDIS_URL ?? 'redis://127.0.0.1:6379';
const ttgopsBin = resolve(process.env.PST_TTGOPS_BIN ?? '../st-server-compose/ttgops-cli_linux64');
const ttgopsConfig = resolve(process.env.PST_TTGOPS_CONFIG ?? '../st-server-compose/.ttgops-cli.yaml');

mkdirSync(runtimeRoot, { recursive: true });

const store = new EnvironmentStore(dbPath);
const processor = new TaskProcessor({
  store,
  dockerRunner: runDockerCompose,
  imagePuller: createTtgopsImagePuller({
    binPath: ttgopsBin,
    configPath: ttgopsConfig,
  }),
  runtimeRoot,
  templateRoot,
});
const worker = createBullTaskWorker(redisUrl, processor);

worker.on('completed', (job) => {
  console.log(`task completed: ${job.data.taskId}`);
});
worker.on('failed', (job, err) => {
  console.error(`task failed: ${job?.data.taskId ?? 'unknown'}: ${err.message}`);
});

console.log('PST platform worker started');

async function shutdown(): Promise<void> {
  await worker.close();
  store.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
