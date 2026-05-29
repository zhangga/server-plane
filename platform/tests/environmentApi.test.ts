import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/api/app.js';
import type { ComposeCommand, ComposeRunner } from '../src/docker/compose.js';
import type { ImagePuller } from '../src/docker/ttgops.js';
import type { TaskQueue } from '../src/queue/taskQueue.js';
import { TaskProcessor } from '../src/worker/taskProcessor.js';
import { EnvironmentStore } from '../src/store/environmentStore.js';

class RecordingQueue implements TaskQueue {
  readonly taskIds: string[] = [];
  healthy = true;

  async enqueue(taskId: string): Promise<void> {
    this.taskIds.push(taskId);
  }

  async healthCheck(): Promise<boolean> {
    return this.healthy;
  }
}

describe('environment API with task worker', () => {
  let tempRoot: string;
  let runtimeRoot: string;
  let store: EnvironmentStore;
  let dockerCalls: ComposeCommand[];
  let pulledImages: string[];
  let queue: RecordingQueue;
  let processor: TaskProcessor;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'pst-api-'));
    runtimeRoot = join(tempRoot, 'runtime');
    store = new EnvironmentStore(join(tempRoot, 'metadata.sqlite'));
    dockerCalls = [];
    pulledImages = [];
    queue = new RecordingQueue();

    const dockerRunner: ComposeRunner = async (command) => {
      dockerCalls.push(command);
    };
    const imagePuller: ImagePuller = async (image) => {
      pulledImages.push(image);
    };

    processor = new TaskProcessor({
      store,
      dockerRunner,
      imagePuller,
      runtimeRoot,
      templateRoot: resolve('templates'),
    });
    app = createApp({
      store,
      taskQueue: queue,
      runtimeRoot,
    });
  });

  afterEach(async () => {
    store.close();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('returns health status', async () => {
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      checks: {
        queue: true,
        store: true,
      },
    });

    const slots = await app.request('/api/slots');
    expect(slots.status).toBe(200);
    expect(await slots.json()).toEqual({ occupiedSlots: [] });
  });

  it('returns 503 when queue health fails', async () => {
    queue.healthy = false;

    const res = await app.request('/api/health');

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      checks: {
        queue: false,
        store: true,
      },
    });
  });

  it('returns TASK_NOT_FOUND for missing task detail and logs', async () => {
    const detail = await app.request('/api/tasks/task_missing');
    expect(detail.status).toBe(404);
    expect(await detail.json()).toEqual({
      error: {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found',
      },
    });

    const logs = await app.request('/api/tasks/task_missing/logs');
    expect(logs.status).toBe(404);
    expect(await logs.json()).toEqual({
      error: {
        code: 'TASK_NOT_FOUND',
        message: 'Task not found',
      },
    });
  });

  it('enqueues create, worker renders runtime, and task logs are available over SSE', async () => {
    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice-dev', owner: 'alice' }),
    });

    expect(res.status).toBe(202);
    const accepted = await res.json();
    expect(accepted).toMatchObject({
      envId: expect.stringMatching(/^env_/),
      taskId: expect.stringMatching(/^task_/),
    });
    expect(queue.taskIds).toEqual([accepted.taskId]);
    expect(dockerCalls).toEqual([]);

    const queuedTask = await app.request(`/api/tasks/${accepted.taskId}`);
    expect(await queuedTask.json()).toMatchObject({
      id: accepted.taskId,
      envId: accepted.envId,
      type: 'env.create',
      status: 'queued',
    });

    await processor.processTask(accepted.taskId);

    const envRes = await app.request(`/api/environments/${accepted.envId}`);
    expect(await envRes.json()).toMatchObject({
      id: accepted.envId,
      name: 'alice-dev',
      owner: 'alice',
      slot: 1,
      state: 'running',
      ports: {
        tgate: 20101,
        gameserver: 20110,
        matcher: 20120,
        global: 20130,
        scenex: 20150,
        mongo: 20117,
        redis: 20179,
      },
      latestTask: {
        id: accepted.taskId,
        status: 'succeeded',
      },
    });

    const composeFile = join(runtimeRoot, 'alice-dev', 'docker-compose.yml');
    await expect(stat(composeFile)).resolves.toBeTruthy();
    const gameConfig = await readFile(
      join(runtimeRoot, 'alice-dev', 'external_config', 'game', 'config.yaml'),
      'utf8',
    );
    expect(gameConfig).toContain('RedisIp: 172.19.0.111');
    expect(gameConfig).toContain('MongoConn: "mongodb://root:rFG4QoKXLtAZ@172.19.0.112:27017"');
    expect(dockerCalls).toEqual([
      {
        projectName: 'pst-alice-dev',
        composeFile,
        cwd: join(runtimeRoot, 'alice-dev'),
        args: ['up', '-d'],
      },
    ]);

    const logsRes = await app.request(`/api/tasks/${accepted.taskId}/logs`);
    expect(logsRes.headers.get('content-type')).toContain('text/event-stream');
    const logs = await logsRes.text();
    expect(logs).toContain('event: log');
    expect(logs).toContain('create environment alice-dev');
    expect(logs).toContain('event: done');
    expect(logs).toContain('"status":"succeeded"');
  });

  it('runs stop, start, restart, wipe, and update-images tasks in the worker', async () => {
    const created = await createAndProcess('alice-dev');

    const stopTaskId = await postAction(created.envId, 'stop');
    await processor.processTask(stopTaskId);
    expect((await getJson(`/api/environments/${created.envId}`)).state).toBe('stopped');
    expect(dockerCalls.at(-1)?.args).toEqual(['stop']);

    const startTaskId = await postAction(created.envId, 'start');
    await processor.processTask(startTaskId);
    expect((await getJson(`/api/environments/${created.envId}`)).state).toBe('running');
    expect(dockerCalls.at(-1)?.args).toEqual(['up', '-d']);

    const restartTaskId = await postAction(created.envId, 'restart');
    await processor.processTask(restartTaskId);
    expect(dockerCalls.at(-1)?.args).toEqual(['restart']);

    const wipeTaskId = await postAction(created.envId, 'wipe');
    await processor.processTask(wipeTaskId);
    expect(dockerCalls.at(-2)?.args).toEqual(['down', '-v']);
    expect(dockerCalls.at(-1)?.args).toEqual(['up', '-d']);

    const updateTaskId = await postAction(created.envId, 'update-images');
    await processor.processTask(updateTaskId);
    expect(pulledImages).toEqual([
      'harbor-sh.dailygn.com/pst/tgateserver:master-latest',
      'harbor-sh.dailygn.com/pst/gameserver:master-latest',
      'harbor-sh.dailygn.com/pst/scenexserver:master-latest',
      'harbor-sh.dailygn.com/pst/globalserver:master-latest',
      'harbor-sh.dailygn.com/pst/matcherserver:master-latest',
    ]);
    expect(dockerCalls.at(-1)?.args).toEqual(['up', '-d']);
  });

  it('destroys an environment asynchronously and hides it from the active list', async () => {
    const created = await createAndProcess('alice-dev');

    const res = await app.request(`/api/environments/${created.envId}`, { method: 'DELETE' });
    expect(res.status).toBe(202);
    const accepted = await res.json();
    expect(accepted.envId).toBe(created.envId);
    expect(queue.taskIds.at(-1)).toBe(accepted.taskId);

    await processor.processTask(accepted.taskId);

    await expect(stat(join(runtimeRoot, 'alice-dev'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(dockerCalls.at(-1)).toEqual({
      projectName: 'pst-alice-dev',
      composeFile: join(runtimeRoot, 'alice-dev', 'docker-compose.yml'),
      cwd: join(runtimeRoot, 'alice-dev'),
      args: ['down', '-v', '--remove-orphans'],
    });
    expect(await getJson('/api/environments')).toEqual({ environments: [] });
    expect(await getJson('/api/environments?state=destroyed')).toMatchObject({
      environments: [{ id: created.envId, state: 'destroyed' }],
    });
  });

  it('destroys a failed environment even when no compose file exists', async () => {
    const now = new Date().toISOString();
    store.create({
      id: 'env_failed',
      name: 'broken-dev',
      owner: 'qa',
      slot: 1,
      imageTag: 'master-latest',
      state: 'failed',
      now,
    });

    const res = await app.request('/api/environments/env_failed', { method: 'DELETE' });
    expect(res.status).toBe(202);
    const accepted = await res.json();

    await processor.processTask(accepted.taskId);

    expect(dockerCalls).toEqual([]);
    expect(await getJson('/api/environments?state=destroyed')).toMatchObject({
      environments: [{ id: 'env_failed', state: 'destroyed' }],
    });
  });

  it('rejects invalid names and duplicate active names', async () => {
    const invalid = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice Dev', owner: 'alice' }),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: {
        code: 'INVALID_NAME',
        message: 'Environment name must be 3-40 chars of kebab-case lowercase letters and numbers',
      },
    });

    await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice-dev', owner: 'alice' }),
    });
    const duplicate = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice-dev', owner: 'alice' }),
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      error: {
        code: 'ENV_NAME_TAKEN',
        message: 'Environment name is already in use',
      },
    });
  });

  it('rejects a second task while one is in flight for the same environment', async () => {
    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice-dev', owner: 'alice' }),
    });
    const created = await res.json();

    const destroy = await app.request(`/api/environments/${created.envId}`, { method: 'DELETE' });

    expect(destroy.status).toBe(409);
    expect(await destroy.json()).toEqual({
      error: {
        code: 'TASK_RUNNING',
        message: 'Environment already has a task in progress',
      },
    });
  });

  it('returns NO_SLOT_AVAILABLE when all slots are occupied by queued creates', async () => {
    for (let i = 1; i <= 15; i += 1) {
      const res = await app.request('/api/environments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `env-${i}`, owner: 'qa' }),
      });
      expect(res.status).toBe(202);
    }

    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'env-full', owner: 'qa' }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: 'NO_SLOT_AVAILABLE',
        message: 'No environment slots are available',
      },
    });
  });

  async function createAndProcess(name: string): Promise<{ envId: string; taskId: string }> {
    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, owner: 'alice' }),
    });
    const created = await res.json();
    await processor.processTask(created.taskId);
    return created;
  }

  async function postAction(envId: string, action: string): Promise<string> {
    const res = await app.request(`/api/environments/${envId}/${action}`, { method: 'POST' });
    expect(res.status).toBe(202);
    const body = await res.json();
    return body.taskId;
  }

  async function getJson(path: string): Promise<any> {
    return (await app.request(path)).json();
  }
});
