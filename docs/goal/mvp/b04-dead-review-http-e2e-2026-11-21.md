# U03/B04 管理员 HTTP 会话与 CSRF 真请求隔离验证 — 2026-11-21

状态：新增独立真实 HTTP E2E 流水线候选；本地脚本语法、TypeScript 已检查，**真实 GitHub Actions 尚未运行，严禁提前标 VERIFIED**。整体 NOT READY。

## 恢复基线
- 已核验 `af0444a` GitHub Actions run [44897394234](https://github.com/MrRobt/job-board-next/actions/runs/44897394234) SUCCESS；上一包后台 Server Action/默认关闭开关已完成，只剩真实 HTTP 管理员登录态、跨站请求和幂等回归。按长期 Goal 读取 AGENTS、current-task、handoff、需求矩阵、测试证据、发布清单、风险和当前 Git。
- 其他 Agent 的共享 handoff、需求矩阵、发布清单、风险、财务审计、package-lock、next-env 和缓存均未编辑。现有 `.github/workflows/ci.yml` 有受保护配置，编辑器禁止直接修改；保留它原状，**新建独立工作流**而不尝试绕过保护。

## 实施
- `.github/workflows/dead-review-e2e.yml`：独立 GitHub Actions Ubuntu + MySQL 8，专用数据库 `dead_review_ci`，全新 `prisma migrate deploy`、`generate`、Next 生产 build。只在这个隔离 job 内将复核读写开关设为 true，所有真实支付/AI/退款发送仍为 false；绑定服务到 `127.0.0.1:3101`，不对公网开放，不修改原 CI。
- `scripts/ci-dead-review-http-e2e.mjs`：强制 `CI=true`、`INTEGRATION_TEST_DATABASE=true`、关掉真实支付/AI，连接独立数据库。拒绝处理已有固定事故任务；仅测试内创建事故、DEAD 通知、随机测试管理员/普通用户及 SHA256 会话 token（只用 `@example.invalid` 邮箱，不用真实用户）。
- 使用真实 HTTP GET 验证匿名跳登录、普通用户拒绝、管理员页面 200 且出现测试 DEAD 任务；从真实页面渲染表单提取 React Server Action ID 后，通过 HTTP POST 验证跨域 Origin 和缺 Origin 拒绝且数据库记录 0、普通用户拒绝；同源管理员首复核成功、同决定重放幂等、不同决定拒绝，数据库始终只有一条复核且任务依旧 DEAD。
- `finally` 按先复核→通知任务→事故→测试用户顺序清理本 job 创建的数据；不清空 DB，不触碰其他业务数据，不调用商户、模型或通知接口。

## 证据 / 限制
- 本地 `node --check`、独立 TypeScript exit 0；真 HTTP 流水线结果**待 GitHub 新提交运行**。与页面浏览器 Playwright 截图、正式预发布域名/反向代理、安全头以及真实商户/法务验收不同，必须明确标注此任务为 CI localhost HTTP/会话攻防 E2E，而非全站完整浏览器 UAT。
- 失败后需按具体日志修复；未经独立 MySQL CI 成功，不可声称 CSRF/角色已通过真实网络验证。
