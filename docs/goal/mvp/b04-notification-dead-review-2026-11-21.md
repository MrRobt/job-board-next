# B04/U03 DEAD 通知任务管理员复核（第十四迁移）— 2026-11-21

状态：本地单元、独立 TypeScript VERIFIED；第十四迁移、真实 MySQL 角色/幂等复核及生产构建已在 `00fd34d` GitHub Actions [run 44895376472](https://github.com/MrRobt/job-board-next/actions/runs/44895376472) **SUCCESS**：149/149 单元、35/35 集成，0 FAIL/0 SKIP；管理员权限/复核唯一性、冲突拒绝、DEAD 保持以及完整 typecheck/build/smoke PASS。B04/U03 IN_PROGRESS，整体 NOT READY。

## 恢复与边界
- 已确认 `c8d7b5c` GitHub Actions run [44894374079](https://github.com/MrRobt/job-board-next/actions/runs/44894374079) SUCCESS；第十三迁移与真实数据库 FK 回滚演练已经验收，不重复。
- 已恢复 AGENTS.md、long-running-goal.md、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register、真实 Git。其他 Agent 未提交的共享文档、financial-risk-audit、next-env、package-lock 及缓存完整保留。

## 本轮工作包
- 第十四迁移 `20261121000600_ops_notification_dead_review` 新增 `OpsNotificationDeadReview`：`intentKey` 作为 PK/FK，只有任务、管理员 ID、规范机器复核原因、时间，不存个人资料/消息内容/领取令牌。唯一主键防止同一通知多次人工复核。
- `reviewDeadOpsNotification` 使用注入的事务端口，在事务内根据数据库 User.role 核查 `ADMIN`，验证任务仍是 `DEAD`，查已有复核记录；完全相同的复核返回 ALREADY_REVIEWED，不同决定抛出冲突；初次复核新增记录，任何错误由数据库事务回滚。输入只能是严格 64 位小写十六进制任务 key、非空受限 operator ID、40 字节以内机器原因及合法时钟。
- `createPrismaDeadReviewStore` 使用 Serializable Prisma 事务和窄投影操作。**没有 HTTP/Cron/通知通道/任务重试或复活功能**，仅供后续审计合规管理使用。
- 单元 `tests/ops-notification-dead-review.test.ts` 覆盖管理员一次复核、幂等重放、冲突、普通用户被拒、非 DEAD 被拒、输入校验、Prisma DB 角色查询。
- 扩展既有 `tests/integration/ops-notification-queue-mysql.test.ts`：仅在已创建并由本测试独占的队列任务上人工将状态设为 DEAD（仅测试数据），创建随机无效邮箱的测试管理员和普通用户，验证后者无权操作，管理员首次复核成功、重复同决定幂等、不同决定冲突；真实数据库记录仅一条且任务仍 DEAD。finally 精确删除测试复核、审计、任务、事故以及测试用户。CI 缺第十四迁移会失败，旧专用 MySQL 缺迁移时会 SKIP，不得记为通过。

## 验收与尚缺
- 本地 `tsc --noEmit` exit 0、`npm test` exit 0。
- 第十四迁移真实 MySQL/权限测试、Prisma Client 生成及生产构建必须由本提交 CI 验证，不能预先宣称成功。
- 仍需真正 dead-letter 运维 UI/管理员 HTTP 授权和 CSRF E2E、投递确认与去重、跨网络调用竞态保护、预发布恢复演练；商户、经营资质、AI/个人信息处理等外部门禁均不擅自解除。
