# PST 自助环境平台 - 设计文档

- 日期：2026-05-29
- 状态：待评审
- 范围：第一期 MVP

## 1. 背景与目标

`compose/` 目录下已经维护了一份单独的 `docker-compose.yml`，可以一键拉起 PST 后端的整套环境（5 个 Java 服务 tgate / game / scenex / global / matcher，加上 redis / mongodb / etcd）。但目前的 compose 文件里容器名、固定 IP（`172.18.0.x`）、宿主端口都是写死的，无法多人在同一台中央主机上同时各跑一套。

测试同学在做联调和回归时，需要相互隔离的环境，且希望自助完成「启 / 停 / 重启 / 销毁 / 清档 / 更新镜像」这些常用操作，而不是每次找运维或脚本作者。

本设计描述一个内部 Web 平台，让每位测试同学在同一台中央 Linux 主机上申请并维护自己专属的 compose 环境。

## 2. 第一期范围

第一期纳入：

- 环境的生命周期管理：创建、启动、停止、重启、销毁
- 清档（重置玩家数据）
- 更新镜像（沿用现有 `update.sh` 的镜像清单，拉完即重启该环境）

第一期暂不做：

- 选镜像分支 / 自定义 tag（第二期）
- 热更（配表 / class / antidirt，可走第二期）
- 状态详情和实时日志查看（第二期）
- 多人协作、转让、自动回收
- 鉴权（内网信任，全员可见可操作）

## 3. 关键约束与现状事实

设计必须兼容的现状：

- 现存 `compose/docker-compose.yml` 里 `entrypoint.sh` 通过 `SERVICE` / `POD_NAME` / `SERVER_ID` 等环境变量驱动服务启动，并把日志、热更数据落到 `/external_storage/${sid}/${POD_NAME}/`。
- 镜像通过 `ttgops-cli` 从 `harbor-sh.dailygn.com/pst/*` 拉取，更新流程是 `update.sh` 里写死的 5 个镜像。
- etcd 在容器内通过 docker DNS（`http://etcd:2379`）做 advertise，依赖同 compose project 内服务名解析。
- 整个目录是脚本仓库（参考 `AGENTS.md`），保持现有目录结构、镜像 tag、上传模块名、`/data00/game/st` 路径不变。

部署运行环境：

- 中央服务器：Linux + Docker Engine 原生
- 同时并发环境数：5 - 15 套
- 槽位上限：16（slot 0..15）
- 客户端连接方式：每套环境分配独立的宿主机端口段，测试客户端通过 `host:port` 连接

技术选型：

- 前后端：TypeScript
- 后端框架：Hono
- 队列：bullmq + 一个本地 redis 容器
- 元数据：SQLite（drizzle 或 kysely）
- 前端：React + Vite + TanStack Query
- docker 调用：`dockerode` 或直接子进程调 `docker compose -p ...`

## 4. 整体架构

```
┌─────────────────────────────────────────┐
│           浏览器（React + Vite）              │
│   环境列表 / 创建 / 启停清档 / 任务抽屉 SSE     │
└──────────────────┬──────────────────────┘
                   │ HTTP / SSE
                   ▼
┌──────────────────┐     ┌──────────────────┐
│  API 进程 (Hono + TS) │ enq │  任务队列              │
│  - 校验、状态、CRUD   ├────►│  (bullmq + redis)    │
│  - 任务编排（投递/取消） │ poll│  - 任务持久化         │
│  - SSE: 日志 / 任务进度│◄────┤  - 重试 / 死信        │
└────────┬─────────┘     └─────────┬────────┘
         │                         │
         ▼                         ▼
┌────────────────────┐    ┌────────────────────┐
│  元数据存储 (SQLite)    │    │  Worker 进程 (TS)      │
│  environments / tasks  │    │  - compose 模板渲染    │
└────────────────────┘    │  - docker compose 调用 │
                          │  - 数据清理            │
                          │  - ttgops-cli pull    │
                          └──────────┬─────────┘
                                     │ 本机
                                     ▼
                              docker engine
                            /var/run/docker.sock
                          + ttgops-cli_linux64
```

部署形态：API 进程 + Worker 进程同机器跑（也可分机器，bullmq 的语义自然支持）。前端构建产物由 API 进程顺手 serve。

