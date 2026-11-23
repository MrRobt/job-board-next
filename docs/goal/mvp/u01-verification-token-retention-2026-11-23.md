# U01 邮箱验证过期令牌清理 · 2026-11-23

## 范围与安全边界

- 从前轮未提交修改继续：扩展现有 `lib/auth-retention.ts`，把 `EmailVerificationToken` 的已过期记录纳入已有「先预览、后授权 APPLY」认证数据保留例程。默认不写库、不输出哈希/邮箱/令牌。
- 按 `expiresAt <= now` 统计和按到期时间、哈希排序，最多选取 `batchSize`（1～1000）条；在与会话、限流数据同一原子事务内再次校验截止时间后删除。**不触碰用户、财务权益、订单、退款或未过期的令牌**；不新增定时删除，也不解除现有 `AUTH_RETENTION_APPLY_APPROVED=true` 运维写门禁。
- 返回统计新增 `expiredVerificationTokens`、`deletedVerificationTokens`；清理只计数。已验证账号的身份/权限逻辑不变。
- 新增纯策略回归 `tests/auth-retention-verification-policy.test.ts`、仅供 `INTEGRATION_TEST_DATABASE=true` 一次性 MySQL 环境运行的 `tests/integration/auth-verification-retention.test.ts`：自建伪造账号，测试过期/未过期对照、只读预览、APPLY 只删过期、重复 APPLY 幂等、账号仍存在。测试只清理自己创建的账号，不使用真实数据。

## RED / GREEN 与证据

- 原代码缺少验证记录计数、索引选择和删除，新增策略测试先 RED exit 1；恢复实现后定向测试 GREEN 1/1。
- `node --import tsx --test tests/auth-retention-verification-policy.test.ts`、独立 `tsc --noEmit`、完整 `npm test`、带静态占位 DSN 的 Next 生产 `npm run build` 均 exit 0。
- **本地未对 MySQL 写入；隔离真实数据库集成测试等待本轮 GitHub 主 CI run/job。** 在收到具体成功日志前，不能称数据库清理专项 VERIFIED。

## 上轮远端收口、后续工作

- `94350a6`：主 CI `45124959965`、管理员 HTTP E2E `45124959956`、B07 只读预检 `45124960196`、B07 非空恢复 `45124959966` 全部 SUCCESS；管理员 HTTP 10/10 检查包含未验证 ADMIN 会话拒绝。
- U01 仍 IN_PROGRESS：邮箱服务授权、真实投递、旧账号验证迁移、密码找回、账户删除和更完整用户浏览器 E2E 不在本包内；技术上线仍 NOT READY。
- 保留其他 Agent 的 `handoff.md`、`requirement-matrix.md`、`release-checklist.md`、`risk-register.md`、财务审计、缓存及 `package-lock.json` 未提交改动。只暂存本文档和本人测试/实现、检查点与测试证据，严格正常非强推。
