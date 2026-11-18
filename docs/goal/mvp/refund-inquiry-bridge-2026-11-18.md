# B06 P0 退款查询与已存交易号桥接 — 2026-11-18

## 真实问题

`settleToolPayment()` 将已验签的商户交易号保存为 `ToolOrder.providerTradeId = provider + ":" + tradeId`，例如 `WECHAT:420000...` 或 `ALIPAY:202611...`，用于避免跨渠道交易号冲突。

已有 `liveRefundInquiryGateway.query()` 严格比较微信 `transaction_id` / 支付宝 `trade_no` 与传入的 `providerTradeId`，但渠道返回**不带本地渠道前缀**的原始交易号。若未来直接把数据库值传入只读查单，会误判签名正确的渠道结果为交易号不一致；不能为了让查单通过而放宽渠道身份校验。

## 新增模块

`lib/payment/refund-inquiry-bridge.ts`，不引用其他 Agent 尚未提交的退款 Prisma 模型、迁移或动作，**无数据库访问和网络/资金写操作**。

- `prepareRecordedRefundInquiry(record)`：仅允许已经持久化、处于 `PROCESSING`、订单仍 `PAID` 且冻结 `refundHold=true`、已持久化真实发送记录 `dispatchRecorded=true` 的退款申请。用 `prepareMerchantRefund` 重新推导原退款单号和金额/交易引用指纹，与持久化字段严格比较。
- 只剥离与已校验 `provider` 完全匹配的 `WECHAT:` / `ALIPAY:` 前缀，拒绝再次嵌套冒号、不安全交易号、错渠道及修改原始申请，输出兼容 `RefundInquiryGateway` 的原始交易号。
- `queryRecordedRefund(record,gateway)`：调用**显式传入**、由服务器选定的只读网关；再次核对回包渠道、订单、退款请求 ID、金额以及合法状态。未设默认网络网关、不自动实际查询商户；即使渠道返回 `SUCCEEDED` 也只返回证据，**不改变 `REFUNDED` 状态、不解除冻结、不撤权、不返还钱**。

这里的 `record` 必须由未来服务端授权的持久化退款表/出款 outbox 组装，绝不能接受表单/浏览器伪造的快照或普通用户指定网关。现有其他 Agent 退款 Schema 只有申请和审查字段，尚无已持久化的退款单号、指纹与发送凭证，所以本桥接模块**尚不能接入真实出款生命周期**。

## 本地测试

在 `F:\code\job-board-next` 的授权工作树执行：

| 验收项 | 结果 |
|---|---|
| 新增纯单元测试 `tests/refund-inquiry-bridge.test.ts` | **4/4 PASS** |
| 全量单元 `tests/*.test.ts` | **36/36 PASS** |
| 独立 MySQL 全量集成 `tests/integration/*.test.ts` | **17/17 PASS** |
| TypeScript `tsc --noEmit` | exit 0 |
| Next.js 16.4.6 生产构建 | exit 0 |

覆盖微信/支付宝持久化交易号标准化、同一退款申请单号重试一致、未发送/未冻结/不匹配状态拒绝、指纹与金额漂移拒绝、商户回包伪造身份/异常状态拒绝。测试网关为内存注入，无真实商户调用或实际资金退款。

## 待解决与人工门禁

1. 等待其他 Agent 的 `ToolRefundCase`/迁移/权限路径完成独立审查与提交；随后新增**唯一退款出款记录**：原始渠道交易号、原订单、原始金额、允许退款金额、确定性 `outRefundNo`、指纹、审核人、出款开始/结束与重试状态。
2. 设计数据库事务内冻结权益、预检查 RESERVED/SUCCEEDED/FAILED 与退款使用政策，以及单次出款幂等/重试/失败恢复。商户 `SUCCESS` 的签名与金额/订单校验、退款实际终态、撤权与审计应各自有记录且一致。
3. 合法商户、真实小额退款及回调/查单/对账 UAT 必须经主体授权；即使离线测试成功，`B06` 仍 `IN_PROGRESS`，真实支付和 AI 默认关闭。
