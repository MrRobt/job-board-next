# U03/B04 终止通知复核后台入口（默认关闭）— 2026-11-21

状态：本地独立 TS 与单元测试 VERIFIED，CI 已核验 `a6da140` GitHub Actions [run 44897021404](https://github.com/MrRobt/job-board-next/actions/runs/44897021404) **SUCCESS**：全新 MySQL8、152/152 单元、35/35 集成、0 FAIL/0 SKIP，Prisma、typecheck、Next build、HTTP smoke 全部通过；**真实管理员登录态/CSRF 浏览器 E2E 未执行，不算上线就绪**。

## 现场恢复
- 核验上一轮 `c7170ba` GitHub Actions [run 44895785888](https://github.com/MrRobt/job-board-next/actions/runs/44895785888) SUCCESS；第十四迁移复核记录和角色 DB 检查已在 MySQL 验收，不重复。
- 完整恢复 AGENTS、长期 Goal、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register 与真实 Git。所有其他 Agent 未提交的共享文档、财务风险审计、next-env、package-lock 和缓存保持原样。

## 本轮功能
- `lib/career/ops-dead-review-web.ts` 独立只读/写入开关 `ENABLE_OPS_DEAD_REVIEW_READ`、`ENABLE_OPS_DEAD_REVIEW_WRITE`；只有**严格等于 `true`** 才启用，写入还要求只读显式开启，默认全关；这两个开关与真实通知发送、AI、支付完全无关。
- `app/admin/dead-notifications/page.tsx` 默认关闭，功能开关打开后只展示最近 25 条 DEAD 任务的截断 ID、种类、级别、尝试、机器失败码、创建时间和既有复核结论，绝不回显发送内容、令牌或其他业务敏感信息；仅展示未复核的明确确认表单。不支持任务恢复、重放或外部通知发送。导航仅在只读开关 true 时出现。
- `app/actions/dead-notifications.ts` Server Action 使用 `requireAdmin` 读取当前有效会话；写入开关单独校验；`Origin` 与 `Host` 必须严格同源（无 Origin 即拒绝），并沿用 Next Server Action 内置的源校验。随后通过 DB 原子限流 `allowAttempt` 与严格 FormData 解析（拒重复字段、文件、任意原因/角色/操作人）；operator ID 仅取服务端 session，再进入已验收的 Prisma Serializable DB 角色核验 + DEAD 任务唯一复核。
- 任何失败仅重定向通用错误，不暴露数据库状态和令牌；成功使用受限结果代码并刷新页面。没有新数据库迁移、HTTP API、自动任务、真实通知端点或生产开关。
- `tests/ops-dead-review-web.test.ts` 覆盖默认关闭与近似开关、来源缺失/跨域/伪装域名/带路径/认证信息、表单重复字段/无确认/非法原因、FormData 文件和忽略伪造管理员字段。现有服务层数据库权限、幂等与事务测试仍保留。

## 测试与限制
- 本地 `tsc --noEmit` exit 0；`npm test` exit 0；本提交 CI 将验证生成/真实 MySQL/生产构建和 HTTP smoke。
- 尚未进行管理员登录态浏览器 E2E（含真实跨域 POST、Next Server Actions 真实防 CSRF 响应验证及 DB 配置在预发布可用性），不得把单元来源验证称为已完成 CSRF E2E。需要人工授权的预发布数据库迁移与确认 `ENABLE_OPS_DEAD_REVIEW_*` 开关配置；正式环境默认关闭。
- 整体 B04/U03 IN_PROGRESS、NOT READY；真实支付、AI、通知渠道及合规审批人工门禁保持不变。
