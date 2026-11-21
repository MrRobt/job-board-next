# B04/U03 事故通知领取后发送前只读校验候选 — 2026-11-21

状态：**纯内部 preflight + 单元/类型/构建 VERIFIED；本轮新增真实 MySQL 检查待新 CI。** 无发送器、无网络投递、无凭证或生产开关；B04/U03 IN_PROGRESS / 整体 NOT READY。

## 恢复基线
- 已核实上一轮 `1ab2428` GitHub Actions [run 44887201687](https://github.com/MrRobt/job-board-next/actions/runs/44887201687) **success**。第十一迁移、QUEUED→CLAIMED 租约及超期更换 token 已通过全新 MySQL 测试，不重复开发。
- 读取 AGENTS.md、long-running-goal.md、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register 和 Git 状态。其他 Agent 的 handoff/矩阵/清单/风险、财务审计、next-env、package-lock、缓存均未编辑。

## 本轮最小工作包
- 新建 `lib/career/ops-notification-preflight.ts` 的 `preflightOpsNotification`：只读事务内核对完整通知主键、UUID 领取令牌、时间、当前任务仍 CLAIMED、令牌一致且租约未过期、事故仍为同一 OPEN 轮次且计数大于 0。分别返回 READY/MISSING/FENCED/EXPIRED/STALE；无发送、无 ack 和资金/用户修改。
- `lib/career/ops-notification-preflight-prisma-store.ts` 通过窄只读 Prisma delegate 和 Serializable 事务读取任务、事故；不给写入操作或外部发送能力。
- 新增 `tests/ops-notification-preflight.test.ts`，覆盖旧 token、队列未领取、租约过期、缺失任务、确认/已解决、事故重新开启、错误输入和 Prisma 只读事务。随机 token 仅在测试进程中生成。
- 扩展**既有** `tests/integration/ops-notification-queue-mysql.test.ts`：首 CLAIMED 后旧 token READY；过期重领后旧 token FENCED、新 token READY；事故 RESOLVED 后新 token STALE。复用原文件测试专用记录，避免多个文件抢同一事故 key；仅清理自身记录。
- **安全语义限制**：READY 是独立只读时点的快照，并非发送授权。真正发送要考虑检查与外部网络投递之间的 TOCTOU、提供方幂等、租约续期/回执与合规接收人/渠道授权；不能仅靠该快照直接开通发送。

## 测试证据
- 新增 5 条专门单元测试 exit 0；全套 `npm test` exit 0；独立 `tsc --noEmit` exit 0；Next.js 生产 `build` exit 0。
- 历史专用 MySQL `36 total / 31 PASS / 0 FAIL / 5 SKIP`：缺第九至十一迁移，故扩展后的真实 preflight 测试在本机仍 SKIP；已查验提交 `1f2bae4` 的 GitHub Actions [run 44889847821](https://github.com/MrRobt/job-board-next/actions/runs/44889847821) 最终 **SUCCESS**：全新 MySQL8 全量迁移、138/138 单元、35/35 集成、0 FAIL/0 SKIP；扩展后的既有 MySQL 入队测试验证首次 preflight READY、旧令牌 FENCED、新令牌 READY、事故已解决 STALE 明确 PASS；typecheck、Next build、HTTP smoke 均成功。仅证明内部时点校验，不代表网络发送或送达。
- 工具执行曾出现一次批量超时，后用独立命令逐个复测，已取得上述有效退出码。
- 不涉及数据库新迁移、HTTP/Cron、真实通知、支付、模型、用户数据。外部商户、资质与隐私/法律审批均保留人工门禁。
