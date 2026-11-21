# B04/U03 真实 MySQL 扫描与管理员确认交错测试 — 2026-11-21

状态：**新增迁移库并发集成场景代码、单元/TS/Build VERIFIED；并发数据库执行待新 CI**。整体 B04/U03 IN_PROGRESS，商业 MVP NOT READY。

## 恢复与基线
- `f365c28` 的 GitHub Actions run [44879055646](https://github.com/MrRobt/job-board-next/actions/runs/44879055646) 实际 SUCCESS；全新 MySQL 8 全量迁移成功，**114/114 单元、33/33 集成、0 FAIL/0 SKIP**，其中整批第三类审计注入故障的回滚用例 PASS。
- 恢复 `AGENTS.md`、`long-running-goal.md`、current-task、handoff、requirements、test-evidence、release-checklist、risk-register 及原始 Git 状态。其他 Agent 未提交的 handoff、矩阵、风险、发布清单、financial-risk-audit、next-env、缓存与 package-lock 原样保留。
- 当前最高优先级的独立缺口是**扫描刷新与管理员确认在真实 MySQL 同轮次并发**是否能保留人工确认，不重复审计及容错重试。

## 本次变更
- 仅扩展既有 `tests/integration/ops-incident-batch-mysql.test.ts`，在三类事故初次 OPENED 后新建临时 ADMIN 用户，通过真实 Prisma Serializable 同时竞争：
  - `syncOpsAlertScanWithStore` 刷新 `REFUND_READY_AGED` count 3→4；
  - `acknowledgeOpsIncidentWithStore` 读取真实管理员角色，按 openedAt CAS 人工确认。
- `Promise.allSettled` 捕捉真实串行化冲突；必须至少一个提交，失败分支在已有结果落库后重新读取/重试。最终要求事故仍为 ACKNOWLEDGED、数量 4、确认人属于该临时 ADMIN，并且该轮 ACKNOWLEDGED 审计**恰好一条**。
- 后续把三类事故 RESOLVED，预期原有 6 条 OPENED/RESOLVED 审计加 1 条 ACKNOWLEDGED 审计共 7 条；在 finally 只清理本测试创建的事件、事故和临时管理员。
- 未改生产运行代码、数据库 schema 或调度/通知开关；不调用真实收款、AI、退款、资金或用户业务服务。

## 测试证据及明确限制
- `npm test` exit 0；独立 `tsc --noEmit` exit 0；Next.js 生产构建 exit 0。
- 本地专用历史 MySQL 首轮 **34 total / 30 PASS / 1 FAIL / 3 SKIP**，失败仅来自其他 Agent 未提交的 `financial-risk-audit.test.ts` 的临时 `127.0.0.1:3306` 数据库连接故障，未编辑其代码；同命令复跑 **34 total / 31 PASS / 0 FAIL / 3 SKIP**。三个 SKIP 均因历史库缺第 9 项事故迁移，故新增真实并发用例**尚未在本地验证**。
- 已核实 `859db27` 的 GitHub Actions run [44879917200](https://github.com/MrRobt/job-board-next/actions/runs/44879917200) 完成且 **success**。实际 job 日志显示全新 MySQL8 全量迁移成功、**114/114 单元、33/33 集成、0 FAIL/0 SKIP**，整批事故扫描含真实 ADMIN 确认交错用例 PASS；生产 build 与匿名 smoke 均 success。此项不是管理员登录态浏览器/CSRF E2E，不代表生产库已迁移或真实通知闭环。
- 外部经营主体资质、商户、模型、隐私/数据协议、法律审查全部仍需有权主体人工验证。正式上线 NOT READY。
