# B06 支付宝退款 POST 商户身份 fail-closed（2026-11-22）

## 背景与边界

恢复依据：`docs/goal/mvp/long-running-goal.md`、`current-task.md`、`test-evidence.md`、`AGENTS.md` 与真实 Git `main`。当前 `B06` 整体仍 `IN_PROGRESS`；真实商户、生产数据迁移、完整浏览器 E2E 与法律审批均不是本包可验收项。

支付宝退款 POST 的 `code=10000` RSA2 签名回包在 `seller_id` 缺失时仍被 `sendAlipay` 视作初步 `ACKNOWLEDGED`；错误商户 ID 原已拒绝。签名仅证明回包来自配置的支付宝平台公钥，不能补足回包中本商户身份缺失的证据。`ACKNOWLEDGED` 本来就不意味着资金到账，本包进一步将未核实卖方身份的回包保持未知态，要求独立渠道查单。

## 变更

- `tests/integration/refund-submission.test.ts`：在已有临时 RSA2 密钥、签名响应、模拟 `fetch` 的退款 POST 测试中增加 `seller_id` 缺失及错商户场景，保持原有正确回包、金额异常与伪签名回归。
- `lib/payment/refund-submit.ts`：严格要求已签名成功回包的 `seller_id` 存在并精确匹配 `ALIPAY_SELLER_ID`；否则抛错。调用方 `submitPreparedRefundOnce` 将不确定结果留在 `IN_DOUBT`，不自动重发、不撤权、不记作资金终态。
- 生产真实支付、退款发送、AI 和通知开关均未修改、未开启；没有真实商户网络请求、数据库表变更或资金操作。

## 当前本机实测

1. TDD RED：`node --conditions=react-server --import file:///F:/code/job-board-next/node_modules/tsx/dist/loader.mjs --test --test-name-pattern="Alipay refund POST" F:/code/job-board-next/tests/integration/refund-submission.test.ts` → **exit 1**，`Missing expected rejection`（在原网关下缺 seller 仍 ACK）。
2. 实现后同一命令 → **exit 0，1 PASS / 0 FAIL**，缺失/错误商户均拒绝，正常签名和金额行为不变。
3. `npm --prefix F:/code/job-board-next test` → **exit 0**（全量单元）。
4. `node F:/code/job-board-next/node_modules/typescript/bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json` → **exit 0**。
5. `npm --prefix F:/code/job-board-next run build` → **exit 0**；Prisma generate 和 Next.js 16.4.6 生产构建全部成功。

执行器默认 cwd 不在仓库，最初相对路径/裸 `--import tsx` 无法解析；已以绝对文件 URL 正常执行，不能把路径错误当成 RED。**本轮没有运行完整 MySQL 集成，也没有真实商户退款成功/查单或远端 CI 的新提交证明**。

## 下一次续跑

优先继续 B06 退款商户最终态和 B04/B07/U01 的 P0 实际缺口，避免重做已验收子包；仅对本次精准文件进行独立小提交。共享 `handoff.md`、主需求矩阵、风险清单、发布清单与 financial-risk-audit 等其他 Agent 的未提交改动全部保留，不覆盖、不混提交、不强推。必须持续保持商业与外部人工门禁为未完成。
