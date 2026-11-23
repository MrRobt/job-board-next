# U01 账户注销审核申请 localhost HTTP E2E · 2026-11-23

## 工作包及安全约束

- 前一受理底座 `f1ef3d2` 的真实 GitHub 主 CI run `45133996644` SUCCESS，包含新增增量迁移、三并发唯一申请和模拟 PAID 订单保全；证据在 `u01-account-deletion-request-2026-11-23.md`，不重复。
- 新增独立 `.github/workflows/account-deletion-http-e2e.yml`，只在 GitHub Actions 临时 MySQL 8 `account_deletion_http_ci` 上迁移新库、构建 Next production 并在 `127.0.0.1:3104` 启动 localhost；支付、退款、AI、邮箱外发开关全部 false。
- 新增 `scripts/ci-account-deletion-http-e2e.mjs`，需要 `CI=true`、`INTEGRATION_TEST_DATABASE=true` 和**固定 CI 数据库名**；新建合成已验证用户、另一用户、模拟已付款次数包。使用真实 HTML form Action ID，通过真实 HTTP 检验匿名拦截、有效登录、账户页入口、跨域和缺 Origin 拒绝、错误密码拒绝、未明确勾选拒绝、合法 POST 新建唯一人工审核申请、重复提交不重置时间或影响他人、既有用户与订单会话全部保留。仅在独立临时库清理自建测试数据，绝不操作用户真实账户。
- `tests/account-deletion-http-ci-policy.test.ts` 初次配置与脚本不存在 RED 2/2，创建后 2/2 GREEN；合并原安全策略专项 4/4 GREEN，HTTP 脚本 `node --check` exit 0。
- 本地完整全量校验因其他 Agent 正编辑 `lib/auth-retention.ts` / 对应测试而不可信；该并行工作文件绝不能混提交。**本包的真实 CI HTTP 演练尚待新 run/job 实际执行，当前不标 VERIFIED。**

## 后续

1. GitHub HTTP 专项 run/job、主 CI/其余防回归均确认 SUCCESS 后，回填 commit 与原始 `CI_ACCOUNT_DELETION_HTTP` 的 pass/fail。真实 HTTP 子包只可标记 synthetic/disposable VERIFIED。
2. 实际用户注销/删除、法定保留、订单售后争议、审计与个人信息处理仍需有权主体审查，不可自动硬删。U01 总体 IN_PROGRESS，技术上线 NOT READY。
3. 持续保护其他 Agent 的 handoff、主矩阵、release/risk、认证保留、财务扫描、缓存和 lockfile；只 stage 本包对应文件及独立证据。
