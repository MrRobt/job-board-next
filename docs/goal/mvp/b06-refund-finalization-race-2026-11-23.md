# B06 退款终态双管理员并发与冻结权益回归 · 2026-11-23

## 任务判断

- 遵守 `docs/goal/mvp/long-running-goal.md` 的 B06 高优先级要求。读取当前真实源码 `refund-approvals.ts`、`refund-dispatch-outbox.ts`、`refund-finalization.ts`、`credits.ts` 及既有集成测试，确认退款制单/双人审批/单次派发/商户只读查单/成功后原子撤销未用权益已经存在并曾由 CI 验收；本包**不重复实现**、不修改资金写入代码。
- 剩余缺口：此前主要覆盖单人终态/顺序重试，尚缺“两个审核者同时确认同一笔退款、并行观察同一笔模拟商户成功结果”的确定性 MySQL 竞争回归。
- 新增 `tests/integration/refund-finalization-race.test.ts`，隔离 MySQL synthetic ALIPAY PAID `STARTER20`、订单冻结、制单、不同管理员独立审核、持久化派发，**只在一次性测试库用 DB 模拟已 claim 的 IN_DOUBT，不打开真实退款派发/查询开关、不进行任何外部商户调用**。网关仅为注入式无网络模拟，双方在事务前同时得到相同金额/商户订单/退款请求号一致的成功观察。
- 断言仅一个事务可将 IN_DOUBT → SUCCEEDED、PAID → REFUNDED 和剩余 20 次 → 0；仅一条 `CREDITS_REVOKED` 审计；另一个审核者只能抛安全竞争错误或返回 `ALREADY_SUCCEEDED`；后续顺序重入不再查询商户。冻结期的用户调用不能消费这份 paid grant，单独免费试用权益在模拟退款后仍保留。
- 不传入任何真实卡号、商户 ID、支付凭据或个人用户资料。测试按随机 tag 建立虚构用户，并仅清理其自身的测试订单、退款意图/派发、用量与账户。不在该过程中触碰已存在的原始 `jobs` 库或其他项目容器。

## 本机实际证据

- 在原本用于验收的独立 `jobs_preview_20261123` MySQL 8 测试库，显式 `INTEGRATION_TEST_DATABASE=true` 运行单文件集成测试，初版 1/1 PASS；强化竞争失败者结果约束后 1/1 PASS；修正新增测试 `reserve` kind 的 TS 大小写约束后再实际复跑 1/1 PASS。
- 新增文件的 TS 类型错误已修正；本机全局 `tsc --noEmit` 仍被**其他 Agent 尚未提交**的 `lib/auth-retention.ts:83` TS2739 阻断，返回值缺少密码重置令牌保留计数字段。本包不修改、不暂存他人的认证、财务审计、共享 handoff/需求矩阵、lockfile 等变更。
- **现已取得干净远端真实验收：** 提交 `75227ca` 主 CI run `45184435692` / job `137726254001` completed/success，实际 job 日志 `B06 signed refund reconciliation is single-winner under concurrent reviewers` PASS；Prisma 迁移部署/状态/重复执行、TypeScript、全部单元/真实 MySQL 集成、Next 生产 build 和 HTTP smoke 均 SUCCESS；同提交另 7 条邮箱、注销、后台和 B07 专项 CI 全部 SUCCESS。**仅 B06 双人并发/冻结权益回归子包 VERIFIED**。B06 整体仍 IN_PROGRESS：真实支付宝/微信退款请求、正式查单与回款结果、生产财务对账及商户 UAT 需有效凭据和人工授权，不能用本合成证据替代。

## 下一手交接

1. 已核验 `75227ca` 主 CI `45184435692` / job `137726254001` 及其余 7 条专项 CI 全部 SUCCESS，新增 MySQL B06 并发用例在原始日志中 PASS；本子包 VERIFIED，不重复已验收工作。
2. 保留技术上线 NOT READY；对 B06 继续考虑外部商户成功但内部剩余权益有争议时的受控人工异常处理，不自动改钱、不自动重试 POST，不擅自批准或开启真实通道。
3. Git 保护：不重置、clean、强推，不修改其他 Agent 的未提交文件；在 `handoff.md` 已有他人改动时，本独立交接文件即本包 handoff。
