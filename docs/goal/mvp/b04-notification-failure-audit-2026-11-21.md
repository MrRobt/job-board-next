# B04/U03 通知失败尝试的事务审计（第十三迁移）— 2026-11-21

状态：**代码、独立 TS、单元 VERIFIED；本地 Prisma validate / Next build 因执行器超时未完成；第十三迁移与真实 MySQL 原子审计已由 `ec9506e` GitHub Actions [run 44892913723](https://github.com/MrRobt/job-board-next/actions/runs/44892913723) 验收成功：第十三迁移全新 MySQL8 部署及重复检查、145/145 单元、35/35 集成、0 FAIL/0 SKIP，真实故障事件及重复提交不新增行 PASS，Prisma typecheck、Next build、HTTP smoke 全通过。审计插入故障时的真正 MySQL 回滚注入仍待单独演练；本地工具超时记录继续保留。** B04/U03 IN_PROGRESS，技术上线 NOT READY。

## 恢复与隔离
- 已确认 `a6b5c4a` GitHub Actions [run 44891820268](https://github.com/MrRobt/job-board-next/actions/runs/44891820268) SUCCESS；第十二迁移 `RETRY_WAIT/DEAD` 和故障限次重试已有证据，未重复开发。
- 已读取 AGENTS、长期 Goal、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register、真实 Git 状态；他人未提交的共享文件、financial-risk-audit、next-env、package-lock、缓存全部不编辑/不提交。

## 本轮实现
- 新增第十三迁移 `20261121000500_ops_notification_failure_audit` 和 `OpsNotificationFailureEvent`：事件 id、intentKey FK、attemptCount、RETRY_WAIT/DEAD disposition、限定失败码、createdAt；`UNIQUE(intentKey,attemptCount)` 防止同一任务同一次尝试产生多条故障事件。**不存令牌、个人信息、通知内容、商户或用户 ID**。
- 修改 `createPrismaOpsNotificationFailureStore`，在同一个 Serializable 事务内，只有 `updateMany` CAS 成功（count=1）才插入审计；CAS 冲突不写事件，审计插入失败将使 Prisma 事务拒绝/回滚，不会把异常宣称成功。保留原业务服务的 5 次上限、延时重领。
- 新增 `tests/ops-notification-failure-audit.test.ts`：审计字段投影、重复 token 不多写、CAS 失败不插入、审计插入异常传播。扩展原 `tests/integration/ops-notification-queue-mysql.test.ts`：在全新 MySQL 上验证真正 RETRY_WAIT 后存在 1 条尝试 2 的审计事件，重复失败仍只有 1 条，且清理时先删除本测试独有审计行。CI 缺第十三表必须 FAIL；旧本地隔离库 SKIP。

## 验证与未完成
- `npm test` exit 0、独立 `tsc --noEmit` exit 0。
- 本地 `prisma validate` 工具执行超时；`next build` 已成功编译但 TypeScript 阶段未完成即工具超时，**均不可记完整 PASS**。不干扰其他 Agent 进程/缓存。
- 第十三迁移、新 Prisma Client、真实审计 FK/UNIQUE/同事务 MySQL 证明、完整 CI build/smoke **待本提交远端 CI**。不能只凭本地 mock 称原子回滚 VERIFIED。
- **没有真实 sender、通知渠道投递回执、人工死信解锁或自动定时 Worker**；管理员会话安全 E2E、预发布备份恢复和真实资金/AI 联调仍是 P0，人工外部商户与合规门禁继续 BLOCKED。
