# M5 打磨与上线实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:executing-plans to execute this plan task-by-task.

**Goal:** 补齐第一期上线前的安全交互、状态机校验、健康检查、部署脚本和操作说明，让 M1-M4 的 API/Worker/UI 可以在中央机上按一套 compose 启动并被测试同学试用。

**Architecture:** 保持现有 Hono API + BullMQ worker + SQLite + React 前端架构。M5 不改变业务流程，只把状态机/错误码显式化，强化前端危险操作确认，并提供 `platform/deploy/docker-compose.yml` 启动 API、worker 和平台队列 Redis。

---

## 任务清单

- [x] 用 TDD 增加后端状态机与错误行为测试：非法 task id 返回 `TASK_NOT_FOUND`，health 返回 store/queue checks，状态动作矩阵可单测。
- [x] 抽出后端 `domain/stateMachine.ts`，让 API 入队校验复用显式状态矩阵。
- [x] 前端补危险操作确认：destroy 必须输入环境名；update-images 显示 master-latest 副作用提示；列表 5 秒轮询并展示 in-flight task 标签。
- [x] 增加前端组件测试覆盖 destroy 名称确认与 update-images 确认提交。
- [x] 增加 `platform/Dockerfile`、`.dockerignore`、`platform/deploy/docker-compose.yml`，把 API、worker、redis 作为上线启动单元。
- [x] 更新 README：本地开发、构建、部署、环境变量、dogfood/回滚/数据目录注意事项。

## 验收标准

1. `pnpm typecheck` 通过。
2. `pnpm test` 通过。
3. `pnpm build:web` 通过。
4. `docker compose -f platform/deploy/docker-compose.yml config` 通过。
5. 浏览器检查确认弹窗不会出现明显布局或 console issue。

## M5 不做

- 不引入登录/RBAC。
- 不接 Prometheus/Grafana。
- 不做真实 Harbor/Docker dogfood 自动化；真实中央机 dogfood 仍需凭据和 Docker 环境。
- 不做第二期镜像 tag 选择或热更入口。
