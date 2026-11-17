# 商户查单与安全关单工作手册（P0，开发态）

## 变更范围

- `lib/payment/merchant-gateway.ts`：支付宝 OpenAPI / 微信支付 API v3 签名请求、签名验证查询；微信 204 无正文关单响应视为接口接收，**不得直接当作最终关闭证明**。
- `lib/career/payment-reconciliation.ts`：仅管理员操作，查单状态校验、成功交易幂等发放、过期未支付订单关单后复查 CLOSED、释放 `activeKey`、记录 `ToolOrderReconcileEvent`。
- `app/actions/payment-reconciliation.ts`：服务器端管理员鉴权和 CLOSE_EXPIRED 人工确认。
- `app/admin/tool-orders/page.tsx`：待支付订单清单（最多 30 个）、人工查单/到期关单 UI。
- `prisma/migrations/20261117000200_tool_order_reconcile/migration.sql`：新增审计表的增量 SQL。现阶段只在开发库 `db push` 同步过 Prisma Schema，**迁移文件本身尚未经过独立新库 migrate deploy 验收**。

## 财务安全不变量

1. 当前本地订单必须为 PENDING 且支付渠道符合预期。禁止 MOCK 进入商户核对。
2. 仅从经过渠道签名验证的业务响应中判断支付结果。任何超时、解析失败、错误商户、错误订单、错误金额/币种、未知状态都不更改本地资金状态。
3. PAID：复用现有 `settleToolPayment` 原子结算，验证金额、渠道、交易唯一性并防止重复发放。
4. CLOSED：经有签名验证的渠道查询确认才将 PENDING -> CLOSED，设置 activeKey=null 和 codeUrl=null，允许用户另行下单。
5. CLOSE_EXPIRED：既要求本地订单确实过期，又要求渠道查询 UNPAID，调用渠道关单，并再次经过可信查询确认 CLOSED，才能改本地订单。如果渠道查单成功但仍 NOTPAY/UNKNOWN，则继续保留 PENDING。
6. 支付成功与关单的竞争通过 updateMany(status=PENDING) 控制；冲突记录为 CONFLICT，不允许覆盖 PAID。
7. 每次成功完成的查询/关闭操作保存管理员、订单、动作、观察状态和结果；不记录完整付款信息、用户简历或支付接口密钥。
8. 绝不使用前端跳转结果、支付超时或 Mock 订单作为真实收款和关闭证明。

## 运行开关与限制

默认不允许真实商户操作：`ENABLE_PAYMENT_RECONCILIATION` 不设置或设置为 `false`。业务真实收费仍由独立开关控制（默认 false），这里的查单权限不代表开启收款。

仅在已获合法商户权限、检查配置和人工审批后，才可显式启用这个单独的查单开关。需要合法的支付宝或微信商户标识、公私钥和对应的平台公钥，密钥仅在环境配置中传入，不进入 Git。平台返回签名失败时不得重试为无验签模式。必须人工确认发起关单。

接口文档：
- 微信 Native 商户订单号查询： https://pay.wechatpay.cn/doc/v3/merchant/4012791880
- 微信 Native 关闭订单： https://pay.wechatpay.cn/doc/v3/merchant/4012791881
- 支付宝接口查询 / 对响应对象原文验签： https://developer.alibaba.com/docs/doc.htm?articleId=104728&docType=1&treeId=180

## 本轮验收证据和限制

- 8/8 单元测试、7/7 MySQL 集成测试、TypeScript 和 Next.js build 通过。
- 使用随机生成的 RSA 密钥和本地伪造 HTTP 响应测试支付宝/微信签名处理，**没有向真实支付服务发送请求**。
- 模拟业务测试覆盖：错误金额拒绝发放、渠道结果 UNKNOWN 不改变订单、未到期禁止关单、到期后再次确认 CLOSED 才释放占用、已关闭可创建新订单、重复结算不重复发放、非管理员拒绝、审计记录。
- 尚缺：真实支付宝/微信商户查单、关单、退款、资金对账、回调竞态压力测试和自动任务/报警联调。**不能直接开启正式收费。**
