# M2 单环境创建/销毁最小后端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `platform/` 中增加一个最小 Hono API，让 curl 可以创建、查看、销毁一套由 M1 渲染出的 compose 环境。

**Architecture:** M2 不引入队列、任务表、SSE 或前端；写操作在 HTTP 请求内同步执行。元数据保存在 SQLite，API 调用 M1 的 `renderEnvironment` 后执行 `docker compose up -d`，销毁时执行 `docker compose down -v --remove-orphans` 并删除 `runtime/<name>`。测试注入 fake docker runner，不真实启动容器。

**Tech Stack:** TypeScript、Hono、`@hono/node-server`、Node 22 `node:sqlite`、Vitest。

---

## 文件结构

- `platform/src/api/app.ts`：创建 Hono app，注册 health/environments 路由。
- `platform/src/domain/environments.ts`：创建/销毁业务流程、校验、slot 分配。
- `platform/src/domain/errors.ts`：统一业务错误与 HTTP error code。
- `platform/src/domain/ports.ts`：环境端口映射响应。
- `platform/src/docker/compose.ts`：封装 `docker compose -p ... -f ... <args>`。
- `platform/src/store/environmentStore.ts`：SQLite 表结构和环境 CRUD。
- `platform/src/server.ts`：Node HTTP 启动入口。
- `platform/tests/environmentApi.test.ts`：API 集成测试，注入临时 DB/runtime 和 fake docker。

## 行为约定

- `POST /api/environments` body 为 `{name, owner}`，创建成功返回 `201` 与环境详情。
- `DELETE /api/environments/:id` 同步销毁环境，成功返回 `{id, state: "destroyed"}`。
- `GET /api/environments` 默认返回非 destroyed 环境；`?state=destroyed` 可查 destroyed。
- `GET /api/environments/:id` 返回单个环境，找不到返回 `ENV_NOT_FOUND`。
- `GET /api/health` 返回 `{ok: true}`。
- 名称必须是 3-40 位 kebab-case：小写字母/数字开头和结尾，中间允许 `-`。
- 创建时自动分配最小可用 slot，默认范围 `1..15`；active/failed 环境占用 slot，destroyed 不占用。
- 创建失败时环境状态置为 `failed`，保留 row 和 runtime 目录供排查。
- 销毁只允许 `running/stopped/failed/creating` 状态；destroyed 再销毁返回 `INVALID_STATE_TRANSITION`。

## 验收标准

1. `pnpm typecheck` 通过。
2. `pnpm test` 通过，覆盖 health、create、duplicate name、invalid name、delete、no slot。
3. API 测试断言 fake docker 收到 `up -d` 和 `down -v --remove-orphans`。
4. 创建接口会生成 `runtime/<name>/docker-compose.yml` 与 slot-aware `external_config`。
5. `pnpm dev:api` 能启动本地 API，供后续在中央机用 curl dogfood。

## M2 不做

- 不实现 bullmq/task 表/SSE。
- 不实现 start/stop/restart/wipe/update-images。
- 不做真实 Docker 启动自动测试。
- 不做鉴权、前端、部署 compose。
