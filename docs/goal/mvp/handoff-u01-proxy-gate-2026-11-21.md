# U01 可信代理认证门禁交接 · 2026-11-21

由于共享主 `handoff.md` 有其他 Agent 未提交修改，本次使用独立增量交接，避免覆盖并行工作。

## 本轮已交付

- `lib/auth-throttle-policy.ts` 和 `app/actions/auth.ts`：生产登录/注册必须同时受邮箱与可信单 IP 限流；无代理配置、客户端头伪造/列表/缺失、数据库错误全部 fail closed。开发可保留邮箱限流。
- `tests/auth-throttle-policy.test.ts`：先 RED，再 GREEN，专项 4/4；全量单元 66/66、MySQL 31/31、TS/Next build exit 0。
- 无真实账号/资金/模型数据，未改变 DB schema；无公开部署和真实浏览器 E2E。

## 继续优先

1. 运维授权的真实代理/TLS/E2E：代理必须覆盖选定头并封锁外部源站直连；生产环境未正确配置时认证会 fail closed，不能绕过。
2. U01 未交付邮箱验证、密码找回、会话撤销、注销和删除；需要隔离测试和隐私/数据留存边界。
3. A02 模型用量与次数原子审计、B06 真实商户资金回查、B07 非空异库恢复、D02 完整远端 CI/登录态浏览器测试继续保留 P0 或外部审批。

仅精确暂存本轮认证策略、测试、当前任务/证据与独立增量文件，保护其他 Agent 未提交内容；分两笔正常 commit/push，不强推。

**子包 U01-production-auth-proxy-gate：VERIFIED（本地测试）；U01 / 整体 MVP：IN_PROGRESS。**
