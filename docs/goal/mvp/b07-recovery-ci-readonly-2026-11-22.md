# B07 · 隔离 MySQL 8 只读恢复预检 CI（2026-11-22）

## 背景与交付边界

根据 `docs/goal/mvp/long-running-goal.md` 继续 B07 P0，避免重复已经通过的 14 条迁移、普通 MySQL CI 和上一轮迁移目录锚定修复。此前 `scripts/b07-recovery-preflight.mjs` 只在旧本机隔离数据库运行过，后续增加的运营事故关键表检查未在全新隔离库通过该脚本。现有主 CI 会执行版本化迁移，但不会执行 B07 只读预检本身。

本包增加独立 `.github/workflows/b07-recovery-readonly.yml`，以不触碰本地或生产库的 GitHub Actions 一次性 MySQL 8 服务执行迁移及只读预检。新增 `tests/b07-recovery-ci-policy.test.ts` 保证关键门禁不会因工作流维护而意外消失；不修改已有主 CI / DEAD HTTP E2E。

## CI 操作边界

- 临时 MySQL 8 service 仅存在于 GitHub Actions runner，名称 `jobs_mvp_migrate_20261122_ci`，host `127.0.0.1:3306`。仓库中的固定数据库口令只是一次性 CI 服务的测试夹具，**不是任何真实环境或持久化数据库凭据**。
- 仅在新建一次性服务上执行 `npx prisma validate`、`npx prisma migrate deploy`、`npx prisma migrate status`，随后仅在预检步骤设置 `DJS_RECOVERY_PREFLIGHT_APPROVED=READ_ONLY`，运行 `node scripts/b07-recovery-preflight.mjs`。
- 业务开关真实付款、模拟付款、真实 AI、工具收费、退款查单/派发/发送和支付对账全部明确关闭。没有备份导入、DROP、强制清库、退款或对外 HTTP 发送。
- GitHub workflow `contents:read`，受独立 15 分钟超时限制；主 CI、管理员 E2E 与其他 Agent 未提交文件保持不变。

## 验证记录

- TDD RED：`tests/b07-recovery-ci-policy.test.ts` 首次加入而 workflow 未创建时，`npm test` exit 1，`ENOENT` 指向目标 CI 工作流。
- GREEN：工作流实现后，完整 `npm --prefix F:/code/job-board-next test` **exit 0**，专项策略断言通过；独立 TypeScript 检查 **exit 0**。
- `npm --prefix F:/code/job-board-next run build` **exit 0**（Prisma 生成、Next.js 16.4.6 生产构建）。
- **远端运行实证已核验：** `9816be8` 的 B07 独立 GitHub Actions run `45038958476`，job `137258883779`，均 `completed/success`。实际只读脚本输出 `status=PASS`，本地迁移文件 14、DB 登记 14；pending/unknown/unfinished/checksumMismatch、missingTables、missingColumns 全为空，隔离库三类聚合计数（inDoubt/reserved/paidFrozen）均为 0。**仅此次 disposable CI 数据库的只读预检子包可视为 VERIFIED，B07 整体继续 IN_PROGRESS。**
- 未在本机连接数据库，也未进行任何备份恢复写入/非空数据恢复。B07 整体 `IN_PROGRESS`，商业上线 `NOT READY`。

## 下轮衔接

B07 只读 CI 首轮已核验成功；同一提交的主 CI run `45038958420` 与 DEAD 复核 HTTP E2E run `45038958405` 也都 `completed/success`。接下来继续有状态、**非空业务数据**的隔离库备份恢复、预发布实际 RPO/RTO 和回滚故障演练；需要专门的授权运维与安全门禁。这些缺口未完成前 B07 与上线准备不得标 VERIFIED。其他 Agent 的 `handoff.md`、requirement-matrix、risk-register、release-checklist、financial-risk-audit、Next 生成文件及缓存绝不混提交。
