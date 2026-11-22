# 2026-11-22 B04/U03 只读通知 Handoff 的真 MySQL 门禁补充

## 工作包
- 独立新增 `tests/integration/ops-notification-handoff-mysql.test.ts`，不修改生产代码/迁移、不触发通知网络 I/O。
- 仅在明确 `INTEGRATION_TEST_DATABASE=true`、非 production 的专用测试库运行；核验真实事故/通知迁移存在，CI 缺表直接 FAIL，历史未迁移本地库有明确 SKIP。
- 测试先确认 `REFUND_READY_AGED` 事故与对应通知不存在，再在本测试拥有的记录上真实走 `syncOpsIncidentWithStore` OPENED → `queueInitialOpsNotificationIntent` → `claimOpsNotificationIntent` → Serializable `prepareOpsNotificationHandoff`。
- 比较实际 DB 已入队数 2 与事故刷新后的当前数 3：输出 envelope 以当前事故快照为准；另外检查错误 claim token FENCED、未批准 DENIED、到期 EXPIRED 和解决后 STALE。finally 仅清理本测试创建的通知/事故/审计记录。
- 不涉及商户、AI 调用、资金/权益、真实消息或任何运行开关的开启。

## 本轮验证及限制
- `tsc --noEmit`：exit 0。
- `npm --prefix F:/code/job-board-next test`：exit 0（完整单元套件，包括已有五项 handoff 离线测试）。
- 新增真 MySQL 集成未在本机旧测试库执行，**不宣称当前已 PASS**；需要本提交推送后的 GitHub CI 全新 MySQL 执行结果，或另行批准的专用迁移测试库实测。
- `npm --prefix F:/code/job-board-next run build`：Prisma Client 生成与 Next.js 16.4.6 生产编译、TypeScript 阶段、页面构建均 exit 0。远端新增 MySQL 测试仍待 CI 证据；商户/模型/合规门禁不变。

## 仍需推进
- 实际通知发送器、网络出口规则、供应商幂等、真实签收/未知结果、租约边界竞态、恢复与预发布告警 E2E 没有完成。B04/U03 仍 `IN_PROGRESS`，整体 `NOT READY`。
- 主矩阵/交接与财务审计仍属于并行 Agent 未提交文件，本包不覆盖。
