# 2026-11-20 · B06 双人审批后退款派发 Outbox（只写账本，不发款）

## 本包目标

在已完成双人审批的 `ToolRefundIntent.APPROVED` 之后，建立可持久恢复、不会并发重复领取的退款派发账本；**本包没有真实商户出款功能**。

- `prisma/schema.prisma` 新增 `ToolRefundDispatch`、`RefundDispatchState`、管理员领取关系，唯一限制 `intentId` 和 `outRefundNo`。状态只有 `READY` 和 `IN_DOUBT`；后者表示“可能派发，必须核对”，**并不说明资金已退**。
- `prisma/migrations/20261120000400_refund_dispatch_outbox/migration.sql` 为第七条版本化迁移（不改已执行迁移历史）。
- `lib/career/refund-dispatch-outbox.ts` 的 `queueApprovedRefund`：在 SERIALIZABLE 事务中强制 ADMIN、独立审批、实际订单 PAID、权益冻结、商品整数金额/权益匹配、无在途或已成功消费、原渠道退款请求号/指纹有效；相同意图只返回同一 Outbox 记录，不生成第二笔。
- `claimRefundDispatchOnce`：显式 `ENABLE_REAL_PAYMENT=true` 且 `ENABLE_REFUND_DISPATCH_CLAIM=true` 时才允许管理员对 READY 进行原子状态转移；立即永久进入 IN_DOUBT，保留领取人和领取时间。**函数本身不发 HTTP 请求，不得自动重新领取**，后续必须查询带验签的渠道退款状态并人工核账。
- `tests/integration/refund-dispatch-outbox.test.ts`：先审批、并发领取只一人成功、非管理员拒绝、默认开关关闭、重复队列不重复创建、领取后禁止再次领取、订单仍 PAID、权益仍冻结、可用次数不增加、被篡改余额及原退款理由拒绝。
- `app/admin/refund-dispatch/page.tsx`：ADMIN 鉴权的只读派发状态台账，区分 READY 和 IN_DOUBT，展示领取时间及关联订单；`app/admin/tool-orders/page.tsx` 提供入口。禁止任何出款或重发操作。
- `package.json`：`test:integration` 使用 `--test-concurrency=1` 将共享 MySQL 的不同测试文件串行化；测试文件**内部的并发交易断言仍保留**，避免多套件争抢数据库连接池产生假阴性。

## 安全与运维约束

1. 只有合法有效的双人审批意图能入队，原交易号、币种、退款金额与原始指纹在入队和领取时均需重新检验。
2. 领取状态 IN_DOUBT 不自动表明商户收到请求；断电/崩溃可能发生在发送前，也可能发生在商户收到后；**不能盲目重发**。
3. 未来商户发送必须复用确定性 `outRefundNo`，遇超时先通过**受信任签名的渠道查询**确定状态，再由授权人员决定下一步。
4. 未完成渠道真实退款查询/确认之前，不得改变 `ToolOrder.status`、`ToolRefundCase.status` 为退款成功，也不得撤回用户权益或恢复冻结。
5. 本轮不提供任何前端“发起退款”按钮，不连接支付商户。生产中两个退款操作开关应保持 false；真实商户、资质、支付与消费者权益审批必须由人工完成。

## 本轮验收证据

- 在职讯集专用隔离 MySQL `jobs_mvp_migrate_20261118_8f72` 执行第 7 条 migration 成功；`prisma migrate status` up to date，复跑 `migrate deploy` 返回 `No pending migrations to apply`。
- Prisma Schema validate 与 Client generate 均通过。Client 首次生成因在运行的本项目 Next.js 进程占用 Windows DLL 返回 EPERM；核验 localhost:3000 的 Next 进程后仅停止该进程，第二次生成成功，未终止其他 Agent/Node 服务。
- 新的退款 Outbox 专项 1/1 PASS，TypeScript exit 0、**全量单元 38/38**、Next.js 生产 build exit 0，构建包含 `/admin/refund-dispatch`。
- MySQL 全量集成：此前并行套件有一轮 24/24 PASS；新增防篡改测试与后台页面后，**两次并行执行分别 23/24**（原跨业务交易隔离、原 career 测试，单独交叉交易测试 1/1 PASS）；按 `--test-concurrency=1` 串行不同测试文件后 **24/24 PASS**。并行不稳定问题需要继续跟踪，不能将串行通过等同于生产压测通过。
- 上述均为本地独立数据库/离线程序测试；无商户网络调用、无真正资金退款、无浏览器 E2E、无生产迁移回滚或外部批准。

## 后续优先级

**B06 保持 IN_PROGRESS**。下一包应实现受控的真实商户退款发送网关（默认禁用）、基于 `IN_DOUBT` 的只读签名查单和人工核账、确认真实退款成功后的原子撤回未使用权益，并补并发/断线/幂等/渠道金额核对和真实商户 UAT。

`docs/goal/mvp/requirement-matrix.md`、`risk-register.md`、`release-checklist.md` 与财务风险扫描文件存在其他 Agent 的未提交变更，不覆盖也不混提交。