## 5. 环境模型与隔离方案

### 5.1 Environment 实体

| 字段 | 例 | 说明 |
|------|-----|------|
| `id` | `env_01J9...` | 主键，ULID |
| `name` | `zhangsan-dev` | 用户取的名字（kebab-case，全局唯一，落到 compose project name） |
| `owner` | `zhangsan` | 自由填写的归属字符串，仅做展示与过滤，不做鉴权 |
| `slot` | `3` | 0..15 的整型槽位，决定端口段和子网段 |
| `image_tag` | `master-latest` | 第一期所有服务统一一个 tag，固定为 `master-latest` |
| `state` | `creating / running / stopped / failed / destroying / destroyed` | 状态机见下 |
| `created_at` | | |
| `updated_at` | | |

### 5.2 槽位（slot）与隔离

每个 slot 决定一组确定性的网络/端口分配：

- **子网**：`172.{18 + slot}.0.0/16`（slot=0 ⇒ `172.18.0.0/16`，slot=1 ⇒ `172.19.0.0/16`，依此类推；slot 0..15 占用第二段 18-33）
- **容器内固定 IP**：保留末位（`.111` redis、`.112` mongo、`.113` etcd、`.201` tgate、`.202` gs、`.203` scenex、`.204` global、`.205` matcher），仅替换前两段。这样 etcd 的 advertise 与服务间互联约定不需要改。
- **主机端口段**：`base = 20000 + slot * 100`，原端口加偏移：

| 服务 | 容器端口 | 主机端口 |
|------|------|------|
| tgate | 12001 | base + 1 |
| gameserver | 12010 | base + 10 |
| matcher | 12020 | base + 20 |
| global | 12030 | base + 30 |
| scenex | 12050 | base + 50 |
| mongo | 27017 | base + 17 |
| redis | 6379 | base + 79 |
| etcd | 2379 | 不暴露（仅集群内） |

- **compose project name**：`pst-{name}`（例如 `pst-zhangsan-dev`），让 `docker compose -p pst-zhangsan-dev` 天然把容器、网络、卷都隔成独立命名空间。
- **容器名**：仍然是 `tgateserver` 等，docker 实际生成的是 `pst-zhangsan-dev-tgateserver-1`，对 `entrypoint.sh` 里依赖 `POD_NAME` 的逻辑透明。
- **持久化目录**：每套环境一份 `runtime/<env-name>/`，包含 `external_config/`、渲染好的 `docker-compose.yml`、任务日志 `.tasks/`。数据卷改成 docker named volume（见 §7）。

### 5.3 槽位分配策略

- 创建时 slot 由后端自动分配：扫所有 `state in (creating, running, stopped, failed, destroying)` 的环境占用了哪些 slot，挑最小未用的。
- `destroyed` 不占 slot。
- 同一槽位上「stopped」算占用——保留槽位以便重启时位号不变。
- slot 上限 16（0..15），超出时返回 `NO_SLOT_AVAILABLE`。可后续扩到更大上限，公式不变。

## 6. 用户操作 → 任务的映射

每个用户动作落成一条或一串「Task」，由 worker 串行执行（同一个环境同时只允许一条任务在跑）。

| 用户动作 | Task 类型 | 关键步骤 |
|------|------|------|
| 创建环境 | `env.create` | 1) 分配 slot；2) 写元数据为 `creating`；3) 在 `runtime/<name>/` 渲染 `docker-compose.yml` 与 `external_config/` 副本；4) `docker compose -p pst-<name> up -d`；5) 成功置 `running`，失败置 `failed` |
| 启动 | `env.start` | `docker compose -p pst-<name> start`；如果容器都不存在则等价于「重建」走 `up -d`，置 `running` |
| 停止 | `env.stop` | `docker compose -p pst-<name> stop`，置 `stopped` |
| 重启 | `env.restart` | `docker compose -p pst-<name> restart`，置 `running` |
| 销毁 | `env.destroy` | `docker compose -p pst-<name> down -v --remove-orphans`（同时删 named volume）→ `rm -rf runtime/<name>/`，元数据置 `destroyed`（保留行用于审计） |
| 清档 | `env.wipe` | 1) `docker compose -p pst-<name> down -v`（删容器并清空 4 个 named volume）；2) `up -d`；置 `running`。**保留 `external_config/` 不动** |
| 更新镜像 | `env.update_images` | 1) 在 worker 主机上执行 `ttgops-cli icr pull <每个镜像>`（沿用现有 `update.sh` 的 5 个 image）；2) `docker compose -p pst-<name> up -d` 触发新镜像生效 |

