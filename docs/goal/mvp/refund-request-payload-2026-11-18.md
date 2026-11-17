# 退款请求确定性构造与重试防漂移 — 2026-11-18

## 交付边界（B06 内部子包）

新增 `lib/payment/refund-request-payload.ts` 和 `tests/refund-request-payload.test.ts`，提供**无网络、无数据库、无密钥**的纯函数：

- `prepareMerchantRefund(intent, expectedFingerprint?)`：验证订单、支付交易引用、商户退款申请标识、整数分金额及原因；从**已有的、持久化的**退款 caseId + 订单号确定性派生同一商户退款单号 `outRefundNo`；产生与支付渠道、金额、原交易引用、退款原因绑定的 SHA-256 指纹。
- `wechatRefundPayload`：生成微信 API v3 的 `out_trade_no`、`out_refund_no`、`reason`、`amount.{refund,total,currency=CNY}` 数据，尚不发送 POST。
- `alipayRefundPayload`：生成 `alipay.trade.refund` 所需的 `out_trade_no`、`out_request_no`、`refund_amount`（元、两位小数）、`refund_reason` 数据，尚不发送 POST。

**重要**：退款 caseId 必须先由已提交且经过权限/状态验收的数据库事务创建；真实商户请求之前必须持久化 `outRefundNo` 和指纹、原订单、退款金额，并在所有重试之前比较指纹。单靠确定性 ID 或哈希无法提供数据库级资金幂等。当前工程的 `ToolRefundCase` Schema/代码尚属于其他 Agent 未提交工作，**没有接线、没有发送商户退款、也没有开启真实支付开关**。

## 安全行为

1. 同一 caseId + 订单号重复生成相同退款单号，防止单纯网络重试生成新的商户退款请求号。
2. 同一记录试图更改渠道、金额、支付交易引用、退款原因时，给定原指纹会拒绝。
3. 拒绝 MOCK、不符合订单号或交易号格式、非整数/零/负数/超出原单的金额、过长或含控制字符的原因；金额始终存储为整数分，支付宝出站金额精确为两位小数。
4. 该函数不提供权限判断、并发锁、退款金额政策审批，也不对渠道响应进行验签，不能用作完成资金退款的凭据；需与已交付只读渠道查询模块、未来资金流水审计和权限控制配合。

## 实际测试

在已授权的 `F:\code\job-board-next` 工作区执行：

| 验收 | 结果 |
| --- | --- |
| 新增纯函数测试 | 4/4 PASS |
| 全量单元 | 18/18 PASS |
| 隔离 MySQL 集成（含其他 Agent 尚未提交的退款申请） | 12/12 PASS |
| TypeScript | exit 0 |
| Next.js 生产 build | exit 0 |

首轮测试发现控制字符经 `trim()` 被消除，以及测试断言类型错误；修正后全部 PASS。**这些结果是本地工作树的测试，不等于远端 CI 或商户 UAT。**

## 待验收与人工门禁

- 原退款申请 Schema、迁移/权限提交和验收后，才能新建持久退款记录及出款 outbox，确保同一业务申请只可申请一笔资金退款。
- 真实微信/支付宝退款 API 签名、请求发送、同步响应验签及异步/查单终态必须另外实现并经合法商户 UAT；支付宝同步 HTTP/业务码成功不等于资金已退。
- 退款终态核对、在途 AI 调用、部分使用的次数、撤权和对账必须建立可恢复的原子事务和事故审计。
- `B06` 保持 `IN_PROGRESS`，`L01/L02` 人工合规/商户验收保持 `BLOCKED`，生产收款与实际 AI 不得擅自开启。

参考：微信支付 API v3 商户退款说明（退款失败后重试应使用原商户退款单号）<https://pay.wechatpay.cn/doc/v3/merchant/4012791862>；支付宝 `alipay.trade.refund` 和 `alipay.trade.fastpay.refund.query` 官方接口说明 <https://aipay.alipay.com/docs/vibe-pay/ai-web-app-payment-qianyi/api-list/alipay-trade-refund.html>。
