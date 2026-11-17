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

## Git 安全

工作区历史保留 `next-env.d.ts`、`package-lock.json` 和 `.dsh-meow/` 的其他 Agent/工具变更；仅暂存本轮工作包文件。遵守 `AGENTS.md`，分批 commit/push、禁止 reset/clean、force push。未经实际商户、模型、生产 UAT 和资质确认，`ENABLE_REAL_PAYMENT`、`ENABLE_LIVE_AI` 保持禁用。
