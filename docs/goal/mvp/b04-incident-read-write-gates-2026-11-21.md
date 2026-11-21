# B04/U03 事故查看与确认独立开关、重复表单安全门禁 — 2026-11-21

状态：**本轮离线子包 VERIFIED**；管理员已登录操作、CSRF HTTP E2E、预发布库迁移、自动告警生命周期和通知继续 IN_PROGRESS。整体上线 NOT READY。

## 从真实状态恢复
- 工作树 `main...origin/main`，其它 Agent 的 `handoff.md`、`requirement-matrix.md`、`risk-register.md`、`release-checklist.md`、financial-risk-audit 与临时文件均保留未提交，未混合修改。
- GitHub Actions `2290948` run [44876839721](https://github.com/MrRobt/job-board-next/actions/runs/44876839721) 已实际 **success**，无需重做已通过的 CI。
- 继续 B04/U03 P0：此前只读页面与人工确认共用 `ENABLE_OPS_INCIDENT_ACK`，使运营只能通过开放写入开关查看事故，权限粒度不合理。

## 实现
- 新增纯服务端 `lib/career/ops-incident-gates.ts`：`ENABLE_OPS_INCIDENT_READ=true` 允许只读查看；`ENABLE_OPS_INCIDENT_ACK=true` 允许人工确认且自动具备只读权限；两者严格字符串 `true`，默认都关闭，类似 `TRUE`、`1`、空格一律不启用。
- `app/admin/incidents/page.tsx`：只读开关开放时可展示事故状态，绝不出现确认按钮；仅 `canAcknowledge` 且事故 `OPEN` 时渲染提交表单。只读 `OPEN` 状态显示「待人工处理（只读模式）」，不错误显示「已解决」。现有 `requireAdmin` 仍必须先通过，若完全关闭不查询新表。
- `app/admin/layout.tsx` 只在具备读权限时展示事故导航；`app/actions/ops-incidents.ts` 单独检查 `canAcknowledge`，避免伪造 POST 绕过只读页面的表单隐藏。保持管理员来源为会话、DB 限流和 CAS 审计。
- `lib/career/ops-ack-form.ts` 对确认/类别/轮次/理由各字段要求恰好一个 `FormData` 值，拒绝重复字段的多值/参数污染请求；不接受客户端伪造管理员身份。测试覆盖四类重复字段。
- 新增 `tests/ops-incident-gates.test.ts` 三组组合/近似值严格关闭测试；更新 `tests/ops-ack-form.test.ts` 重复输入测试。本包未开放真实支付/AI/通知，未改任何数据库 schema、商户配置或真实数据。

## 实际测试
- `npm test` exit 0，独立 TypeScript `tsc --noEmit` exit 0，Next.js 生产构建 exit 0。
- 历史隔离 MySQL 首轮：`32 total / 30 PASS / 1 FAIL / 1 SKIP`；失败来自其他 Agent 未提交 `financial-risk-audit.test.ts` 的短时 MySQL `127.0.0.1:3306` 连接失败，没有改其代码。
- 同命令复跑：`32 total / 31 PASS / 0 FAIL / 1 SKIP`。唯一 SKIP 仍为旧隔离库缺少第 9 项迁移；GitHub Actions 全新 MySQL 有历史真实事务 PASS 证据。不宣称本轮有完整登录态 HTTP/CSRF E2E。

## 下一依赖与限制
- 下一轮在经过授权的预发布隔离新库验证只读 USER/ADMIN/匿名、开关不同组合、真实登录态表单 POST、CSRF 拒绝、管理员审计及并发；本轮纯逻辑和构建通过不代表真实开关已经可以在生产启用。
- 启用任何读/写开关前需先验证对应数据库第 9 项迁移和备份；不自动发通知、不结算资金、不自动解除外部资质与商户门禁。
