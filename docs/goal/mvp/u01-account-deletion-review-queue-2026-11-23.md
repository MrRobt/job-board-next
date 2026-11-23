# U01 账户注销人工审核队列与财务预检 · 2026-11-23

## 范围与安全边界

- 基于前一 `5b4b700` 已验收的非破坏性用户注销审核申请，新增管理员只读入口 `/admin/account-deletions`，并在 `/admin` 提供导航。路由先 `requireAdmin()`；普通用户或匿名无权访问。最多显示最早 20 条，避免无界扫描；邮箱只显示脱敏值，不输出原始密码、敏感表单、订单号、支付凭据或申请原文。
- `listAccountDeletionReviewQueue` 仅批量 SELECT/groupBy：真实渠道工具订单、待支付订单、历史订单、退款/售后记录、退款意图及派发账本、RESERVED AI 请求、仍有余额的权益和个人求职记录。数据库读取失败会直接失败，不默认按无风险放行；数值异常同样以 `EVIDENCE_UNAVAILABLE` 呈现。
- 纯策略 `assessDeletionReviewExposure`：存在财务/退款证据时 `FINANCIAL_HOLD`，存在 AI 在途/剩余权益时 `OPERATIONAL_HOLD`，没有上述可识别风险时仍为 `MANUAL_REVIEW`。**所有分支 `canAutoDelete=false`**；本包没有任何更新审核状态、批准、删用户、退款、撤权或对外通知 API。
- 严格限制为运维“预检辅助”，不是法定删除/匿名化决策。合同、数据保存期限、未决售后和个人信息处理需要人工审批，U01 总体 IN_PROGRESS、技术上线 NOT READY。原支付/模型及其他外部资质门禁完全保留。

## 测试证据

- `tests/account-deletion-review-policy.test.ts` 先缺模块 RED exit1，再 4/4 GREEN；覆盖干净记录仍不自动删除、财务/退款风险、在途/权益风险、异常计数 fail closed。
- `tests/account-deletion-review-readonly-policy.test.ts` 初次因后台页面不存在 RED，补页面后 2/2 GREEN；验证管理员鉴权、只读查询、无写操作和脱敏策略。
- `tests/integration/account-deletion-review-queue.test.ts` 只在 `INTEGRATION_TEST_DATABASE=true` 独立 MySQL8 数据库执行：模拟真实渠道 PAID 与 OPEN 退款、模拟订单仍有权益和 RESERVED 请求、私有求职记录，验证分组风险分类、申请人隔离、脱敏、限额与查询前后财务记录不变。
- 本地定向 6/6 PASS；本地全局 TypeScript 被另一 Agent 已有的未提交 `lib/auth-retention.ts` TS2739 阻断。本包未修改他人的认证清理、财务扫描、主矩阵、risk/release、`handoff.md` 和缓存。**已获干净远端主 CI/MySQL 实测回执：** `e385b3d` 主 CI run `45137031288` / job `137565666292` completed/success，原始日志 `U01 review queue is read-only, batched, tenant-scoped and blocks financial/operational exposure` PASS；Prisma 迁移、类型、全量单元和真实 MySQL 集成、生产 build/HTTP smoke 均 SUCCESS。同提交管理员 HTTP、注销申请 HTTP、邮箱 HTTP、找回密码 HTTP、B07 只读及 B07 合成非空恢复等 6 条专项 CI 全部 SUCCESS。**仅管理员只读注销风险预检子包 VERIFIED；用户数据实际删除仍为人工门禁。**

## 交接

1. 读取新提交的 GitHub Actions 主 CI，核对新 MySQL8 集成的实际 PASS、Prisma/TS/单元/构建；遇到失败修复本包，不重复已验收任务。
2. 下一包可增加一次性 MySQL8 的管理员 HTTP 权限回归，检查匿名/USER 被阻断、ADMIN 只读可见、POST 不暴露执行入口。
3. 用户注销后续需要正式人工审批与可证明的合法数据清理/保留方案，绝不在本只读工作包中启用。
