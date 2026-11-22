# B07 · 恢复预检迁移路径与执行器目录解耦（2026-11-22）

## 恢复与目标

本轮重新核对了 `AGENTS.md`、长期 Goal、current-task、handoff、需求矩阵、测试证据及真实 Git 工作树。上一个 B07 结构完整性提交 `59614f4` 的 GitHub Actions 主 CI `45036485712` 与管理员 HTTP E2E `45036485756` 均已确认 SUCCESS，不重复此前已验收的功能。

继续 B07 仍未完成的“恢复预检稳定性”。`scripts/b07-recovery-preflight.mjs` 原先通过 `process.cwd()/prisma/migrations` 读取已签入 Git 的迁移 SQL；在 f-codexpro/MSYS2 等从非仓库目录启动的执行器里会查错目录，导致本应只读、可重复的预检无法准确核对迁移记录。此问题与数据库本身无关，不应通过改变运维工作目录或数据库配置掩盖。

## 本工作包

- `tests/b07-recovery-schema.test.ts` 新增仓库相对迁移目录的定向测试，用脚本自身 URL 计算目标路径，对 URL 对象和 URL 字符串均检查。
- RED：新测试加入后，原实现未提供 `recoveryMigrationDirectoryFromScript`，全量单测 **exit 1**，该测试报 `is not a function`；旧测试不受影响。
- `scripts/b07-recovery-schema.mjs` 新增只读路径解析函数，使用 `fileURLToPath(new URL("../prisma/migrations/",scriptUrl))`；相应 `.d.mts` 类型声明同步。
- `scripts/b07-recovery-preflight.mjs` 从 `import.meta.url` 锚定迁移目录，目录扫描与每个 migration.sql SHA-256 读取均使用同一绝对路径；不再依赖 shell `cwd`。
- 保留原有 `DJS_RECOVERY_PREFLIGHT_APPROVED=READ_ONLY`、`INTEGRATION_TEST_DATABASE=true`、非 production、专用 localhost/3306/隔离库命名限制，所有 SELECT 与敏感数据脱敏规则未放宽。

## 本机验收证据

- 完整 `npm --prefix F:/code/job-board-next test`：**exit 0**（GREEN）。
- `node F:/code/job-board-next/node_modules/typescript/bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json`：**exit 0**。
- `npm --prefix F:/code/job-board-next run build`：**exit 0**，Prisma Client generate、Next.js 16.4.6 compile、类型和静态页面构建成功。
- **未执行真实隔离 MySQL 预检、非空数据备份/恢复、生产迁移、真实付款/退款/AI/通知发送或预发布完整浏览器 E2E。** 本包仅证明路径解析及已有自动化检查；B07 总体仍为 `IN_PROGRESS`，技术上线 `NOT READY`。

## 安全、续跑

不修改 `docs/goal/mvp/handoff.md`、主需求矩阵、release-checklist、risk-register 及 financial-risk-audit 等已有其他 Agent 未提交内容。仅本包代码、测试、current-task、test-evidence 与本独立交接精确提交；不得 reset/clean/force push。后续先运行**获授权且名称匹配的本项目一次性隔离库**只读预检，再申请合法的非空数据备份恢复及灾备验证；外部商户、模型服务和合规审批由有权主体审核。
