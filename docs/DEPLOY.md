# 部署与验收
## CI
GitHub Actions 使用 Node 22 + MySQL 8，依次执行 Prisma validate、版本化 migrate deploy（含复跑与 status 校验）、seed、类型检查、单元测试、生产构建、首页和后台匿名拦截 smoke test。若连接器不允许 workflow 文件写入，将模板复制到 .github/workflows/ci.yml。
当前未提交 lockfile，依赖安装使用 npm install；首次 CI 后应在本地生成、检查并提交 package-lock.json，改用 npm ci。
## 认证数据保留期维护
- `npm run auth:retention` 默认仅预览过期 Session/AuthAttempt 数量；不会删除。需运维人工批准，确认隔离库与备份有效后，才可能通过 `AUTH_RETENTION_APPLY_APPROVED=true npm run auth:retention -- --apply` 执行有界清理。**当前没有实际删除验收，禁止在生产启用**。见 `docs/goal/mvp/auth-retention-2026-11-18.md`。

## AI 提供方出口
- 真实 AI 仍默认关闭。仅在法务/隐私与服务商审核后设置 `AI_BASE_URL` 和精确匹配（包含路径、逗号分隔）的服务器端 `AI_APPROVED_BASE_URLS`，并另行配置已有 AI 合规门禁。IP 字面量、内网/本地域名及非默认 HTTPS 端口被代码拒绝，但 DNS 解析到私网地址仍须通过网络出口策略额外封锁。
- 模型回应按 200,000 字节上限流式读取，需预发布模拟超大响应/超时、Token 成本和数据保护验收；详见 `docs/goal/mvp/ai-provider-egress-2026-11-18.md`。

## 只读数据库就绪探针
- `GET /api/readyz` 默认关闭（404），仅在部署侧配置高熵 `READINESS_PROBE_TOKEN` 并携带 `x-readiness-token` 请求头时返回 DB 200/503。必须通过内网/反向代理访问控制和速率限制保护，禁止将 Header 凭据放入 URL 或日志。正式环境使用前还需断库、恢复、告警 UAT，见 `docs/goal/mvp/readiness-probe-2026-11-18.md`。

## 容器
docker build -t job-board-next .
使用独立 MySQL、独立低权限数据库账号，通过安全环境文件注入运行配置。容器内数据库地址不能使用 127.0.0.1 指向宿主数据库。发布前先备份数据库并执行受控迁移；db:push 仅适用于开发/空库，不建议在生产运行。当前有 `prisma/migrations/20261117000100_baseline/migration.sql` 候选基线，由 Prisma migrate diff 生成但 **已在本项目独立空库成功进行首次 migrate deploy**（见 `docs/goal/mvp/migration-uat-2026-11-18.md`），但旧库基线登记、重复部署与生产迁移仍未验收，不可当作生产就绪。另有 `20261117000200_tool_order_reconcile` 增量候选迁移用于审计表，开发库已 db push，独立空库首次 migrate deploy 已应用，但旧库及生产迁移仍未单独验收；不要将 db push 当作迁移演练。全新库应先在独立预发布容器验证 `prisma migrate deploy` 和幂等复跑；已存在表的旧库必须先备份、核对 schema 并制定 migrate resolve 基线登记方案，禁止直接重放全量 CREATE TABLE。
反向代理启用 HTTPS、请求体上限、安全响应头。可信代理 IP 限流代码默认关闭；只有代理覆盖 `x-real-ip` 或 `cf-connecting-ip`、源站拒绝直接访问并通过预发布伪造头/并发回归后，才可设置 `TRUSTED_CLIENT_IP_HEADER`（见 `docs/goal/mvp/trusted-ip-limit-2026-11-18.md`）。禁止挂载或提交真实密钥。正式环境 ENABLE_REAL_PAYMENT=false，直至所有资金闭环和合规门禁验收通过。
