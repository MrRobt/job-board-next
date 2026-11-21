# B04/U03 事故通知 Outbox 仅入队持久化门禁 — 2026-11-21

状态：**候选入队逻辑、schema 与本地单元/独立类型/构建 VERIFIED；第十迁移与真实 MySQL 幂等入队待本提交 CI 验证。** 无发送器、无自动 Worker、无外部通知；整体 NOT READY。

## 真实起点
- 已查 `cd755a1` GitHub CI success；第一小包 `89fbe7a` run [44884812385](https://github.com/MrRobt/job-board-next/actions/runs/44884812385) **success**：全新 MySQL8 迁移成功、125/125 单元、34/34 集成，0 FAIL、0 SKIP。
- `main...origin/main` 及 AGENTS.md、Goal、current-task、handoff、需求矩阵、测试证据、发布清单、风险登记均已核对。其他 Agent 未提交的 handoff、矩阵、风险、清单、财务审计、next-env、缓存与 package-lock 全部保护。

## 本轮第二小包（只入队，不发送）
- `prisma/schema.prisma` 与第十迁移 `20261121000200_ops_incident_notification_intents`：增加 `OpsIncidentNotificationIntent`，`idempotencyKey CHAR(64)` 唯一主键，关联已存在的 `OpsAlertIncident`，记录事故轮次、聚合数、等级、通知种类、时间桶、QUEUED 状态和创建时间。没有配送成功状态/通知渠道/商户或用户信息，不更改资金表。
- `ops-notification-intents.ts` 导出独立的稳定 `opsNotificationIdempotencyKey`；`ops-notification-queue.ts` 强制验证哈希真实性、事故类别、数量、等级、时间戳、仅 NOTIFY 第零桶，然后在 injected store 事务中重新核对当前事故状态必须仍 OPEN 且 openedAt 与意图轮次完全匹配，已确认/解决/旧轮次直接 `STALE`。
- `ops-notification-queue-prisma-store.ts`：Serializable 事务内 SELECT 当前事故并 `createMany(skipDuplicates:true)`，依靠数据库主键实现首次 `QUEUED` / 幂等 `EXISTS`；任何数据库错误回滚，不进行发送或事务外副作用。**没有将此服务接入生产 HTTP/Cron/CLI**。
- 单元 `ops-notification-queue.test.ts`：重复同键只入队一次、ACK/RESOLVED/新轮次拒绝、未知 key/伪哈希/错误等级/时间失败、Prisma Serializable + skipDuplicates 样例；新增 `ops-notification-queue-mysql.test.ts` 在迁移后的隔离 DB 真实核验首入队、重复入队、解决后不得再次入队、最后只清理自己测试记录。CI 缺表直接 FAIL；旧专用本地库缺第十迁移明确 SKIP。

## 实测及已知阻断
- `npm test` exit 0；带占位数据库连接 URL 的 `prisma validate` exit 0；独立 `tsc --noEmit` exit 0；Next.js build exit 0。
- 机器上 `npm run typecheck` 内的 `prisma generate` 曾遇到 Windows 占用 `query_engine-windows.dll.node` 的 `EPERM rename`，不是 schema 验证不通过；没有终止其他 Agent/服务。全新 CI 环境会执行 Prisma generate / typecheck。
- 旧独立 MySQL `36 total /31 PASS /0 FAIL /5 SKIP`：旧库缺第九、第十迁移；不能声称本机验证新增真实入队。已核验 `853d20b` GitHub Actions [run 44885639216](https://github.com/MrRobt/job-board-next/actions/runs/44885639216) **success**：第十迁移全新 MySQL8 apply/repeatable、129/129 单元、35/35 集成、0 FAIL/0 SKIP，真实测试 `B04/U03 migrated MySQL: durable notification queue is unique per episode, stale queue refused` 明确 PASS；Next build 与 HTTP smoke 通过。该结果仅证明 QUEUED 入队存储与唯一约束，不证明真实通知可送达。

## 严禁虚报完成
- 此阶段只创建 **QUEUED 意图**，不提供发送、确认、领取租约、过期重试或自动升级；队列在事故已解决后仍需后续 Worker **重新检查事故轮次/状态**才能决定是否发送。不得称可靠消息已送达或 Exactly-once。
- 不改变生产数据库、不启用通知/支付/AI、不执行真实商户调用。后续依赖合规批准的接收人、通知渠道、持久化 claim/ack、死信/重试/恢复、浏览器管理员权限 E2E、预发布迁移/备份恢复。商户和经营合规仍人工门禁。
