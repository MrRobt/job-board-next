# P0 跨业务商户交易号重复结算防护（2026-11-18）

## 缺陷与风险（有 RED 实证）

旧招聘 `Order` 和独立 AI 次数包 `ToolOrder` 各自定义 `providerTradeId @unique`。在独立两张表中，单表 UNIQUE 不能确保同一支付宝/微信商户交易号只被两类订单中的一类使用。

原 `settleToolPayment` 已在本地事务内查询旧订单是否占用该交易号，但 `settlePayment` 没有反向检查。新增隔离 MySQL 集成测试 `tests/integration/cross-product-trade-isolation.test.ts` 先证实 RED：先完成 AI 次数包结算，再用同一渠道交易号结算历史订单，**意外成功**，测试报出 `Missing expected rejection`。该用例使用合成订单和测试交易号，绝无真实资金。

## 修复

只修改已提交的两条服务端结算路径：`lib/payment/settlement.ts`、`lib/career/billing.ts`。

1. 历史订单付款结算新增反向检查 `ToolOrder.providerTradeId` 是否已经占用商户交易号，发现则阻止第二次授权；已有 AI 次数包侧对 `Order.providerTradeId` 的检查保持。
2. 两种结算使用同一 MySQL InnoDB `SERIALIZABLE` 隔离级别执行各自的完整 Prisma 交互式事务（有界 `maxWait=10s`、`timeout=15s`）。检查和授权写入均在事务内，依赖 InnoDB 对对侧 UNIQUE 交易号索引的锁定读/间隙锁，禁止并发路径在各自表中成功使用同一个商户交易号。数据库死锁或超时会使该交易结算失败关闭，不会偷偷发放另一份权益。**未实现自动重试**，需要渠道重试/人工对账。
3. 两条路径服务端统一校验渠道和不含危险分隔符的 1–120 位商户原始交易号，再生成带渠道前缀的本地引用；继续以整数分核对金额、订单号、渠道和状态，原有支付成功重复回调幂等行为不变。
4. 不修改退款申请、`prisma/schema.prisma`、迁移、用户/后台页面及其他 Agent 的未提交文件，不调用任何真实商户接口，不开放支付开关。

## 测试与结果

只在职讯集独立的 `job-board-next-db-1` / `jobs_mvp_migrate_20261118_8f72` 环境中执行：

| 证据 | 结果 |
|---|---|
| 新增专项 MySQL 集成，修复前 | **RED**，相同渠道交易号可被 AI 次数包和历史订单分别结算；`Missing expected rejection` |
| 新增专项 MySQL 集成，修复后 | **GREEN 1/1**，覆盖历史先付→AI、AI 先付→历史，以及 **6 组同时进行的双业务结算竞争**；冲突时至多 1 方获得权益 |
| 修复后完整单元测试 | **38/38 PASS** |
| 修复后完整 MySQL 集成（扩大并发覆盖后再运行） | **18/18 PASS** |
| TypeScript | exit 0 |
| Next.js 16.4.6 生产构建 | exit 0 |

该用例是可重复的合成数据回归，不能代替真实支付商户回调重试、生产高并发压力、死锁告警、全局交易号数据库建模/唯一约束和灾后恢复验收。

## 后续 P0

- 将跨业务唯一交易号的事务冲突率/Prisma deadlock/timeout 纳入监控和人工核账，不将失败通知自动记为已付。
- 若后续有更多支付产品线，建议独立全局 `MerchantTransaction` 登记表及唯一 `(provider,tradeId)` 约束；须在其他 Agent 的退款 Schema/迁移完成并单独验收后设计生产升级，不能抢改对方的未提交迁移。
- B05/B06 继续 `IN_PROGRESS`：真实支付/退款 UAT、退款出款持久化、资金终态、剩余权益原子撤回及安全部署尚缺。保持真实支付/AI 默认禁用，外部资质、商户与合规审批继续人工门禁。
