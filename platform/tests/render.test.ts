import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderEnvironment } from '../src/compose/render.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const platformRoot = resolve(__dirname, '..');
const templateRoot = join(platformRoot, 'templates');

describe('renderEnvironment', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'pst-render-'));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('renders slot=1 compose without fixed container names', async () => {
    await renderEnvironment({
      name: 'foo',
      slot: 1,
      imageTag: 'master-latest',
      runtimeRoot: tmpRoot,
      templateRoot,
    });

    const yml = await readFile(join(tmpRoot, 'foo', 'docker-compose.yml'), 'utf8');

    expect(yml).not.toContain('container_name:');
    expect(yml).toContain('subnet: 172.19.0.0/16');
    expect(yml).toContain('gateway: 172.19.0.1');
    expect(yml).toContain('ipv4_address: 172.19.0.114');
    expect(yml).toContain('"20101:12001"');
    expect(yml).toContain('"20110:12010"');
    expect(yml).toContain('"20120:12020"');
    expect(yml).toContain('"20130:12030"');
    expect(yml).toContain('"20150:12050"');
    expect(yml).toContain('"20117:27017"');
    expect(yml).toContain('"20179:6379"');
    expect(yml).toContain('ETCD_ADDR: http://172.19.0.113:2379');
  });

  it('renders slot-specific Redis and Mongo addresses into external_config', async () => {
    await renderEnvironment({
      name: 'foo',
      slot: 1,
      imageTag: 'master-latest',
      runtimeRoot: tmpRoot,
      templateRoot,
    });

    const gameConfig = await readFile(
      join(tmpRoot, 'foo', 'external_config', 'game', 'config.yaml'),
      'utf8',
    );
    const globalConfig = await readFile(
      join(tmpRoot, 'foo', 'external_config', 'global', 'config.yaml'),
      'utf8',
    );
    const matcherConfig = await readFile(
      join(tmpRoot, 'foo', 'external_config', 'matcher', 'config.yaml'),
      'utf8',
    );

    expect(gameConfig).toContain('RedisIp: 172.19.0.111');
    expect(gameConfig).toContain('MongoConn: "mongodb://root:rFG4QoKXLtAZ@172.19.0.112:27017"');
    expect(globalConfig).toContain('MongoConn: "mongodb://root:rFG4QoKXLtAZ@172.19.0.112:27017"');
    expect(matcherConfig).toContain('RedisIp: 172.19.0.111');
  });

  it('renders different slot values for slot=5', async () => {
    await renderEnvironment({
      name: 'bar',
      slot: 5,
      imageTag: 'master-latest',
      runtimeRoot: tmpRoot,
      templateRoot,
    });

    const yml = await readFile(join(tmpRoot, 'bar', 'docker-compose.yml'), 'utf8');
    const gameConfig = await readFile(
      join(tmpRoot, 'bar', 'external_config', 'game', 'config.yaml'),
      'utf8',
    );

    expect(yml).toContain('subnet: 172.23.0.0/16');
    expect(yml).toContain('gateway: 172.23.0.1');
    expect(yml).toContain('"20501:12001"');
    expect(yml).toContain('ETCD_ADDR: http://172.23.0.113:2379');
    expect(gameConfig).toContain('RedisIp: 172.23.0.111');
    expect(gameConfig).toContain('MongoConn: "mongodb://root:rFG4QoKXLtAZ@172.23.0.112:27017"');
  });

  it('copies non-template external_config files into runtime/<name>/external_config/', async () => {
    await renderEnvironment({
      name: 'foo',
      slot: 1,
      imageTag: 'master-latest',
      runtimeRoot: tmpRoot,
      templateRoot,
    });

    const entrypointStat = await stat(join(tmpRoot, 'foo', 'external_config', 'entrypoint.sh'));
    expect(entrypointStat.isFile()).toBe(true);

    for (const svc of ['game', 'global', 'matcher', 'scenex', 'tgate']) {
      const log4jStat = await stat(
        join(tmpRoot, 'foo', 'external_config', svc, 'log4j2.xml'),
      );
      expect(log4jStat.isFile()).toBe(true);
    }
  });

  it('refuses to overwrite an existing runtime/<name> directory', async () => {
    await renderEnvironment({
      name: 'foo',
      slot: 1,
      imageTag: 'master-latest',
      runtimeRoot: tmpRoot,
      templateRoot,
    });

    await expect(
      renderEnvironment({
        name: 'foo',
        slot: 1,
        imageTag: 'master-latest',
        runtimeRoot: tmpRoot,
        templateRoot,
      }),
    ).rejects.toThrow(/already exists/);
  });
});
