# P0 数据库迁移独立验收记录（2026-11-18）

## 目标与隔离

本次只针对 `F:\code\job-board-next` 的**全新、独立本地测试数据库**执行迁移检查，不操作旧业务库及其他项目数据库。Git `main` 原始 HEAD 为 `1cc150f`；验收期间工作区已有退款功能未提交变更，其所有权保持原状。

- 使用健康的 `job-board-next-db-1`（MySQL 8.0）容器，新增独立数据库 `jobs_mvp_migrate_20261118_8f72`。
- 本次测试使用该**临时数据库**，不是生产环境；凭据不得写入文档、提交或用于生产。
- `prisma/schema.prisma` 和 `20261117000300_refund_cases` 在测试时属于原有未提交变更，本报告只证实当前工作树的运行效果，不等于对它们的提交验收。

## 本地已执行证据

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| MySQL `docker ps` | exit 0，`job-board-next-db-1` healthy | 仅查看容器 |
| 以独立库名创建数据库 | exit 0 | 仅创建 `jobs_mvp_migrate_20261118_8f72` |
| `prisma migrate deploy --schema ...` | exit 0，依次应用 `20261117000100_baseline`、`20261117000200_tool_order_reconcile`、`20261117000300_refund_cases` | 首次全新库迁移，当前工作树 |
| `prisma migrate status --schema ...` | exit 0，`Database schema is up to date!`，3 migrations found | 独立库状态 |
| MySQL 集成测试 `--conditions=react-server --import tsx --test tests/integration/*.test.ts` | 8 PASS / 0 FAIL / exit 0 | 独立库，`INTEGRATION_TEST_DATABASE=true` |
| TypeScript `tsc --noEmit` | exit 0 | 当前工作树 |
| 单元测试 `tsx --test tests/*.test.ts` | 8 PASS / 0 FAIL / exit 0 | 当前工作树 |
| 第二次本地 `migrate deploy` | **BLOCKED：工具安全检查拒绝调用，未实际执行** | 不能宣称幂等复跑通过 |

本轮通过的场景属于数据库、代码及离线签名伪响应测试，**没有**真实商户交易、真实退款、生产恢复演练、完整浏览器 E2E 或合规审核。

## CI 门禁调整

`.github/workflows/ci.yml` 的全新 MySQL job 改为先运行 `prisma migrate deploy` 与 `prisma migrate status`，随后再次执行 `migrate deploy` / `migrate status`，最后才 seed、类型检查、单测、集成、build 和 smoke。防止使用 `db push` 掩盖缺失或损坏的迁移 SQL。**本地尚未执行 GitHub Actions 流水线；该门禁的实际 CI 结果待提交推送后由远端验证**。

## 尚未完成，禁止推断

1. 真实旧库存在已建表时，不可直接重放 baseline；先备份、校验 schema 漂移，人工审核 `migrate resolve` 登记及数据回滚方案。
2. CI 迁移复跑未在本轮本地完成，须以实际 CI 运行记录验收。
3. 预发布环境的备份、恢复、最小数据库权限、回滚，以及生产多版本部署仍须专门演练。
4. 真实渠道支付与退款资金闭环、AI 服务/隐私审核、全部外部门禁仍保持 **BLOCKED**；`ENABLE_REAL_PAYMENT` 和 `ENABLE_LIVE_AI` 不得打开。
