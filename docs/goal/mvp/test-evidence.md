# MVP 测试证据（2026-11-17）

执行环境：job-codexpro，本机独立 Docker MySQL `job-board-next-db-1`。未使用 `djs-mysql-uat`。

| 测试 | 命令摘要 | 实际结果 |
|---|---|---|
| Prisma schema | `DATABASE_URL=<dev-db> node node_modules/prisma/build/index.js validate` | exit 0，合法 Schema |
| 开发库同步 | `DATABASE_URL=<dev-db> node node_modules/prisma/build/index.js db push --skip-generate` | exit 0，仅开发库 |
| Prisma Client | `DATABASE_URL=<dev-db> node node_modules/prisma/build/index.js generate` | exit 0，Prisma 6.19.3 |
| 类型检查 | `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| 单元测试 | `node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts` | 8 PASS / 0 FAIL |
| DB 集成测试 | `INTEGRATION_TEST_DATABASE=true DATABASE_URL=<dev-db> node --conditions=react-server --import tsx --test tests/integration/*.test.ts` | 7 PASS / 0 FAIL |
| Next.js 生产构建 | `node node_modules/next/dist/bin/next build` | exit 0，Next.js 16.4.6，编译成功 |
| 生产迁移 | `prisma migrate deploy`（全新独立库） | 上一工作包工具安全检查阻断，本轮未复验；**BLOCKED** |

## 本轮支付测试新增的实际场景

- PENDING 在本地过期但渠道 UNKNOWN 或 UNPAID 时不关单/不释放 `activeKey`。
- 关单前必须本地过期，且渠道先确认 UNPAID；关单 API 返回之后再次查询 CLOSED 才允许关闭本地订单。
- 关单成功后，activeKey 释放；订单允许创建新支付渠道的待支付订单。
- 已关闭订单重复操作不造成二次改账；支付回调与确认流程复用幂等结算。
- 错金额订单查询绝不发放权益，非管理员不能进行商户查单。
- 微信 API v3 伪响应 RSA 验签及 204 关单响应处理；支付宝 OpenAPI RSA2 请求加签、原始 JSON 响应验签、伪造签名拒绝。
- `ToolOrderReconcileEvent` 记录操作人、动作、观察状态和结果。无真实商户 API 请求，测试签名密钥运行时随机生成。

## 2026-11-18：独立迁移验证子包（CI 待远端验证）

- 在独立 MySQL 库 `jobs_mvp_migrate_20261118_8f72` 上首次 `prisma migrate deploy` exit 0，按顺序应用 baseline、reconcile、refund_cases 共 3 个迁移；`prisma migrate status` exit 0，报告 up to date。
- 当前工作树 TypeScript exit 0；单元 8/8 PASS；隔离库集成 8/8 PASS，含尚未提交的退款冻结代码。
- 第二次本地 `migrate deploy` 被连接器安全检查阻断，**未验收幂等复跑**；`.github/workflows/ci.yml` 已改为用迁移替代 `db push` 并在空库复跑，GitHub Actions 实际运行尚待验证。
- 详见 `migration-uat-2026-11-18.md`。只证明本地独立库；旧库 baseline 登记、备份恢复、真实商户/AI 与生产安全仍未验收。

## 2026-11-18：P0 退款渠道只读查询子包

- 新增 `tests/integration/refund-query.test.ts`：3/3 PASS（伪造签名、错误金额/身份拒绝、查询未知结果不被认定成功、默认门禁禁用）；**无真实商户 HTTP 调用**。
- 隔离库 `jobs_mvp_migrate_20261118_8f72` 全量 MySQL 集成 11/11 PASS；单元 8/8 PASS；TypeScript `--noEmit` exit 0；Prisma validate exit 0。
- 使用明确项目目录运行 Next.js 16.4.6 production build，exit 0；最初不指定项目目录的 build 因连接器 CWD 错误失败，已通过正确命令复验。
- 详见 `refund-channel-inquiry-2026-11-18.md`；资金申请、退款到账、撤权、真实商户和生产 UAT 均没有验收，B06 保持 IN_PROGRESS。

## 2026-11-18：可信代理 IP 限流与数据库并发修复

- 新增并发集成测试首轮 FAIL：Prisma upsert 同时插入 AuthAttempt 抛唯一键错误；修复为 SQL 原子 upsert/事务内读后该用例 1/1 PASS。
- 全量 MySQL 集成 12/12 PASS；单元 10/10 PASS；TypeScript exit 0；Next.js 生产 build exit 0。详情 `trusted-ip-limit-2026-11-18.md`。
- IP 头信任依赖实际反向代理强制覆盖与源站防护；未进行真实预发布代理联调，U01 维持 IN_PROGRESS，不能宣称正式上线级限流验收。

## 2026-11-18：退款账务只读预检

- 新增 `refund-preflight.test.ts` 2/2 PASS：订单用户/管理员隔离、退款冻结、在途 AI、失败返还、已消费、错误账本，以及预检前后财务状态不变。
- 全量 MySQL 集成 14/14 PASS；全量单元 10/10 PASS；Prisma validate、TypeScript、Next.js 生产 build 均 exit 0。测试库 `jobs_mvp_migrate_20261118_8f72`，未发起真实退款。
- 详见 `refund-preflight-2026-11-18.md`。B06 整体仍 IN_PROGRESS：预检是只读时点快照，不是渠道到账证明或原子资金事务。

## 保留的局限

没有真实商户、沙箱、小额实付、退款或真实对账验证，没有生产环境首次迁移、恢复与回滚演练，也没有完整浏览器 E2E。以上通过的测试**不代表支付通道或正式上线已验收**。实际商户操作开关必须单独由经营者审核。
