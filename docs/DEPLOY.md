# 部署与验收
## CI
GitHub Actions 使用 Node 22 + MySQL 8，依次执行 Prisma validate、schema push、seed、类型检查、单元测试、生产构建、首页和后台匿名拦截 smoke test。若连接器不允许 workflow 文件写入，将模板复制到 .github/workflows/ci.yml。
当前未提交 lockfile，依赖安装使用 npm install；首次 CI 后应在本地生成、检查并提交 package-lock.json，改用 npm ci。
## 容器
docker build -t job-board-next .
使用独立 MySQL、独立低权限数据库账号，通过安全环境文件注入运行配置。容器内数据库地址不能使用 127.0.0.1 指向宿主数据库。发布前先备份数据库并执行受控迁移；db:push 仅适用于开发/空库，不建议在生产运行。当前有 `prisma/migrations/20261117000100_baseline/migration.sql` 候选基线，由 Prisma migrate diff 生成但 **尚未在新空库实际执行/验收**（执行被安全检查阻断），不可当作生产就绪。另有 `20261117000200_tool_order_reconcile` 增量候选迁移用于审计表，开发库已 db push，迁移 SQL 仍未单独验收；不要将 db push 当作迁移演练。全新库应先在独立预发布容器验证 `prisma migrate deploy` 和幂等复跑；已存在表的旧库必须先备份、核对 schema 并制定 migrate resolve 基线登记方案，禁止直接重放全量 CREATE TABLE。
反向代理启用 HTTPS、请求体上限、IP 限流、安全响应头。禁止挂载或提交真实密钥。正式环境 ENABLE_REAL_PAYMENT=false，直至所有资金闭环和合规门禁验收通过。
