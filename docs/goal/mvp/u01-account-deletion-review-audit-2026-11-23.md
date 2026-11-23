# U01 账户注销审核事件台账（不触发注销）· 2026-11-23

## 本工作包

- 在既有 `AccountDeletionRequest` 人工审核队列之后，新增版本化增量迁移 `20261123000400_account_deletion_review_event`。`AccountDeletionReviewEvent` 只记录关联申请、操作者、固定审核原因码和时间；申请/操作者均采用 RESTRICT 外键；`requestId + reasonCode` 唯一用于幂等。**不更改申请状态，不删除、冻结或匿名化账号、支付订单、退款及权益。**
- 固定原因仅为 `NEEDS_PRIVACY_REVIEW`、`FINANCIAL_HOLD_RECORDED`、`NEEDS_OFFLINE_VERIFICATION`；无自由文本、账号 ID、角色、执行删除标志可由表单伪造。记录者必须是真实已验证管理员，且不得审核自身申请；请求必须仍为 `PENDING_MANUAL_REVIEW`，使用 Serializable 事务 + 唯一约束 `skipDuplicates` 确保重复记录只写一条。
- 新 Server Action `submitAccountDeletionReview` 先 `requireAdmin`、写入开关 `ENABLE_ACCOUNT_DELETION_REVIEW_WRITE=true`、Origin/Host 同源校验及数据库限流，再解析表单、追加审计事件；成功也不能将申请改为已批准/已注销。
- 管理员 `/admin/account-deletions` 展示每条请求最近 3 项固定审核事件；只有被独立授权的运行环境才显示“记录审核事项”表单，默认只读。在 D02 预发布守卫中新增独立禁用门禁：LOCAL_PREVIEW 与 PUBLIC_PRELAUNCH 一律禁止开启审核写入开关。正式授权不在本小包内。

## RED/GREEN 与真实测试

- `tests/account-deletion-review-event-policy.test.ts`：模块缺失 RED 1 → 实现后 3/3 GREEN，包含默认关闭、严格原因码/单值、非法和重复字段、Next Server Action 内部字段兼容。
- `tests/prelaunch-env-guard.test.ts`：新写入开关未登记先 RED → 加入后 GREEN，任何预发布模式均不得开启该写入。
- 既有只读队列安全策略升级为允许仅选择 `reasonCode/recordedAt`，继续禁止密码哈希、商户交易号和密钥。相关策略/预发布共 13/13 PASS。
- 仅在明确的隔离数据库 `jobs_preview_20261123` 上运行 `prisma migrate deploy`，17→18 个迁移全部成功，`prisma generate` 和 `migrate status` 通过；原始 `jobs` 库未进行任何迁移、删库或数据修改。
- `tests/integration/account-deletion-review-event.test.ts`：在 `INTEGRATION_TEST_DATABASE=true` 的预览库使用 synthetic 账号和 MOCK 付款记录进行实际 MySQL 集成，**1/1 PASS**。覆盖普通用户拒绝、非法原因拒绝、3 次并发只新增一条记录、再提幂等、追加不同原因、申请仍待审核、原用户与订单金额/状态完整、操作者可追溯；测试只清理自己创建的夹具。
- **本地全局 tsc 与 npm test 尚未全绿**：其他 Agent 未提交的 `lib/auth-retention.ts` APPLIED 返回仍缺 `expiredPasswordResetTokens/deletedPasswordResetTokens`，TS2739；其配套未提交的 `tests/auth-retention-verification-policy.test.ts` 中，原邮箱令牌保留测试 PASS，但新增的密码重置令牌保留专项 FAIL（定向 1 PASS / 1 FAIL）。没有修改、覆盖或暂存这些并行工作文件。需以干净远端 CI 的主工作流、真实 MySQL 集成和生产构建回执作为本包最终 VERIFIED 门禁。真实 HTTP 对新写入动作的权限/CSRF 演练仍为后续独立工作包。
- 真实模型、支付、退款、邮件外发和运营审核写入开关仍保持关闭。用户注销、法律保存期限、资金争议审查及最终删除/匿名化流程**不在本包**，U01 仍 IN_PROGRESS、技术上线 NOT READY。

## 交接及 Git 安全

1. 远端 CI 跑完检查新的 schema/迁移与 `account-deletion-review-event` 集成；失败时先修复当前小包后再更新证据。仅成功后将“审核事件台账后端子包”标为 VERIFIED。
2. 后续独立演练 HTTP 角色隔离、跨域拒绝、停用门禁、重复 POST，并制定受有权主体授权的状态审核与个人信息处理方案；不自动硬删。
3. 精确 stage 本包相关代码、测试、`current-task.md`、`test-evidence.md` 和本交接；其他 Agent 的 `handoff.md`、主需求矩阵、发布/风险、认证数据保留、财务扫描、缓存和 lockfile 一律保留，不混提交、不强推。
