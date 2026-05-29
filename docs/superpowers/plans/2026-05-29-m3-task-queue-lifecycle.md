# M3 队列、任务日志与生命周期实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 M2 的同步创建/销毁改成 task + worker 模型，并补齐 start/stop/restart/wipe/update-images 与 SSE 任务日志。

**Architecture:** API 进程只校验和入队，立即返回 `{envId, taskId}`；worker 消费 task，执行 M1 渲染、docker compose、ttgops pull 并更新环境/任务状态。测试使用内存队列和 fake docker/puller，不依赖 Redis 或真实 Docker；生产提供 BullMQ adapter 和独立 `dev:worker` 入口。

**Tech Stack:** TypeScript、Hono、BullMQ、SQLite、Node streams、Vitest。

---

## 核心变更

- SQLite 增加 `tasks` 和 `task_logs` 表。
- 写接口统一返回 `202`：
  - `POST /api/environments`
  - `DELETE /api/environments/:id`
  - `POST /api/environments/:id/start`
  - `POST /api/environments/:id/stop`
  - `POST /api/environments/:id/restart`
  - `POST /api/environments/:id/wipe`
  - `POST /api/environments/:id/update-images`
- `GET /api/tasks/:taskId` 返回任务状态、错误、时间戳。
- `GET /api/tasks/:taskId/logs` 返回 SSE；已完成任务会回放历史日志并发送 `done` 后关闭。
- 同一环境存在 `queued/running` task 时，新写操作返回 `TASK_RUNNING`。

## Worker 行为

- `env.create`：渲染 runtime，`docker compose up -d`，成功置 `running`，失败置 `failed`。
- `env.start`：必要时补渲染 runtime，执行 `docker compose up -d`，成功置 `running`。
- `env.stop`：执行 `docker compose stop`，成功置 `stopped`。
- `env.restart`：执行 `docker compose restart`，成功置 `running`。
- `env.destroy`：执行 `docker compose down -v --remove-orphans`，删除 runtime，成功置 `destroyed`。
- `env.wipe`：执行 `down -v` 后 `up -d`，成功置 `running`，保留 `external_config`。
- `env.update_images`：按 `PST_IMAGES` 执行 image pull，再 `up -d`，成功置 `running`。

## 验收标准

1. `pnpm typecheck` 通过。
2. `pnpm test` 通过，覆盖入队、worker 生命周期、TASK_RUNNING、task detail、SSE 日志。
3. `pnpm dev:api` 和 `pnpm dev:worker` 均可启动；真实环境需提供 `PST_REDIS_URL`。
4. M2 的同步写行为不再保留；写操作不阻塞 Docker 执行。
