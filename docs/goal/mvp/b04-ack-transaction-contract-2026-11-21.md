# B04/U03 事故确认事务服务契约与 CAS 审计原子性 — 2026-11-21

状态：**VERIFIED（本地可回滚适配器的事务服务逻辑）**；真实 Prisma 落库、告警发送及第 9 项迁移 UAT 仍 **IN_PROGRESS / BLOCKED**，项目上线 NOT READY。

## 恢复与目标
从已推送 `b5fe885` 的 `prepareOpsAcknowledgment`（只读权限/轮次规则）接续；之前只生成 CAS 条件，尚未形成“服务端核验管理员 → 事务读事故 → 比较更新 → 同事务审计”的完整业务服务契约。没有重复此前策略和 MySQL 异常回放的验收内容。

## 新增逻辑
- `lib/career/ops-incident-acknowledgment-service.ts` 定义 `OpsIncidentStore` / `OpsIncidentTransaction`、`acknowledgeOpsIncidentWithStore`。事务内部从存储适配器查询 `operatorRole`；**不接受调用方声明的管理员角色**。
- 使用上一轮 `prepareOpsAcknowledgment` 进行类别、状态、理由和事故轮次核验。只有 OPEN 且 `key + expectedState=OPEN + expectedOpenedAt` CAS 更新恰好 **1 行**后，才同事务写入 `ACKNOWLEDGED` 审计事件。CAS 数量异常时抛错；重复同管理员/同理由确认返回 `ALREADY_ACKNOWLEDGED`，不得重复写审计。
- `tests/ops-incident-acknowledgment-service.test.ts` 使用显式可回滚事务存储模拟器验证：合法管理员仅一次确认与审计、幂等/冲突、非管理员和失效轮次拒绝、读写间事故重开导致 CAS 失败、审计写入失败时回滚事故状态。
- 服务无 Prisma 客户端和出站依赖；不触碰商户、资金、AI 消费或真实告警投递。

## 实际验证
- TDD 首次新增测试（服务模块未存在）`npm test` **exit 1**；实现后完整单元 **90/90 PASS，exit 0**。
- 独立 `tsc --noEmit` **exit 0**。
- 仅访问历史专用隔离 MySQL `jobs_mvp_migrate_20261118_8f72` 的**现有**集成全套 **31/31 PASS，exit 0**，是老账务/退款回归；**不是**本事故确认事务对 MySQL 的验收。
- Next.js 生产构建 **exit 0**。

## 严格边界与下一步
第 9 项告警表迁移之前未成功应用；本轮也没有迁移或生成新的 Prisma Client。事务存储适配器尚未真实接线，数据库隔离级别、真实 CAS 并发、外键、审计落库、管理员鉴权接口、CSRF、通知投递/重试均**未进行数据库级验收**；不能因此把 B04/U03/D02 设为 VERIFIED。

后续须先在单独且授权的 UAT MySQL 上成功应用第 9 项迁移、重新生成客户端并核对结构与既有账本，再实现真实数据库事务适配器并测试并发、崩溃与审计原子性；随后补管理员 API / CSRF / 通知渠道 / E2E。其他 Agent 的 `handoff.md`、矩阵、风险、发布清单、财务审计改动不得覆盖或混提交。真实商户、模型和合规门禁保留人工确认。
