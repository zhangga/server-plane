# server-plane

PST 自助环境平台，用于在同一台中央 Docker 主机上给测试同学创建、启停、清档、更新和销毁相互隔离的 `st-server-compose` 环境。

## 本地开发

```bash
cd platform
pnpm install
pnpm typecheck
pnpm test
pnpm build:web
```

常用进程：

```bash
cd platform
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

`pnpm dev:web` 会把 `/api` 代理到 `http://localhost:3000`。创建环境时镜像 tag 默认是 `master-latest`，也可以在创建弹窗里输入指定 tag；已有环境可以在卡片上切换 tag，并立即触发一次更新镜像任务。卡片上的详情入口会展示 compose project、runtime 路径、最近任务和 Docker Compose 服务状态；容器日志入口会读取当前环境指定服务最近 300 行日志。

API 和 worker 默认使用：

- `PST_RUNTIME_ROOT=platform/runtime`
- `PST_DB_PATH=platform/runtime/metadata.sqlite`
- `PST_REDIS_URL=redis://127.0.0.1:6379`
- `PST_TTGOPS_BIN=../st-server-compose/ttgops-cli_linux64`
- `PST_TTGOPS_CONFIG=../st-server-compose/.ttgops-cli.yaml`

## 手动渲染 compose

```bash
cd platform
pnpm render --name dogfood --slot 1
docker compose -p pst-dogfood -f runtime/dogfood/docker-compose.yml config
docker compose -p pst-dogfood -f runtime/dogfood/docker-compose.yml up -d
```

slot 默认范围是 `1..15`。slot 决定子网、固定容器 IP 和宿主端口段；`destroyed` 环境不占 slot。

## 中央机部署

部署 compose 会启动三类服务：平台 API、平台 worker、平台队列 Redis。

```bash
export PST_RUNTIME_ROOT=/data00/pst-platform/runtime
export PST_PLATFORM_PORT=3000
export PST_TTGOPS_DIR=/path/to/st-server-compose

docker compose -f platform/deploy/docker-compose.yml up -d --build
```

`PST_RUNTIME_ROOT` 必须是宿主机上的绝对路径，并且会以同一个绝对路径挂进 API/worker 容器。worker 通过 `/var/run/docker.sock` 调宿主机 Docker，业务 compose 中的 `./external_config` bind mount 会被 Docker CLI 解析成这个宿主机路径；如果容器内外路径不同，业务容器会挂不到配置。

部署后检查：

```bash
curl http://localhost:${PST_PLATFORM_PORT:-3000}/api/health
docker compose -f platform/deploy/docker-compose.yml ps
```

## Dogfood 流程

1. 确认中央机可以访问 Docker Engine，并且 `PST_TTGOPS_DIR` 下存在 `.ttgops-cli.yaml` 和 `ttgops-cli_linux64`。
2. 打开 `http://<host>:3000` 创建一套环境，例如 `dogfood`。
3. 在任务抽屉确认 `env.create` 成功，环境进入 `running`。
4. 用卡片端口连接客户端，验证 tgate/game 等端口段正确。
5. 依次试 `stop`、`start`、`restart`、`wipe`、查看环境详情、查看容器日志、切换镜像 tag、`update-images`。
6. 销毁时输入环境名二次确认，之后检查 `docker compose -p pst-dogfood ps` 无残留，`down -v` 已清理 named volume。

## 注意事项

- 更新镜像会拉取该环境当前 tag 的业务镜像，其他同 tag 环境下次启动也会用到宿主机上已拉取的新镜像。
- 环境详情里的服务状态来自 `docker compose ps --format json`，用于第一层定位容器是否 missing、running、exited 或 unhealthy。
- 容器日志查看使用 `docker compose logs --tail 300 <service>`，只读取最近日志，不保持实时 follow。
- `wipe` 会执行 `docker compose down -v` 后再 `up -d`，清空 named volume，但保留 `external_config`。
- 平台不做鉴权，默认只部署在可信内网。
- Node 当前使用 `node:sqlite`，测试时会出现 Node 的 experimental warning，这是运行时自身提示。
