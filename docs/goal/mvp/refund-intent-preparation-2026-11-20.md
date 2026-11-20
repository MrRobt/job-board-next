# 2026-11-20 · B06 退款资金意图持久化工作包

## 目标与非目标

在用户申请和 `refundHold` 冻结、管理员只读预检的基础上，建立**持久化、不可重复、可复核的退款意图**。本工作包不发送支付渠道退款请求、不查询真实商户、不标记订单 REFUNDED、不撤回余额，不代替消费者权益和资金规则审批。

## 实际实现

- `prisma/schema.prisma`：新增退款申请状态 `PREPARED` 和 `ToolRefundIntent`，通过唯一 `caseId`、`orderId`、`outRefundNo` 防止同一申请或同一订单被重复准备；记录操作人、准备时间、原金额整数分、请求指纹与审核依据。
- `prisma/migrations/20261120000100_refund_intents/migration.sql`：有版本的增量迁移，新的字段和表均不会直接执行退款。
- `lib/career/refund-intents.ts`：事务内验证 ADMIN、订单真实 PAID、退款冻结、最新 OPEN 工单、与服务端 SKU 一致的金额/权益、无在途/成功 AI 次数、历史无冲突，使用已存在的 `prepareMerchantRefund` 算出确定性的渠道请求号和指纹。只有无异常才原子转为 PREPARED 并写入不可更改的意图。重复完全相同请求返回原记录，变化内容拒绝。
- `app/actions/refund-cases.ts`：管理员二次明确确认只**准备**请求；未实现资金出款按钮。
- `app/admin/tool-orders/page.tsx`：新增准备操作和已准备、未发款的只读账本清单。
- `app/account/page.tsx`：用户看到「退款资料已准备（未发款）」，不得误读为资金到账。
- `lib/career/refund-preflight.ts`：历史 PREPARED 也属于未完成的旧退款，不能被另一次申请绕过。

## 不变量与测试

1. 非管理员无法准备；Mock、不匹配 SKU/金额、非最新工单、未冻结、已完成/在途 AI 消费、账本不平衡均失败关闭。
2. 不存在商户 HTTP 调用，绝不根据表单/Mock 改订单资金状态。
3. `outRefundNo` 和 `fingerprint` 由服务端生成、唯一，重试不可变；退回的只是内部记录。
4. 在 `ToolRefundCase` 进入 PREPARED 后，已有驳回 API 不能重新解冻，避免资金意图与用户可用权益冲突。
5. 退款请求的实际发送、独立审批、渠道验签查询、最终状态及权益撤权均是后续 P0 工作。

## 2026-11-20 本机验证

- 隔离 MySQL `jobs_mvp_migrate_20261118_8f72`：4 个迁移，`20261120000100_refund_intents` 已成功应用；再次 `prisma migrate deploy` 报 `No pending migrations to apply`；`migrate status` 为 up-to-date。
- 新增 `tests/integration/refund-intents.test.ts`：管理员校验、准备持久化、唯一性、同参数幂等、篡改拒绝、驳回受限、保留冻结和剩余额度、已使用 AI 请求拦截，**1/1 PASS**。
- 全量单元 **38/38 PASS**、MySQL 集成 **22/22 PASS**、TypeScript exit 0、Next.js 16.4.6 生产 build exit 0。
- 测试只在隔离开发数据库执行，非真实商户资金操作，未进行在线支付退款 UAT。

## 交付规则

此次工作包只暂存上述源码、迁移、专项测试及本说明；其他 Agent 的 `financial-risk-audit` 文件、`package-lock.json`、`next-env.d.ts`、`.data/.omc/.dsh-meow`、预先未提交的需求矩阵/风险登记/上线检查文件保持原状。

Git 本机 SSH 默认选择了错误的执行器。已核对 GitHub 官方公钥指纹及本机 Windows OpenSSH 身份，`GIT_SSH='C:/Windows/System32/OpenSSH/ssh.exe' git push origin main` 成功把上轮积压提交正常推送至 `ab1c1d0`。未禁用 SSH 主机校验，未强推。
