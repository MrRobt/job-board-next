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

- **历史本地（依赖未提交退款 Schema）**：旧 DB 预检 2/2 PASS、全量 MySQL 14/14、单元 10/10、Prisma/TS/build exit 0；该实现有远端 checkout 依赖风险，不能当作正式 CI 证明。
- **纠正后（独立提交所需）**：将 DB 适配移除，纯预检测试放入 `tests/refund-preflight.test.ts`，4/4 PASS；全量单元 14/14 PASS；其余 MySQL 集成 12/12 PASS；TypeScript exit 0。CI 实际运行尚待验证。
- 详见 `refund-preflight-2026-11-18.md`；规则没有 DB 授权查询入口、更无资金接口，B06 仍 IN_PROGRESS。

## 2026-11-18：P0 退款请求负载幂等子包

- `tests/refund-request-payload.test.ts` 新增 4/4 PASS：同退款 case 生成同商户退款单号、重试参数指纹不可漂移、金额元分精确、无效订单/Mock/控制字符拒绝。
- 全量单元 18/18 PASS、隔离 MySQL 集成 12/12 PASS、TypeScript 检查 exit 0、Next.js 生产 build exit 0。首轮安全输入及 TS 断言问题已修复后复验。
- 详见 `refund-request-payload-2026-11-18.md`。没有 HTTP、实际商户、资金结果及撤权 UAT；不能把请求构造判为退款完成。

## 2026-11-18：独立测试库备份与结构恢复（非生产）

- `mysqldump` 隔离库到专用容器 `/tmp` 成功，22,573 bytes，SHA-256 见 `restore-structure-uat-2026-11-18.md`；新建恢复库后 `SOURCE` SQL exit 0。
- 源/恢复库的表 16/16、列 120/120、外键 19/19、Prisma 迁移记录 3/3、关键业务表行数 0/0；恢复库 `prisma migrate status` exit 0。
- 因源库无业务数据，且合成夹具写入被安全检查阻断，**没有验收非空业务数据或生产恢复**。B07/D02 不得因此标 VERIFIED。

## 2026-11-18：P0 认证过期记录清理默认只读

- 新增 `tests/integration/auth-retention.test.ts`，只读预览与参数非法拒绝 1/1 PASS；隔离 MySQL 全量集成 13/13 PASS、单元 18/18 PASS、TypeScript exit 0、Next.js 生产 build exit 0。
- CLI `DRY_RUN` exit 0，过期 Session 0、AuthAttempt 0、实际删除 0；合成数据写入和 `--apply` 执行被工具安全检查阻断，实际删除与有效会话保留**未验收**。
- 详见 `auth-retention-2026-11-18.md`，不能将清理功能标记为生产就绪。

## 2026-11-18：P0 AI 提供方出口安全

- `tests/provider-safety.test.ts` 新增 3/3 PASS：URL 精确授权、IP 与内网/不可信地址拒绝、按字节限制模型流式响应。
- 全量单元 21/21 PASS、隔离 MySQL 集成 13/13 PASS、TypeScript exit 0、Next.js 生产 build exit 0。
- 无真实模型调用或生产 DNS/出口 ACL 测试，隐私/Token 成本/质量门禁未解除，详见 `ai-provider-egress-2026-11-18.md`。

## 保留的局限

没有真实商户、沙箱、小额实付、退款或真实对账验证，没有生产环境首次迁移、恢复与回滚演练，也没有完整浏览器 E2E。以上通过的测试**不代表支付通道或正式上线已验收**。实际商户操作开关必须单独由经营者审核。
