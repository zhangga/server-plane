import { describe, expect, it, vi } from 'vitest';
import { createEnvironment, deleteEnvironment, fetchEnvironments, postEnvironmentAction } from './api';

describe('web api client', () => {
  it('fetches environment list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        expect(url).toBe('/api/environments');
        return jsonResponse({ environments: [] });
      }),
    );

    await expect(fetchEnvironments()).resolves.toEqual([]);
  });

  it('fetches environment list with owner filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        expect(url).toBe('/api/environments?owner=alice');
        return jsonResponse({ environments: [] });
      }),
    );

    await expect(fetchEnvironments({ owner: 'alice' })).resolves.toEqual([]);
  });

  it('fetches environment list with state and owner filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        expect(url).toBe('/api/environments?owner=alice&state=destroyed');
        return jsonResponse({ environments: [] });
      }),
    );

    await expect(fetchEnvironments({ owner: 'alice', state: 'destroyed' })).resolves.toEqual([]);
  });

  it('creates environments and returns accepted task ids', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        expect(url).toBe('/api/environments');
        expect(init).toMatchObject({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'alice-dev', owner: 'alice', imageTag: 'feature-123' }),
        });
        return jsonResponse({ envId: 'env_1', taskId: 'task_1' }, 202);
      }),
    );

    await expect(createEnvironment({ name: 'alice-dev', owner: 'alice', imageTag: 'feature-123' })).resolves.toEqual({
      envId: 'env_1',
      taskId: 'task_1',
    });
  });

  it('posts actions and delete requests', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/environments/env_1/stop') {
        expect(init).toMatchObject({ method: 'POST' });
        return jsonResponse({ envId: 'env_1', taskId: 'task_stop' }, 202);
      }
      if (url === '/api/environments/env_1') {
        expect(init).toMatchObject({ method: 'DELETE' });
        return jsonResponse({ envId: 'env_1', taskId: 'task_destroy' }, 202);
      }
      throw new Error(`unexpected request ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(postEnvironmentAction('env_1', 'stop')).resolves.toEqual({
      envId: 'env_1',
      taskId: 'task_stop',
    });
    await expect(deleteEnvironment('env_1')).resolves.toEqual({
      envId: 'env_1',
      taskId: 'task_destroy',
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
