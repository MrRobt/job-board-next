# B04/B06 CI 退款异常扫描的安全门禁断言修复 — 2026-11-21

状态：**本地修复 VERIFIED；新提交远端 GitHub Actions 尚待实际验证**。B04/U03 与整体上线状态不改变。

## 根因证据
- 通过 GitHub Actions 真实 run/job 日志核查：`8145fd2` run `44870889080` 和 `8442b89` run `44871860531` 均在 `npm run test:integration` 失败，具体是 `tests/integration/refund-finalization.test.ts` 的 `signed refund inquiry settlement...`。
- 失败断言原本固定要求告警 CLI exit=2（ALERT）；而 GitHub Actions 运行的是全新 MySQL `jobs` 数据库，不属于 `approvedOpsScanEnvironment` 允许的历史专用 localhost 隔离库。CLI 安全地拒绝扫描并返回 exit=3 和 `Operational scan refused`，原测试错误地以 `3 !== 2` 报失败。
- **不放宽安全保护，不让 CLI 在 CI 的非专用库上扫描**。CLI 的本机专用库限制保留原样。

## 本轮修复
- 修改 `tests/integration/refund-finalization.test.ts`，复用生产 `approvedOpsScanEnvironment` 判断测试进程的实际扫描许可。
- 若处于许可的专用隔离测试库，仍断言 exit=2、解析只读聚合 JSON、确认含 `REFUND_IN_DOUBT`；若不是，断言 CLI exit=3、stderr 包含 `Operational scan refused`，且 stdout 为空，确保拒绝时不泄漏聚合数据。
- 无商户、模型、真实支付、权限或数据层业务变更。其余 Agent 的财务风险审计源码、未提交测试和四份共享 Goal 文档全部保留。

## 验证结果与限制
- 修改后 `npm test` exit 0；独立 TypeScript `tsc --noEmit` exit 0；Next.js 生产构建 exit 0。
- 历史隔离 MySQL 全量集成首次 `32 total / 30 PASS / 1 FAIL / 1 SKIP`，失败来自**其他 Agent 未提交的** `financial-risk-audit.test.ts` 的 `127.0.0.1:3306` 临时不可连接；未修改其代码。完全相同的命令重新执行 `32 total / 31 PASS / 0 FAIL / 1 SKIP`。唯一 SKIP 为本轮第一包的第 9 项告警迁移新集成测试，不能算它已在 MySQL 通过。
- 本轮针对 GitHub Actions 断言失败的修复已本地复验；**没有新提交的远端 Actions 成功证据时不可宣称 CI 恢复**。

## 下一依赖
- 推送后读取新提交 GitHub Actions run/job 步骤和日志，验证 `npm run test:integration`、build、smoke 是否全部通过。
- 第 9 项告警表迁移、真实 CAS 并发、持久化审计和管理端 API 仍待独立 UAT；真实支付与 AI 及法务/商户审批绝不自动放行。
