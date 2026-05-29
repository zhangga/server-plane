# M4 前端 MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `platform/web/` 中实现 React + Vite 单页前端，让测试同学可以创建环境、查看列表、执行生命周期操作并观察任务日志。

**Architecture:** 前端使用 React、TanStack Query 和原生 SSE；API client 单独封装，UI 通过 Query 轮询环境列表。构建输出到 `platform/public/`，Hono API 进程 serve 静态资源。M4 不引入登录、路由系统或复杂状态管理。

**Tech Stack:** React、Vite、TanStack Query、lucide-react、Vitest、Testing Library。

---

## 核心界面

- 顶栏：环境平台标题、运行统计、创建按钮。
- 左侧过滤：全部、我的、运行中、已停止、失败、已销毁。
- 主区域：环境卡片列表，显示 name、owner、slot、state、端口和最新任务。
- 创建弹窗：`name` + `owner`，提交后打开任务抽屉。
- 操作按钮：start/stop/restart/wipe/update-images/destroy，按 state 和 in-flight task 禁用。
- 任务抽屉：连接 `/api/tasks/:taskId/logs`，显示日志和完成状态。

## 验收标准

1. `pnpm test` 通过，覆盖 API client、动作可用性、创建表单基本交互。
2. `pnpm typecheck` 通过。
3. `pnpm build:web` 通过并输出 `platform/public/`。
4. `pnpm dev:web` 可在开发环境代理 `/api` 到后端。
5. `pnpm dev:api` 在有 `platform/public/` 时能 serve 前端入口。

## M4 不做

- 不做登录/RBAC。
- 不做独立详情页。
- 不做真实容器日志查看，只看 task SSE 日志。
- 不做图片/营销页/落地页。
