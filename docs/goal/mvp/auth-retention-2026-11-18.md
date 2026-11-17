# P0 认证会话与限流记录保留期维护（2026-11-18）

## 范围与默认安全状态

独立实现 `lib/auth-retention.ts`、`scripts/prune-auth.ts` 和 `tests/integration/auth-retention.test.ts`；不修改账号/订单/退款/AI 权益 Schema，也不访问其他项目数据库。

- `pruneExpiredAuthRecords` 默认 **DRY_RUN**，仅读取过期 Session / AuthAttempt 计数，零删除。
- `apply=true` 分别以最多 200 条（可配置但单表不超过 1000）处理过期记录；先选择主键，再将过期条件带入删除谓词，防止误删已更新的非过期记录。目标模型仅限 Session、AuthAttempt。
- CLI 使用 `npm run auth:retention` 预览；即使显式指定 `-- --apply`，仍需运行环境 `AUTH_RETENTION_APPLY_APPROVED=true` 才会进入删除路径。
- 不输出会话 token、token 哈希、用户邮箱、IP 哈希或真实数据库连接参数；只报告汇总计数。

## 验收记录

工作区 `F:\code\job-board-next`，使用专用隔离 MySQL `jobs_mvp_migrate_20261118_8f72`：

| 检查 | 结果 |
|---|---|
| 集成预览与参数约束 | PASS 1/1 |
| 本地 CLI 默认 DRY_RUN | exit 0；过期 Session 0、AuthAttempt 0、删除 0 |
| 全量 MySQL 集成 | PASS 13/13 |
| 全量单元 | PASS 18/18 |
| TypeScript | exit 0 |
| Next.js 生产构建 | exit 0 |

试图验证受保护的 `--apply` 路径时，执行工具安全检查阻断；没有绕过限制，**没有执行或证明任何数据库清理**。此外，包含模拟账号/会话数据的写入测试也被安全检查阻断，现有测试只验证只读预览和参数约束。

## 仍需验收

1. 在已授权的独立预发布库中验证非空过期 Session/AuthAttempt 清理、有效会话不被删、同一批次重复执行与并发刷新保护。
2. 审核运维执行角色、只读监控与人工授权；配置实际调度频率和失败告警；此处没有自动创建定时任务或启用生产清理。
3. U01 仍 `IN_PROGRESS`：邮箱验证、找回密码、注销、可信反向代理联调、完整安全/浏览器 E2E 未完成。
4. 保持退款资金、实际 AI、商户、合规与生产上线外部门禁关闭；本子包不意味着正式上线就绪。
