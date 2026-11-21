# B04/U03 事故通知幂等意图与升级时间桶安全边界 — 2026-11-21

状态：**纯离线意图规划的本地单元/类型/构建 VERIFIED；持久化 Outbox、真实投递、重试、恢复仍 TODO；B04/U03 IN_PROGRESS，商业 NOT READY。**

## 已确认基线
- `cd755a1` GitHub Actions [run 44882754338](https://github.com/MrRobt/job-board-next/actions/runs/44882754338) SUCCESS；上一轮真实 Prisma 计数→事故创建/恢复 MySQL 集成已验收，不重做。
- 恢复 `AGENTS.md`、`long-running-goal.md`、`current-task.md`、`handoff.md`、`requirement-matrix.md`、`test-evidence.md`、`release-checklist.md`、`risk-register.md` 与 Git 状态。其余 Agent 未提交的 handoff、矩阵、风险、发布清单、财务审计、`next-env.d.ts`、package-lock 等完全保护。

## 本轮工作包
- 新增 `lib/career/ops-notification-intents.ts`：只对**已经持久化存在**的事故轮次生成纯数据通知意图；从已有 `planOpsIncidents` 校验三类计数、已人工确认/已解决/抑制状态和升级规则。不尝试发送或标记已投递。
- 按事故 `key + openedAt + NOTIFY/ESCALATE + episode-relative dueBucket` 生成 SHA-256 幂等键，同一个事故轮次扫描次数和数量变化不改变首次通知标识；CRITICAL 退款状态按 15 分钟，其他事故按 30 分钟划分升级桶；跨桶才生成不同的升级键，解决后停止、重新开启会使用新轮次 key。
- 返回仅包含类别、等级、聚合计数、轮次时间、通知种类、时间桶和哈希标识的有限字段，绝不含用户简历、订单 ID、商户凭证、管理员笔记或连接密钥。
- 新增 `tests/ops-notification-intents.test.ts` 覆盖未持久化不发送、同轮次稳定键、同桶防重复/跨桶升级、ACK/解决抑制、重开唯一性、非法计数/时间/重复快照 fail closed。

## 真实测试证据
- `npm test` exit 0；独立 `tsc --noEmit` exit 0；Next 生产构建 exit 0。
- 历史隔离 MySQL 首轮 **35 total/30 PASS/1 FAIL/4 SKIP**，唯一失败为既有 `auth-retention.test.ts` 查询时 `127.0.0.1:3306` 不可达，未修改其代码；原样复跑 **35 total/31 PASS/0 FAIL/4 SKIP**。四项旧库缺第九迁移而跳过，不属于本轮新增通知意图的测试。
- 本轮通知意图仅单元模拟，无投递/持久化；不应宣称 exactly-once delivery。后续必须新增事务 outbox UNIQUE dedupe、claim 租约、发送确认、崩溃重试、超时回收、权限和接收人审批，真实 MySQL 集成/端到端验证后才能打开任何通知开关。

## 安全和交接
- 不改 Prisma、调度、数据库中的事故状态，不接 HTTP、Cron、外部通知/支付/模型，也不操作真实商户/用户/资金。
- 经营资质、商户、模型、个人信息、法律文件、生产数据库迁移和备份恢复全部保持独立人工/预发布门禁。整体 NOT READY。