### 6.1 关键语义说明

- **清档不删 external_config**：external_config 是配置（log4j2.xml / config.yaml / entrypoint.sh），不是数据。
- **更新镜像影响所有同 tag 环境**：ttgops-cli pull 是宿主机层面的，pull 同一个 `master-latest` 后，其他环境下次启动也会用上新镜像。这是隐式语义，UI 上要明确写出来。
- **状态机**：UI 根据 `state` 灰掉不可用按钮；后端再做一层校验。非法转移返回 `INVALID_STATE_TRANSITION`。
- **任务串行**：同一 environment 同时只允许一个任务 in-flight。已有 in-flight 任务时新动作返回 `TASK_RUNNING`。

### 6.2 状态机

```
creating ──成功──> running ──stop──> stopped
creating ──失败──> failed              │
                                      │
running ──restart──> running           │
running ──update_images──> running     │
running ──wipe──> running              │
running ──stop──> stopped              │
                                      │
stopped ──start──> running ◄───────────┘
stopped ──destroy──> destroying ──> destroyed
running ──destroy──> destroying ──> destroyed
failed ──destroy──> destroying ──> destroyed
failed ──start──> 等价 create 的恢复路径，再走 up -d
```

`destroyed` 是终态，不再允许任何操作。

## 7. bind mount → docker volume 改造

数据卷和配置卷分开处理。

### 7.1 数据卷（销毁/清档时清理）改成 docker named volume

| 现状 bind mount | 改成 named volume |
|------|------|
| `./redis-data:/data` | `pst-<name>_redis_data:/data` |
| `./mongo-data:/data/db` | `pst-<name>_mongo_data:/data/db` |
| `./etcd-data:/etcd-data` | `pst-<name>_etcd_data:/etcd-data` |
| `./external_storage:/external_storage` | `pst-<name>_external_storage:/external_storage` |

named volume 由 docker 管理，解决 mongo 的 uid=999 写入权限问题，省了 chown；生命周期挂在 compose project 上，`docker compose -p pst-<name> down -v` 一行即清。

### 7.2 配置卷继续 bind mount（运行期可能要回看/调试）

| 现状 | 仍然保留 |
|------|------|
| `./external_config/entrypoint.sh:/<svc>/entrypoint.sh:ro` | bind mount |
| `./external_config:/external_config` | bind mount |

bind mount 指向的是 `runtime/<name>/external_config/`，由后端在创建环境时从 `templates/external_config/`（直接复制现有 `compose/external_config/` 一份做种子）复制。

### 7.3 对应任务步骤的精确化

- `env.create`：渲染模板 → 复制 external_config → `docker compose -p pst-<name> up -d`（docker 自动建 named volume）
- `env.destroy`：`docker compose -p pst-<name> down -v --remove-orphans`（连同 4 个 named volume 一起删）→ `rm -rf runtime/<name>/`
- `env.wipe`：`docker compose -p pst-<name> down -v` → `up -d`（named volume 重建即空）

`env.wipe` 用 `down -v` 不用 `stop`，因为 stop 不动 volume。

## 8. HTTP API

REST + 一个 SSE 通道。前缀 `/api`。

### 8.1 端点列表

```
GET    /api/environments                    # 列表，可按 state / owner 过滤
POST   /api/environments                    # 创建（body: {name, owner})  → 返回 envId, taskId
GET    /api/environments/:id                # 详情（含端口映射、当前 state、最近一次 task）
DELETE /api/environments/:id                # 销毁，返回 taskId

POST   /api/environments/:id/start          # → taskId
POST   /api/environments/:id/stop           # → taskId
POST   /api/environments/:id/restart        # → taskId
POST   /api/environments/:id/wipe           # 清档
POST   /api/environments/:id/update-images  # 更新镜像（拉完即重启）

GET    /api/tasks/:taskId                   # 任务详情：状态、开始/结束时间、错误
GET    /api/tasks/:taskId/logs              # SSE，追加增量日志

GET    /api/slots                           # 调试：当前已占 slot
GET    /api/health                          # 健康检查
```

