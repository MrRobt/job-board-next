# U01 找回密码真实 localhost HTTP E2E · 2026-11-23

## 目标与边界

- 上轮 `0daf679` 已正式推送且远端主 CI `45127453163`、后台 HTTP `45127453001`、B07 只读 `45127453148`、合成非空恢复 `45127453070` 四条均 SUCCESS；不重复。
- 新增独立 `.github/workflows/password-reset-http-e2e.yml`：GitHub Actions 临时 MySQL 8 `password_reset_ci`、显式 `INTEGRATION_TEST_DATABASE=true`、Node22、全新迁移和 Next production build，在 CI 自己的 `127.0.0.1:3102` 上启动服务器；邮件外发、真实支付、AI 和退款开关全部 false。
- 新增 `scripts/ci-password-reset-http-e2e.mjs`，严格需要 `CI=true` 且一次性测试库，随机创建 synthetic verified 用户、单次重置令牌及旧 session；测试从 GET 找回页到 POST 申请、GET 重置页**只读**、跨域/缺 Origin POST 不消费、合规同源 POST 更新密码、原 session 失效、令牌重放失败、旧 Cookie 被拒绝。仅删除自有测试账号；不操作其他项目或既有数据库。
- 在 `app/actions/password-reset.ts` 加入独立的 `isTrustedActionOrigin` 同源源检查（缺失、伪造、URL 带凭证或混淆域名 fail closed），并保留原有 Next Server Actions 校验 + 按 email/摘要和可信代理 IP 限流。无任何外部邮件请求，也不触碰用户真实密码。
- 新的 `tests/action-origin-policy.test.ts` 与 `tests/password-reset-http-ci-policy.test.ts` 先 RED（缺实现 / 配置脚本），实现后 GREEN；扩展 `tests/password-reset-auth-policy.test.ts` 保证两个动作都在 DB 前验证同源。

## 本地检查

- 原点策略 2/2、动作策略 3/3、HTTP CI 配置策略 2/2；`node --check scripts/ci-password-reset-http-e2e.mjs`、完整 `npm test`、独立 tsc、`npm run build` 均 exit 0。
- **远端真实 MySQL8/Next localhost HTTP 演练已通过**：提交 `d13456b` 的 GitHub Actions run `45128326350`、job `137537737478` 全部 completed/success。真实 job 日志记录 `CI_PASSWORD_RESET_HTTP pass=10 fail=0`；逐项确认匿名找回、跨域请求阻断、邮件禁用、GET 只读、跨域/缺失 Origin 确认拒绝、同源 POST 单次消费、scrypt 新密码、旧会话撤销、重放和旧 Cookie 拒绝。**仅这一隔离 HTTP 断言子包 VERIFIED**。
- 同一提交 `d13456b` 的主 CI run `45128326325`、管理员 HTTP run `45128326338`、B07 只读 run `45128326408`、B07 合成非空恢复 run `45128326374` 亦均 completed/success；不因 HTTP 专项而退化既有路径。
- 独立工作流的 CI 配置是虚构账户，未交付真实邮件发送、生产域名、真实商户/AI 或任何受法律限制的调用。

## 后续交接

1. 本包真实 localhost HTTP run/job 已验收，**隔离 HTTP 找回密码演练子包 VERIFIED**，不重复；正式邮箱供应商、生产域名和业务合规 UAT 仍未验证。
2. U01 总体仍 IN_PROGRESS：经营者批准的实际邮件投递、密码重置收件箱与反垃圾联调、旧用户邮箱验证迁移、账号注销与隐私处理、浏览器端可用性均未验收。
3. 严格保护其他 Agent 的 `handoff.md`、需求矩阵、风险/发布清单、财务审计及缓存/lockfile；精确 stage，本人分批普通 push，真实支付与模型开关继续关闭。
