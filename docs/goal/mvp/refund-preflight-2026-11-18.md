# P0 退款账务预检规则：纯函数交付（2026-11-18）

## 目标与依赖边界

- `lib/career/refund-preflight.ts` 现只提供 `assessRefundSnapshot(orderId, snapshot)`。**不导入 Prisma、数据库、商户 SDK 或其他 Agent 未提交的退款文件**。
- `tests/refund-preflight.test.ts` 提供基于显式账本快照的纯单元验证；GitHub 干净 checkout 不需要 `ToolRefundCase` Schema 或本地尚未提交的退款申请服务。
- 调用方必须先执行用户/管理员鉴权，读取**同一用户、同一订单**的可信账本，按最新到最旧排序退款申请，再传入规则函数。该 DB 适配层**尚未交付**，不能拿用户提交的任意快照作为财务事实。

## 决策规则

- 仅当真实支付订单 `PAID`、非 MOCK、`refundHold=true`、最新申请 `OPEN`、本地支付交易引用存在，且账本无异常、没有成功消耗/在途运行和未清退款历史时，才返回 `READY_FOR_MANUAL_REVIEW`。
- `RESERVED` 表示仍在执行或待恢复，`SUCCEEDED` 表示已使用；`FAILED` 应已经返还权益。核对 `remaining + RESERVED + SUCCEEDED === total`，并检查总次数与原订单一致。
- 缺冻结、缺 OPEN 申请、重复 PROCESSING/成功退款、MOCK、账本错误或非法金额时均 `NEEDS_RECONCILIATION`，**并非自动拒绝消费者依法应有的售后权利**。
- `automaticallyRefundable` **始终是 false**。本地商户交易引用不等于渠道付款证明。规则不会发起资金转账、解冻或撤权，不具备资金操作权限。

## 验收证据

- 原始实现曾依赖工作区内尚未提交的 Prisma/退款申请代码；在该**本地脏工作树**上曾完成 2/2 预检集成场景、14/14 全量 MySQL 集成、10/10 单元测试、Prisma validate、TS 和 Next.js 构建。**这些历史本地结果不可直接视作干净 checkout 证据**。
- 为保证提交可独立部署，已去掉该 DB 适配器，将纯测试移至 `tests/refund-preflight.test.ts`；新单元 4/4 PASS，运行全量单元 14/14 PASS，且模块不再依赖尚未提交的退款 Schema。
- 当前工作包只交付**纯规则与自动化测试**，不是已上线的退款预检 API、不是商户退款闭环。远端 GitHub Actions 需要在提交后另行核验。

## 待完成

1. 先由原退款申请工作包安全地提交/验收数据库 Schema、迁移和 API；不能混入其他 Agent 未提交变更。
2. 实现受控数据库适配器、授权、时点一致性/锁定、审计，以及稳定持久化的退款单号和实际退款金额。
3. 商户退款申请、查单、最终资金证明、并发/崩溃恢复、撤权账务必须经过真正的渠道联调及人工审批；保留 `B06=IN_PROGRESS`。
4. 真实支付/AI 默认禁用；不得自动启用公网收费、生产凭据或法律门禁。
