# 测试证据（2026-11-17）

执行环境：job-codexpro，Windows `F:\code\job-board-next`，独立 Docker 开发 MySQL（非 djs-mysql-uat）。

| 试验 | 命令摘要 | 真实结果 |
|---|---|---|
| Prisma validate | `DATABASE_URL=<test-db> node node_modules/prisma/build/index.js validate` | exit 0，schema valid |
| Dev DB schema sync | `DATABASE_URL=<test-db> node node_modules/prisma/build/index.js db push` | exit 0，DB in sync；追加 ToolRunAdjustment 表 |
| Prisma generate | `DATABASE_URL=<test-db> node node_modules/prisma/build/index.js generate` | exit 0，Prisma 6.19.3 Client 生成成功 |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| 单元测试 | `node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts` | 8/8 PASS |
| MySQL 集成 | `INTEGRATION_TEST_DATABASE=true DATABASE_URL=<test-db> node --conditions=react-server --import tsx --test tests/integration/*.test.ts` | 3/3 PASS |
| 生产构建 | `node node_modules/next/dist/bin/next build` | exit 0，Next.js 16.4.6 compiled successfully |
| 本机存活 | `curl http://127.0.0.1:3000` 的状态响应 | HTTP 200 |

数据库集成测试 `manual stale AI credit refund is authorized, audited and idempotent` 覆盖：
- 刚创建的预留不允许人工返还；
- 普通用户无法返还；
- 太短的理由被拒绝；
- 超过 10 分钟的异常预留可核查，但只读检查不会变更余额；
- 管理员确认后余额恢复、ToolRun 变为 FAILED、ToolRunAdjustment 正确记录操作人/原因；
- 重复返还/迟到的 finish 不会重复发放。

**限制**：无真实模型服务调用、真实商户支付/退款、生产迁移/备份恢复/全量浏览器 E2E；测试通过不表示正式商业上线已获批准。
