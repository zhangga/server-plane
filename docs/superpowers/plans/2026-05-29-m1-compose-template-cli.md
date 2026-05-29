# M1 Compose 模板化与渲染 CLI 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 `st-server-compose/` 生成 slot 隔离的 compose 运行目录，并提供 `pnpm render --name foo --slot 1` 渲染 CLI。

**Architecture:** 在仓库根新增 `platform/` TypeScript 子项目。M1 只实现 slot 配置计算、compose/external_config 模板渲染、CLI 和测试；不引入 Hono、SQLite、bullmq。模板必须删除固定 `container_name`，并把业务配置中的 Redis/Mongo 地址按 slot 渲染，保证同机多套环境不会串容器或串库。

**Tech Stack:** Node.js LTS、pnpm、TypeScript、tsx、Vitest、ejs、commander。

---

## 文件结构

**新建/维护：**

- `platform/package.json`：平台子项目脚本与依赖。
- `platform/pnpm-workspace.yaml`：允许 `tsx` / `vitest` 依赖的 `esbuild` 构建脚本。
- `platform/src/config.ts`：slot、端口、镜像、密码等常量。
- `platform/src/compose/slotConfig.ts`：`computeSlotConfig(slot)`，默认 slot 范围 `1..15`，slot=0 只允许通过显式参数兼容旧手工环境。
- `platform/src/compose/template.yml.ejs`：从 `st-server-compose/docker-compose.yml` 改造的 compose 模板。
- `platform/src/compose/render.ts`：渲染 `docker-compose.yml` 和 `external_config/`。
- `platform/scripts/render.ts`：CLI 入口。
- `platform/templates/external_config/`：从 `st-server-compose/external_config/` 复制并模板化后的配置种子。
- `platform/tests/*.test.ts`：slot、render、CLI 测试。
- `.gitignore`：忽略 `platform/node_modules/`、`platform/dist/`、`platform/runtime/`。

## 关键实现规则

- `template.yml.ejs` 中不得出现 `container_name:`；容器命名交给 `docker compose -p pst-<name>`，业务仍通过 `POD_NAME` 环境变量得到原逻辑名称。
- `redis_data`、`mongo_data`、`etcd_data`、`external_storage` 使用 compose named volume；`external_config` 继续 bind mount 到 `runtime/<name>/external_config/`。
- `etcd-init` 必须加入 `app_net`，固定为当前 slot 的 `.114`，否则它无法通过服务名访问同网络里的 `etcd`。
- `external_config/game/config.yaml.ejs`、`global/config.yaml.ejs`、`matcher/config.yaml.ejs` 必须把 Redis/Mongo 地址渲染为当前 slot 的 `ips.redis` / `ips.mongo`。
- `renderEnvironment` 必须拒绝覆盖已存在的 `runtime/<name>`，防止误覆盖测试同学调过的配置。
- CLI 错误码：非法 slot 为 `2`；环境目录已存在为 `3`。

## 任务清单

- [ ] 初始化 `platform/` 子项目，安装依赖并提交 lockfile。
- [ ] 用 TDD 实现 `computeSlotConfig(slot)`：覆盖 slot=1、slot=15、slot=0 默认拒绝、slot=0 显式兼容、slot=16、非整数。
- [ ] 从 `st-server-compose/docker-compose.yml` 改造 `template.yml.ejs`：删除 `container_name`、改端口/IP、改 named volume、保留服务名和业务启动参数。
- [ ] 从 `st-server-compose/external_config/` 准备 `platform/templates/external_config/`：把 `config.yaml` 改为 `config.yaml.ejs`，按 slot 渲染 Redis/Mongo 地址。
- [ ] 实现 `renderEnvironment`：渲染 compose、递归渲染 `.ejs` 配置、复制非模板文件、拒绝覆盖。
- [ ] 实现 `pnpm render --name <name> --slot <slot>` CLI，并输出可直接启动的 `docker compose -p pst-<name> -f <composeFile> up -d` 命令。
- [ ] 跑 `pnpm typecheck`、`pnpm test`，再手动渲染 `dogfood` 并执行 `docker compose config` 验证 YAML 有效。

## 验收标准

1. `platform/` 下 `pnpm typecheck` 通过。
2. `platform/` 下 `pnpm test` 通过，覆盖 slot、render、CLI。
3. `pnpm render --name dogfood --slot 1` 生成 `platform/runtime/dogfood/docker-compose.yml` 和 `external_config/`。
4. 渲染产物不包含 `container_name:`，且 slot=1 时 Redis/Mongo/Etcd IP 为 `172.19.0.x`，宿主端口为 `201xx`。
5. `docker compose -p pst-dogfood -f platform/runtime/dogfood/docker-compose.yml config` 通过。

## M1 不做

- 不启动真实 Harbor 镜像作为自动测试的一部分。
- 不封装 `ttgops-cli` 更新镜像流程。
- 不引入 API、数据库、队列、前端。
- 不做自定义 image tag UI；`master-latest` 仍是默认值。
