# U01 邮箱验证真实 localhost HTTP 安全验收 · 2026-11-23

## 本包独立范围

- 从已验收的邮箱验证令牌/登录守卫和找回密码 E2E 继续，不重复这些 VERIFIED 工作。
- 新增 `lib/action-origin-policy.ts` 已存在的同源策略到 `app/actions/email-verification.ts` 两个 POST Server Actions：确认、重新发送在接触数据库前拒绝缺失或伪造 Origin。保留 Next 原生 Server Action 同源校验、数据库次数限流、未授权邮件默认禁用。
- 新增 `.github/workflows/email-verification-http-e2e.yml`：GitHub Actions 独立、一次性 MySQL 8 `email_verification_ci`，新执行 Prisma 迁移、Next production build，在 `127.0.0.1:3103` 启动应用；所有真实支付、退款、AI、邮箱发信开关均 false，不操作本地既有数据库、不发送任何邮件。
- 新增 `scripts/ci-email-verification-http-e2e.mjs`：仅 `CI=true`、`INTEGRATION_TEST_DATABASE=true` 且固定临时数据库可以执行，创建伪造用户、有效/过期令牌（均存 SHA-256）；真实 HTML 提取 Server Action ID，核实未验证登录拒绝、GET 只读、邮件关闭时重发不换令牌、跨域/缺 Origin 拦截、过期拒绝、合法 POST 单次验证、无隐式登录、重放拒绝及验证后登录建立会话；只删除自己生成的用户。
- 新增 `tests/email-verification-http-ci-policy.test.ts`，首先 RED 3/3（缺防线/CI/脚本），完成后 GREEN 3/3；联合已有邮箱验证安全策略 6/6 PASS，`node --check` 通过。

## 测试与交接

- **本地定向测试 6/6 通过**；但本地完整 TypeScript 检查当前被另一 Agent 的未提交 `lib/auth-retention.ts` 改动阻断，错误 TS2739：结果类型新增 `expiredPasswordResetTokens/deletedPasswordResetTokens`，但 `APPLIED` 返回尚未补齐。其对应 `tests/auth-retention-verification-policy.test.ts` 也为并行未提交改动；本包禁止触碰、改写或提交这些文件。
- 因此**不能声称本轮完整本地 tsc/npm test/build 均 PASS**；但已独立推送提交 `543b576` 并取得**干净 GitHub Actions 真实通过回执**：主 CI run `45129637497` / job `137541931079` SUCCESS（Prisma 迁移/校验、类型、单元、真实 MySQL 集成、Next build、HTTP smoke）；邮箱确认 HTTP run `45129637522` / job `137541931200` SUCCESS，原始日志 `CI_EMAIL_VERIFICATION_HTTP pass=10 fail=0`，涵盖未验证登录拒绝、GET 只读、邮件禁用、跨域/缺 Origin 拒绝、过期拒绝、单次确认、无隐式登录、重放拒绝及验证后登录建立会话。另有管理员 HTTP `45129637509`、找回密码 HTTP `45129637524`、B07 只读 `45129637538`、B07 非空恢复 `45129637428` 均 SUCCESS。**仅 U01 合成邮箱验证 HTTP 子包 VERIFIED；不是现实邮箱送达或账户注销验收。**
- 外部邮件发信、真实收件箱、旧账号迁移、账户删除及全站浏览器验收仍缺，U01 整体 IN_PROGRESS。B07、支付/退款、AI 法规及商户仍保留人工门禁，技术上线 NOT READY。
- 分批提交时仅 stage 本包文件和 `current-task.md`、`test-evidence.md`、本文档，不包含其他 Agent 的 handoff、矩阵、发布/风险、财务审计、本地缓存、lockfile、认证清理中途修改。
