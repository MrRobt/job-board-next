# 2026-11-20 B06 · 退款验签查单与剩余权益原子撤销

## 范围

- `lib/career/refund-finalization.ts`：新增 `reconcileDispatchedRefund`，只处理 `ToolRefundDispatch.IN_DOUBT` 已领取、双管理员已审、资金订单仍 PAID、权益冻结且退款请求指纹不变的记录。
- 复用现有 `lib/payment/refund-query.ts` 的支付宝/微信签名和退款查询（金额、原支付单号、原交易号、退款请求号均校验）。默认必须 `ENABLE_REAL_PAYMENT=true`、`ENABLE_REFUND_QUERY=true` 且有合法商户配置，其他情况下失败关闭。测试用 Mock 查询接口仅允许 `INTEGRATION_TEST_DATABASE=true` 且非 production，不允许运行时注入假确认。
- `lib/career/refund-finalization.ts` 查询渠道后，**重新在 SERIALIZABLE 事务中核对所有资金/权益前置条件**：派发记录、申请单、订单、金额、请求指纹、独立审批人、商户交易号、冻结状态、次数字段与 AI 运行状态。只对签名渠道最终状态 `SUCCEEDED` 执行一次性事务：`ToolOrder.PAID → REFUNDED`、`ToolRefundCase.PREPARED → SUCCEEDED`、`ToolRefundDispatch.IN_DOUBT → SUCCEEDED`、`ToolGrant.remaining → 0`，并写审计事件。订单保持 `refundHold=true`，避免误解冻。
- 对 `PROCESSING/FAILED/UNKNOWN` 只追加 `ToolRefundInquiryEvent`，维持状态和冻结，**不重发商户退款请求，不擅自结束工单或恢复次数**。不匹配金额/身份/渠道或未授权 API 拒绝修改账本。
- `prisma/migrations/20261120000500_refund_inquiry_settlement/migration.sql`：第八个增量迁移，增加 `SUCCEEDED` 状态、确认时间和独立不可删除审计记录；此迁移本身**绝不发起退款**。
- `app/actions/refund-finalization.ts`：ADMIN 会话、用户显式确认、限流的渠道只读查单；与 `app/admin/refund-dispatch/page.tsx` 的退款状态台账衔接。UI 不提供发起退款、重发或无凭据手工标记成功操作。

## 本机测试与安全边界

- Prisma Schema validate、Client generate、TypeScript 类型检查 exit 0；独立测试库 `jobs_mvp_migrate_20261118_8f72` 的第八个 migrate deploy 成功，status up to date，重复 deploy `No pending migrations to apply`。
- 新集成测试 `tests/integration/refund-finalization.test.ts` **1/1 PASS**：查单前必须已领取，ADMIN 限权，默认真实商户查询门禁不启用；渠道错误金额拒绝；处理中/未知/失败不改账、写审计；账本异常拒绝成功；成功后在同一事务中撤销余额并修改三表，重复确认返回 ALREADY_SUCCEEDED 且不重复追加成功事件。
- 全量单元 **38/38 PASS**、MySQL 集成（文件串行，保留文件内并发测试）**25/25 PASS**，Next.js 16.4.6 生产 build exit 0；新管理页和 action 经 TS/build 验证。
- 测试只使用隔离 MySQL 与程序中注入的**模拟商户查询结果**，不包含任何实际支付退款、真实签名渠道流量、退款到账验证或生产环境回滚演练。
- Windows Prisma Client 生成之前只停止明确属于本项目 localhost:3000 的 Next.js PID 20348；其他服务未终止。新版本网站需重新使用显式关闭真实支付/AI 的环境配置启动。

## 待完成

- B06：真实商户退款**发送**网关仍未实现，`IN_DOUBT` 只有可安全查询/处理的技术对账能力；没有凭据不可联调真实支付宝/微信，也不能把模拟商户响应当作正式资金到账证据。资金部分退款/已使用次数争议仍需单独规则与人工审批。
- 生产/日常开发数据库 `jobs` 此前最新迁移被安全检查阻断，本轮只使用隔离库。后台管理员真实登录态、开发/生产迁移、商户 UAT、E2E 和法律合规门禁仍为 IN_PROGRESS/BLOCKED。
- 按长期 Goal 分批提交并推送，不触及其他 Agent 已有未提交的主需求矩阵/风险/上线清单和财务风险扫描代码。
