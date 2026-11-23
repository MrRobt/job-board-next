# U01 管理员注销审核队列真实 HTTP 权限回归 · 2026-11-23

## 本包

- 前一 `e385b3d` 管理员只读队列的主 CI run `45137031288` / job `137565666292` 已 SUCCESS，真实 MySQL groupBy 风险分类隔离测试 PASS；证据已由 `c1ff73e` 独立推送，不重复后端实现。
- 扩展已有 `scripts/ci-account-deletion-http-e2e.mjs`（仍由独立 `account-deletion-http-e2e.yml` 在一次性 MySQL8 `account_deletion_http_ci` + Next.js production localhost 执行，所有外部支付/邮件/AI/退款均 false），构造合成 USER/ADMIN 账号、随机登录会话、已存在的用户注销申请和模拟 PAID 订单。
- 本次新增真实 HTTP 断言：匿名 GET `/admin/account-deletions` 必须跳转登录；普通 USER GET 必须权限拒绝并跳转首页；ADMIN 合法登录后 GET 200，可查看只读人工审核队列；用户邮箱仅显示遮罩，不能泄漏真实完整邮箱，页面无执行删除的表单；检查请求前后唯一审核申请数量及 PAID 订单金额/状态不变。
- 新 `tests/account-deletion-admin-http-policy.test.ts` 先因缺检查 RED，再 2/2 GREEN；联合原审核风险与只读策略 8/8 PASS，`node --check` PASS。脚本原 10 项扩大到 14 项，**真实远端 MySQL8/Next localhost HTTP 已验收：** 提交 `f5b77dc` 的独立 HTTP run `45137974907` / job `137568710870` completed/success；原始日志 `CI_ACCOUNT_DELETION_HTTP pass=14 fail=0`，含新增匿名/USER 拒绝、ADMIN 只读访问、邮箱脱敏/财务记录保持；同提交主 CI run `45137975011` / job `137568711263` completed/success，Prisma、TypeScript、全量单元/集成、Next build/HTTP smoke 全 PASS；其余五条专项 CI 全 SUCCESS。**仅管理员只读权限 HTTP 子包 VERIFIED**，不代表真正账户删除获得批准。
- 无任何注销批准/删除、资金退款、权益撤回或真实用户操作；审批与法定个人数据保留继续人工门禁，U01 整体 IN_PROGRESS、技术上线 NOT READY。

## Git 安全与下一步

- 本轮严格只提交扩展的独立 HTTP 脚本、新策略测试、当前任务/测试证据及此交接；不混入其他 Agent 未提交的 `lib/auth-retention.ts`、财务扫描、需求矩阵、风险/发布清单、共享 handoff、lockfile 与缓存。
- 验收后继续按 P0 缺口设计真正的注销状态审核和资金/权益不可消除凭证；未经授权不启用真实硬删除或商户调用。
