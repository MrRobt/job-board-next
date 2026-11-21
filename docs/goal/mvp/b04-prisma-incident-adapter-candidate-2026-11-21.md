# B04/U03 Prisma 告警确认事务适配器候选 — 2026-11-21

状态：**VERIFIED（委托模拟器和服务边界单测）**；真实 MySQL 新事故表迁移、Prisma Client 生成和实际事务 CAS 仍 **IN_PROGRESS / BLOCKED**，技术上线 NOT READY。

## 本轮从真实检查点接续
- 继续已推送 `0d1d9f2` 的 `acknowledgeOpsIncidentWithStore`，不重复此前确认规则、内存事务契约和退款 MySQL 回放。
- 新增 `lib/career/ops-incident-prisma-store.ts`：显式 `OpsPrismaClientPort`，无新 PrismaClient 实例、无数据库连接、无生产路由接线。通过注入的 Prisma 委托在单个 `Serializable` 事务（maxWait 10s、timeout 15s）内读取 `User.role`，读取 `OpsAlertIncident`，`updateMany` CAS，最后创建 `OpsAlertIncidentEvent` 审计。
- 关键字段修复：前一层服务契约名为 `expectedState / expectedOpenedAt`，必须在适配器映射为 Prisma 的真实列 `state / openedAt`，不能直接透传。首轮 TDD 已实际抓到此错误后修复。
- 新增 `tests/ops-incident-prisma-store.test.ts`，委托模拟器测试 5 个情况：Serializable 与查询顺序、角色非 ADMIN 时不读事故、CAS 更新 0 行时不写审计、审计插入异常触发提供方事务回滚、相同确认重试不重写记录。

## 测试证据与准确边界
- 首轮新测试 RED（服务适配器未存在），实现后测试发现 CAS 字段名映射错误，修复后完整单元 **exit 0**；独立 TypeScript `tsc --noEmit` **exit 0**。
- 现有历史专用隔离 MySQL 全量集成：首次 **30/31 PASS，exit 1**，同一命令复跑 **31/31 PASS，exit 0**。首次单项失败没有在后续复跑中稳定复现，必须保留不稳定性风险；本轮没有捕获足够的首轮错误堆栈来断言根因。
- Next.js 生产构建 **exit 0**。
- 此处 MySQL 集成只覆盖既有账务/退款服务；本次适配器使用的是**模拟 Prisma 委托**而不是新告警表的真实 MySQL 集成。模拟器的回滚代表委托事务语义，不证明真实 MySQL 隔离级别/并发性能。
- 之前新增的第 9 项告警表迁移未成功应用，Windows Prisma Client generate 曾出现 DLL EPERM；因此本模块是待验收的适配器候选，未通过真实 Prisma Client 类型兼容性/执行验收，未开放生产端点、未发送通知、未触及真实商户或 AI。

## 后续 P0 依赖
- 在明确授权的独立 UAT 库完整执行/检查第 9 项迁移，处理 Prisma Client 生成及模型委托匹配；真实数据库跑角色拒绝、并发 CAS、审计失败回滚、同轮次重试、事故重新打开等 RED/GREEN。
- 找到首次 MySQL 集成回归偶发失败的具体测试名称与根因并增加稳定性保障。
- 再接服务端身份鉴权、CSRF 与管理员页面、告警同步/通知/重试，验证部署、备份恢复与浏览器完整业务链。
- 不更改其它 Agent 的共享 handoff、需求矩阵、发布清单、风险登记和财务审计，保留所有商户、隐私、法律及真实 AI 人工门禁。
