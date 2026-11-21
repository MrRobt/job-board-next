# B04/U03 事故页 URL 结果欺骗与类别白名单安全收口 — 2026-11-21

状态：**本轮安全小包本地 VERIFIED，远端 CI 待本次提交触发**；B04/U03 整体 IN_PROGRESS，商业技术上线 NOT READY。

## 真实恢复
- 已核实 `82d57a9` GitHub Actions run [44880164059](https://github.com/MrRobt/job-board-next/actions/runs/44880164059) 结果 **success**。工作树 `main...origin/main`，他人未提交的 `handoff.md`、矩阵、风险登记、上线清单、`next-env.d.ts`、财务审计与缓存等原样保护。
- 管理员 `/admin/incidents` 原页面把 `?incidentOutcome=ACKNOWLEDGED` 直接显示“确认已记录”。GET 查询串可被任意构造，管理员若看到伪成功消息会误判事故处理状态；URL 不是数据库审计证据。
- `transitionOpsIncident` 虽然 TS 约束 `OpsIncidentKey`，但运行时接受任意 key，JS 调用者/异常数据可能把未知事故类别写入表内。

## 修复
- 新增纯 `opsIncidentOutcomeNotice`，页面对非空查询串只提示“请求已返回，请以事故状态与审计记录为准”，明确不代表成功。不更改需要服务器鉴权和 CAS 的 `confirmOpsIncident`，不将输入映射为可信结果，也不暴露审核笔记或管理员 ID。
- 新增 `assertOpsIncidentKey` 运行时白名单，并在 `transitionOpsIncident` 任何状态/事务写入前校验；`planOpsIncidents` 复用一致的 key 校验。
- 单元用例：`ops-incident-notice.test.ts` 验证伪造 ACKNOWLEDGED/ALREADY_ACKNOWLEDGED 等 URL 参数不能显示肯定性的成功语；`ops-incident-state.test.ts` 扩展非法 key、空串、null、数字全部拒绝。

## 真实验证
- `npm test` exit 0；独立 TypeScript `tsc --noEmit` exit 0；Next 生产构建 exit 0。
- 历史独立 MySQL 集成 **34 total / 31 PASS / 0 FAIL / 3 SKIP**；三项 SKIP 为旧库缺少第 9 项事故迁移，不能误称本地已重新验收真实事务。上一轮 CI 的全新 MySQL 并发测试已通过，本次新提交的 CI 必须另核验。
- 未改数据库 schema、商户/AI/通知开关、资金/权益账本，未改其他 Agent 未提交内容，也不执行未经批准的生产迁移。

## 下一项
- 管理员登录态及 CSRF/越权 HTTP E2E、合规授权的预发布迁移及备份恢复、可恢复告警通知与自动扫描调度。外部商户、隐私、模型服务及经营合规仍属于人工门禁。
