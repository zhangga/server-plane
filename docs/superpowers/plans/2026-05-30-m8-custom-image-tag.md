# M8 自定义镜像 tag 实现计划

**Goal:** 创建环境时允许测试同学指定镜像 tag，默认仍为 `master-latest`。worker 渲染 compose 和更新镜像时都使用环境自己的 tag。

## 任务清单

- [x] 后端 `POST /api/environments` 接收 `imageTag`，默认 `master-latest`。
- [x] 校验 Docker tag 格式，非法 tag 返回 `INVALID_IMAGE_TAG`。
- [x] 环境元数据保存自定义 tag，worker 渲染 compose 时使用该 tag。
- [x] `update-images` 拉取当前环境 tag 的 5 个业务镜像。
- [x] 前端创建弹窗增加 `镜像 tag` 输入，默认 `master-latest` 并随创建请求提交。
- [x] 跑完整测试、构建和浏览器验收。

## 验收标准

1. `pnpm typecheck` 通过。
2. `pnpm test` 通过。
3. `pnpm build:web` 通过。
4. 浏览器确认创建弹窗展示默认 tag，修改后提交请求包含自定义 tag。
