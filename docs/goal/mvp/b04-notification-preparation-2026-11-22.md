# 2026-11-22 B04/U03 通知发送前只读绑定子包

## 实现与安全边界
- 新增 `lib/career/ops-notification-handoff.ts`：将默认拒绝的目标地址/运营审批策略与同一个持久化数据库事务中读取的 CLAIMED 通知、有效 claimToken、租约、OPEN 事故轮次绑定。
- 仅从持久化任务取通知身份、类型、优先级和事故轮次；从当前事故读取最新聚合数量，通过 `buildOpsNotificationEnvelope` 再次验证 SHA-256 幂等键，仅输出固定非敏感字段。
- 新增 `lib/career/ops-notification-handoff-prisma-store.ts`：单个 Serializable 只读事务，仅显式 select 十一个任务字段和三个事故字段，无 create/update/delete 接口。
- 只返回 `PREPARED` 的**只读候选快照**，绝不是外部发送许可；没有 HTTP、真实接收人、回执、定时任务、DB schema/资金/权益修改，也没有开启任何通知/真实支付/真实 AI 开关。

## 实际验收
- `F:/code/job-board-next/node_modules/.bin/tsx --test F:/code/job-board-next/tests/ops-notification-handoff.test.ts`：**5/5 PASS，exit 0**；覆盖合法绑定、未审批零 DB 调用、无效目标、失效租约/令牌/事故、记录畸形/异常、只读 Prisma 投影。
- `npm --prefix F:/code/job-board-next test`：**exit 0**（全部现有单元测试；原始输出在工具中截断，未据此宣称准确总数）。
- `F:/code/job-board-next/node_modules/.bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json`：**exit 0**。
- `npm --prefix F:/code/job-board-next run build`：Prisma generate、Next.js 16.4.6 生产构建 **exit 0**（首次已过；最终复验以同轮补充执行为准）。
- 本包**没有**重新验收独立全新 MySQL、生产真实通知、真实付款/退款、预发布浏览器 E2E、远端 CI。

## 下一步 / 阻断
- 需要真实接收人审批与目标身份配置、供应商端幂等策略、DNS/网络出口限制、防重试重投、发送时租约再核验、可靠回执及超时未知状态处理；先构建完全隔离的伪供应商测试，再考虑受控外部联调。
- 不得用本包 `PREPARED` 结果直接接 HTTP；只读快照与真实网络发送之间存在 TOCTOU，必须另行封堵。B04/U03 仍 `IN_PROGRESS`、技术上线 `NOT READY`。
- 既有其他 Agent 的主 handoff/requirement-matrix/release-checklist/risk-register、财务审计、lockfile、运行态文件不改不提交。