### 8.2 行为约定

- 所有写操作同步只做参数校验 + 入队，立即返回 `{taskId}`，不阻塞 HTTP。
- 错误统一 `{error: {code, message}}`。常见 code：
  - `ENV_NOT_FOUND`
  - `ENV_NAME_TAKEN`
  - `INVALID_STATE_TRANSITION`
  - `NO_SLOT_AVAILABLE`
  - `TASK_RUNNING`（同一 env 已有 in-flight task）
  - `INVALID_NAME`（非 kebab-case 或长度超限）
- SSE 协议：每条事件 `event: log\ndata: <一行>\n\n`；终态时再发 `event: done\ndata: {status}` 然后断流；断线重连用 `Last-Event-ID` 续传字节偏移。
- 不做认证、不做 RBAC、不做 webhook。
- bullmq 全局并发上限设为 4。

## 9. UI 形态

单页，三个区域：

```
┌───────────────────────────────────────────┐
│  PST 自助环境平台              [+ 创建环境]   ← 顶栏 │
├──────┬────────────────────────────────────┤
│ 我的    │ 环境列表（卡片）                            │
│ 全部    │ ┌────────────────────────────┐ │
│ 运行中  │ │ zhangsan-dev   slot=3   running          │ │
│ 已停止  │ │ 端口: tgate 20001 / gs 20010 / ...        │ │
│        │ │ owner: zhangsan      2 分钟前更新          │ │
│        │ │ [启] [停] [重启] [清档] [更新镜像] [销毁]    │ │
│        │ └────────────────────────────┘ │
│        │ ...                                          │
└──────┴────────────────────────────────────┘
```

### 9.1 交互细节

- 「创建环境」是轻量弹窗：输入 `name` + `owner`（image_tag 第一期固定 `master-latest`，不暴露在表单）。
- 卡片上每个动作按钮点击后立即弹一个**任务抽屉**：标题是任务名，内容是 SSE 滚动日志（终态后变绿/变红），可关闭，任务在后台继续。
- 不可用按钮根据 state 灰掉。
- 列表 5 秒轮询 `GET /api/environments` 刷状态；任务进行中时该卡片叠加一个「进行中：env.wipe」的小标签。
- **销毁是危险动作**：弹二次确认，要求输入环境名才允许。
- **更新镜像**点击时弹提示：「这会拉取所有 5 个服务的最新 master-latest 镜像，并重启本环境。其他使用同一 tag 的环境下次启动时也会用到新镜像。」

## 10. 文件布局

```
src/
  api/                       # Hono 路由
  worker/                    # bullmq worker
  domain/                    # 领域逻辑
    slots.ts                 # 分配/释放 slot
    state-machine.ts         # 合法状态转移
  compose/
    template.yml.ejs         # 由当前 docker-compose.yml 改造的模板
    render.ts                # 渲染 + 写到 runtime/<name>/
  docker/
    compose.ts               # 封装 `docker compose -p ... <verb>` 调用 + 流式输出
    ttgops.ts                # 封装 `ttgops-cli icr pull` 调用
  db/
    schema.ts                # drizzle / kysely
  store/                     # 元数据访问
  config.ts                  # 端口段、子网、镜像列表常量

templates/
  external_config/           # 直接复制现有 compose/external_config 一份做种子

runtime/                     # 运行时生成（.gitignore）
  <env-name>/
    docker-compose.yml
    external_config/
    .tasks/<task-id>.log
  _logs/
    api.log
    worker.log

public/                      # 前端构建产物

web/                         # 前端 React + Vite 子目录
```

## 11. 模板渲染要点

针对现有 `compose/docker-compose.yml` 的改造：

