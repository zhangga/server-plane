import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { EnvironmentService } from '../domain/environments.js';
import { AppError, toErrorResponse } from '../domain/errors.js';
import type { TaskQueue } from '../queue/taskQueue.js';
import type { EnvironmentState, EnvironmentStore, TaskRecord } from '../store/environmentStore.js';

export interface AppDeps {
  store: EnvironmentStore;
  taskQueue: TaskQueue;
  runtimeRoot: string;
}

const TERMINAL_TASK_STATUSES = new Set<TaskRecord['status']>(['succeeded', 'failed']);
const PUBLIC_ROOT = './public';
const PUBLIC_INDEX = './public/index.html';

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const environments = new EnvironmentService({
    store: deps.store,
    taskQueue: deps.taskQueue,
  });

  app.get('/api/health', async (c) => {
    const checks = {
      store: deps.store.healthCheck(),
      queue: await deps.taskQueue.healthCheck(),
    };
    const ok = Object.values(checks).every(Boolean);
    return c.json({ ok, checks }, ok ? 200 : 503);
  });

  app.get('/api/slots', (c) => c.json({ occupiedSlots: deps.store.occupiedSlots() }));

  app.get('/api/environments', (c) => {
    const state = c.req.query('state') as EnvironmentState | undefined;
    return c.json({ environments: environments.list(state) });
  });

  app.post('/api/environments', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      return c.json(
        await environments.create({
          name: body.name,
          owner: body.owner,
        }),
        202,
      );
    } catch (err) {
      return errorJson(c, err);
    }
  });

  app.get('/api/environments/:id', (c) => {
    try {
      return c.json(environments.get(c.req.param('id')));
    } catch (err) {
      return errorJson(c, err);
    }
  });

  app.delete('/api/environments/:id', async (c) => {
    try {
      return c.json(await environments.destroy(c.req.param('id')), 202);
    } catch (err) {
      return errorJson(c, err);
    }
  });

  for (const action of ['start', 'stop', 'restart', 'wipe', 'update-images'] as const) {
    app.post(`/api/environments/:id/${action}`, async (c) => {
      try {
        return c.json(await environments.enqueueAction(c.req.param('id'), action), 202);
      } catch (err) {
        return errorJson(c, err);
      }
    });
  }

  app.get('/api/tasks/:taskId', (c) => {
    try {
      const task = deps.store.findTaskById(c.req.param('taskId'));
      if (!task) {
        throw new AppError('TASK_NOT_FOUND', 'Task not found');
      }
      return c.json(task);
    } catch (err) {
      return errorJson(c, err);
    }
  });

  app.get('/api/tasks/:taskId/logs', (c) => {
    const taskId = c.req.param('taskId');
    if (!deps.store.findTaskById(taskId)) {
      return errorJson(c, new AppError('TASK_NOT_FOUND', 'Task not found'));
    }
    const lastEventId = Number.parseInt(c.req.header('Last-Event-ID') ?? '0', 10);
    const stream = createTaskLogStream(deps.store, taskId, Number.isFinite(lastEventId) ? lastEventId : 0);
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    });
  });

  if (existsSync(PUBLIC_INDEX)) {
    app.use('/assets/*', serveStatic({ root: PUBLIC_ROOT }));
    app.get('*', serveStatic({ path: PUBLIC_INDEX }));
  }

  return app;
}

function errorJson(c: Context, err: unknown): Response {
  const { status, body } = toErrorResponse(err);
  return c.json(body, status);
}

function createTaskLogStream(store: EnvironmentStore, taskId: string, afterSeq: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let cursor = afterSeq;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const pump = () => {
        if (closed) {
          return;
        }

        const task = store.findTaskById(taskId);
        if (!task) {
          controller.enqueue(encoder.encode(sse('error', { code: 'ENV_NOT_FOUND', message: 'Task not found' })));
          closed = true;
          controller.close();
          return;
        }

        const logs = store.listTaskLogs(taskId, cursor);
        for (const log of logs) {
          cursor = log.seq;
          controller.enqueue(encoder.encode(sse('log', log.message, log.seq)));
        }

        if (TERMINAL_TASK_STATUSES.has(task.status)) {
          controller.enqueue(encoder.encode(sse('done', { status: task.status })));
          closed = true;
          controller.close();
          return;
        }

        timer = setTimeout(pump, 500);
      };

      pump();
    },
    cancel() {
      closed = true;
      if (timer) {
        clearTimeout(timer);
      }
    },
  });
}

function sse(event: string, data: unknown, id?: number): string {
  const idLine = id === undefined ? '' : `id: ${id}\n`;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `${idLine}event: ${event}\ndata: ${payload}\n\n`;
}
