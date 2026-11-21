# B04/U03 受控管理员事故面板候选 — 2026-11-21

状态：**VERIFIED（表单展示代码、只读投影规则、单元/类型/构建及既有回归）**；管理员登录态操作、预发布数据库与浏览器 E2E 尚未验证，整体 B04/U03 IN_PROGRESS，上线 NOT READY。

## 恢复与已有证据
- 从已推送的 `1837f7e` 继续：GitHub Actions run `44872780536` 已实际 `success`，其前一轮 `efceb92` run `44872146477` 也 `success`。原有 CI 新 MySQL8 第 9 项迁移与告警确认事务集成已通过；此次不重复其验收，也不假称预发布/生产库已迁移。
- 本次接入前，`confirmOpsIncident` Server Action 默认关闭且尚无页面。需在保护功能开关的前提下提供只读事故列表与明确人工确认入口。

## 本次实施
- 新增 `app/admin/incidents/page.tsx`。每次先执行 `requireAdmin`；若 `ENABLE_OPS_INCIDENT_ACK` 不为 `true`，仅展示关闭说明，**不访问新事故表**；开启后最多读取最近 25 项汇总，数据不可用或校验失败时仅给通用错误，不泄漏 SQL/敏感信息。
- 仅对 OPEN 的事故显示手动确认表单：严格传入 key 与当前 openedAt，审核理由 10–500 字，必须人工勾选确认；复用现有 Server Action 服务端管理员鉴权、DB 限流、独立开关及事务 CAS 审计。RESOLVED 和 ACKNOWLEDGED 只读，不允许重复创建新确认。
- `app/admin/layout.tsx` 仅在功能开关开启时显示「运行事故」导航；`app/actions/ops-incidents.ts` 的成功/失败跳转和 revalidate 调整到该新页面。
- 新增 `lib/career/ops-incident-view.ts` 白名单只读投影，限定类别、状态、非负整数 count 与有效时间。公开投影不包含操作员 ID、审核笔记、已解决时间、简历或订单详情。
- 新增 `tests/ops-incident-view.test.ts` 三个单元场景：不输出敏感字段、拒绝损坏的统计/类别/时间、正确映射告警优先级和状态。无资金/退款/真实 AI/通知发送代码变更。

## 实测
- `npm test` exit 0、独立 `tsc --noEmit` exit 0、Next.js 生产构建 exit 0。
- 历史专用本地 MySQL 原有回归：**32 total / 31 PASS / 1 SKIP / 0 FAIL**，SKIP 是旧库没有第 9 项迁移的新事故确认集成；该真实集成已在前述 CI 全新隔离 MySQL 单独通过。
- **未做已登录管理员真实浏览器提交/CSRF E2E**，也没有将独立开关打开，未写入生产、正常开发或历史隔离库的新事故表。前端页面本身不能当作事故采集、自动通知或资金操作验收。

## 后续 P0
- 首先在专用预发布环境授权迁移并核对事故表、数据备份/恢复，再以真实管理员与普通用户会话验收页面、开关关闭、CSRF/跨用户提交、限流、并发与审计一致性，方可开启该独立开关。
- 自动汇总扫描→事故状态生命周期→持久化审计→可恢复通知仍需开发及 UAT；不可把人工“已确认”解释为退款/服务恢复。
- 用户邮箱验证、帐号注销、财务商户实测、部署恢复/HTTPS 和合规资质门禁继续 IN_PROGRESS/BLOCKED。
- 其他 Agent 尚未提交的 handoff、矩阵、风险、发布清单、financial-risk-audit、缓存、package-lock 均不修改或混提交。
