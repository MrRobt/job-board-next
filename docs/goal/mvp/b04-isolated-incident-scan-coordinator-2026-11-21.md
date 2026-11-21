# B04/U03 只读计数到事故同步的隔离安全协调器 — 2026-11-21

状态：**本轮离线协调服务/单元/类型/构建 VERIFIED；未连生产扫描调度及真实 MySQL 端到端；B04/U03 整体 IN_PROGRESS；上线 NOT READY。**

## 恢复及基线
- GitHub Actions `ba15b8d` run [44880692126](https://github.com/MrRobt/job-board-next/actions/runs/44880692126) 实际 **success**，不用重复已验收的 URL 安全收口。
- 已恢复 AGENTS、Goal、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register 和 Git 状态；`main...origin/main`。他人未提交的 handoff/矩阵/发布清单/风险、财务审计、`next-env.d.ts`、package-lock、缓存等全部保留原样。

## 本轮实现
- `lib/career/ops-incident-scan-coordinator.ts` 添加 `runIsolatedOpsIncidentScan`：只有原先 `approvedOpsScanEnvironment` 的 localhost 历史专用库 + **额外** `OPS_INCIDENT_SYNC_APPROVED=true` 才能读取/同步，任一门禁不满足即拒绝且零 DB IO。生产 NODE_ENV、远端库、普通开发库均禁止。先验证时间，再完整取得三个计数并严格校验，最后才调用现有三类别单事务同步；部分计数、负数、数据库读取异常不得静默转 0 或解决事故。
- `lib/career/ops-incident-count-prisma-reader.ts` 增加窄 Prisma 只读适配，在同一个 `RepeatableRead` 事务里获取 RESERVED 过期、IN_DOUBT 退款、READY 超时三个计数，复用现有查询过滤器，禁止部分查询失败后落库。
- `tests/ops-incident-scan-coordinator.test.ts` 覆盖只读许可不构成写入许可、默认拒绝、生产/远端库拒绝且 0 次读写、查询故障/漏字段/非法计数禁止任何事务、合法快照只触发一次写事务、时钟拒绝提前停止、Prisma RepeatableRead 事务及中途查询失败传播。
- **未**将这套入口接入 `scripts/ops-alert-scan.ts` 原来的只读 CLI，不增加后台定时任务、HTTP、通知发送，也不改变支付/退款/AI/权益任何表或开关。该协调器仍为隔离测试候选，非商业上线服务。

## 验证
- 单元 `npm test` exit 0；独立 TS `tsc --noEmit` exit 0；Next.js 生产构建 exit 0。
- 本地历史独立 MySQL 集成：**34 total / 31 PASS / 0 FAIL / 3 SKIP**。三项 SKIP 是旧隔离库未有第九项事故迁移，不能将本轮协调器解释为真实数据库端到端验收；已核验新提交 `49d258e` 的 GitHub Actions [run 44881430687](https://github.com/MrRobt/job-board-next/actions/runs/44881430687) **success**：全新 MySQL8 迁移成功、119/119 单元、33/33 集成、0 FAIL/0 SKIP，Next build 和 smoke PASS。新增协调器仍仅通过单元注入测试，未做实际数据库端到端。
- 首次 TS 检查发现测试替身的 where 类型未收窄，已修正并完整复测通过。

## 待验收
- 严格许可的独立预发布迁移/备份恢复与真实扫描作业策略、可靠通知/重试 outbox、管理员登录态/CSRF/越权 HTTP E2E；不得跳过外部商户、真实模型、隐私与经营法律人工门禁。
