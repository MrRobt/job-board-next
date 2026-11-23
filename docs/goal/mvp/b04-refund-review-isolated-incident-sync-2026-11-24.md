# B04 退款账本冲突持久事故安全扫描 · 2026-11-24

## 恢复、依赖与工作包边界

- 目标：延续 `4b3aef2` VERIFIED 的 B06 已验签退款成功 + 权益不一致审计 `MANUAL_LEDGER_REVIEW` 及 B04 事故中心只读提示。完整核对 Goal、current-task、handoff、requirement-matrix、test-evidence、release/risk、真实 Git、预览进程、独立 MySQL8 的18条迁移和原有 3 类事件/通知队列，不重做已验收功能。
- P0 缺口：异常审计能只读显示，但尚无法进入 `OpsAlertIncident` 持久事件状态机与管理员接手，无法记录 OPEN/ACKNOWLEDGED/RESOLVED/REOPENED 处置过程。
- 单独注册 `REFUND_LEDGER_REVIEW`（Critical，限 40 字符的现有 incident key），**不改变原 3 类时延扫描的聚合定义和现有自动通知任务生成**。管理员页面复用原有最小字段投影，原 `requireAdmin` 和 ACK 开关继续生效；新类别允许原生有权限管理员确认，但“确认接手”不代表退款成功。
- 新 `lib/career/refund-review-incident-scan.ts`：只读取 `ToolRefundInquiryEvent` 中 `outcome=MANUAL_LEDGER_REVIEW` 且 dispatch 仍 `IN_DOUBT` 的**活跃数**，调用现有 `syncOpsIncidentWithStore` 与 Serializable CAS+事件审计。仅持久化 `OpsAlertIncident` 和 `OpsAlertIncidentEvent`；不修改用户、工单、订单、次数、派发与退款记录；读取异常失败不当作 0，扫描写入冲突不吞错。
- 新 `scripts/refund-review-incident-scan.ts` 是**人工触发的手动命令**，运行前要求 `OPS_ALERT_READ_ONLY_APPROVED=true`、`OPS_INCIDENT_SYNC_APPROVED=true`、新增 `OPS_REFUND_LEDGER_SYNC_APPROVED=true`、`INTEGRATION_TEST_DATABASE=true`、非生产 `NODE_ENV`，且仅接受 `127.0.0.1:3306/jobs_mvp_migrate_YYYYMMDD_<token>` 专用隔离迁移库。**不提供生产运行入口、没有定时调度、没有商户/AI/外部网络通知**。未经批准默认拒绝、退出码 3；正常无活跃异常退出 0，存在未解决异常退出 2 供人工检查；输出只包含聚合事件数量，不打印 DSN 或客户信息。
- `ops-notification-envelope` 与 `ops-notification-queue` 显式阻断这一新类别，直到未来单独批准通知收件人/出站网络/lease/提供者幂等和 UAT；切勿把手动事故同步解释为已实现告警推送。

## RED/GREEN 与真实数据库验收

- 新 `tests/refund-review-incident-scan.test.ts`：先因服务不存在 RED，随后覆盖三重独立门禁、默认拒绝、OPEN→RESOLVED→REOPENED、非法/错误计数不自动解决事故、管理员确认表单/显示、拒绝入通知队列；**4/4 PASS**。
- 新 `tests/refund-review-incident-cli-policy.test.ts`：默认拒绝、生产模式或库名不符退出 3，无 SQL/秘钥泄漏，静态确认无 HTTP 发送/定时器/资金写代码；**2/2 PASS**。
- 原三类规划、管理员视图/表单和通知相关单测累计补充定向 **24/24 PASS**。
- `tests/integration/refund-finalization.test.ts` 扩展在 `jobs_preview_20261123` 独立 MySQL8 的真实流程：模拟商户成功但使用中账本不一致产生 1 条持久人工核账事件 → 读活跃数 1 → B04 事故 OPEN，重复扫描不重复创建 → 真实数据库管理员（不是伪造身份）接手 ACKNOWLEDGED 且保留事件 → 原有原子结算成功后活跃数 0、事故 RESOLVED、历史审计 `OPENED/ACKNOWLEDGED/RESOLVED` 保留。仅清理本测试 own synthetic 数据和新 incident key，不影响其他项目 DB。**1/1 PASS**。
- 本地全量 `npm test` 实际 **230/231 PASS**，唯一失败为其他 Agent 未提交的 `tests/auth-retention-verification-policy.test.ts` 密码重置保留期测试；本机 `tsc` 唯一 TS2739 在其他 Agent 未提交 `lib/auth-retention.ts:83`，本包不修改/暂存这两个文件。**已取得干净远端真实验收：** 提交 `c6d4525` 主 CI run `45248128498` / job `137950245274` completed/success；原始日志新增 B04 事故三重门禁及无外发测试 PASS、MySQL8 `signed refund inquiry settlement requires confirmed matching refund, atomically revokes unused credits` 集成 PASS（含 OPEN→ACKNOWLEDGED→RESOLVED 持久审计）；Prisma 全新迁移及重复部署、TypeScript、单元 **230/230 PASS**、完整 MySQL 集成、Next 生产 build/HTTP smoke 均 SUCCESS。同提交另外 7 条邮箱/密码/后台/恢复专项 CI 全 SUCCESS。**仅此隔离合成事故同步与手动审核子包 VERIFIED**，不是正式自动通知或真实商户资金确认。

## 独立验收/交接与遗留门禁

- 此文档兼作需求矩阵 B04 的独立增量说明与 handoff：`B04` 整体依然 `IN_PROGRESS`，此次仅闭环**合成数据的持久事故扫描及人工接手子包**；其他 Agent 的 `requirement-matrix.md`、`handoff.md`、`release-checklist.md`、`risk-register.md` 正处于 dirty，不覆盖/混提交。
- 只阶段提交本包自有脚本、纯策略、管理员表单显示与通知拒绝、新测试、current-task/test-evidence/独立交接。无强推、无 reset/clean，保护其他 Agent 未提交的 auth retention、finance risk audit、lockfile 和缓存。
- 后续 P0：真正生产级安全调度、外部通知可达性/去重、人工处理 SLA、财务账本异常实盘排查仍未通过；真实商户/AI、经营资质、消费者退款、合规审批全部保留人工门禁。技术上线 NOT READY。
