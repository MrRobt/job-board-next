# B04/U03 真实 MySQL 事故确认回归的 CI 强制门禁 — 2026-11-21

状态：**IN_PROGRESS**。测试源码、类型和现有回归已验证；**第 9 项迁移与新表上的真实数据库验收仍未完成**。CI 的实际结果尚待远端确认，正式上线 NOT READY。

## 从真实进度继续
- 接续已正常推送的 `8145fd2` Prisma 事故确认适配器，不重复之前 95 项左右的逻辑/模拟器测试。
- 已有 `.github/workflows/ci.yml` 在 GitHub Actions 的全新 MySQL8 上执行 `prisma migrate deploy`、`prisma generate`、`npm test`、`npm run test:integration` 和 build。因此新增 `tests/integration/ops-incident-mysql.test.ts`，由现有 `test:integration` 通配符自动收录，不依赖编辑含受保护凭据的 CI 文件。
- 新测试使用实际 `db` Prisma Client 和 `createPrismaOpsIncidentStore`，验证迁移存在、管理员/普通用户权限、过期轮次拒绝、一次成功确认的状态和审计落库、重试幂等、不同原因不得覆盖、事故重新打开后旧确认拒绝、双管理员同时确认新一轮事故最多一次成功并只记一条新审计。
- 专用库测试开始先检查两张迁移表。如果是 **CI=true** 或明确设置 `OPS_INCIDENT_INTEGRATION_REQUIRED=true`，缺表时 **抛错以失败关闭**；若是历史本地专用库缺表，明确 `SKIP`，绝不可算作新表验收成功。测试检查 `INTEGRATION_TEST_DATABASE=true` 与非 production，明确拒绝覆盖已存在的事故 key；仅在已写入自己数据后清理对应管理员、事件和事故。
- 实际 CI 工作流含凭据配置，尝试修改该文件被安全检查阻断，因此没有编辑/提交该文件；利用 GitHub Actions 自有 `CI=true` 判断。

## 本地测试证据
- `tsc --noEmit` exit 0；`npm test` exit 0；Next.js 生产构建 exit 0。
- 历史专用隔离 MySQL `jobs_mvp_migrate_20261118_8f72`：完整集成 **32 total / 31 PASS / 1 SKIP / 0 FAIL / exit 0**。SKIP 的是第 9 项迁移必需的新事故确认集成测试，原因是两张新事故表均未建立；**不代表新功能通过 MySQL UAT**。
- 尝试本地模拟 `CI=true` 缺迁移失败的独立演练，执行无法取得有效可用结果，后续调用被安全检查拦截；此门禁尚无本机 RED 证据，不能声称已实测。
- 没有执行迁移、生产密钥/真实支付/真实模型、通知发送或正常开发/生产数据库写入。

## 待解决与验收条件
1. 对已推送的新提交查看 GitHub Actions 真正的 job/run，确认第 9 项迁移和生成器通过且新集成测试在 CI 环境**没有 SKIP**；失败需定位根因再修复。
2. 授权隔离 UAT 数据库第 9 项迁移及 Windows Prisma Client 生成，核验真实新表 CAS、审计事务、并发竞争和重复确认；本地历史隔离库的 SKIP 必须消失才能将新功能验收标 VERIFIED。
3. 后续管理员 HTTP 身份/CSRF、防重复通知、值班升级、备份恢复和浏览器端 E2E；B04/U03/B07/D02 继续 IN_PROGRESS，不抬升状态。
4. 其它 Agent 的共享 `handoff`、矩阵、风险、发布清单、财务审计和工具缓存未修改/未暂存。严格不绕安全门禁、不强推、不自动放行商户与合规。
