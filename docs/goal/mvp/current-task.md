# 当前任务（2026-11-17）

## 最近完成并有测试证据

- `P0-AI-RESERVED-AUDIT/RECONCILIATION`：管理员只读识别卡住的 AI 次数预留、确认未交付后单次返还及审计，重复返还和普通用户越权受限（见历史 Git 提交）。
- `P0-PAYMENT-RECONCILIATION-CORE`：本轮新增微信 API v3 和支付宝 RSA2 签名查单/关单接口、支付金额/商户校验、到期未付款关单后复查 CLOSED 才释放 activeKey、管理员确认操作及 `ToolOrderReconcileEvent` 审计。
- 本轮已实际验收：Prisma validate、开发库 schema 同步、TypeScript、8/8 单元测试、7/7 MySQL 集成（包含渠道离线签名伪响应测试）、Next.js 生产 build。实际商户联调尚未执行。
- `prisma/migrations/20261117000200_tool_order_reconcile` 为新增审计表增量 SQL。生产迁移基线仍未独立验证 `migrate deploy`，不得宣称可直接生产迁移。

## 最高优先级未完成

1. `P0-REFUND-ENTITLEMENT-LIFECYCLE`：设计退款申请、微信/支付宝退款接口和查询、金额与权益撤回的并发一致性。任何退款状态必须以真实渠道最终结果为准，不用本地手工标记模拟真实退款。
2. `P0-PAYMENT-RECONCILIATION-UAT`：目前商户查单/关单仅离线模拟验证；需经合法商户、密钥及人工审批完成实际查询、关单、支付成功竞态与对账。
3. `P0-DB-MIGRATION-UAT`：候选迁移的全新独立数据库 migrate deploy、重复部署、备份/恢复、已有数据基线登记；之前执行被安全检查阻断，保留 BLOCKED。
4. 安全、账号验证、自动告警与合规门禁按需求矩阵依赖推进。

## 2026-11-18 独立迁移子包检查点

- 为避免覆盖正在开发的退款代码，本轮独立处理 `P0-DB-MIGRATION-UAT` 的全新库验收与 CI 门禁，原有退款文件保持原状。
- 新建独立 MySQL 库后，首次 3/3 迁移成功，migrate status 成功，单元 8/8、隔离 MySQL 集成 8/8、TypeScript 均通过；详细证据 `migration-uat-2026-11-18.md`。
- 已修改 `.github/workflows/ci.yml` 为 `migrate deploy`（两次）+ `migrate status`，尚未获得远端 CI 运行结果；本地二次 deploy 因安全检查被阻断。故数据库迁移只推进了子验收，整体 P0 继续 IN_PROGRESS。
- 后续仍按原优先级：退款资金与权益一致性 > 商户 UAT（人工门禁）> 旧库基线登记/备份恢复 > 安全与账号。

## 2026-11-18 退款渠道只读查单子包

- 按 P0 退款闭环继续，避免改动其他 Agent 尚未提交的退款申请/冻结代码，独立新增 `lib/payment/refund-query.ts` 与 `tests/integration/refund-query.test.ts`。
- 已实现微信/支付宝退款查询请求签名和回包验签、订单号/退款请求号/原交易号/金额一致性校验；默认双门禁关闭，只有只读查询能力，**不发起资金退款也不改账本**。
- 新增 3/3 离线测试 PASS；现有+新增 MySQL 集成 11/11 PASS、单元 8/8 PASS、TypeScript/Prisma validate PASS、Next.js 生产 build PASS。证据 `refund-channel-inquiry-2026-11-18.md`。
- 查询代码与独立证据已单独 commit/push：`1ccf99b`（`main` → `origin/main`）；对应工作包已提交，B06 整体仍 IN_PROGRESS。
- 后续最高优先级是退款请求号持久化与幂等资金申请、最终渠道结果确认、在途 AI 调用和剩余权益一致性；实际商户及外部合规 UAT 继续 BLOCKED。

## Git 安全

工作区历史保留 `next-env.d.ts`、`package-lock.json` 和 `.dsh-meow/` 的其他 Agent/工具变更；仅暂存本轮工作包文件。遵守 `AGENTS.md`，分批 commit/push、禁止 reset/clean、force push。未经实际商户、模型、生产 UAT 和资质确认，`ENABLE_REAL_PAYMENT`、`ENABLE_LIVE_AI` 保持禁用。
