# U01 · 公网认证限流可信代理门禁（2026-11-21）

## 问题与处理

上一版本 `app/actions/auth.ts` 中 `authenticationAllowed` 在 `TRUSTED_CLIENT_IP_HEADER` 未配置时退回“只按邮箱”限流。这对于本地开发有用，但生产环境可被攻击者通过不断更换注册邮箱规避同一来源的频率控制。真实 IP 不能直接信任用户提交的 `X-Forwarded-For`，必须先由受控反向代理覆盖单一可信 IP 头。

- 新增 `lib/auth-throttle-policy.ts`，统一登录与注册的频率门禁。生产环境（`NODE_ENV=production`）未配置 `TRUSTED_CLIENT_IP_HEADER` 则在任何数据库限流计数操作前拒绝；配置了代理但头缺失、格式异常或不在白名单中，也拒绝。
- 若环境与代理正确：依次验证每邮箱限流与全局可信 IP 限流（跨邮箱共享来源配额），任一失败均拒绝，底层限流抛错时不放开认证。
- 本机开发在未配置可信代理时允许沿用原有邮箱限流，避免将生产反向代理部署前置条件错误应用于开发环境。
- `app/actions/auth.ts` 在登录、注册处使用统一安全策略。用户名、密码验证、密码哈希、Session 创建和数据库 schema 不变，不提交或记录真实账号信息。

## 2026-11-21 实测证据

- TDD：先执行新增 `tests/auth-throttle-policy.test.ts`，因模块不存在返回 `MODULE_NOT_FOUND`，预期 RED。完成实现后专项 **4/4 PASS**，分别覆盖生产无代理 fail closed/不触碰限流数据库、开发邮箱回退、规范可信头双重限流、无效头与失败/异常限流一律拒绝。
- `tsc --noEmit` exit 0、全量单元 **66/66 PASS**、隔离 MySQL 文件串行集成 **31/31 PASS**、Next.js 16.4.6 生产 build exit 0。
- 本轮只新增认证安全门禁，没有运行真实账号注册、发邮件、创建 Session、外部收款或模型调用；没有数据迁移或生产数据库写入。
- 测试通过不代表生产反向代理已经正确安装。仍需要生产网关实际覆盖 `x-real-ip` 或 `cf-connecting-ip` 并阻止直连源站，同时实现 CI、TLS 与真实浏览器 E2E。

## 重要部署影响与人工门禁

生产环境必须指定 `TRUSTED_CLIENT_IP_HEADER=x-real-ip` **或** `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip`，并确保所选头只由真正受控的上游代理生成/覆盖。若误配置、源站暴露或攻击者可以直接指定这些头，来源限流不能被当作安全防线。若未完成网关配置，**登录与注册将保持拒绝**，这是本次 fail-closed 预期行为而非代码故障。

本包不解决邮箱归属验证、忘记密码、跨设备会话撤销、用户注销、账户删除与完整的垃圾注册防护。U01 仍为 `IN_PROGRESS`；商业上线之前仍需独立完成有权主体商户、隐私、模型、生产运维及法律门禁。其余未提交的主 `handoff.md`、`requirement-matrix.md`、`release-checklist.md`、`risk-register.md`、`financial-risk-audit` 和缓存文件为其他 Agent 工作，均不纳入本轮提交。
