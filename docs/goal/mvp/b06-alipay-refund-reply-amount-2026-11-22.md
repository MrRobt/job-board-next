# B06 支付宝退款回包金额精确一致性（2026-11-22）

## 目标与发现
- 在已签名的 `alipay.trade.refund` POST 响应中，原 `lib/payment/refund-submit.ts` 仅拒绝 `refund_fee < 申请退款金额`，大于请求金额和缺失 `refund_fee` 仍可能获得 `ACKNOWLEDGED`。
- `ACKNOWLEDGED` 从来不代表到账、资金确认或本地状态 `REFUNDED`，但资金身份的初步确认也不应接受不一致金额。
- 本包保持原有持久 Outbox 一次性 POST 与独立签名查单终态策略，不触发任何真实支付/退款 HTTP。

## 实现
- 新增 `lib/payment/refund-submit-amount.ts`：严格两位十进制元格式，BigInt 精确换算整数分，正安全整数金额，缺失/畸形/偏大/偏小一律要求签名查单。
- 在 `lib/payment/refund-submit.ts` 支付宝回包验签及商户交易号/订单校验后执行新断言；不影响微信签名、下单、出款重试策略。
- `tests/refund-submit-amount.test.ts` 覆盖金额精确、缺失、非法/溢出/不同精度。
- 扩展 `tests/integration/refund-submission.test.ts` 的 RSA2 离线签名回包用例，验证金额偏大、偏小、缺失和错误签名均拒绝。

## 本机验证
- 测试先行：新测试加入时 `npm test -- --test-name-pattern=refund` exit 1（新增模块尚不存在）。随后补实现。
- 真正网关专项：`node --conditions=react-server --import file:///F:/code/job-board-next/node_modules/tsx/dist/loader.mjs --test --test-name-pattern="Alipay refund POST" F:/code/job-board-next/tests/integration/refund-submission.test.ts`：1/1 PASS，exit 0。测试使用运行时生成的临时 RSA 密钥与 mock fetch，真实网络 0 次。
- `npm --prefix F:/code/job-board-next test`：exit 0。
- `F:/code/job-board-next/node_modules/.bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json`：exit 0。
- `npm --prefix F:/code/job-board-next run build`：exit 0（Prisma generate、Next.js 16.4.6 production build）。
- **未执行 MySQL 全量集成、真实商户签名联调、退款发送/到账/撤权、远端 CI 或生产恢复演练**；B06 整体 IN_PROGRESS。

## Git 与安全门禁
- 起始状态 `main` 超前 `origin/main` 两笔本地提交 `3ecee5d` / `ddeed46`。
- 项目专用 `.ai-bridge/github-verified-known-hosts` 使用 GitHub 官方公布的 ED25519 公钥，StrictHostKeyChecking=yes 仍启用。一次非强推尝试由 Host key verification failed 改为 `Permission denied (publickey)`；**认证尚未修复，无远端 push 成功**。不安装私钥、不改全局 SSH、安全门禁不降低。
- 保护已有其他 Agent 未提交的主 handoff/需求矩阵/风险登记/上线清单、financial-risk-audit 及工具缓存。仅精确暂存本工作包。
- 真实收款、出款、AI 与通知开关保持默认关闭；经营资质、商户实付/实退和合规审批全部仍需人工验收。
