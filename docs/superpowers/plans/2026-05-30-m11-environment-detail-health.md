# Environment Detail Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an environment detail view that shows first-layer Docker Compose service status, paths, ports, and recent task context.

**Architecture:** Add a read-only API that combines existing environment metadata with `docker compose ps --format json` output through an injected reader. The frontend opens a right-side detail drawer from each environment card and displays metadata plus a service status table, with per-service handoff to the existing container log drawer.

**Tech Stack:** Hono API, TypeScript, React, TanStack Query, Vitest, Docker Compose CLI.

---

### Task 1: Backend Detail API

**Files:**
- Create: `platform/src/docker/ps.ts`
- Modify: `platform/src/api/app.ts`
- Modify: `platform/src/server.ts`
- Test: `platform/tests/environmentApi.test.ts`
- Test: `platform/tests/composePs.test.ts`

- [x] Write failing API tests for `GET /api/environments/:id/detail`.
- [x] Write failing parser tests for Docker Compose ps JSON output.
- [x] Implement `ComposePsReader`, `runDockerComposePs`, and `parseComposePsJson`.
- [x] Inject `composePsReader` into `createApp`.
- [x] Build detail response with `composeProject`, `runtimePath`, `composeFile`, existing environment response, and all expected services.
- [x] Mark services absent from ps output as `missing: true`.
- [x] Verify backend tests pass.

### Task 2: Frontend Detail Drawer

**Files:**
- Modify: `platform/web/src/types.ts`
- Modify: `platform/web/src/api.ts`
- Modify: `platform/web/src/api.test.ts`
- Create: `platform/web/src/components/EnvironmentDetailDrawer.tsx`
- Create: `platform/web/src/components/EnvironmentDetailDrawer.test.tsx`
- Modify: `platform/web/src/App.tsx`
- Modify: `platform/web/src/styles.css`

- [x] Write failing API client test for `fetchEnvironmentDetail`.
- [x] Write failing drawer test that renders project/path/task/service status and triggers service logs.
- [x] Implement shared detail types and API client.
- [x] Implement `EnvironmentDetailDrawer`.
- [x] Add a details icon button to environment cards.
- [x] Wire service log buttons in the detail drawer to the existing container logs drawer.
- [x] Verify frontend tests pass.

### Task 3: Verification And Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-05-30-m11-environment-detail-health.md`

- [x] Document the detail view and Docker-level health boundary.
- [x] Run `pnpm typecheck`.
- [x] Run `pnpm test`.
- [x] Run `pnpm build:web`.
- [x] Run `docker compose -f platform/deploy/docker-compose.yml config`.
- [x] Browser-check opening details, reading service status, opening service logs, and refreshing details with a mock API.
- [ ] Commit as `feat: add environment detail health view`.
