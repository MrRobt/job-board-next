# 2026-11-18 P0 退款渠道查询：只读、安全隔离子包

## 实施范围

本轮新增：
- `lib/payment/refund-query.ts`：微信支付 API v3 根据 `out_refund_no` 查询退款状态；支付宝 `alipay.trade.fastpay.refund.query` 查询；请求 RSA2 签名、渠道响应签名验证及订单/退款单号/原支付交易号/币种与金额一致性校验。
- `tests/integration/refund-query.test.ts`：3 个测试场景，内含签名伪造、错订单、错退款号、错交易号、错金额、未知状态和门禁验证。

**严格边界**：这是只读查询底座，**不发起资金退款**、不生成或持久化 `outRefundNo`、不调用真实商户、不修改 `ToolOrder`、`ToolRefundCase`、`ToolGrant` 或 `ToolRun`，不向普通用户暴露查询接口。

独立默认关闭：仅当 `ENABLE_REAL_PAYMENT=true` **且** `ENABLE_REFUND_QUERY=true` 并具备当前商户凭据时才允许查询。**本轮两个开关从未对真实商户启用**；测试只通过进程环境覆盖和模拟 `fetch` 完成。未接入管理端入口，不应在未经人工批准前接入真实调用。请注意项目其他支付对账开关的独立审批。

状态映射：
- 微信已验签 `SUCCESS` → `SUCCEEDED`；`PROCESSING` → `PROCESSING`；`CLOSED` → `FAILED`；`ABNORMAL`/未识别 → `UNKNOWN`（不可自动解冻）。
- 支付宝已验签且全部金额/交易一致，`refund_status=REFUND_SUCCESS` → `SUCCEEDED`；空或其他值 → `UNKNOWN`。**支付宝 `code=10000` 本身不是退款成功证据**，不得据此撤销权益或置 `REFUNDED`。

参考接口：
- 微信支付商户文档：<https://pay.wechatpay.cn/doc/v3/merchant/4012791884>
- 微信支付退款接入指引：<https://pay.wechatpay.cn/doc/v3/merchant/4013071031>
- 支付宝退款查询：<https://aipay.alipay.com/docs/vibe-pay/ai-web-app-payment-qianyi/api-list/alipay-trade-fastpay-refund-query.html>

## 实际测试证据（job-codexpro，2026-11-18）

| 验证 | 结果 |
|---|---|
| 新增独立退款查询离线测试（模拟签名密钥和响应，无网络商户调用） | PASS 3/3，exit 0 |
| 本项目专用隔离 MySQL `jobs_mvp_migrate_20261118_8f72` 全部集成测试 | PASS 11/11，exit 0 |
| 全量单元测试 | PASS 8/8，exit 0 |
| TypeScript `tsc --noEmit -p F:/code/job-board-next/tsconfig.json` | exit 0 |
| Prisma validate | exit 0 |
| Next.js 生产构建（显式项目路径） | exit 0，编译/TypeScript/页面生成通过 |

第一次执行 `next build` 未指定项目路径时，连接器在非工作区 CWD 启动，错误地报告找不到 `app` 和依赖；**不是源码错误**。加上 `F:/code/job-board-next` 作为构建目录后实际构建成功。

## 仍未完成的 P0 事项

1. 由人工核准商户与退款规则后，设计独立持久化退款请求号、退款金额、渠道退款状态、请求/查询审计；不得重复创建资金退款。
2. 在数据库事务中审查 `refundHold`、已经 `RESERVED` 的 AI 调用、真实已用次数与剩余权益；只在真实渠道回款最终证明和金额确认后原子撤权。
3. 出现渠道超时/网络错误/未知结果时，不得重复退款或据 HTTP 成功推断回款；须查询同一退款请求号，保持冻结并交人工核对。
4. 完成管理员权限、商户 UAT、对账、生产数据库恢复和合规审核。这一查询模块 **不能代表 B06 VERIFIED**。
5. 既有退款申请、Prisma Schema、lockfile、工具记忆目录等本轮开始前即有未提交改动，由其他 Agent/工具所有，本轮没有修改。
