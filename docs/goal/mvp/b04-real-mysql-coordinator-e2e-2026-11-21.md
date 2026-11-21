# B04/U03 真实 Prisma 计数 → 协调器 → 事故闭环 MySQL 集成门禁 — 2026-11-21

状态：**测试新增与本地单元/类型/构建 VERIFIED，新增真实 MySQL 用例待远端全新迁移库验收**；B04/U03 IN_PROGRESS，商业上线 NOT READY。

## 恢复与基线
- 核实 `ef5a77f` GitHub Actions run [44881854858](https://github.com/MrRobt/job-board-next/actions/runs/44881854858) **success**，已验收隔离同步协调器的单元安全门禁，但此前尚无协调器真实 Prisma/MySQL 完整闭环。
- 已查阅 `AGENTS.md`、`long-running-goal.md`、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register 和真实 Git 状态；`main...origin/main`。其他 Agent 未提交的 handoff、矩阵、风险、上线清单、财务审计、缓存、package-lock 等保持不动。

## 本轮测试
- 新增 `tests/integration/ops-incident-coordinator-mysql.test.ts`，只有 `INTEGRATION_TEST_DATABASE=true` 且非 production 能执行，检查九号事故迁移；CI 缺表直接失败，旧隔离库显式 SKIP。若已有任何事故记录或三项告警计数不为 0，安全拒绝，绝不修改他人数据。
- 在全新测试数据库创建随机 `.invalid` 邮箱的临时 USER、试用 Grant、11 分钟前的 `ToolRun RESERVED`。由真实 `createPrismaOpsIncidentCountReader` 的单个 RepeatableRead 事务读取三个计数并断言 `{1,0,0}`，用 `runIsolatedOpsIncidentScan` + 真实 Prisma Serializable store 生成唯一 OPENED 事故/事件；注入一次读取失败，确认原事故保持 OPEN 不会被零告警误解决。
- 将本次测试 ToolRun 标为 SUCCEEDED，再由真实 Reader + Coordinator 读取并产生 RESOLVED 事故，检查事件顺序 OPENED→RESOLVED。finally 仅删除本次创建的事故事件、ToolRun、Grant 和临时 USER。
- **测试隔离注意**：CI 的全新数据库叫 `jobs`，不是允许生产扫描写入的历史隔离库名。测试调用里仅当 `CI=true`、实际数据库 URL 为 localhost MySQL `/jobs`、且 `INTEGRATION_TEST_DATABASE=true` 才注入一个虚拟的专用隔离库策略环境，验证协调器的读取、验证、真实 Prisma 事务同步闭环。**这不是实际 CI 数据库写入许可白名单的证明，也未改变任何运行时开关或生产 gate**；真正连接生产调度还需独立授权和限制验证。
- 这段测试不调用外部模型/商户/退款/通知服务，不改变其他用户或资金账本。

## 本地实际测试
- `npm test` exit 0；独立 TypeScript `tsc --noEmit` exit 0；Next 生产构建 exit 0。
- 历史专用隔离 MySQL 首轮 **35 total/30 PASS/1 FAIL/4 SKIP**，因既有 `auth-retention.test.ts` 临时无法连 `127.0.0.1:3306`；原样复跑 **35 total/31 PASS/0 FAIL/4 SKIP**。4 SKIP 因旧本地库无第九事故迁移，新增实际协调器 DB 测试尚未在本地真实执行。
- 后续需查本次提交 CI 上**全新迁移** MySQL 真实测试的实际 PASS/FAIL；若失败按 job 原始日志修复，不能将本地 SKIP 当通过。

## 剩余门禁
- 受控预发布环境迁移/备份/恢复、独立可靠通知/重试 outbox、管理员登录态/CSRF/越权浏览器 E2E、实际资金/AI 商户与隐私合规人工审批依旧未完成。禁止宣称技术上线就绪。
