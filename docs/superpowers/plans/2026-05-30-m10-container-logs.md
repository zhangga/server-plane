# Container Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users view recent Docker Compose logs for one service in one environment without SSHing into the host.

**Architecture:** Add a read-only API that validates environment, service name, and tail count, then runs `docker compose logs --tail <N> <service>` through an injected log reader. The frontend adds a container log drawer opened from each environment card, with service selection and a refresh button.

**Tech Stack:** Hono API, TypeScript, React, TanStack Query, Vitest, Docker Compose CLI.

---

### Task 1: Backend Container Logs API

**Files:**
- Create: `platform/src/docker/logs.ts`
- Modify: `platform/src/api/app.ts`
- Modify: `platform/src/server.ts`
- Modify: `platform/src/domain/errors.ts`
- Test: `platform/tests/environmentApi.test.ts`

- [x] Write failing tests for `GET /api/environments/:id/container-logs?service=tgateserver&tail=300`.
- [x] Verify tests fail because the route does not exist.
- [x] Implement `ComposeLogReader` and `runDockerComposeLogs`.
- [x] Inject `composeLogReader` into `createApp`.
- [x] Validate service whitelist and tail range.
- [x] Verify backend tests pass.

### Task 2: Frontend Container Logs Drawer

**Files:**
- Modify: `platform/web/src/api.ts`
- Modify: `platform/web/src/api.test.ts`
- Modify: `platform/web/src/types.ts`
- Create: `platform/web/src/components/ContainerLogsDrawer.tsx`
- Create: `platform/web/src/components/ContainerLogsDrawer.test.tsx`
- Modify: `platform/web/src/App.tsx`
- Modify: `platform/web/src/styles.css`

- [x] Write failing API client test for `fetchContainerLogs`.
- [x] Write failing drawer test for service selection and refresh.
- [x] Implement API client and shared types.
- [x] Implement drawer UI with default service `tgateserver`, tail 300, refresh, and error display.
- [x] Add a logs icon button to each environment card.
- [x] Verify frontend tests pass.

### Task 3: Verification And Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-05-30-m10-container-logs.md`

- [x] Document the container logs API and UI behavior.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm build:web`.
- [x] Run `docker compose -f platform/deploy/docker-compose.yml config`.
- [x] Browser-check opening logs, switching service, and refreshing with a mock API.
- [ ] Commit as `feat: add environment container logs`.
