import { describe, expect, it } from 'vitest';
import { parseComposePsJson } from '../src/docker/ps.js';

describe('compose ps parser', () => {
  it('normalizes docker compose ps json arrays', () => {
    const services = parseComposePsJson(
      JSON.stringify([
        {
          Service: 'tgateserver',
          Name: 'pst-alice-dev-tgateserver-1',
          Image: 'harbor-sh.dailygn.com/pst/tgateserver:master-latest',
          State: 'running',
          Status: 'Up 2 minutes',
          Health: 'healthy',
          ExitCode: 0,
          Publishers: [{ PublishedPort: 20101, TargetPort: 12001, Protocol: 'tcp' }],
        },
      ]),
    );

    expect(services).toEqual([
      {
        service: 'tgateserver',
        name: 'pst-alice-dev-tgateserver-1',
        image: 'harbor-sh.dailygn.com/pst/tgateserver:master-latest',
        state: 'running',
        status: 'Up 2 minutes',
        health: 'healthy',
        exitCode: 0,
        publishers: [{ publishedPort: 20101, targetPort: 12001, protocol: 'tcp' }],
      },
    ]);
  });

  it('normalizes newline-delimited docker compose ps json', () => {
    const services = parseComposePsJson(
      [
        JSON.stringify({ Service: 'redis', Name: 'pst-alice-dev-redis-1', State: 'running' }),
        JSON.stringify({ Service: 'mongodb', Name: 'pst-alice-dev-mongodb-1', State: 'exited', ExitCode: 1 }),
      ].join('\n'),
    );

    expect(services).toMatchObject([
      {
        service: 'redis',
        name: 'pst-alice-dev-redis-1',
        state: 'running',
      },
      {
        service: 'mongodb',
        name: 'pst-alice-dev-mongodb-1',
        state: 'exited',
        exitCode: 1,
      },
    ]);
  });
});
