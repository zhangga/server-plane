import { Hono } from 'hono';
import { EnvironmentService, type EnvironmentServiceDeps } from '../domain/environments.js';
import { toErrorResponse } from '../domain/errors.js';
import type { EnvironmentState } from '../store/environmentStore.js';

export type AppDeps = EnvironmentServiceDeps;

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const environments = new EnvironmentService(deps);

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.get('/api/environments', (c) => {
    const state = c.req.query('state') as EnvironmentState | undefined;
    return c.json({ environments: environments.list(state) });
  });

  app.post('/api/environments', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const env = await environments.create({
        name: body.name,
        owner: body.owner,
      });
      return c.json(env, 201);
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      return c.json(body, status);
    }
  });

  app.get('/api/environments/:id', (c) => {
    try {
      return c.json(environments.get(c.req.param('id')));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      return c.json(body, status);
    }
  });

  app.delete('/api/environments/:id', async (c) => {
    try {
      return c.json(await environments.destroy(c.req.param('id')));
    } catch (err) {
      const { status, body } = toErrorResponse(err);
      return c.json(body, status);
    }
  });

  return app;
}
