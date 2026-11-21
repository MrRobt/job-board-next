# D02 匿名 HTTP 安全 Smoke Test · 2026-11-21

## 本包交付

- 新增 `scripts/ci-http-smoke.mjs`，固定只请求本机 `http://127.0.0.1:3000`，不会向外部站点发送请求、不需要用户或商户账号、不执行支付/AI操作。
- 新增 `package.json` 命令 `npm run release:smoke`，可以在 Next.js 生产版已启动后独立执行。
- 检测 13 个 HTTP 路由：`/`、`/pricing`、`/login`、`/register` 应为 200 且有关键文案；`/admin`、`/admin/tool-orders`、`/admin/refund-dispatch`、`/account`、`/tracker`、`/tools/resume`、`/tools/interview` 未登录必须 307/308 并且只重定向本源 `/login`；`/api/readyz` 未带运维 token 为 404；旧购买入口 `/checkout/disabled` 为 404。
- 为涉及私密用户数据的页面检验 `Cache-Control: private, no-store`；验证 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、Permissions-Policy、未暴露 X-Powered-By。
- 仅测试匿名访问、页面拦截、headers 和状态，不进行管理员登录、资金、AI 或数据库写入；若页面错误或安全头缺失，进程非零退出，不能误报通过。

## 本轮实际证据

- `npm run release:smoke` 在真实本机 Next.js 服务上 **13/13 PASS、exit 0**；生产 build 后再次运行也是 13/13 PASS。
- `tsc --noEmit` exit 0；单元 **40/40 PASS**；Next.js 16.4.6 build exit 0。
- MySQL 全量集成首次 **27/28**，失败的是**其他 Agent 尚未提交**的 `financial-risk-audit.test.ts`；该测试单独复跑 **1/1 PASS**，完整 MySQL 文件串行复跑 **28/28 PASS**。一次复测命令还出现手工写错 node 路径导致 exit 127，正确命令复测后为 28/28；并发/资源竞争的根因尚未确认，不能当作稳定性已彻底修复。
- 尝试将新步骤加入现有 `.github/workflows/ci.yml` 时，工作区安全检查阻断了对含敏感配置的文件编辑。**未绕过、未修改 CI 工作流**。需仓库所有者使用授权路径将 `npm run release:smoke` 追加在已启动应用的 CI Smoke test 之后，实际远端执行成功才能作为自动 CI 证据。
- GitHub 连接器的 `fetch_commit_workflow_runs` 当前仅筛选 PR 事件，对本次 main push 提交返回空；`get_commit_combined_status` 亦无传统 status 记录。**不能据此断言 Actions success 或 failure**。

## 仍未验收的技术上线门禁

- D02 `IN_PROGRESS`：远端自动 CI 对本次新测试实际运行、真实浏览器管理员登录态 E2E、未迁移开发库、HTTPS 终止代理/CSP、并发压力、监控告警、生产备份/异库恢复及回滚。
- U01 `IN_PROGRESS`：本轮计划补全修改密码和跨会话撤销，但写入安全敏感会话模块受到工作区安全策略拦截；没有修改用户凭据、认证模块或数据库，不声称已交付。
- B06 `IN_PROGRESS/BLOCKED`：真实商户小额资金操作及合规授权仍未进行，全部支付和 AI 真实服务默认保持关闭。
- 其他 Agent 的 `handoff.md`、三份主矩阵、财务风险扫描文件和 `package-lock.json` 保留原状，不纳入本包提交。

本包 `D02-anonymous-smoke` 已在本地 VERIFIED，**整体 D02 与正式上线仍未就绪**。
