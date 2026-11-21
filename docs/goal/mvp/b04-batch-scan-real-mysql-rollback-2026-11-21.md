# B04/U03 三类事故完整扫描 MySQL 事务回滚门禁 — 2026-11-21

状态：**新增真实 MySQL 测试代码及本地编译 VERIFIED，隔离 MySQL 事务执行待新 CI**。B04/U03 仍 IN_PROGRESS；整体发布 NOT READY。

## 实际起点
- GitHub Actions `79d7c5b` run [44878653947](https://github.com/MrRobt/job-board-next/actions/runs/44878653947) 已实际 **success**，其单元、MySQL 集成、生产构建及匿名 HTTP smoke 全部步骤均 success。之前 `91f867e` 的单类别扫描 MySQL 真实事务测试已另有 PASS 证据。
- 工作区 `main...origin/main`；已有其他 Agent 对 `handoff.md`、矩阵、风险、发布清单、financial-risk-audit、`next-env.d.ts` 等未提交修改严格保留。

## 本轮独立小工作包
- 新增 `tests/integration/ops-incident-batch-mysql.test.ts`，仅允许专用隔离 MySQL（`INTEGRATION_TEST_DATABASE=true` 且非生产），必须有第 9 项事故迁移；CI 缺表直接 FAIL，旧本地专用库允许显式 SKIP。
- 拒绝写入已有三个事故 key 的数据库。用真实 `createPrismaOpsIncidentSyncStore` 事务适配器，故意在第三类事件 INSERT 后抛错，要求数据库中三类事故和审计 **均为零**（前两个类别和第三个事件一起回滚）。
- 然后在同一专用测试库真实运行整批 OPENED 与整批 RESOLVED，检查三类事故全部关闭且共六项事件，最后仅删除此测试自己创建的事故及事件。无用户、支付、AI、退款表写入；没有自动任务/生产开关。
- 原始测试文件首轮有多余的右花括号，独立 TypeScript/Build 和集成测试入口失败；已明确修复，并重跑全部检查通过。

## 验收证据和剩余风险
- 最终本地 `npm test` exit 0，独立 `tsc --noEmit` exit 0，Next build exit 0；历史专用 MySQL **34 total / 31 PASS / 0 FAIL / 3 SKIP**。新增测试的数据库事务用例在旧库因缺第 9 项迁移被明确 SKIP，不能声称已在本地验证。
- 后续须检查本提交 Github Actions 在**全新已迁移 MySQL**上的新用例 PASS 才能验证真实整批回滚；若失败按原始 CI 日志修复。此测试不等同于有真实管理员登录/CSRF、并发多 worker、生产迁移恢复或外部资金 UAT。
- 保留其他 Agent 未提交文件，禁用真实支付、AI、通知及未获授权的生产迁移；经营资质、商户及合规审批保持人工门禁。
