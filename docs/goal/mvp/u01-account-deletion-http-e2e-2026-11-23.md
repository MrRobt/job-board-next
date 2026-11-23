# U01 账户注销审核申请 localhost HTTP E2E · 2026-11-23

## 工作包及安全约束

- 前一受理底座 `f1ef3d2` 的真实 GitHub 主 CI run `45133996644` SUCCESS，包含新增增量迁移、三并发唯一申请和模拟 PAID 订单保全；证据在 `u01-account-deletion-request-2026-11-23.md`，不重复。
- 新增独立 `.github/workflows/account-deletion-http-e2e.yml`，只在 GitHub Actions 临时 MySQL 8 `account_deletion_http_ci` 上迁移新库、构建 Next production 并在 `127.0.0.1:3104` 启动 localhost；支付、退款、AI、邮箱外发开关全部 false。
- 新增 `scripts/ci-account-deletion-http-e2e.mjs`，需要 `CI=true`、`INTEGRATION_TEST_DATABASE=true` 和**固定 CI 数据库名**；新建合成已验证用户、另一用户、模拟已付款次数包。使用真实 HTML form Action ID，通过真实 HTTP 检验匿名拦截、有效登录、账户页入口、跨域和缺 Origin 拒绝、错误密码拒绝、未明确勾选拒绝、合法 POST 新建唯一人工审核申请、重复提交不重置时间或影响他人、既有用户与订单会话全部保留。仅在独立临时库清理自建测试数据，绝不操作用户真实账户。
- `tests/account-deletion-http-ci-policy.test.ts` 初次配置与脚本不存在 RED 2/2，创建后 2/2 GREEN；合并原安全策略专项 4/4 GREEN，HTTP 脚本 `node --check` exit 0。
- 本地完整全量校验因其他 Agent 正编辑 `lib/auth-retention.ts` / 对应测试而不可信；该并行工作文件没有修改或混提交。**现已在干净远端真实验收成功**：提交 `8d7d494` 的账户注销 HTTP GitHub Actions run `45134887116` / job `137558697836` completed/success；原始日志 `CI_ACCOUNT_DELETION_HTTP pass=10 fail=0`，确认匿名阻断、真实登录、表单、跨域和缺 Origin 拒绝、错误密码与未勾选拒绝、合法审核请求、重复幂等与用户隔离，以及 PAID 模拟订单/用户/会话均完整。主 CI run `45134887170` 同样 SUCCESS（Prisma、迁移、类型、全套单元/集成、Next 生产 build/HTTP smoke）；另外邮箱、找回密码、管理员权限和 B07 两条恢复共五条专项 CI 也 SUCCESS。**仅本一次性 HTTP 安全子包 VERIFIED**。

## 后续

1. 本包独立 GitHub HTTP 专项和主 CI/其余五条回归全部 SUCCESS，原始 `CI_ACCOUNT_DELETION_HTTP pass=10 fail=0` 已回填，**仅本 synthetic/disposable HTTP 子包 VERIFIED**，不重复。
2. 实际用户注销/删除、法定保留、订单售后争议、审计与个人信息处理仍需有权主体审查，不可自动硬删。U01 总体 IN_PROGRESS，技术上线 NOT READY。
3. 持续保护其他 Agent 的 handoff、主矩阵、release/risk、认证保留、财务扫描、缓存和 lockfile；只 stage 本包对应文件及独立证据。
