# U01 账户注销审核事件真实 HTTP / CSRF 演练 · 2026-11-23

## 本工作包

- 上一个 `604602b` 的后端台账已通过真实 MySQL8 主 CI，`ac81a12` 回填了 7 条 SUCCESS 证据；不重复底座开发。本包仅增加一条独立 CI 对新的**可选审核事件记录动作**进行真实 HTTP E2E。
- 新建 `.github/workflows/account-deletion-review-audit-http.yml`：全新、独立 `account_review_audit_ci` MySQL8、严格 `INTEGRATION_TEST_DATABASE=true`，Next 生产构建并监听 CI localhost `127.0.0.1:3105`。**只有该一次性合成测试环境**配置 `ENABLE_ACCOUNT_DELETION_REVIEW_WRITE=true`，支付、模拟支付、AI、退款、邮件等全部 false；正式 LOCAL_PREVIEW/PUBLIC_PRELAUNCH 仍由 D02 禁止开启写入。
- 新 `scripts/ci-account-deletion-review-audit-http.mjs`：强制 `CI=true` + 正确隔离库名 + 禁止外部服务；只创建 synthetic 管理员、用户与 MOCK 付款记录，使用真实 Next.js Server Action 表单测试匿名/USER 访问拒绝、ADMIN 表单可见、USER POST 拒绝、攻击者或缺失 Origin 被挡、未确认拒绝、非法 APPROVED_DELETE 原因拒绝、合法 POST 只增加一个审核事件、重复 POST 幂等、第二固定原因合法追加、申请一直 PENDING、原用户/模拟 PAID 订单和脱敏页面均完整。测试只清理自己的夹具。
- `tests/account-deletion-review-http-ci-policy.test.ts` 起初缺 workflow/script 而 RED 2/2，补全后与核心规则专项一起 5/5 GREEN，`node --check` 成功。
- **当前尚未取得本工作包的远端 run/job**；真正 HTTP E2E 没有实际运行前不得标 VERIFIED。真实用户正式注销、法定保存和财务争议仍需人工合规门禁。

## 交接与 Git 安全

1. 正常 commit/push 后核对独立 GitHub run/job 的日志 `CI_ACCOUNT_DELETION_REVIEW_HTTP pass=12 fail=0`，失败先定位并在本包内修正；同时确认主 CI、B07、邮箱/找回密码、管理员既有 HTTP 回归不退化。
2. 全部成功后仅此一次性合成 HTTP 子包 VERIFIED，U01 整体仍 IN_PROGRESS、技术上线 NOT READY。
3. 仅 stage 本 workflow、脚本、策略测试、当前任务/测试证据和独立交接，不改其他 Agent 的 `handoff.md`、需求矩阵、发布/风险、认证清理、财务审计、缓存和 lockfile；不强推。
