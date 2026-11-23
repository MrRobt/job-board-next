# B04/B06 退款成功-权益冲突审计的运营只读入口 · 2026-11-24

## 位置与范围

- 上一阶段 `4fc401a` 解决经过校验的退款成功但权益余额/AI 运行冲突时没有持续记录异常的问题；`786ffc1` 已记录干净 CI VERIFIED。
- 检查 `/admin/incidents`：已存在三类事故的独立状态机、确认、通知意图和门禁，**并无** `MANUAL_LEDGER_REVIEW` 聚合。此包只增加一项**即时只读数量提示与现有退款派发页链接**，不扩展事故的状态/通知语义，也不触碰资金流程。
- 新 `lib/career/refund-review-ops-read.ts` 只查询 `ToolRefundInquiryEvent.count({where:{outcome:"MANUAL_LEDGER_REVIEW"}})`，仅返回非负安全整数；任何 DB 错误、非法返回都抛出而非归零；不查用户/交易/申请的私密内容。
- 管理员 `/admin/incidents` 继续先 `requireAdmin()`，并保留独立的 `ENABLE_OPS_INCIDENT_READ` 或 ACK 只读门禁；未授权时完全不调用汇总。事故数据库与额外汇总读入任何一步失败均走已有 fail-closed 错误页，防止错误的“无异常”。有记录时用 `role="alert"` 展示计数和前往 `/admin/refund-dispatch` 的人工核账链接。该提示**不自动**创建、确认、解决 OpsAlertIncident 或发送外部消息。
- 没有更改既有三类事故的扫描/通知引擎，不引入网络任务、商户查单、退款 POST 或自动撤权。

## 测试与门禁

- `tests/refund-review-ops-visibility.test.ts` 先因聚合读模块缺失 RED；实现后 2/2 GREEN，断言只有固定 `MANUAL_LEDGER_REVIEW` 原因、负数/小数/NaN/Infinity/溢出和 DB 拒绝均 fail-closed、管理身份与只读门禁顺序、页面不写账。
- 现有 `tests/ops-incident-view.test.ts` 4/4 PASS；合计 6/6。原 `tests/integration/refund-finalization.test.ts` 加入在实际 `jobs_preview_20261123` MySQL8 读取聚合的断言，合法模拟商户成功后冲突证据新增一条 → 总数+1，重复查询数量不变，1/1 PASS。
- 本地 `tsc --noEmit` 仍被其他 Agent 未提交的 `lib/auth-retention.ts:83` TS2739 阻断。没有修改该文件或 `handoff.md`、需求矩阵、风险/发布清单及财务审计草稿。需干净 GitHub 主 CI 真实回执后才可标本子包 VERIFIED。
- 本阶段不会显示真实用户 PII；测试只使用独立数据库合成退款单，真实支付/AI 邮件、外部资质仍人工门禁，技术上线 NOT READY。

## 下一工作包

- 取得远端主 CI 的 Prisma/TypeScript/全单测/实际 MySQL 集成/Next build/smoke 和其他专项回执；只在全通过后更新本交接与 current-task/test-evidence 并独立 commit/push。
- 后续 B04/U03 自动通知与独立持久事故状态整合仍待设计并验收，禁止把本次只读计数误报为自动通知能力；B06 真渠道回款及资金/权益对账仍须有效商户授权、法律合规人工确认。
