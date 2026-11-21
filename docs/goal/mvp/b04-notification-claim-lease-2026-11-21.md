# B04/U03 事故通知领取租约与到期恢复候选 — 2026-11-21

状态：**本地单元、TypeScript、生产构建、schema 校验 VERIFIED；全新 MySQL 第 11 迁移/领取租约待新 CI 验收。B04/U03 IN_PROGRESS；整体 NOT READY。**

## 现场恢复
- `d2834d9` GitHub Actions [run 44886104615](https://github.com/MrRobt/job-board-next/actions/runs/44886104615) 已 success；此前 `853d20b` 第十迁移 QUEUED 幂等入队已在新 MySQL 35/35 集成通过，勿重复。
- 已复核 AGENTS.md、长期 Goal、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register、Git `main...origin/main`。其他 Agent 未提交 handoff/矩阵/发布清单/风险/financial-risk-audit、next-env、package-lock、缓存等全部保留。

## 本轮新增
- Prisma 第 11 迁移 `20261121000300_ops_notification_claim_lease`：`OpsIncidentNotificationIntent` state 从 QUEUED 扩展 CLAIMED，新增 `attemptCount`（default 0）、`claimToken`、`claimedAt`、`leaseExpiresAt` 及 state/lease 索引；不改资金、退款、用户数据，不改外部通知和真实密钥。
- `claimOpsNotificationIntent`：仅凭确定的 SHA256 任务 key 定点领取；clock + 租约 1–15 分钟校验、事务读取当前任务与事故、确认仍为同一 OPEN 轮次且计数 >0 才允许领取。已有有效租约返回 BUSY，过期才可再领并更换 UUID fencing token，最大 5 次后 EXHAUSTED；已确认/已解决/新轮次返回 STALE。返回 claim token **仅用于将来的内部状态机**，不允许发出任何通知或凭 token 绕过授权。
- Prisma adapter 使用 Serializable 事务读取事故及任务，`updateMany` 以 task ID、state、attemptCount、token、leaseExpiresAt 条件更新，CAS 失败返回 BUSY，防止并发多 Worker 重复占用租约。没有 HTTP、Cron、sender 或 ack/delivery。
- `tests/ops-notification-claim.test.ts`：覆盖首次领取、有效租约阻止第二次、到期更换 token、五次上限、ACK/RESOLVED/轮次变化拒领、非法输入 fail-closed、Serializable/CAS 适配。扩展既有 `ops-notification-queue-mysql.test.ts`，在相同测试专用事故中核实真实入队→领取→有效租约 BUSY→过期再次领取→数据库尝试数=2→事故 RESOLVED 后禁止领取，最后只删除本测试创建的数据（避免跨文件并行碰撞）。

## 本地真实证据及限制
- `npm test`、独立 `tsc --noEmit`、Next.js `build` exit 0；`prisma validate` 使用非真实占位 DSN exit 0。
- 历史专用隔离 MySQL：**36 total /31 PASS /0 FAIL /5 SKIP**；旧数据库缺第 9–11 项迁移，新租约测试在本地不计为真实数据库通过。
- 本机旧 Prisma Client 因 Windows DLL 文件锁不能轻易 regenerate，测试中只对新字段回读做显式类型收窄；全新 GitHub CI 需执行 Prisma generate/typecheck + 第 11 迁移 + 真 MySQL 集成。已查验提交 `7ae462f` 的 GitHub Actions [run 44886846171](https://github.com/MrRobt/job-board-next/actions/runs/44886846171) 最终 **success**：第十一迁移全新 MySQL8 apply/redeploy、133/133 单元、35/35 集成、0 FAIL/0 SKIP，扩展的 MySQL 入队测试包含第一次领取、有效租约阻止、到期再次领取及事故解决拒领，明确 PASS。Prisma generate/typecheck、生产 build 和 HTTP smoke 均 success；仍未涉及任何外部通知发送。
- **没有发送器、发送成功/失败确认、租约续期、重试死信、可靠 Outbox dispatch 或通知渠道审批**；CLAIMED 只表示数据库排他占用，不等于消息投递。正式商户/模型/通知、预发布数据库迁移备份和合规审批继续各自人工门禁。
