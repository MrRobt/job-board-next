# B07 备份恢复只读预检：运营事故与通知表结构（2026-11-22）

## 恢复依据与问题

继续 `docs/goal/mvp/long-running-goal.md`；沿用上一轮已推送的 D02 预上线门禁。B07 现有的 `scripts/b07-recovery-preflight.mjs` 可对获准的 localhost 一次性 MySQL 测试库只读检查迁移状态、退款/AI 账本与部分关键表，但此前遗漏第 9～14 迁移加入的运维事故、通知队列、失败审计与死信复核表。迁移表记录存在不代表上述数据结构一定完好，可能漏掉需要恢复的运营状态。

## TDD 与实现

- 新增 `tests/b07-recovery-schema.test.ts`，明确要求包含 `OpsAlertIncident`、`OpsAlertIncidentEvent`、`OpsIncidentNotificationIntent`、`OpsNotificationFailureEvent`、`OpsNotificationDeadReview` 五张关键表及主要状态/令牌/审计字段。
- RED：新测试在策略模块不存在时 `npm test` exit 1（模块无法导入），没有借用真实生产 DB 或制造数据破坏。
- 新增无副作用纯策略 `scripts/b07-recovery-schema.mjs` 和类型声明，保持原退款账本关键表/字段/整数分检查，并将 5 张运营表与关键字段纳入。合成 metadata 测试覆盖完整结构、缺表/缺列、错误金额字段类型。
- `scripts/b07-recovery-preflight.mjs` 重用这一纯策略，保留原有隔离数据库白名单、显式 `READ_ONLY` 授权、迁移 SQL checksum 核对和汇总计数逻辑。不新增写库、迁移、备份/恢复命令，不放开任何生产开关。

## 当前验收

- 完整 `npm --prefix F:/code/job-board-next test`：**exit 0**。
- 独立 `node F:/code/job-board-next/node_modules/typescript/bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json`：**exit 0**。
- `npm --prefix F:/code/job-board-next run build`：**exit 0**；Prisma Client 生成、Next.js 16.4.6 生产构建通过。
- 无真实数据库的运营结构丢失演练；**未执行**本轮完整 MySQL 集成、读写迁移、备份恢复、生产代理或外部渠道调用。旧隔离库与实际预发布数据库的结构检查仍须获准后运行；B07 仍 `IN_PROGRESS`，不能标 `VERIFIED`。

## 后续与文件保护

下轮优先在**本项目获准的隔离库**运行 read-only preflight，先核对是否具备全部迁移与新表，再单独安排经授权的非空业务数据备份/恢复、重复 migrate deploy、浏览器验收。禁止访问或重置其他项目数据库。仅本轮独立代码/测试和增量检查点入 Git；其他 Agent 的共享 handoff、主矩阵、风险/发布清单及财务审计文件继续保持原样。不强推，未经授权不得启用商户或模型。
