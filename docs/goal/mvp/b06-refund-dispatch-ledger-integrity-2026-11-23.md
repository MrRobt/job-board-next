# B06 退款派发账本只读一致性预检 · 2026-11-23

## P0 缺口与本包范围

- 延续已验收的 B06 双人并发退款最终核算子包 `75227ca`、证据 `3edc3c3`（主 CI `45184435692` SUCCESS），不重新开发已有的双人审批、持久化退款请求、唯一领取、商户验签查单或权益撤销。
- 既有 `/admin/refund-dispatch` 只展示 READY/IN_DOUBT/SUCCEEDED 状态。实际风险是原款/退款请求号/工单/订单/冻结权益或领取时间发生内部数据分叉时，运营人员可能误认合法退款终态；现有超时告警无法即时覆盖所有账本矛盾。
- 新增不依赖数据库的只读 `assessRefundDispatchIntegrity`：严格诊断批准人的存在、已批准的意图、工单阶段、PAID/REFUNDED 对应状态、订单必须 refundHold、原次数/剩余次数合法且符合阶段、是否存在 RESERVED 或 SUCCEEDED AI 运行、READY 不应已领取、IN_DOUBT 必须领取凭证、SUCCEEDED 必须确认时间等。分类仅为 `PENDING_OPERATOR_REVIEW / CHANNEL_INQUIRY_REQUIRED / TERMINAL_CONSISTENT / LEDGER_MISMATCH`，**无论何时 `canAutoSendRefund=false,canAutoRevokeCredits=false`**。
- 在已有管理员路由先 `requireAdmin()` 后，将当前限额 50 条派发记录的查询增量限定为所需工单/订单/权益字段及最多一条已成功或 RESERVED 使用证据；新增“对账风险（只读）”列。金额/原用户已有显示权限不变；不触发外部商户网络请求、不执行补款/退款/撤权、不新增任何服务端写操作。显示“本地一致”并非商户回款证明，所有渠道财务证据仍需人工核验。

## RED/GREEN 和真实本地数据库测试

- `tests/refund-dispatch-integrity.test.ts` 起步模块不存在 RED；实现后 3/3 PASS。覆盖 READY/IN_DOUBT/SUCCEEDED 正常生命周期与 18 类异常状态；任何异常均 fail-closed 为 LEDGER_MISMATCH。
- `tests/refund-dispatch-integrity-admin-policy.test.ts` 起步管理页缺风控字段 RED 2/2，增强管理页后转 2/2 GREEN；管理员鉴权、风险列、有限的必要关系读取和没有新写库调用均受策略检查约束。专项合计 5/5 PASS。
- `tests/integration/refund-dispatch-integrity.test.ts` 在独立 `jobs_preview_20261123` MySQL8、`INTEGRATION_TEST_DATABASE=true` 下 1/1 PASS。合成 ALIPAY 订单完成双人内审/准备/派发但不联网发送；真实 SELECT 获得无领取凭证 READY、缺领取字段异常、已领取 IN_DOUBT、冲突的权益余额、恢复原余额后的结果；核对原订单仍 PAID、金额/权益未更改及没有真实查询证据。仅清理本包随机 synthetic 夹具，未接触原 `jobs` 库。
- 本地全局 TypeScript 仅受**其他 Agent 未提交**的 `lib/auth-retention.ts:83` TS2739 阻断，本包新增源码未出现额外 TS 错误。未覆盖/暂存认证清理、其他财务扫描草稿、共享 handoff/需求矩阵、风险/发布文档、lockfile 或缓存。
- **已取得干净远端真实验收：** 提交 `871823a` 的主 CI run `45187327007` / job `137736215406` completed/success；实际 job 日志 `B06 admin refund preflight reads actual isolated MySQL relationships without changing ledgers` PASS，新增规则单测和页面授权策略 PASS，整套单元 **222/222 PASS**，版本化迁移+重复 deploy、TypeScript、真实 MySQL 集成、Next 生产 build/HTTP smoke 均 SUCCESS。同提交邮箱/密码找回/管理员及 B07 恢复另外 **7 条**专项 CI 全部 SUCCESS。**仅此管理员只读风控子包 VERIFIED**。 生产退款后端和真实商户 UAT 仍在 B06 整体门禁内；签名商户退款成功与消费者争议需独立、有效的授权证据，绝不根据本地只读风控自动采取资金操作。

## Handoff

1. 本包 `871823a` 已正常推送并完成真实 CI：主 CI `45187327007` / job `137736215406` SUCCESS，新增真实 MySQL 读账回归 PASS，222 项单测、类型检查及生产构建 PASS；其他 7 条专项 CI 全成功。本子包已验收，不重复。
2. 干净 CI 成功后回填 run/job/原始日志和总状态；其他 Agent 的 dirty 文件继续保留。下一 P0 聚焦商户退款成功但内部权益出现争议的**非破坏性财务异常处理**与合法 UAT，不允许补退款 POST 或强行标记成功。
3. 外部商户、模型、消费者合规及正式上线资质继续人工门禁，技术上线 NOT READY。这里的独立文件充当交接，避免覆盖已被其他 Agent 修改的 `handoff.md`。
