# B06 · 双人审批后一次性退款发送（2026-11-20）

## 目标与范围

本轮完成已验收的 `ToolRefundIntent.APPROVED`、`ToolRefundDispatch.READY` 与真实支付宝/微信退款发送 API 之间的默认禁用、一次性提交链路。**没有真正向商户发送请求或成功退款的证据**。

- `lib/payment/refund-submit.ts`：支付宝 `alipay.trade.refund` RSA2 请求签名、原始回包验签，微信支付 API v3 `POST /v3/refund/domestic/refunds` 按报文原文字节签名、响应验签；拒绝不匹配的订单号/渠道交易号/退款单号/金额、非法响应和超大报文、网络重定向。
- 严格独立的财务开关：只有 `ENABLE_REAL_PAYMENT=true`、`ENABLE_REFUND_DISPATCH_CLAIM=true`、`ENABLE_REFUND_SEND=true` 且对应商户身份/密钥完整时才允许真正提交；任何一个默认 false 即禁用。不得因为配置了密钥、启用了查单或模拟测试而自动开启发送。
- `lib/career/refund-sender.ts`：先在 Serializable 事务中对 Outbox 做 **唯一一次** `READY → IN_DOUBT` 占用（角色、双人审批、订单金额、服务端 SKU、全未使用权益及请求指纹由既有 `claimRefundDispatchOnce` 复核），**提交占用事务后**才对真实商户 POST。未知结果、超时、签名错误也保持 `IN_DOUBT`，只记录需查单的审计，不再重试 POST。不在发送响应中改为退款成功，也不撤销任何权益。
- `app/actions/refund-submission.ts`：管理员会话、限流、明确复核退款号和勾选授权的第一次发送入口；`app/admin/refund-dispatch/page.tsx` 仅在开关、凭据齐全且状态为 `READY` 时显示，一旦 `IN_DOUBT` 永不展示重发按钮，只保留受控验签查单入口。
- 终态 `SUCCEEDED` 与原子撤销未使用权益，**仍只在独立的验签渠道查单 + Serializable 事务中进行**（上一工作包）；HTTP 200、微信退款申请 SUCCESS、支付宝业务成功均不直接视为真实到账。

## 本地回归证据

- 新 `tests/integration/refund-submission.test.ts` **3/3**：微信原始 POST 签名/回包身份比对、支付宝 RSA2 加签验签及业务金额、默认关闭与无效权限拦截、崩溃/超时后无第二次 POST、资金订单保持 PAID、次数仍冻结和审计。
- 全量单元 **38/38**、独立 MySQL 集成（测试文件串行）**28/28**、TypeScript **exit 0**；Next.js 16.4.6 生产构建 **exit 0**，新增管理员退款入口及 Server Action 已编译。
- 独立 MySQL `jobs_mvp_migrate_20261118_8f72`：`prisma migrate status` exit 0、8 个已登记迁移、schema up to date。本工作包不新增迁移，不改变其他数据库。

## 安全边界与未完成

- 所有商户回包均为本机自签名模拟的离线响应；**未执行真实资金退款**，不等价于有效商户密钥、实际退款、真实资金流水或生产压力测试。
- 已获有权主体合法商户资格、真实 UAT、商户出款凭据/私钥、客户退款条款、审批授权后才能在独立环境启用对应门禁。生产默认关闭全部真实 AI/支付/退款。
- 使用 `IN_DOUBT` 防重发只能保证应用代码不会再次 POST；需要渠道真实查询/对账、超时失败恢复、资金异常处理与用户争议人工机制才能满足正式商业就绪。
- 正常开发库 `jobs` 的升级、历史生产数据迁移、真实浏览器管理员端、CI 新提交运行、备份恢复、模型/数据合规仍是独立 P0 门禁。
- 其他 Agent 未提交的 `docs/goal/mvp/handoff.md`、主需求矩阵、风险清单、上线清单、财务扫描及各种工具缓存不得覆盖、混提交；本文件为独立交接记录。