- 容器名 `tgateserver / gameserver / scenexserver / globalserver / matcherserver / redis / mongodb / etcd` 等保持原样（project 前缀由 `-p` 提供）。
- 子网 `172.{18+slot}.0.0/16`、gateway `172.{18+slot}.0.1`、各服务固定 IP 末位不变（仅替换前两段）。
- `ports` 改成 `${HOST_TGATE}:12001` 之类，由模板填具体值。
- `entrypoint.sh` / `external_config/*` 通过 bind mount 挂自己 `runtime/<name>/external_config/`。
- 数据卷改成 named volume（见 §7）。
- 镜像 tag 从 `image_tag` 字段取（第一期固定 `master-latest`）。
- ETCD 的 `--advertise-client-urls http://etcd:2379` 这种用容器 DNS 的写法不动。
- etcd-init 容器仍然内联在模板里，与现状一致。

## 12. 容易踩的坑（预先标记）

- **多环境同时拉镜像**：ttgops-cli pull 是宿主机层面的，对其他环境有副作用。第一期接受这个事实，UI 上写明。
- **slot=0 与现状冲突**：如果机器上已有手动跑的 docker-compose（subnet 172.18.0.0/16），slot 起始值要可配置，默认从 1 开始。
- **磁盘容量**：每套环境的 mongo / etcd / redis named volume 加起来不小，5-15 套要规划存储；docker root 应指向 `/data00/...` 这种容量大的盘，README 里说明。
- **etcd 集群只有一个节点**：现状即如此（`--name node1` 单点），第一期沿用。
- **ttgops-cli 配置**：现状 `update.sh` 依赖 `${SCRIPT_DIR}/.ttgops-cli.yaml`；后端要继承这个配置文件路径约定，平台部署时挂进容器或放到工作目录。

## 13. 可观测性（最低限度）

- 后端结构化日志：pino，写到 stdout + `runtime/_logs/{api,worker}.log` 滚动。
- 任务执行日志：worker 把每条任务的 stdout/stderr 同时 tee 到 `runtime/<name>/.tasks/<task-id>.log` 和 task 行的 `error` 字段（最后一段截断）。
- UI 上的 SSE 消费这个日志文件。
- 不接 Prometheus / Grafana。

## 14. 测试策略

- **单元测试**（Vitest）：slots 分配、状态机合法转移、模板渲染（给定 slot 渲出来的 yml 字符串去和 fixture 比）。
- **集成测试**：在 CI 里跑 docker-in-docker 拉一个 `nginx:alpine` 做替代镜像，验证 `env.create / env.stop / env.destroy` 端到端。bullmq 用 `ioredis-mock` 替换。
- **手动测试**：用一个真实小镜像 + 真实 redis 队列在中央机上验一遍创建/清档/销毁。

## 15. 第一期里程碑

切成可独立验收的 5 个里程碑：

1. **M1 模板与渲染**：把现有 docker-compose.yml 改造成 ejs 模板，写一个 CLI 工具 `pnpm tsx scripts/render.ts --name foo --slot 1` 渲染出可手动跑通的 compose；docker volume 改造 + bind mount 配置卷在这一步固化。
2. **M2 单环境创建/销毁的最小后端**：API 进程 + worker 共进程跑（先不分），SQLite 存 environment 表，HTTP `POST /environments` 能创建一个并 `up -d`、`DELETE /environments/:id` 能销毁。无前端，curl 验证。
3. **M3 队列与剩余生命周期**：拆出 worker 进程，引入 bullmq + redis 容器，补齐 start/stop/restart/wipe/update-images，加上 task 表与 SSE 日志通道。
4. **M4 前端 MVP**：环境列表 + 创建表单 + 卡片操作 + 任务抽屉 SSE。
5. **M5 打磨与上线**：错误码统一、危险确认、状态机校验前后双层、健康检查、部署脚本（一份 docker-compose.yml 把 API + worker + redis 一起拉起）、README 操作说明。

每个里程碑之后找一个测试同学试用，自己做一轮 dogfood 再继续。

## 16. 不做（划清边界）

- 不做认证、不做 RBAC、不做 webhook
- 不做选镜像分支 / 自定义 tag（第二期）
- 不做热更操作（第二期）
- 不做状态详情页 / 实时容器日志查看（第二期）
- 不做多人协作 / 转让 / 自动回收
- 不接 Prometheus / Grafana
- 不接 K8s
- 不修改 `st-server` 业务代码仓库
- 不动 `image_package/` `build_package/` 现有打镜像 / 上传热更包流程
