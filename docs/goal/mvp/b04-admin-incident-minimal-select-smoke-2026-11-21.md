# B04/U03 管理员事故页最小查询与匿名 HTTP 权限回归 — 2026-11-21

状态：**本轮安全小包 VERIFIED（只读字段、独立端口匿名 HTTP、单元/TS/Build、既有 MySQL 回归）**。真实管理员登录态提交、CSRF/授权迁移和预发布恢复演练仍 IN_PROGRESS；技术上线 NOT READY。

## 真实恢复
- `224b084` 的 GitHub Actions run [44876152273](https://github.com/MrRobt/job-board-next/actions/runs/44876152273) 实际为 **success**，不是先前排队状态。工作树 `main...origin/main`；其它 Agent 的 handoff、风险登记、发布清单、矩阵、财务审计与缓存均处于原先的未提交状态，未触碰。
- 当前目标是上轮新增的 `/admin/incidents` 的 P0 最小敏感字段与匿名 HTTP 权限收口，而不是重新实现第 9 项迁移或支付事务。

## 修改
- `lib/career/ops-incident-view.ts` 定义唯一 `incidentPanelSelect`，仅包含 key、state、count、openedAt、lastSeenAt、acknowledgedAt 六个字段，`OpsIncidentPanelRecord` 为对应最小类型。页面 `app/admin/incidents/page.tsx` 的实际 `findMany` 委托使用该共享查询常量，**数据库层不读取 acknowledgedById、acknowledgmentNote、resolvedAt**；仍在显示层使用白名单映射。
- `tests/ops-incident-view.test.ts` 新增精确字段键集断言，防止后续代码意外向查询添加管理员身份或审核笔记。
- `scripts/ci-http-smoke.mjs` 将 `/admin/incidents` 加入匿名限制路由；默认端口仍为 3000，可用纯数字 `SMOKE_PORT` 参数在 **127.0.0.1** 上测试隔离新服务，不允许外部 URL 或非法端口。原本保留的各项匿名 307/308、Location=/login、private/no-store 和安全响应头检查不变。

## 测试与诊断（不得混淆）
- `npm test` exit 0；独立 `tsc --noEmit` exit 0；Next 生产构建 exit 0。
- 首次执行旧服务 localhost:3000 的 `npm run release:smoke` **exit 1**：`/admin/incidents` 返回 404；旧 `/admin` 和 `/admin/refund-dispatch` 都返回 307 /login。诊断说明 3000 上的服务尚未加载新增路由；并不代表新编译构建未授权。
- **不停止/重启其他 Agent 的 3000 进程**。用临时子进程在本机 `3100` 端口运行刚编译的 Next 生产构建，开关 `ENABLE_OPS_INCIDENT_ACK=false`，实测 `/admin`、`/admin/incidents`、`/admin/refund-dispatch` 均为 **307 /login**；退出后只结束临时子进程。此处是匿名 HTTP 测试，不是管理员登录态 E2E；受控 smoke 脚本其他路径未在隔离端口全部运行。
- 历史独立 MySQL 集成 `32 total / 31 PASS / 0 FAIL / 1 SKIP`，唯一 SKIP 仍是该旧库未迁第 9 项表；之前 GitHub CI 全新 MySQL 已有真实迁移/事故事务 PASS 证据。

## 接续
- 优先在真实授权的预发布新库加上浏览器已登录 ADMIN、USER、匿名及 CSRF 行为 E2E，确认开关关闭时绝不访问新表，再结合现有事务审计测试验证操作页面到数据库闭环。
- 之后做事故数据采集/生命周期/通知的可恢复方案和回放、备份/恢复、HTTPS 与完整用户路径。
- 不启用真实支付/AI/通知；外部商户、隐私、资质和合规审批保持人工门禁。
