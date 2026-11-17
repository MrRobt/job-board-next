# 当前任务（2026-11-17）

## 本轮已完成并有验证证据

- `P0-AI-RESERVED-AUDIT`：只读检测超过 10 分钟仍为 RESERVED 的用量，管理员后台显示异常，并明确禁止自动返还/重试。
- `P0-AI-RESERVED-RECONCILIATION`：仅管理员可在输入明确核查依据且确认用户未收到有效服务后进行单次返还；ToolRun 状态更改、ToolGrant 余额增量、ToolRunAdjustment 操作人/原因审计在同一个 MySQL 事务内执行。重复操作、普通用户、10 分钟内的运行均被拒绝。
- 本地开发 MySQL schema 已同步并重新生成 Prisma Client；单元 8/8、集成 3/3、类型检查和生产构建通过，本机首页 HTTP 200。

## 下一项最高优先级未完成任务

`P0-PAYMENT-RECONCILIATION`：先建立可测试的渠道查单/安全关闭/异常账务分类与重复通知幂等行为。没有商户有效凭据前只能完成代码和模拟服务测试，**不得强制关闭或清空未确认支付状态的订单**。

并行可推进：`P0-CI-LOCKFILE-MIGRATIONS`。现已由 Prisma CLI 从空库生成基线迁移 SQL（`prisma/migrations/20261117000100_baseline/`），但独立 MySQL 的 `migrate deploy` 执行被安全检查拦截，**未通过迁移验收、不得在生产使用**。临时测试容器已停止。之后需要在授权的测试执行环境完成全新库 migrate deploy 与幂等复跑、备份/恢复和 CI，不能假定迁移成功。

## Git 安全

此前已存在的 `next-env.d.ts`、`package-lock.json` 与 `.dsh-meow/` 非本轮改动，禁止混提交或删除。上轮 `lib/jobs.ts` 类型修复已核验 diff，单独提交为 `f734138`，没有和 AI 账务工作包混提交。
