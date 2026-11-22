# 2026-11-22 B06 支付宝退款查询成功终态的商户身份核验

## 发现
`lib/payment/refund-query.ts` 原检查为 `if (body.seller_id && body.seller_id !== env("ALIPAY_SELLER_ID"))`，因此已通过 RSA2 验签的 `REFUND_SUCCESS` 回包若 `seller_id` 为空或缺失，仍可能返回 `SUCCEEDED`。后续服务会据此执行退款成功后的权益撤销，属于 B06 P0 资金身份门禁。

## 修复与边界
- 对 `REFUND_SUCCESS` 要求明确且精确匹配 `ALIPAY_SELLER_ID`；对其他查询状态若给出 `seller_id`，仍必须匹配。
- 没有放宽签名、订单号、退款请求号、交易号和金额验证；查询不是退款 POST，不执行资金变更，也不修改真实配置。
- `tests/integration/refund-query.test.ts` 添加签名成功但空/缺失 seller_id 的拒绝断言。

## 实测结果
- 新断言加入后，支付宝退款专项 RED（exit 1，`Missing expected rejection`），证实原有绕过。
- 实现修正后，在现有 RSA2 模拟响应环境下专项 1/1 PASS（exit 0）。
- `npm --prefix F:/code/job-board-next test` exit 0。
- `F:/code/job-board-next/node_modules/.bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json` exit 0。
- `npm --prefix F:/code/job-board-next run build` exit 0（Prisma generate、Next.js 16.4.6 production build）。
- **没有验证真实支付宝沙箱/商户回包是否总提供 seller_id**；缺失时系统将 fail-closed、保留人工查账，不得宣称生产退款 UAT 或 B06 整体验收通过。

## 恢复信息
- 起始本地与远端 `main` HEAD 均为 `ffef774b`，旧提交积压已同步。
- 其他 Agent 的 `handoff.md`、矩阵、风险、发布清单、财务审计及工具工作文件保持原样；不混提交或强推。
- 下一步为授权隔离 MySQL 的资金终态/撤权回归，及经营者批准的真实商户验证、恢复演练；真实付款/退款/AI/通知继续关闭。
