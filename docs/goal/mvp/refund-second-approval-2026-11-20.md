# 2026-11-20 · B06 退款意图独立二人审批

## 本包范围

在已验收的 `ToolRefundIntent.PREPARED` 上追加内部双人复核阶段 `APPROVED`，不发送支付宝/微信退款请求，不改变订单付款状态，也不撤销权益。**APPROVED 仅为内部审批，不代表成功退款、支付平台受理或法律合规批准。**

- `lib/career/refund-approvals.ts`：受控 `approveRefundIntent`，采用 SERIALIZABLE MySQL 事务；审批者必须是另一名 ADMIN，不能与 `operatorId` 相同。检查工单 PREPARED、订单 PAID、权益仍冻结、SKU/金额/余额一致、无在途/成功使用的 AI 记录、原请求号/指纹未被篡改。相同审批者+相同依据幂等，不同依据冲突拒绝。
- `prisma/schema.prisma`：`RefundIntentState.APPROVED`，`approvedById/approvedAt/approvalReason` 审计字段；审批账号与制单账号为独立关系。
- `prisma/migrations/20261120000200_refund_second_approval/`：新增审批字段、状态和关联。
- `prisma/migrations/20261120000300_refund_approval_audit_fkey/`：调整已执行迁移的审批人关联策略为 RESTRICT，防止删除账号时自动抹去审计身份；**不修改已执行的迁移历史**。
- `app/actions/refund-approvals.ts`：管理员会话鉴权、二次复核确认、服务端校验。
- `app/admin/tool-orders/page.tsx`：PREPARED 显示待他人批准，APPROVED 显示双人内部审批完成但未发款。
- `app/account/page.tsx`：用户能看到内部审批完成、资金尚未发起退款。
- `tests/integration/refund-approvals.test.ts`：普通用户/制单人越权拒绝、余额异常、冻结中断、审计留痕、重复审批和篡改拒绝、原资金仍 PAID、次数仍冻结。

## 本地验收证据

- 独立测试库 `jobs_mvp_migrate_20261118_8f72` 上，两项新迁移成功执行，全部 6 项迁移的记录已登记。
- 双人审批专项测试：1/1 PASS（至少两次单独运行）。
- TypeScript `tsc --noEmit`：exit 0；单元测试 38/38 PASS；Next.js 16.4.6 生产构建 exit 0。
- 全量 MySQL 集成：**首轮 22/23（失败为新增审批用例）；专项单独执行 1/1，再次全量执行 23/23 PASS**。需保留并行偶发失败作为后续测试稳定性风险，不因复跑成功隐去首次失败。
- 迁移重复执行测试首次命令超时；重新执行 `migrate deploy` exit 0、`No pending migrations to apply`，隔离库的幂等复跑补验通过；生产旧库迁移和非空数据恢复仍未验证。
- 无真实商户请求，无资金退款、余额撤销、外部合同/资质审批；真实支付和 AI 默认关闭。

## 后续 B06 工作

1. 资金退款请求持久化派发前需独立人工门禁、商户凭据/权限核验与确定性退款单号；在发送之前先写入不可重入的出款任务状态、处理并发争用与崩溃后的未知结果。
2. 退款商户调用及查询必须核验签名/交易/币种/金额；任何未知状态不得自动重试新增出款或直接退款。
3. 只有在确认渠道真实退款成功且核对账本无在途请求后，方可原子变更订单 REFUNDED、撤销未使用次数并留审计；必须处理跨线程竞争与清算异常。
4. 真实商户 UAT、生产旧库迁移、退款合规和消费者权益规则仍是硬门禁；本阶段只完成技术上可安全离线验证的内部二人审批。

## Git 与多 Agent 边界

仅精确暂存本工作包代码、迁移、测试及证据；`docs/goal/mvp/requirement-matrix.md`、`risk-register.md`、`release-checklist.md`、`financial-risk-audit` 文件以及 `.data/.omc/.dsh-meow`、`package-lock.json`、`next-env.d.ts`、临时诊断脚本均视为其他 Agent 或工具的改动，不合并、不清理。提交后正常 push，不强推。
