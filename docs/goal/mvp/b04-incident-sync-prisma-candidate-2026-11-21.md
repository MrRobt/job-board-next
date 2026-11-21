# B04/U03 事故扫描结果持久化事务候选 — 2026-11-21

状态：**离线服务、单元、TS、生产构建 VERIFIED；真实 MySQL 同步事务待新 CI 验收**；B04/U03 整体 IN_PROGRESS、商业上线 NOT READY。

## 起点
- `d252123` 的 GitHub Actions run [44877523145](https://github.com/MrRobt/job-board-next/actions/runs/44877523145) 完成且 **success**。
- 原有代码已有事故状态纯函数 `transitionOpsIncident`、人工确认的独立 Prisma 事务、管理员页和只读/写入独立开关；但扫描结果尚无将 OPENED/RESOLVED/REOPENED 事件与当前状态同事务写入的服务。
- 工作树 `main...origin/main`；其他 Agent 未提交的 `handoff.md`、矩阵、发布清单、风险登记、financial-risk-audit 与临时文件均不修改、暂存或删除。

## 本轮实现（不接生产）
- 新建 `lib/career/ops-incident-sync-service.ts`：接收可信扫描汇总之一的事故 key、非负整数 count 与扫描时间，先读取上次快照，再使用现有 `transitionOpsIncident`；同一事务中创建/按条件 CAS 更新事故表，只有 OPENED/RESOLVED/REOPENED 才插入审计事件。零计数且无历史记录不插入。稳定已解决事故不重复改写；无事件的数量更新也受 CAS 限制。
- 新建 `lib/career/ops-incident-sync-prisma-store.ts`：注入 Prisma Client 的窄类型端口，`Serializable` 事务，CAS 按 key/state/openedAt/lastSeenAt/count 严格约束。审计追加与事件状态更新原子化，冲突抛错由扫描器未来人工或新任务重新读取，不自动发送消息或更改资金/权益。
- 新增 `tests/ops-incident-sync-service.test.ts`：0 首次无操作、开启→数量变化→解决→重开、重复扫描不增加事件、CAS 冲突不写事件、审计失败事务回滚、非法计数/时钟拒绝。纯服务注入事务 mock。
- 新增 `tests/integration/ops-incident-sync-mysql.test.ts`：只在 `INTEGRATION_TEST_DATABASE=true` 运行，检查第 9 项迁移两个事故表，且已有同类别数据则拒绝覆盖。全新 CI 的 `CI=true` 缺表必须失败；旧本地专用库允许明确 SKIP，不计 PASS。预期 CI 真实验证 Prisma OPENED/RESOLVED/REOPENED 事件记录、计数及最终状态；只允许清理自己创建的事故和事件。没有真实外部操作。

## 本轮实际证据
- `npm test` exit 0；独立 `tsc --noEmit` exit 0；Next.js 生产构建 exit 0。
- 本地历史隔离库集成 **33 total / 31 PASS / 0 FAIL / 2 SKIP**；两个 SKIP 都是需要第 9 项事故迁移的测试，**新同步集成测试未在本机真实 DB 上通过**。
- 未执行该旧库的 Prisma 迁移、未触碰默认开发/生产库、未接入 cron、HTTP API、通知系统、真实商户或财务账务；所加服务是未接线的候选基础设施。

## 后续门禁
1. 核验此提交 GitHub Actions 新 MySQL8 的实际迁移、33/33 集成等结果；失败须定位日志后修复，绝不把排队视为通过。
2. 经授权的独立预发布环境上验证多 worker 并发、新扫描与管理员确认交错及真实通知 outbox；在完成恢复/备份/鉴权前不得开放自动持久化运行。
3. 商户、模型、经营资质、隐私和法律审批继续保持人工门禁。
