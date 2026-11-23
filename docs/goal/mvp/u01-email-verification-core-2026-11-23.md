# U01 邮箱验证令牌后端底座 · 2026-11-23

## 本小包边界

- Prisma User 增加可空 `emailVerifiedAt`，新增 `EmailVerificationToken`（哈希主键、用户唯一、过期时间、FK ON DELETE CASCADE）；正式版本化迁移 `20261123000100_email_verification`。**旧账号不会在迁移中自动伪造邮箱验证状态**，正式部署前须先完成可授权的邮件供应商和旧账号验证迁移方案。
- 256 位随机原始令牌仅返回给上层发信逻辑；数据库只保存 SHA-256，令牌 24 小时有效，校验严格限制小写十六进制形式。每个用户最多一枚活动令牌，新请求更新唯一键。
- 消费时在 MySQL Serializable 事务中先检查到期时间，按哈希和有效期条件删除，再对尚未验证用户进行 CAS 更新；重放、过期、错误格式及并发失败均拒绝，其他用户不受影响。无需真实邮箱或外部 API。
- **本小包尚未接入发信、注册/登录阻断、确认页面、重发和老用户恢复流程。U01 仍为 IN_PROGRESS，不能声称邮箱验证闭环已就绪。**

## 实测与限制

- `tests/email-verification-policy.test.ts` 初次找不到规则模块：RED exit 1；增加实现后 3/3 GREEN。
- `npx prisma validate`、`prisma generate`、独立 `tsc --noEmit`、完整 `npm test`、生产 `npm run build` 均 exit 0。
- 新增 `tests/integration/email-verification.test.ts`：真实 MySQL 新迁移上验证发起/轮换、数据库仅存散列、已过期拒绝、并发仅一次成功、验证后删除令牌和已验证不可重签。**本地未连接/迁移任何已有 MySQL 数据库，等待全新 CI MySQL 8 运行结果，未得回执前不得标此数据库专项 VERIFIED。**
- `DATABASE_URL` 在本地仅以无法连接的虚构测试 DSN 提供 Prisma CLI 静态校验，无数据库写入。
- 没有向外部邮件供应商发送请求，也没有触及真实支付、AI、退款、合规设置。

## 下一步

1. 读取 GitHub Actions 上本提交的新迁移和真实 MySQL 集成日志；失败要 RED/GREEN 修正，成功后仅本后端底座子包 VERIFIED。
2. U01 下个独立工作包：默认关闭的合规发信 adapter、注册和登录验证门禁、一次性确认页面/重发及相应 SSR/HTTP 测试；未获发信配置或审批不可激活发送，老账号迁移须有明确方案。
3. 继续保留其他 Agent `handoff.md`、requirement-matrix、release-checklist、risk-register、financial-risk-audit、Next 生成文件等未提交内容，独立 stage 和非强推。
