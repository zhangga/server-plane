# M6 归属过滤与我的环境实现计划

**Goal:** 让“我的”环境从前端硬编码 `alice` 改为可配置归属，并让后端列表接口支持 `owner` 过滤，方便测试同学按自己名字查看环境。

## 任务清单

- [x] 后端 `GET /api/environments?owner=<name>` 支持 owner 过滤，并保持 `state` 过滤兼容。
- [x] 前端 API client 支持 owner query。
- [x] 前端新增当前归属偏好，保存在 localStorage。
- [x] 顶栏提供归属输入，“我的”视图按当前归属查询和过滤。
- [x] 跑完整测试、构建和浏览器验收。

## 验收标准

1. `pnpm typecheck` 通过。
2. `pnpm test` 通过。
3. `pnpm build:web` 通过。
4. 浏览器确认修改归属后，“我的”视图发起 owner query，布局无明显问题。
