# B04/U03 管理员事故确认 Server Action 候选与 CI 实证 — 2026-11-21

状态：**VERIFIED（新表在 GitHub Actions 新 MySQL8 上的既有事务测试、当前表单解析/类型/构建）**；管理员 HTTP 登录态及动作调用 E2E、常规部署库迁移、告警同步和通知仍 IN_PROGRESS，整体上线 NOT READY。

## 已核实远端真实证据
- `efceb92` 的 GitHub Actions run [44872146477](https://github.com/MrRobt/job-board-next/actions/runs/44872146477) 已 `success`；job `validate` 的迁移 deploy、状态、重复 deploy、Prisma typecheck、单测、MySQL 集成、Next build 与 HTTP smoke 各步骤均 success。
- 原始日志：Prisma 所有迁移成功应用、重复运行 no pending；**95/95 单元 PASS，31/31 MySQL 集成 PASS，0 FAIL，0 SKIP**；新增 `B04/U03 migrated MySQL: admin CAS acknowledgment and audit are atomic/idempotent` 测试 PASS。这仅证明 CI 全新隔离 MySQL 的实现可用，**不等于正常开发库或预发布/生产库已迁移**。
- 之前的连续 CI 失败因此确认恢复，不再重做已通过测试包。

## 本轮小工作包
- `lib/career/ops-ack-form.ts` 只解析 `key/expectedOpenedAt/reason/confirmed`，白名单三个告警类别、精确 UTC 毫秒轮次格式、10–500 字审核理由并拒绝控制字符。完全忽略客户端上传的操作人/角色。
- `app/actions/ops-incidents.ts` 提供 `confirmOpsIncident(form)` 的 Server Action 候选：首先 `requireAdmin()` 并从服务器获取操作人身份；`ENABLE_OPS_INCIDENT_ACK=true` 是独立开关，默认不启用；使用 DB 固定窗口限流 5 次/小时，再通过现有 `acknowledgeOpsIncidentWithStore` 和 Prisma adapter 执行单事务 CAS/审计。异常统一重定向，不回显原始错误、敏感数据；成功刷新管理员路径。
- **未在 UI 中添加操作按钮**，也不调用真实支付、AI、自动通知；由于普通开发库第 9 项迁移未经确认，本动作默认不可用，不进行管理登录态 E2E 或声称已上线可用。
- 新增 `tests/ops-ack-form.test.ts`，覆盖合法输入、非法类别、时间格式/日期、确认勾选、控制字符与长度、伪造操作人字段、非字符串 FormData。

## 本地真实测试
- 首次新增测试后独立 TypeScript / Next build 因测试 helper 的 Record 类型约束失败；修复为允许缺省字段并显式过滤后复跑通过。
- 全量单元 `npm test` exit 0；独立 `tsc --noEmit` exit 0；Next.js build exit 0。
- 历史专用隔离 MySQL：`32 total / 31 PASS / 1 SKIP / 0 FAIL`，SKIP 的仍是新事故表测试；CI 已有新表真实通过的单独证明。未修改该旧隔离库、新开发库或生产库。
- 其他 Agent 的 `handoff.md`、矩阵、发布清单、风险登记和财务风险审计文件均保留不混提交。

## 后续
1. 在明确授权的预发布环境做第 9 项迁移、检查真实 Prisma Client，给管理员操作补表单页面、真实登录态/越权/限流/CSRF E2E，才能打开独立功能开关。
2. 实现告警状态同步与可恢复通知投递，不得让“已确认”伪装为商户退款完成；继续验证异常故障和跨进程并发。
3. CI 绿灯只覆盖仓库流水线与隔离库，预发布备份恢复、全量浏览器 E2E、真实商户、模型、资质/隐私条款审批依旧未通过。
