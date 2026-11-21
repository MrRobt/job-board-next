# B04/U03 管理员告警确认的轮次隔离及 CAS 前置规则 — 2026-11-21

状态：VERIFIED（本地无副作用安全策略子包）；数据库实际确认、权限中间件、可靠通知与生产部署仍 IN_PROGRESS/BLOCKED。

## 交付范围
- 新增 `lib/career/ops-acknowledgment-policy.ts`：`prepareOpsAcknowledgment(snapshot, command, now)` 仅返回确认提案和数据库比较更新（CAS）前提，不直接查询/修改数据库。
- 严格要求 `operatorRole=ADMIN`、可用的操作人 ID、10–500 字符且不含控制字符的人工审核理由。
- 客户端请求必须携带 `expectedOpenedAt`；与已存事故类别、实际发生轮次不一致时拒绝。防止处理旧告警的页面确认新一轮资金未知态事故。
- 禁止确认 `RESOLVED`，拒绝未来时间、错误状态和旧数据不一致。已确认事故只有相同管理员、相同原因和相同轮次的重试返回 `ALREADY_ACKNOWLEDGED`，不再次创建确认提案；其他重试拒绝。
- 输出 `cas={key,expectedState:OPEN,expectedOpenedAt}`；后续调用方**必须再次从服务端取得管理员角色**，在同一个数据库事务里执行 compare-and-set，并同时记录审计事件，检查实际受影响行数恰为一。不可把本策略直接作为用户提供的角色凭据。

## 真实验收
- 新增 `tests/ops-acknowledgment-policy.test.ts`，覆盖 5 个案例：合法管理员提案、过期轮次或类别错误、身份/理由拒绝、幂等与冲突、时间与状态一致性。
- TDD 首次补测试 **80/81，1 FAIL**（无模块）；实现后有一次测试断言大小写不一致 84/85，修复后完整 **85/85 PASS，exit 0**。
- TypeScript 独立 `tsc --noEmit` **exit 0**；Next.js 生产构建 **exit 0**。
- 现有专用隔离 MySQL 全量集成测试 **31/31 PASS，exit 0**，该集成回归只证明现有业务未破坏；**不包含本策略的持久化数据库验收**。
- 没有启动真实模型、商户、退款发送、告警发送，也没有修改普通开发/生产数据库。

## 未完成和后续
- 上轮新增第 9 项 `OpsAlertIncident`/审计表迁移仍缺实地验收，不能声称已经落库。先解决隔离 UAT 迁移及 Prisma Client 生成阻断，然后才能落实事务化服务端确认、权限测试和跨进程告警审计。
- 后续进行事件存储、管理员鉴权/CSRF、比较更新与审计同事务、重复确认与旧轮次并发 MySQL 回归、通知渠道幂等和生产故障演练。
- B04/U03、B07/D02 和商户/合规人工门禁不改变状态。共享 `handoff.md`、`requirement-matrix.md`、`risk-register.md`、`release-checklist.md` 及财务审计文件仍为其他 Agent 未提交内容，严禁混提交。
