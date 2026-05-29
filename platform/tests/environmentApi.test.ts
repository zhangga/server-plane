import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/api/app.js';
import { EnvironmentStore } from '../src/store/environmentStore.js';
import type { ComposeRunner } from '../src/docker/compose.js';

interface DockerCall {
  projectName: string;
  composeFile: string;
  cwd: string;
  args: string[];
}

describe('environment API', () => {
  let tempRoot: string;
  let runtimeRoot: string;
  let store: EnvironmentStore;
  let dockerCalls: DockerCall[];
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'pst-api-'));
    runtimeRoot = join(tempRoot, 'runtime');
    store = new EnvironmentStore(join(tempRoot, 'metadata.sqlite'));
    dockerCalls = [];

    const dockerRunner: ComposeRunner = async (command) => {
      dockerCalls.push(command);
    };

    app = createApp({
      store,
      dockerRunner,
      runtimeRoot,
      templateRoot: resolve('templates'),
    });
  });

  afterEach(async () => {
    store.close();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('returns health status', async () => {
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('creates an environment, renders runtime files, and runs docker compose up', async () => {
    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice-dev', owner: 'alice' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      name: 'alice-dev',
      owner: 'alice',
      slot: 1,
      imageTag: 'master-latest',
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
    });
    expect(body.id).toMatch(/^env_/);
    expect(typeof body.createdAt).toBe('string');
    expect(typeof body.updatedAt).toBe('string');

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
  });

  it('rejects invalid names', async () => {
    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice Dev', owner: 'alice' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'INVALID_NAME',
        message: 'Environment name must be 3-40 chars of kebab-case lowercase letters and numbers',
      },
    });
  });

  it('rejects duplicate active environment names', async () => {
    await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice-dev', owner: 'alice' }),
    });

    const res = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice-dev', owner: 'alice' }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: 'ENV_NAME_TAKEN',
        message: 'Environment name is already in use',
      },
    });
  });

  it('lists active environments and returns details by id', async () => {
    const createRes = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice-dev', owner: 'alice' }),
    });
    const created = await createRes.json();

    const listRes = await app.request('/api/environments');
    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toMatchObject({
      environments: [{ id: created.id, name: 'alice-dev', state: 'running' }],
    });

    const detailRes = await app.request(`/api/environments/${created.id}`);
    expect(detailRes.status).toBe(200);
    expect(await detailRes.json()).toMatchObject({
      id: created.id,
      name: 'alice-dev',
      state: 'running',
    });
  });

  it('destroys an environment, removes runtime files, and runs docker compose down', async () => {
    const createRes = await app.request('/api/environments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'alice-dev', owner: 'alice' }),
    });
    const created = await createRes.json();

    const res = await app.request(`/api/environments/${created.id}`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: created.id, state: 'destroyed' });
    await expect(stat(join(runtimeRoot, 'alice-dev'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(dockerCalls.at(-1)).toEqual({
      projectName: 'pst-alice-dev',
      composeFile: join(runtimeRoot, 'alice-dev', 'docker-compose.yml'),
      cwd: join(runtimeRoot, 'alice-dev'),
      args: ['down', '-v', '--remove-orphans'],
    });

    const destroyedList = await app.request('/api/environments?state=destroyed');
    expect(await destroyedList.json()).toMatchObject({
      environments: [{ id: created.id, state: 'destroyed' }],
    });
  });

  it('returns NO_SLOT_AVAILABLE when all slots are occupied', async () => {
    for (let i = 1; i <= 15; i += 1) {
      const res = await app.request('/api/environments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `env-${i}`, owner: 'qa' }),
      });
      expect(res.status).toBe(201);
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
});
