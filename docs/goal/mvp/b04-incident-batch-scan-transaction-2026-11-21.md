# B04/U03 三类告警完整扫描单事务入口 — 2026-11-21

状态：**整批事务纯逻辑与本地构建 VERIFIED，真实 MySQL 集成沿用前一工作包 CI 门禁且待结果**。整体 B04/U03 IN_PROGRESS；商业 MVP NOT READY。

## 原因
- `91f867e` 新增事故单类别事务同步服务，解决“事故状态与审计原子更新”，但分别调用三次会产生部分扫描成功的可能：例如第三类告警写审计失败，前两类已成功落库，不宜把同一完整扫描拆成三个独立提交。
- 继续原始 Goal 的可靠性要求，不重复原有管理员 CAS/只读开关验收，也不越过迁移授权。

## 本轮独立增量
- `lib/career/ops-incident-sync-service.ts` 内提取每类的 `syncOne` 事务内步骤，增加 `syncOpsAlertScanWithStore(store,counts,now)`。首先使用现有 `assessOpsAlerts` 对全部三个计数严格验证并检查合法时钟；然后在**同一个** `store.transaction` 中依次处理 STALE_AI_RESERVATIONS、REFUND_IN_DOUBT 和 REFUND_READY_AGED，任何 CAS 或事件失败由 Prisma 事务整体回滚。
- `tests/ops-incident-batch-sync.test.ts` 新增模拟事务：一次事务处理所有类别、解决复扫不重复审计、最后一个类别审计失败导致前面两类全部回滚、缺失/负数/非整数计数及无效时间被阻断，检查拒绝时没有开启事务。
- 无自动任务/外部 HTTP/真实支付/AI/通知代码；没有任何数据库迁移或运行时开关变化，生产不使用这个候选入口。

## 实际证据
- npm 全量单元测试 exit 0，独立 TypeScript exit 0，Next 生产构建 exit 0。
- 历史专用本地 MySQL 集成 **33 total / 31 PASS / 0 FAIL / 2 SKIP**；两个 SKIP 是该本地库没有第 9 项事故迁移，不可解释为真实 Prisma 事故同步已通过。
- 已查验前一工作包 `91f867e` 的 GitHub Actions run `44878355008` 最终 **success**。实际 job 日志：全新 MySQL8 全量迁移成功，**111/111 单元、32/32 集成、0 FAIL、0 SKIP**，其中 `B04/U03 migrated MySQL: incident scan OPENED / RESOLVED / REOPENED audit is atomic` 明确 PASS。此结果验证单类别 Prisma 持久化，不代替本包新增的整批扫描远端验收。
- 其他 Agent 未提交的 `handoff.md`、需求矩阵、风险、上线清单、`next-env.d.ts`、financial-risk-audit 及缓存等保持原样。

## 后续
1. 确认 `91f867e` 和本次提交的真实 GitHub Actions 结果，必要时修复 Prisma/MySQL 事务适配。
2. 独立预发布环境先授权第 9 项迁移、备份/恢复，再验收扫描并发与管理员确认交错、通知 outbox 后才可能连接自动调度。
3. 商户、模型、隐私和经营合规审批仍人工门禁。
