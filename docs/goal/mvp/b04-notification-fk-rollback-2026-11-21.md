# B04/U03 真实 MySQL 审计插入失败的事务回滚验证 — 2026-11-21

状态：**测试实现、本地 TypeScript 与单元 VERIFIED；真正全新 MySQL 约束故障演练已在 `a47e082` GitHub Actions [run 44894008602](https://github.com/MrRobt/job-board-next/actions/runs/44894008602) **SUCCESS**：145/145 单元、35/35 集成，0 FAIL/0 SKIP；真实 FK 拒绝后状态和审计同时回滚、随后正常失败处理成功，typecheck/build/smoke 全通过。** B04/U03 IN_PROGRESS，整体 NOT READY。

## 工作树与进度
- 核验 `b2c7d44` GitHub Actions [run 44893435390](https://github.com/MrRobt/job-board-next/actions/runs/44893435390) SUCCESS。第十三迁移及按次故障审计已经通过 145/145 单元、35/35 集成；当前缺失的是真实数据库事务在审计写入失败时，前序任务状态 CAS 能否一起回滚的独立演练。
- 已检查 AGENTS.md、long-running-goal.md、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register 和真实 Git 状态；其他 Agent 未提交的共享文档、财务审计、next-env、package-lock 和缓存一律不动。

## 本轮独立工作包
- 仅扩展 `tests/integration/ops-notification-queue-mysql.test.ts`，不改生产服务或迁移。复用原测试自行创建的隔离事故与 QUEUED→CLAIMED 任务，避免不同文件抢同一固定事故 key。
- 创建只在测试函数中注入的 `OpsNotificationFailurePrismaPort`，**保留真正 MySQL Serializable 事务及任务的 findUnique/updateMany**，但在审计 create 调用中用不存在的 64 位 intentKey，触发真实 `OpsNotificationFailureEvent.intentKey` 外键约束拒绝。事务内先执行状态 CAS，再插入审计，模拟真实审计落库失败。
- 断言异常必须抛出；事务完成后在真实 DB 重新读取，任务应仍为 CLAIMED、原 UUID token 与 attemptCount=2 未变、nextAttemptAt/failureCode 仍为空、审计事件数仍为 0。接着同一有效 token 用不注入故障的 Store 正常转 RETRY_WAIT，且按次审计恰好 1 条，重复失败不增行。测试 finally 只清理自身记录。
- 注入仅出现在测试专用适配器中，不修改生产 Prisma Store、不使用真实通知、网络或资金/模型服务；CI 没有第十三迁移会直接失败，不把本地旧 DB SKIP 算通过。

## 验证与边界
- 本地独立 `tsc --noEmit` exit 0、`npm test` exit 0。
- 真正 FK 约束与事务回滚结论须由本提交 CI 全新 MySQL8 集成测试执行后才能标 VERIFIED。
- 仍无 sender/外部投递回执/人工死信恢复；管理员登录态/CSRF E2E、预发布备份恢复及商户/AI/法律外部门禁仍未完成。
