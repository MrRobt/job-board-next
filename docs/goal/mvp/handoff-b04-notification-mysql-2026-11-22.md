# B04/U03 新增 MySQL 只读准备端到端测试交接（2026-11-22）

候选本包：`tests/integration/ops-notification-handoff-mysql.test.ts`。接入**既有**迁移事故/通知队列与 Prisma 适配，验证 QUEUED→CLAIMED→PREPARED、聚合数刷新、旧 token、禁用、租约到期、解决后失效。新文件独立不覆盖原有 MySQL 测试；仅在隔离数据库测试，CI 缺迁移强制失败，测试对自身记录清理。

本地 `npm test`、独立 `tsc`、Prisma+Next 生产 build 均 exit 0；真 MySQL 的新用例需在本次提交的远端 CI 验证，未完成前不得标 VERIFIED。继续保留生产通知关闭、人工审批、原共享文档脏文件和财务审计不动。

证据：`b04-notification-handoff-mysql-2026-11-22.md`。后续检查 GitHub CI 真实新库运行，包括此用例状态；随后推进供应商级幂等与 crash-after-accept 不确定回执建模。
