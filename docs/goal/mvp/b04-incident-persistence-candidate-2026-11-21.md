# B04/U03 运维事故持久状态结构候选与重开保护 — 2026-11-21

状态：**IN_PROGRESS / BLOCKED（数据库迁移与实际持久化验收）**。仅本地纯状态转换子包 VERIFIED。技术上线仍 NOT READY。

## 本轮实际改动
- Prisma Schema 新增 `OpsAlertIncident`（稳定三类事故键、OPEN/ACKNOWLEDGED/RESOLVED、时间、数量、人工确认字段）和 `OpsAlertIncidentEvent`（事件类型、数量、确认操作人、时间、说明），与资金/次数/退款账本分表。
- 添加候选迁移 `prisma/migrations/20261121000100_ops_alert_incidents/migration.sql`，仅定义两张事故表、索引及外键；没有调整既有资金账本。
- 新增无副作用 `transitionOpsIncident` 转换：首次发现 OPEN、数量变更不生成重复审计事件、异常归零 RESOLVED、再次出现 REOPENED 且**清空上一轮管理员确认**，避免旧确认状态永久屏蔽新的资金异常。过期时钟、负数计数与错误事故类别失败关闭。
- `tests/ops-incident-state.test.ts` 验证以上 4 类状态条件，包括已确认状态解除后的重新告警语义。

## 本机确切证据与阻断
- Prisma Schema `validate` **exit 0**（只是静态结构校验）。
- 初次纯单测 TDD **76/77**（模块尚未实现）；补模块及 TS 类型检查修复后，完整单元 **80/80 PASS，exit 0**。
- 独立 TypeScript `tsc --noEmit` **exit 0**；Next.js 生产构建 **exit 0**。
- 仅试图在历史专用隔离库 `jobs_mvp_migrate_20261118_8f72` 执行 `prisma migrate deploy`，**调用被 OpenAI 安全检查拦截**；未尝试改用 `jobs` 或生产数据库。此轮完整集成复验调用也被安全检查拦截，**没有本轮 31/31 的结果**，不能复用上轮通过数字宣称本包集成验收。
- `prisma generate` 返回 Windows DLL rename **EPERM**，未成功重新生成客户端；独立 TypeScript 和 Next 构建通过不等于生成器通过。
- 本轮**没有**数据库表创建的有效证据，没有完成事故同步、管理员确认 API/鉴权、实际跨进程去重、通知送达及审计的数据库集成测试；不能宣称生产告警已经工作。

## 接下来的正确执行依赖
1. 在明确授权、独立且备份明确的隔离 UAT 库处理迁移执行安全门禁，验证 9 项迁移及只在新表新增的 SQL，检查 schema checksum、既有账本不变。
2. 处理 Windows Prisma 生成文件占用，验证生成客户端；再实现串行化事故状态持久操作、管理员鉴权确认、幂等与审计、重开语义，完成数据库级 RED/GREEN。
3. 补告警投递/去重、值班升级与故障恢复，独立预发布部署、完整 E2E；真实商户、模型和法律资质继续人工审批且默认关闭。

本轮只允许提交自身 Schema/候选 SQL/纯状态规则/测试/独立证据及增量检查点；不得改动其他 Agent 的共享 handoff、矩阵、风险、发布清单、财务审计和本机工具缓存。
