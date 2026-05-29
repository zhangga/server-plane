# M7 状态筛选后端查询实现计划

**Goal:** 修正前端状态筛选只拿默认非 destroyed 列表的问题，让“已销毁”等状态筛选能从后端拉到对应环境。

## 任务清单

- [x] 前端 API client 支持 `state` 查询参数，并覆盖 owner + state 组合测试。
- [x] App 根据当前筛选生成后端查询条件：`mine` 使用 owner，状态筛选使用 state。
- [x] 跑完整测试、构建和浏览器验收。

## 验收标准

1. `pnpm typecheck` 通过。
2. `pnpm test` 通过。
3. `pnpm build:web` 通过。
4. 浏览器确认点击“已销毁”会请求 `state=destroyed` 并展示销毁环境。
