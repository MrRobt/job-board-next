# 2026-11-22 B06 微信退款 POST 回包交易身份校验

## 缺口与修复
- `lib/payment/refund-submit.ts` 在微信 API v3 退款 POST 回包中允许已验签响应缺失 `transaction_id` 时返回 `ACKNOWLEDGED`，即跳过了原始支付交易身份核验。
- 本次要求已验签回复必须带有与历史支付记录一致的 `transaction_id`，否则拒绝确认并保留独立签名查询路径。
- `ACKNOWLEDGED` 仍然仅为请求接受态，不代表退款资金到账，绝不直接置 `REFUNDED`，异常/超时也不得重复调用资金 POST。

## 测试证据
- 测试先行：扩展 `tests/integration/refund-submission.test.ts`，模拟带真实临时 RSA 签名的微信回应，缺交易号和错误交易号均应拒绝；首次专项 exit 1、`Missing expected rejection`（RED）。
- 修改实际网关交易号必需检查后重新运行：`node --conditions=react-server --import file:///F:/code/job-board-next/node_modules/tsx/dist/loader.mjs --test --test-name-pattern="WeChat refund POST" F:/code/job-board-next/tests/integration/refund-submission.test.ts` exit 0，1/1 PASS。
- `npm --prefix F:/code/job-board-next test` exit 0。
- `F:/code/job-board-next/node_modules/.bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json` exit 0。
- `npm --prefix F:/code/job-board-next run build` exit 0，Prisma Client 生成与 Next.js 16.4.6 生产构建通过。
- 上一提交 `c427a37` 的远端 Actions CI `44969333237`、管理员 HTTP E2E `44969333229` 均 SUCCESS；这是历史提交证据，不应冒充本包 CI。

## 保留的风险
- 本次签名回归使用 mock fetch 与测试密钥，未发送真实退款、未做商户 UAT、MySQL 全套集成、资金成功终态确认/撤权或生产部署。
- 对合法但缺少 transaction_id 的渠道回应，系统将默认拒绝 ACK，由人工或单独签名查单处理；真实商户兼容性须人工联调。
- B06 继续 IN_PROGRESS；严格保护其他 Agent 的 handoff、矩阵、风险登记、财务审计、缓存与其它未提交修改，真实支付/AI/通知保持关闭。
