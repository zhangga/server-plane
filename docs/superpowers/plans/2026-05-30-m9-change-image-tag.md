# M9 已有环境切换镜像 tag 实现计划

**Goal:** 已创建环境可以切换镜像 tag，并复用更新镜像任务拉取新 tag 的 5 个业务镜像后重启本环境。

## 任务清单

- [x] 后端新增 `POST /api/environments/:id/image-tag`，请求体为 `{ imageTag }`。
- [x] 复用现有 Docker tag 校验，非法 tag 返回 `INVALID_IMAGE_TAG`。
- [x] 更新环境元数据里的 `imageTag`，并排入 `env.update_images` 任务。
- [x] worker 继续从环境记录读取 tag，拉取新 tag 镜像后 `docker compose up -d`。
- [x] 前端 API client 增加 `changeEnvironmentImageTag`。
- [x] 环境卡片增加切换 tag 入口，受 `update-images` 相同状态规则和 in-flight task 限制。
- [x] 增加切换 tag 弹窗，默认填入当前 tag，提交后打开任务抽屉。
- [x] 跑完整测试、构建和浏览器验收。

## 验收标准

1. `pnpm typecheck` 通过。
2. `pnpm test` 通过。
3. `pnpm build:web` 通过。
4. 浏览器确认已有环境能打开切换 tag 弹窗，提交后请求 `POST /api/environments/:id/image-tag`，请求体包含新 tag。
