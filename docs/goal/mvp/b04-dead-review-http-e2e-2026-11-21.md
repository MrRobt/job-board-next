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
- 初版 `4db063d` 独立 HTTP run `44898182767` **FAIL**：MySQL 迁移和 Next build 成功，但用例把跨域拒绝误限定为 HTTP 4xx，而 Server Action 允许用重定向返回拒绝。现已修订为接受 4xx 或带 `reviewError=origin` 的明确拒绝重定向，且无论哪一种都再次检查审计行数必须为 0；完整真 HTTP 测试仍须下一次 CI 验证，不提前宣称安全通过。
- 第二轮 `17fbbe1` 独立 run `44898400072` 仍 **FAIL**：跨域 POST 返回 HTTP 200 且无重定向，定位到测试器把 React Server Action 表单错误编码为 `application/x-www-form-urlencoded`，请求没有真正触发目标 action。已修正为原生 `FormData` multipart，让下一轮实际触发 action 并验证数据库变化；未更改生产代码、未放宽拒绝与零写入检查。
- 第三轮 `7431902` 独立 run `44898655870` **FAIL**：multipart 修复后真实请求已经过跨站 Origin、无 Origin 的拒绝及零写入断言，随后普通用户 Server Action 返回不同于预设 307/308 的重定向状态。现允许 Next Server Action 的 HTTP 303，但必须明确重定向到 `/` 且数据库零写入；管理员首次成功、幂等及冲突的后续步骤仍待本轮修订后的实际 CI。
- 本地 `node --check`、独立 TypeScript exit 0；修订后的真 HTTP 流水线结果**待 GitHub 新提交运行**。与页面浏览器 Playwright 截图、正式预发布域名/反向代理、安全头以及真实商户/法务验收不同，必须明确标注此任务为 CI localhost HTTP/会话攻防 E2E，而非全站完整浏览器 UAT。
- 失败后需按具体日志修复；未经独立 MySQL CI 成功，不可声称 CSRF/角色已通过真实网络验证。
