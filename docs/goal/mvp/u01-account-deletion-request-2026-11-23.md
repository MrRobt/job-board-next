# U01 账户注销人工审核申请安全底座 · 2026-11-23

## 工作包范围与隐私/财务保全

- 从上轮 U01 已验收的邮箱验证、找回密码真实 HTTP 继续。本包只补充**受控的注销审核请求入口**：`/account` 的登录用户主动提交当前密码 + 明确勾选确认。Server Action 验证真实 session、同源 Origin/Host、输入长度、当前密码及账号限流，再向服务端写一次审核申请。绝不信任来自表单的 `userId`、角色或状态。
- 新增 `AccountDeletionRequest`（User 一对一、唯一索引、`PENDING_MANUAL_REVIEW`、时间戳），版本迁移 `20261123000300_account_deletion_request` 只建表与外键、没有修改任何现有业务数据；`ON DELETE RESTRICT` 保证未经审查前无法通过直接硬删除 User 绕开申请记录。
- `requestAccountDeletionReview` 使用唯一约束 + `createMany(skipDuplicates:true)` 幂等记录，不修改已有请求时间、客户账户、资金订单、退款审核、权益、用量或事故审计；页面会明确提示**请求不等于已注销或已擦除个人信息**，对已提交请求显示等待人工审核。
- 该功能只是注销流程的**请求/受理子包**，不是直接履行数据删除权。不同交易状态、法定保留期限、未决售后及历史支付的删除/匿名化边界需要由有权主体明确规则并在后续独立实现；不得自动发起真实退款或抹除财务凭证。

## 本地测试和远端门禁

- 新增 `tests/account-deletion-request-policy.test.ts`：初次缺表/代码/动作先 RED（2/2），实现后 2/2 PASS。Prisma `validate`/generate PASS。
- 新增 `tests/integration/account-deletion-request.test.ts`：仅当 `INTEGRATION_TEST_DATABASE=true` 才可执行，在 CI 一次性 MySQL8 中创建两名合成用户和一份模拟支付记录，3 次并发请求应只写一条申请，不能影响另一个用户、原用户或模拟已付款订单，且外键必须禁止意外硬删除。只清理测试自己创建的数据。
- **本地完整 TypeScript 与全量测试受另一 Agent 已存在的未提交 `lib/auth-retention.ts` 和 `tests/auth-retention-verification-policy.test.ts` 半成品阻断。** 本轮 TypeScript TS2739（`AuthRetentionResult` 的 `APPLIED` 返回缺新字段），未修复/覆盖他人文件。须等正常提交到干净远端 CI 后看实际 Prisma 迁移、集成、类型及构建结果，未取得日志前子包只能 IN_PROGRESS。
- 所有支付、退款、真实邮箱、AI、外部合规审批仍保持原门禁；当前技术上线状态 NOT READY。

## 下一阶段交接

1. 核查本包 GitHub Actions 主 CI 及隔离 MySQL8 集成测试；遇到失败先修复本包测试/实现再回填回执。
2. 继续 U01：账户注销审批、已付/退款/争议中强制阻断、可合法删除的求职记录清理、可审计的假名化/删除证明、用户确认、实际隐私与法务复核。
3. 继续保护其他 Agent 未提交的 `handoff.md`、主矩阵、release/risk、`auth-retention.ts`、财务扫描、缓存与 lockfile；只精确暂存本包文件并小批普通推送。
