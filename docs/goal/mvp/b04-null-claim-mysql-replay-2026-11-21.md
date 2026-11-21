# B04/B06 退款 IN_DOUBT 空领取时间：隔离 MySQL 真实异常回放（2026-11-21）

状态：VERIFIED（本地隔离测试子包）；B04/B06 和上线总门禁仍 IN_PROGRESS。

## 目标和范围
补齐上轮 `b04-refund-null-claim-alert-2026-11-21.md` 的唯一未验收缺口：Prisma 条件虽有单元测试，但未用真实数据库记录检验 `IN_DOUBT AND claimedAt IS NULL` 的告警查询、CLI 退出码和对账安全性。

本轮只扩展 `tests/integration/refund-finalization.test.ts`，复用已经存在的专用合成退款夹具（买家、审批双人、派发领取，均为测试随机生成的账户），避免重复搭建退款流程、改 Prisma schema、修改正常开发库或访问商户。

## 实际隔离 MySQL 验收
- 测试开启 `INTEGRATION_TEST_DATABASE=true`，连接专用 `jobs_mvp_migrate_20261118_8f72`。领取前派发正常，领取后 `IN_DOUBT` 且领取时间有效。
- 同一派发 ID：正常、较新的 `claimedAt` 在查询中计数 **0**；将该测试行 `claimedAt` 临时设为 `NULL` 后，`opsAlertQueryFilters` 驱动的真实 Prisma `count` 计数 **1**。
- 在测试进程中启动 `scripts/ops-alert-scan.ts` 真正的子进程（显式只读批准、非生产、仍指向隔离库），断言 **exit 2**、`status=ALERT`、`uncertainRefunds>=1` 且分类含 `REFUND_IN_DOUBT`。
- 同时核对订单仍为 `PAID`，用户该次数包剩余 **20**，扫描没有触发任何资金或权益改账。
- `finally` 恢复原领取时间，重新查询同一派发 ID 计数 **0**；原有成功验签查单、终态撤权及合成数据清理仍执行。

## 回归结果
- 第一次错误的单文件测试命令用了 `tsx --test`，无法正确导入 `server-only`，exit 1；它是命令方式错误，不是本包业务断言失败。随后使用仓库正式 `npm run test:integration` 方式验收。
- 补充恢复后断言，最后完整单元 **72/72 PASS**；直接 TypeScript `tsc --noEmit` **exit 0**。
- 专用隔离 MySQL 全量文件串行集成 **31/31 PASS，exit 0**（包含本异常记录 + 真实告警 CLI 子进程测试）。
- Next.js 16.4.6 生产 build **exit 0**。

## 安全限制和后续
该测试仅向专用隔离 MySQL 合成记录临时写入空领取时间，且 `finally` 恢复；不涉及真实用户数据、正常开发库、生产库、真实商户退款 POST 或实际 AI 出站。

已验证的是**异常退款告警在隔离库上的检测**，不是生产告警投递、确认/升级、故障恢复、商户验签退款 UAT、生产数据迁移或浏览器 E2E。真实支付、真实 AI 和合规审批保持关闭/人工门禁。

后续优先补充生产部署前的外部通知/值班响应、安全性与去重审计，并继续其他 P0；主 `handoff.md`、需求矩阵、风险和发布清单有其他 Agent 未提交修改，本包不覆盖、不混提交。
