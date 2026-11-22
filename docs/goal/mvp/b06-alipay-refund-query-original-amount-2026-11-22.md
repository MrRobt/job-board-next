# B06 支付宝退款终态缺失原订单金额安全门禁（2026-11-22）

## 交接与范围

基于 `main` 已提交的退款 Outbox、签名查询及 `reconcileDispatchedRefund` 原子撤权，不重写已验收工作。支付宝 `alipay.trade.fastpay.refund.query` 的 `total_amount` 在公开接口文档中为**特殊可选**字段： https://aipay.alipay.com/docs/vibe-pay/ai-web-app-payment-qianyi/api-list/alipay-trade-fastpay-refund-query.html 。

原代码对已签名的 `refund_status=REFUND_SUCCESS` 响应，只检查退款金额，原交易总额 `total_amount` 如缺失仍会返回 `SUCCEEDED`。自动撤权需同时校验原订单总额和退款金额；因此终态查询缺少原订单总额时保留 `IN_DOUBT`，必须人工查账，不从缺字段推断资金已全额退回。

## TDD 与实现

- `tests/integration/refund-query.test.ts` 使用临时 RSA 密钥与模拟 `fetch`，加入已签名成功响应缺少 `total_amount` 的 RED 案例，原实现运行 exit 1（`Missing expected rejection`）。
- `lib/payment/refund-query.ts` 在仅 `REFUND_SUCCESS` 情况下要求存在 `total_amount`，并继续以整数分校验与原订单总金额完全相等，否则拒绝自动成功认定。非成功/未知状态缺少该特殊可选字段仍可返回 `UNKNOWN`，不将其误判为退款成功。
- 补充已签名但原金额不匹配、未知状态且无原金额字段的回归。
- 没有修改 Prisma schema、发起商户退款请求、触发真实收款、进行权益更改或放开生产支付/AI/通知开关。

## 本轮验证

- RED：支付宝单场景原代码 exit 1，`Missing expected rejection`。
- GREEN：修复后支付宝单场景 **1/1 PASS**；全文件退款查询离线集成 **3/3 PASS**（微信、支付宝及只读门禁）。
- `npm --prefix F:/code/job-board-next test`：**exit 0**。
- `node F:/code/job-board-next/node_modules/typescript/bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json`：**exit 0**。
- `npm --prefix F:/code/job-board-next run build`：**exit 0**，Prisma Client generate + Next.js 16.4.6 生产构建成功。

**尚未证明**：当前小包完整 MySQL 集成/财务终态真实交易、合法商户退款及预发布/生产迁移、远端新提交 CI。B06 总体保持 `IN_PROGRESS`，外部资质、商户、模型合规仍保留人工门禁。

## Git 与保护

前一独立子包 `e186774` 已本地 commit，`origin/main` 尚未包含：普通 SSH 主机校验失败，使用历史核实的 `ssh.github.com:443` 严格主机校验后连接超时。不要关闭 host key 校验；先恢复可信网络再执行普通非强推。共享 `handoff.md`、`requirement-matrix.md`、`release-checklist.md`、`risk-register.md`、财务审计/缓存/锁文件均有其他 Agent 的工作，本包不覆盖、不混提交。独立本交接、`current-task.md` 和 `test-evidence.md` 是恢复检查点。
