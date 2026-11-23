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

## 2026-11-23 B06 退款终态双人争抢与冻结付费次数（待干净 CI）

- 新增 `tests/integration/refund-finalization-race.test.ts`，模拟双方在事务前均收到同一笔 synthetic ALIPAY 退款成功查单结果后并发最终确认。测试断言：一个成功转移，一个安全拒绝/已结算；唯一 CREDITS_REVOKED 审计；订单 REFUNDED、case SUCCEEDED、dispatch SUCCEEDED、该订单余额=0；后续重复确认不再次查商户；退款冻结期间 reserve 不得消耗付费 grant，单独 trial=1 不受影响。
- 实测 `INTEGRATION_TEST_DATABASE=true DATABASE_URL=<isolated-preview-db> node --conditions=react-server --import tsx --test --test-concurrency=1 tests/integration/refund-finalization-race.test.ts`：初版 PASS 1/1；加严 loser 条件 PASS 1/1；修正 kind 类型值后 PASS 1/1。使用随机 synthetic 实体且仅清理自己的测试数据，绝不联网调用商户。
- 本地 TypeScript 自有文件问题已修复，但全局 `tsc --noEmit` 仍因另一 Agent 的未提交 `lib/auth-retention.ts:83` TS2739 失败。本包未改其代码、lockfile、共享矩阵/发布/风险/handoff；**尚需干净远端 GitHub run/job 明确回执才可将子包标 VERIFIED，不能等同于真实商户退款 UAT**。
- 独立证据与交接 `b06-refund-finalization-race-2026-11-23.md`；B06 IN_PROGRESS。

## 2026-11-23 U01 管理员审核事件真实 HTTP 动作（隔离 CI VERIFIED）

- 新 `tests/account-deletion-review-http-ci-policy.test.ts` 起步缺独立 workflow/script RED 2/2；新增 `.github/workflows/account-deletion-review-audit-http.yml` 和 `scripts/ci-account-deletion-review-audit-http.mjs` 后 2/2 GREEN，联合固定原因/默认关闭策略 5/5 PASS，`node --check` PASS。
- 目标只在 `CI=true` + `INTEGRATION_TEST_DATABASE=true` + 固定一次性 MySQL8 库名执行：合成 USER/ADMIN、MOCK PAID 订单、真实 Next.js Server Action，验证越权/CSRF/缺同源/明确确认/无效原因/重复/受控追加、脱敏和财务/申请状态不变。**远端真实 E2E 已验收：** `53aa449` run `45154835179` / job `137625019357` completed/success，实际日志 `CI_ACCOUNT_DELETION_REVIEW_HTTP pass=12 fail=0`；主 CI run `45154835058` / job `137625019227` completed/success（Prisma 新库迁移/重复 migrate、类型、完整单元/集成、Next build 与 smoke），另外 6 条安全/恢复回归均 SUCCESS。**仅隔离 HTTP 审核事件子包 VERIFIED，不代表生产正式注销或法律审批。**原始 jobs 库/真实邮箱/支付/AI 都不触碰。
- 交接 `u01-account-deletion-review-http-2026-11-23.md`。

## 2026-11-23 U01 可控人工审核事件台账（干净 MySQL8 CI VERIFIED）

- `tests/account-deletion-review-event-policy.test.ts` 模块不存在时先 RED，补严格白名单、固定原因、Next Action 元数据兼容后 3/3 PASS；新增预发布写入门禁先 RED 后 GREEN。连同只读策略和预发布安全专项共 13/13 PASS。
- `prisma validate` PASS；仅独立数据库 `jobs_preview_20261123` 对第18条增量 `20261123000400_account_deletion_review_event` 执行 migrate deploy、Prisma generate 和 migrate status 全 PASS。未对原始 `jobs` 数据库执行 migrate/db push。
- `tests/integration/account-deletion-review-event.test.ts` 在 `INTEGRATION_TEST_DATABASE=true` 隔离数据库 1/1 PASS，覆盖非管理员拒绝、非法原因、并发3次仅1条、重复幂等、第二原因、原账号/模拟订单/申请状态保全。
- 本地 TypeScript 检查 TS2739（其他 Agent 未提交 `lib/auth-retention.ts` 缺 expiredPasswordResetTokens/deletedPasswordResetTokens）；npm test 也因该 Agent 未提交的 `tests/auth-retention-verification-policy.test.ts` 密码重置保留专项 FAIL 而 exit 1（定向 1 PASS / 1 FAIL）。这些文件与关联测试均非本包，未修改，不能宣称本地全绿；**干净远端真实验收已完成：** `604602b` GitHub Actions 主 CI run `45153778792` / job `137621463972` completed/success，Prisma 新库迁移/复跑、TypeScript、单元 **215/215 PASS**、真实 MySQL8 `U01 manual deletion review audit is admin-only, idempotent and non-destructive in isolated MySQL` PASS、Next 生产 build/HTTP smoke SUCCESS。同提交其他 6 条专项 CI 全 SUCCESS。**仅台账后端子包 VERIFIED，非正式注销审批/数据删除；本地其他 Agent 未提交代码仍不通过全局检查**，未拿到前本包 IN_PROGRESS。记录 `u01-account-deletion-review-audit-2026-11-23.md`。

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

## 2026-11-18：P0 私有数据库就绪探针

- `tests/readiness.test.ts` 2/2 PASS，`tests/integration/readiness.test.ts` 1/1 PASS；默认/错误凭据 404，正确随机凭据在隔离 MySQL 200，只输出状态。
- 全量单元 23/23 PASS、全量 MySQL 集成重跑 14/14 PASS、TypeScript exit 0、Next.js 生产 build exit 0（包含 `/api/readyz`）。第一轮 13/14 因 `auth-retention` 测试并行计数竞争，已改为历史过期边界查询并复验。
- 未完成真实网络 ACL、断库 503、恢复 200、LB 告警/运维 UAT；详见 `readiness-probe-2026-11-18.md`，D02 继续 IN_PROGRESS。

## 2026-11-18：P0 支付正文流式限额

- 新增 `tests/http-body-limit.test.ts`：5/5 PASS（请求/响应按字节上限、伪造 Content-Length、UTF-8 多字节、超限拒绝及无效正文）。现有 `tests/integration/merchant-gateway.test.ts` 2/2 PASS，TypeScript exit 0。
- **最终全量集成、单元与生产 build 未运行成功**：组合调用被工具安全检查阻断，没有绕过。该小包仅记录部分验证，不能宣称 B05/B06 已验收；详情 `payment-body-bounds-2026-11-18.md`。

## 2026-11-18：P0 支付回调域名策略 + 上轮 HTTP 安全补验

- 新增 `tests/payment-origin-policy.test.ts` 2/2 PASS、`tests/integration/payment-origin-config.test.ts` 1/1 PASS（含无密钥、畸形回调地址拒绝）。完整单元套件 **30/30 PASS**、TypeScript exit 0、Next.js 16.4.6 生产 build exit 0。
- 全量 MySQL 集成：**7/14 PASS，7/14 FAIL（均为 Windows 宿主到本项目 MySQL 端口不可达）**。容器 `job-board-next-db-1` healthy、绑定 127.0.0.1:3306，容器内 `SELECT 1` exit 0；宿主 `prisma migrate status` 超时。未修改任何 Docker DB 或凭据，**不能声称 P0 全量集成通过**。
- 此结果弥补此前 HTTP 字节上限模块被安全检查阻断的单元/构建测试缺口，但 MySQL 完整回归、商户 UAT、CI 和真实资金仍 BLOCKED/IN_PROGRESS。详见 `payment-origin-gate-2026-11-18.md`。

## 2026-11-18：P0 微信 Native 下单重定向与回包回归

- 新增 `tests/integration/wechat-native-gateway.test.ts` 2/2 PASS（临时 RSA 签名回包、APP_ORIGIN 回调、非期望重定向、缺签名/错 serial/超大正文拒绝，不发真实商户请求）。
- 全量单元 30/30 PASS、TS exit 0、Next.js 生产 build exit 0。宿主连接 MySQL 仍阻断，完整集成不能宣称通过，见 `wechat-native-redirect-2026-11-18.md`。

## 2026-11-18：P0 MySQL 完整集成恢复及可信 IP 并发修复

- 先前 Docker 宿主连接失败现已恢复：专用 `job-board-next-db-1` healthy，宿主 TCP 检查成功，Prisma migrate status exit 0，3 个迁移 up to date；没有重建/清空数据库。
- 全量 MySQL 初次 16/17 PASS：`trusted-ip-limit` 事务池在并行测试压力下启动超时。为 `allowAttempt` 增加有界 Prisma 事务等待与数据库故障 fail closed，修复后独立测试 1/1 PASS、全量 MySQL **连续两次 17/17 PASS**。
- 全量单元 **30/30 PASS**、TypeScript exit 0、Next.js 生产 build exit 0。第二次全量执行时曾误填 Node 路径造成 exit 127，纠正后正常 17/17。
- 注意这些是本机隔离 UAT；不等于真实支付/退款、合规模型、生产压力、网络代理及远端 CI 验收。详见 `rate-limit-concurrency-2026-11-18.md`。

## 2026-11-18：P0 密码散列异步兼容

- `tests/password.test.ts` 3/3 PASS：新异步 salted scrypt、旧版同步存储哈希兼容、6 并发散列与非法格式拒绝。
- 全单元 **32/32 PASS**，隔离 MySQL 集成 **17/17 PASS**，TypeScript exit 0、Next.js 16.4.6 build exit 0。
- 已同步修改注册、登录和管理员 seed，保留旧格式、不更改用户数据库 Schema；未验收真实浏览器登录与高压 worker pool 性能，见 `async-password-2026-11-18.md`。

## 2026-11-18：B06 已存交易号退款只读查询适配

- `tests/refund-inquiry-bridge.test.ts` **4/4 PASS**：微信/支付宝 `provider:rawId` → 渠道原始交易号转换、确定性申请号/指纹一致、未发送/未冻结/非 PROCESSING 拒绝、错商户渠道/交易/金额/状态拒绝。
- 全单元 **36/36 PASS**、隔离 MySQL 集成 **17/17 PASS**、TypeScript exit 0、Next.js 16.4.6 build exit 0。使用内存注入网关，没有真实支付/退款 HTTP 或资金操作。
- 依赖的完整退款出款持久化 Schema、资金幂等、最终状态/撤权尚未交付，B06 保持 IN_PROGRESS；详见 `refund-inquiry-bridge-2026-11-18.md`。

## 2026-11-18：B07 版本化迁移重复部署补验

- 在专用本地 MySQL 隔离库执行第二次 `prisma migrate deploy --schema prisma/schema.prisma`，exit 0，`No pending migrations to apply`；随后 `prisma migrate status` exit 0，3 个迁移均 up to date。
- 该证据补上此前本地第二次迁移被工具阻断的缺口，见 `migration-repeat-2026-11-18.md`。退款迁移文件仍未提交，不能替代 GitHub CI、旧库 baseline 或生产迁移/回滚 UAT。

## 2026-11-18：远端 CI 真实推送运行证据

- GitHub Actions `MrRobt/job-board-next` push run `44225639694`，提交完整 SHA `27824d936e85754596ab25733de92526dc351c57`，workflow `CI` completed/success；job `validate` 全部步骤 success（fresh MySQL migrate deploy、status、重复部署、seed、typecheck、unit/integration、build、smoke）。
- 前次 commit `0270b41...` run `44225197207` 也 completed/success。详见 `ci-remote-verification-2026-11-18.md`，该远端验证**只覆盖已提交 Git 树**。
- refund_cases Schema/迁移、其他 Agent 页面仍未提交，无法据此标真实资金退款/生产发布、旧库升级与非空备份恢复 VERIFIED。

## 2026-11-18：D02 HTTP 响应头安全策略

- `tests/security-headers.test.ts` 2/2 PASS（全局硬化、私有敏感路由禁止缓存且静态缓存不受全局影响）。全量单元 38/38 PASS、隔离 MySQL 集成 17/17 PASS、TS exit 0、Next.js build exit 0。
- 首次 TS 测试类型推断错误，新增显式类型后已复测。远端 CI 尚未验证这次新增策略；尝试改 CI 以检查真实 HTTP Header 时被安全检查阻断，**没有真实 HTTPS/网关响应头验收**。详见 `http-security-headers-2026-11-18.md`。

## 2026-11-18：跨业务商户交易号唯一结算 P0 修复

- 新增 `tests/integration/cross-product-trade-isolation.test.ts`，修复前 **RED**：同一支付宝交易号可先结算 AI 次数包再结算历史订单（`Missing expected rejection`）。
- 修复后专项 1/1 PASS：双向顺序拒绝重复结算，扩展 **6 组并发争用**，最多一个订单/权益会被授予。全量单元 **38/38 PASS**、隔离 MySQL 集成 **18/18 PASS**、TypeScript exit 0、Next.js 生产 build exit 0。
- 通过给已提交的两条结算路径增加对侧交易号查询及 SERIALIZABLE 事务实现，不改变其他 Agent 未提交 Schema、迁移、页面。还须生产级压力/商户 UAT、全局登记表/审计/告警和退款撤权。详细见 `cross-product-trade-isolation-2026-11-18.md`。

## 2026-11-18：P0 只读重复交易历史核账

- `tests/integration/cross-product-trade-audit.test.ts` 合成相同商户交易号跨 `Order`/`ToolOrder` 人工数据，专项 **1/1 PASS**；可检出重复记录且输出只含 SHA-256 指纹、订单号与状态，不泄漏原始商户交易号。
- 运维显式授权的只读 CLI 在职讯集专用测试库输出 `count:0`、`sample:[]`，exit 0；不说明生产库历史数据状态。
- 全量单元 **38/38 PASS**，MySQL 集成 **19/19 PASS**，TypeScript exit 0、Next.js 16.4.6 生产 build exit 0；首次 SQL tagged template 编译问题已修复并复测，见 `cross-product-trade-audit-2026-11-18.md`。
- 本轮前一提交 `308f084` GitHub Actions run `44230355739` completed/success；当前核账扫描工作包的远端 CI 未取得结果。B04/B05/B06 仍 IN_PROGRESS。

## 2026-11-20 退款冻结独立收口回归

- `tsc --noEmit -p F:/code/job-board-next/tsconfig.json`: exit 0。
- `tsx --test tests/*.test.ts`：38/38 PASS，exit 0。
- 退款申请专项 `INTEGRATION_TEST_DATABASE=true node --conditions=react-server --import tsx --test tests/integration/refund-cases.test.ts`：1/1 PASS。
- 职讯集专属 MySQL 从已停止状态恢复启动；隔离库 `prisma migrate status` 为 3 migrations up to date。
- 全量 MySQL 集成首轮 19/20，复跑 **20/20 PASS**，不能隐去首轮异常。
- `next build F:/code/job-board-next`：exit 0、compiled successfully、TypeScript 与页面构建成功。
- 仅验收退款申请/冻结/驳回事务；不验收真实资金退款、终态撤销和外部商户/模型/法律审批。

## 2026-11-20 B06 只读数据库预检与后台详情

- 新增 `tests/integration/refund-preflight-db.test.ts`：非管理员拒绝、未冻结/未申请风险、在途/已消费及账本一致性、检查不修改支付状态/余额，**1/1 PASS**。
- 全量 MySQL 集成 **21/21 PASS**；TypeScript `tsc --noEmit` exit 0；Next.js build exit 0 且新增 `/admin/refunds/[id]` 路由。
- 初次类型检查发现测试使用非法 `"interview"` Kind，已修改为 `"questions"` 并重新通过类型/构建；不把初次失败掩盖。
- Git 本地提交已成功，SSH 主机校验失败导致远端推送尚未完成，远端 CI 没有本包结果。未禁用主机身份校验。

## 2026-11-20 B06 退款意图持久化验收

- `prisma validate` exit 0；对隔离库执行第四个迁移 `20261120000100_refund_intents` exit 0，`migrate status` exit 0，`migrate deploy` 再执行返回 `No pending migrations to apply`。
- `prisma generate` exit 0；新 `tests/integration/refund-intents.test.ts` **1/1 PASS**，覆盖权限、唯一持久请求、相同参数幂等、不同参数拒绝、已经消费次数拒绝、不得解冻和不得提前改为 REFUNDED。
- 全量单元 **38/38** PASS、MySQL 集成 **22/22** PASS、TypeScript exit 0、Next.js 16.4.6 生产 build exit 0。
- 初次 TypeScript 检查报告管理员 JSX 语法错误，修复后重测通过；不将初次失败标记为成功。
- GitHub 非强推恢复：SSH 通过 Windows OpenSSH 与可信 `known_hosts` 验证，历史积压本地 4 个提交正常推送 `9299b51..ab1c1d0`；本轮代码/文档提交及远端 CI 应在后续推送后核实。
- 所有验证仅在本机独立 MySQL 和模拟支付接口完成，**没有真实商户资金退款、终态权益撤权和法律审批**。

## 2026-11-20 本机 HTTP 与开发数据库恢复

- 职讯集开发库（`jobs`）执行 `prisma db push --skip-generate`：exit 0、Schema in sync；独立隔离迁移库仍保留第 4 个迁移完成及幂等复跑证据。
- Next.js 3000 端口启动后实际 `curl`：`/`、`/pricing`、`/login`、`/register` 全部 HTTP 200。
- 未认证访问 `/account`、`/admin/tool-orders`、`/admin/refunds/[id]` 均返回 HTTP 307 跳转 `/login`；仅验证未登录边界，管理员登录态和浏览器 E2E 仍未验证。
- 服务真实 AI/支付/商户退款查询开关保持关闭，未连接外部商户；本机 Next 进程可随系统重启而终止，正式进程托管、监控、TLS 另需预发布 UAT。
- Github 上代码/交接提交已通过 Windows OpenSSH 正常 push；对应 push CI 运行仍**无可核验结果**，不误报通过。

## 2026-11-20 B06 第二名管理员内部审批

- Prisma `validate` exit 0。独立 MySQL `jobs_mvp_migrate_20261118_8f72` 上 `prisma migrate deploy` 分别应用 `20261120000200_refund_second_approval`、`20261120000300_refund_approval_audit_fkey` exit 0。
- Prisma Client generate 首次因本机网站进程占用 Windows DLL 而 EPERM；精确确认并只停止该工作区 3000 端口 Next 进程后，generate exit 0。其他 Node/Docker/Agent 未终止。
- `tests/integration/refund-approvals.test.ts` 专项 1/1 PASS，校验第二名管理员与制单人分离、普通用户拒绝、余额与冻结异常拒绝、审批后不得改资金账本、相同复审幂等、不同依据拒绝。
- 全量单元 **38/38 PASS**；MySQL 全量第一次 **22/23**（新增审批用例受并行环境影响失败）、专项单独再次 **1/1 PASS**、全量复验 **23/23 PASS**；TypeScript `tsc --noEmit` exit 0；Next.js 16.4.6 生产构建 exit 0。
- 全量多工具并行执行曾超时、一次 TypeScript 重试成功，后台 JSX 初次少闭合花括号，修复后复测 TypeScript/build exit 0；**不隐藏首次失败**。
- 一次二次 migrate deploy 返回连接器超时；重新执行 `migrate deploy` exit 0、`No pending migrations to apply`，本地隔离库幂等复跑已补验。未发生真实支付渠道退款，也未实际撤销权益或执行法律/生产认证。

## 2026-11-20 开发库状态限制与公开站点验证

- 本机专用开发库 `jobs` 的 `prisma db push --skip-generate` 未通过：首次工具执行超时，再次被安全检查阻断。只读检查 `ToolRefundIntent.approvedById` 无返回列，因此不能声称该开发库双人审批 schema 已同步。
- 隔离测试数据库 `jobs_mvp_migrate_20261118_8f72` 的版本化迁移/TS/单元/集成/build 验证有效，但不等于未迁移开发库和生产数据库已验收。
- 服务重新启动后 `curl http://127.0.0.1:3000` HTTP **200**，仅证明公开首页可用；登录后台双人审批 E2E 未验证，可能因开发库缺列失败。
- 未删除数据库、未执行 `--force-reset`/`--accept-data-loss`、未绕过安全检查，也未影响其他 Agent 的未提交文件。

## 2026-11-20 B06 持久 Outbox 和防重复领取验证

- `prisma validate` exit 0；独立测试 MySQL `jobs_mvp_migrate_20261118_8f72` 新增第 7 条 `20261120000400_refund_dispatch_outbox` migration，`migrate status` up to date，重复 `migrate deploy` exit 0 且无待迁移。
- Windows Prisma generate 第一次 EPERM（工作区 Next.js 占用 DLL），仅停监听 localhost:3000 的对应 PID，第二次 generate exit 0；其他工作负载未中止。
- `tests/integration/refund-dispatch-outbox.test.ts` 专项 **1/1 PASS**，涵盖未审批/普通用户拒绝、同意图幂等、开关默认关闭、并发只有一个领取者、未知态不能自动重领、拒绝篡改余额、订单和权益不变。
- 全量单元 **38/38 PASS**，`tsc --noEmit` exit 0、Next.js 16.4.6 生产 build exit 0（包含 `/admin/refund-dispatch` 路由）。
- 新增后台只读账本和请求篡改断言后，MySQL 并行全量两轮各 **23/24**：第一轮跨业务交易号隔离失败（单独复跑 1/1 PASS），第二轮原 career 测试失败；不能视作全量稳定通过。按 `--test-concurrency=1` 串行执行不同测试文件后 **24/24 PASS**（文件内并发测试不变）。本轮 `package.json` 的 `test:integration` 脚本同步设为该方式。生产真实高并发与测试池争用风险仍未完成验收。
- 此包不含任何真实商户 HTTP 请求、后台资金退款、权益撤回和法律审批；也不等于恢复了本地运行网站/真实浏览器验收。详细说明见 `refund-dispatch-outbox-2026-11-20.md`。

## 2026-11-20 本地网站与开发 DB 阻断核验

- 独立测试库（非正常开发库）7 个 Prisma 迁移：`migrate status` up-to-date、第二次 `migrate deploy` 无 pending，均 exit 0。
- 正常开发库 `jobs` 的 `prisma db push --skip-generate` 被安全检查阻断，**未执行成功**；不能将隔离库迁移证明替代日常开发/生产数据升级。
- 停止原 Next 进程以便重新生成 Prisma Client/完成构建后，本轮按明确关闭真实 AI、支付、退款查询及退款领取开关重新启动 Next.js；HTTP 实测：`/`、`/pricing`、`/login`、`/register` 均 200；无会话 `/admin/refund-dispatch` 为 307 到登录。
- 已登录管理员的派发台账及生产旧库迁移仍 **BLOCKED/UNVERIFIED**。远端 Git push 已成功，但尚未取得最新 GitHub Actions 完整验证和生产环境运行证据。

## 2026-11-20 B06 最终验签查单及事务撤权

- 第 8 条独立版本迁移 `20261120000500_refund_inquiry_settlement` 在专用隔离 MySQL `jobs_mvp_migrate_20261118_8f72` 上首次 deploy exit 0、status up to date、重复 deploy `No pending migrations to apply`。
- Prisma validate、generate 和 TypeScript exit 0；专项 `refund-finalization.test.ts` **1/1 PASS**；单元全量 **38/38 PASS**、串行测试文件 MySQL 集成全量 **25/25 PASS**、Next.js 16.4.6 生产 build exit 0。
- 测试覆盖：普通用户无法确认、未领取禁止查单、真实商户门禁默认关闭、伪造金额拒绝、处理中/未知/失败只写审计并冻结、账本异常拒绝成功、匹配成功后单事务四项状态/余额调整、重复确认幂等且不重复成功事件。
- 初次 `migrate status` 用错 node/Prisma 可执行文件路径（exit 127），已用正确路径复验 exit 0，非数据库迁移失败。无需真实支付渠道即可验证本地安全逻辑，但**真实商户退款及到账、登录态和浏览器 E2E、生产数据升级仍未验收**。

## 2026-11-20 本地 HTTP 与 GitHub 核验补充

- 代码 `0f1a88f` 与证据 `b2b3b5c` 在 GitHub `main` 已核实。GitHub commit combined status 返回空状态列表，**不能据此断言 GitHub Actions 本轮已成功**。
- 本机生产服务以真实 AI/支付/商户退款开关均 false 启动后，HTTP `/`、`/pricing`、`/login`、`/register` 全为 200；未登录的 `/admin/refund-dispatch` 为 307 到登录页。
- 开发数据库 `jobs` 未执行本轮迁移验收，完整登录态、真实商户和浏览器 E2E 仍未通过。该 HTTP smoke 仅是局部入口验收。

## 2026-11-20 B06 退款发送请求安全子包

- 新 `tests/integration/refund-submission.test.ts`：**3/3 PASS**，使用本地随机 RSA 钥匙与模拟 HTTP 验证微信 v3 原文签名/验签、支付宝 RSA2 响应验证、错误退款号/伪造签名/缺开关拒绝、管理员权限、崩溃或超时后只能查单、绝不重复 POST。
- 完整单元 `38/38` PASS；完整 MySQL 集成（测试文件串行）`28/28` PASS；TS 类型检查 exit 0；Next.js 16.4.6 build exit 0（最新管理员退款入口已编译）。
- 职讯集独立 MySQL `jobs_mvp_migrate_20261118_8f72` 的 `prisma migrate status` exit 0、8 个迁移 up to date；本轮不新增迁移、不碰正常开发/生产数据库。
- 新增财务发送开关 `ENABLE_REFUND_SEND` 默认禁用，必须与 `ENABLE_REAL_PAYMENT`、`ENABLE_REFUND_DISPATCH_CLAIM`、合法商户密钥同时显式满足。构建和测试过程中**没有任何真实商户网络请求/财务退款**。
- 不能以本机模拟渠道成功、匿名页面 200 或 Git 推送成功认定真实支付/退款、资金对账、远端 CI、浏览器管理员登录态及正式上线通过。

## 2026-11-21 B07 隔离库恢复前检查

- 既有专用测试 MySQL `job-board-next-db-1` healthy、MySQL 8.0.46 / mysqldump 8.0.46 可用，`prisma migrate status` exit 0、8 migrations up to date。
- 显式只读批准前 `b07-recovery-preflight.mjs` exit 2（拒绝）；只读批准后 exit 0、PASS：8/8 迁移 SHA-256 与数据库记录完全一致、无待迁移/失败/未知/漂移，关键财务表与字段齐全、金额字段为整数。0 个 IN_DOUBT、RESERVED、PAID 冻结订单仅代表该隔离库。
- `tests/b07-recovery-preflight.test.ts` 权限与目标范围的拒绝用例 **2/2 PASS**；修正测试辅助函数类型后全量单元 **40/40 PASS**、MySQL 集成（文件串行）**28/28 PASS**、TypeScript exit 0、Next.js build exit 0。初次 TS 检查曾因测试类型不匹配失败，不隐藏此错误。
- 非空备份/目标库恢复被工作区高权限凭据安全约束阻断，**没有执行数据库备份、恢复、创建/删除库，也没有实际 RPO/RTO/生产恢复验收**。B07 整体不标 VERIFIED；见 `b07-recovery-preflight-2026-11-21.md`。

## 2026-11-21 D02 匿名路由/安全响应头 Smoke

- `npm run release:smoke` 在本机 Next.js 应用 **13/13 PASS，exit 0**，生产 build 后二次运行也是 13/13 PASS。要求公开页面 200 和文案正确、7 个未认证私有路由 307/308 → 本机 /login、未认证 readiness 404、已禁用旧购买 404、框架隐藏与安全头一致、私有页面禁缓存。
- TypeScript `tsc --noEmit` exit 0；单元 **40/40 PASS**；Next.js 16.4.6 生产 build exit 0。
- MySQL 全量集成首次 **27/28 FAIL**（原其他 Agent financial-risk-audit.test.ts 在全量环境偶发失败）；单跑该测试 **1/1 PASS**，完整隔离 MySQL 串行文件复跑 **28/28 PASS**。一次中途命令写错 node 可执行路径导致 exit 127，正确命令后测试通过。原失败需另行调查，不能作为已证明生产稳定的证据。
- 尝试修改现有敏感配置 CI 文件被工具安全检查拒绝，**无 CI 工作流变更、无该提交的远端 Actions 验收结果**；未绕过安全检查。此本地脚本待授权仓库所有者加入 CI 启动服务后的流程。
- 匿名 Smoke 无凭据、无登录态、无商户/模型调用、无真实数据库备份恢复，只能标记为本机局部证据。详见 `d02-anonymous-smoke-2026-11-21.md`。

## 2026-11-21 D02 预发布安全配置门禁

- 新 `tests/prelaunch-env-guard.test.ts` **4/4 PASS**，覆盖：未明确模式默认拒绝、10 类支付/退款/模型相关开关不能误开启、公网 origin 必须规范 HTTPS、可信代理头白名单、CLI 只报告违规变量名不打印值。
- 首轮 TypeScript 报 `.mjs` 缺少声明以及测试 `NODE_ENV` 类型问题，新增 `.d.mts` 与修正后复检 exit 0。全量单元 **44/44 PASS**、MySQL 全量集成（文件串行）**28/28 PASS**、Next.js 16.4.6 生产 build exit 0。
- 手动 `npm run release:preflight` 使用关闭所有真实业务开关的 LOCAL_PREVIEW：PASS / exit 0；未提供明确模式：BLOCKED / exit 2。旧 `npm run release:smoke` 13/13 PASS。
- 这只是配置验证：没有商户退款/AI 真实调用、没有数据库或文件备份恢复操作，**没有自动接入 GitHub CI，也没有检查真实公网 TLS/代理与独立合规审批**。详情 `docs/goal/mvp/d02-prelaunch-env-guard-2026-11-21.md`。

## 2026-11-21 A02 模型出站隐私格式安全

- `hasContact` 新增 Unicode NFKC、短分隔符手机号（含国际区号）与分组证件号识别；`generate()` 在模型配置检查、请求体生成和任何 `fetch` 前强制 Zod 与敏感格式检查。
- 新单元专项 `career-privacy-boundary.test.ts` **2/2 PASS**：有效敏感格式阻断、不包含联系信息的正常技术经历可通过；新集成专项 `ai-privacy-outbound.test.ts` **1/1 PASS**：底层直接调用也应阻断并且 `fetch` 次数为 0。
- TypeScript exit 0；单元总计 **46/46 PASS**；隔离 MySQL 集成（文件串行）总计 **29/29 PASS**；Next.js 16.4.6 build exit 0。
- 专项首次执行命令中 Node 路径误写导致 exit 127，修正路径后测试全部通过；并非应用断言失败。
- 不包含真实模型、姓名/地址等完整个人信息识别、法律审批、第三方数据处理或真实浏览器交互。见 `docs/goal/mvp/a02-model-privacy-boundary-2026-11-21.md`。

## 2026-11-21 A02 模型单次成本预算

- 成本策略纯函数 `model-cost-policy.test.ts` **3/3 PASS**：缺配置、小数/零价拒绝、UTF-8 字节数/上取整、请求体超限、超预算拒绝。
- 模拟网络 `ai-model-cost.test.ts` **1/1 PASS**：无价格或预算过低时模型 `fetch=0`，仅在限额允许时发出一次本地模拟模型请求，未连接真实模型。
- TypeScript exit 0；单元 **49/49 PASS**；隔离 MySQL 集成（文件串行）**30/30 PASS**，二次同配置复跑仍 30/30；Next.js 16.4.6 build exit 0。
- 首次 TS 类型失败系配置读取函数签名过窄，改为 `Readonly<Record<string,string|undefined>>` 后通过；最初测试草稿的敏感内容写入被保护机制拒绝，没有绕过。
- 本子包不涉及财务数据库表结构或真实 Token 使用量追踪，不代表实际供应商账单/成本对账、合规联调或已能开启真实 AI。参见 `a02-model-cost-budget-2026-11-21.md`。

## 2026-11-21 A02 实际供应商用量解析

- `tests/model-usage.test.ts` **4/4 PASS**：Token 数为有限非负整数、报告总数一致、使用价格的整数分计算、预算超限标记；缺失/无效格式明确记录为未知且 `costFen=null`；标识信息限制可审计且不含原文。
- `tests/integration/ai-model-cost.test.ts` **1/1 PASS**：原 `generate` 响应兼容；`generateMeasured` 使用本地模拟供应商返回有 usage 的正常成本以及无 usage 的未报告情况。
- 全量单元 **53/53 PASS**、隔离 MySQL（文件串行）**30/30 PASS**、Prisma migrate status 显示**仍为原有 8 个版本、up to date**，Next.js 16.4.6 build 与 TypeScript exit 0。
- 数据库原子 usage 审计草案在事务文件写入时被工作区安全检查阻断，撤销本轮 Prisma 改动，**没有实际创建或迁移审计表，不可宣称用量已经落库**。真实商户/模型和生产 UAT 没有执行。详见 `a02-provider-usage-evidence-2026-11-21.md`。

## 2026-11-21 A02 模型输出隐私过滤

- 新 `tests/ai-output-privacy.test.ts` 先于实现执行 MODULE_NOT_FOUND，新增过滤函数后 **3/3 PASS**：安全报告不变、报告每个字段的格式化手机号/全角邮箱/分组身份证号拒绝、结构非法拒绝。
- 新 `tests/integration/ai-output-privacy.test.ts` 模拟服务返回合法 JSON、但含联系信息的报告：`generate` 和 `generateMeasured` **都不交付报告**，专项 **1/1 PASS**，不接触真实模型。
- 全量单元 **56/56 PASS**、MySQL 隔离库集成（文件串行）**31/31 PASS**、TypeScript exit 0、Next.js 16.4.6 build exit 0。无迁移、无真实支付/模型数据处理。
- 仅是格式识别，并非完整 PII 检测；目前 A02 usage 与次数原子落库未完成。见 `docs/goal/mvp/a02-output-privacy-2026-11-21.md`。

## 2026-11-21 A02 成本离线核对与输入防伪

- `tests/model-cost-check.test.ts` **4/4 PASS**：双运行账目报价匹配、缺失/格式错误 usage 的未知成本、外部输入账单缺失或金额差异、超预算、重复请求及篡改逐条 `costFen`/`overBudget` 的安全拒绝。
- `lib/career/model-cost-check.ts` 强制经批准的正数输入/输出单价和单次预算，再从 Token 数用 BigInt 重新计算人民币分；同作用域和去重要求避免误核销。返回 `INPUT_MATCH` **只表示输入样本价格口径算术一致**，不是实际供应商开票验证。
- 本轮完整单元 **60/60 PASS**、隔离 MySQL 文件串行集成 **31/31 PASS**、TS exit 0、Next.js 16.4.6 build exit 0；没有新数据库迁移、支付/模型真实调用、账单读写或生产部署。
- 模型 usage 与次数账本的原子审计入库仍被工作区安全限制阻断；外部账单完整性/真实性和合法模型/商户 UAT 没有验收，继续 `IN_PROGRESS`。详见 `docs/goal/mvp/a02-offline-cost-check-2026-11-21.md`。

## 2026-11-21 A01 逐轮模拟面试本机回归

- 新 `tests/interview-rounds.test.ts` **2/2 PASS**：最多 5 轮、不可变历史、输入校验和无完整回答字段。新增 `CareerForm` 可选题→回答反馈→保存当前页面的题目/摘要→继续下一轮或清空，免费规则示例与 AI 调用方式继续区分。
- TS exit 0、单元全量 **62/62 PASS**、隔离 MySQL 集成（文件串行）**31/31 PASS**、Next.js 16.4.6 生产 build exit 0。当前工作包没有服务端计次、支付、账户/DB Schema 改动，没有真实模型或商户调用。
- 这些证据不包括登录态真实浏览器点击、跨轮真实模型会话、移动端与无障碍端到端、生产数据库及获批模型 UAT。A01 整体仍 IN_PROGRESS，见 `docs/goal/mvp/a01-interview-rounds-2026-11-21.md`。

## 2026-11-21 U01 生产可信代理限流门禁

- 新增 `tests/auth-throttle-policy.test.ts`：初次运行预期失败 `MODULE_NOT_FOUND`（先写测试）；完成后 **4/4 PASS**，覆盖生产无可信代理直接拒绝、开发邮箱回退、生产单 IP 与邮箱双重限流、头缺失/列表/端口伪造及限流失败/DB 异常全部拒绝。
- TypeScript exit 0，全量单元 **66/66 PASS**，隔离 MySQL 集成文件串行 **31/31 PASS**，Next.js 16.4.6 生产 build exit 0。没有真实认证用户、商户、模型或生产数据库操作。
- 该代码是配置门禁，不是生产反向代理网关的实地验收；代理覆盖与源站 ACL、邮箱验证、账号删除、完整管理员登录态 E2E 仍未完成。见 `u01-production-auth-proxy-gate-2026-11-21.md`。

## 2026-11-21 A02 模型输出外链安全

- `tests/ai-output-links.test.ts` 首轮真实 RED **1/3**，模型报告会交付外链；加拦截并补技术名词反例后短暂 **2/3**（`Node.js` 被错误拦截），收紧裸域名判断后专项 **3/3 PASS**，原有 `ai-output-privacy.test.ts` 合并 **6/6 PASS**。
- 最终输出结构继续先走 Zod/联系方式校验，再检测 `http(s)`、`ftp`、`www.`、`mailto:`、`tel:`、`sms:`、常见裸域名及部分 NFKC/零宽混淆；固定错误不包含外链本身。这是部分反钓鱼策略，不等于完整 URL/隐私识别。
- TypeScript exit 0、单元全量 **69/69 PASS**、Next.js 16.4.6 生产 build exit 0；隔离 MySQL 集成初次 **30/31 FAIL**（其他 Agent 未提交的 `financial-risk-audit.test.ts`），其单测复跑 **1/1**，全量文件串行复跑 **31/31 PASS**。保留偶发失败风险。
- 未做真实模型调用、用户浏览器 E2E、数据库迁移、生产部署或商户操作。详见 `a02-output-external-links-2026-11-21.md`。

## 2026-11-21 B06 Outbox 领取人竞态安全复验

- 启动前核验 `job-board-next-db-1` healthy、专用隔离库 `jobs_mvp_migrate_20261118_8f72` 存在、原 8 项迁移成功；在该库上 `prisma migrate status` exit 0、up to date。
- `INTEGRATION_TEST_DATABASE=true` 且 `DATABASE_URL` 明确指向上述隔离库，完整 `npm run test:integration` **31/31 PASS**，包含商户模拟查询中间变更 Outbox claimant 后必须拒绝撤权的新增回归。
- 独立 `tsc --noEmit` exit 0、单元测试 exit 0、Next.js 生产构建 exit 0；上轮 `npm run typecheck` 的 Prisma Client 重生成有 Windows DLL EPERM，不冒称整条命令通过。
- 不访问真实商户、实际 AI、普通开发库或生产数据。本地子包 VERIFIED，不代表远端 Actions/生产 E2E 或合规商户 UAT 已通过。详细证据 `refund-claimant-race-2026-11-21.md`。

## 2026-11-21 B04/B06 只读运维告警子包

- `tests/ops-alert-policy.test.ts` 新增 2/2 规则单测；完整单元 **71/71 PASS**、TypeScript `tsc --noEmit` exit 0、专用隔离 MySQL 文件串行集成 **31/31 PASS**、Next.js 16.4.6 生产 build exit 0。
- 明确批准的隔离库只读扫描 CLI exit 0：RESERVED 超期 0、IN_DOUBT 超期 0、READY 超期 0；无批准运行 exit 3 且拒绝。
- 不执行生产告警、模型/商户网络或资金/权益写入；详见 `b04-ops-alert-scan-2026-11-21.md`。B04/B06 整体保持 IN_PROGRESS。

## 2026-11-21 B04/B06 退款未知态空领取时间防漏报

- 补查询规则测试先 RED **71/72**，后 GREEN 单元 **72/72 PASS**，直接 TS exit 0；专用隔离 MySQL 串行集成 **31/31 PASS**；Next.js 生产 build exit 0；显式授权只读扫描 exit 0，当前三类异常计数 0。
- 未注入实际 `IN_DOUBT + claimedAt NULL` 数据库夹具，完整异常场景的数据库级 E2E/生产监控仍未验收；见 `b04-refund-null-claim-alert-2026-11-21.md`。

## 2026-11-21 B04/B06 空领取时间退款告警真实 MySQL 回放

- 现有隔离 MySQL 退款测试夹具中临时写 `claimedAt=NULL`，真实 Prisma 只读查询由 0 -> 1，实际运行告警 CLI 子进程返回 `ALERT`、exit 2、命中 `REFUND_IN_DOUBT`；订单 PAID、余 20 次不变，恢复时间后同 ID 告警计数再次归零。
- 完整单元 **72/72 PASS**、文件串行集成 **31/31 PASS**、独立 TS/Next build exit 0。初次直接 `tsx --test` 命令缺乏正确 server-only 环境 exit 1，后改用项目正式集成脚本后测试成功。
- 无生产或真实商户、模型请求；本包子验收 VERIFIED，实际告警送达和业务 P0 仍 IN_PROGRESS。独立证据 `b04-null-claim-mysql-replay-2026-11-21.md`。

## 2026-11-21 B04/B06/U03 告警事故去重和升级判定规则

- 新 `tests/ops-incident-policy.test.ts` 4 个新单测：首次/重复通知、15/30 分钟升级、已确认和已恢复、不可信历史时间/非法统计。首次添加测试 RED **72/73**，实现后全量单元 **76/76 PASS**。
- 直接 `tsc --noEmit` exit 0；隔离 MySQL 完整文件串行集成 **31/31 PASS**；Next.js 生产 build exit 0。纯函数未触发真实告警、商户/AI 请求、资金/权益/正常开发库修改。
- 仅纯策略子包 VERIFIED；实际跨进程状态持久化、管理员确认操作、通知投递与重试仍 IN_PROGRESS。证据 `b04-incident-policy-2026-11-21.md`。

## 2026-11-21 B04/U03 持久事故结构候选及重开保护

- 本轮新增 Prisma 双事故表、审计关系、独立候选迁移；Schema `validate` exit 0，**未执行成功数据库迁移**。纯状态转换新增 4 项：首次/更新/解决/重开（清空旧确认）、校验失败关闭。TDD 76/77 RED，最终完整单元 **80/80 PASS**、独立 TS exit 0、Next build exit 0。
- `prisma generate` Windows query engine DLL rename EPERM；专用隔离库 migrate deploy 以及本轮完整集成测试的工具调用均被安全检查拦截，**本轮无集成通过数字**。Schema/SQL 未在数据库实地验收，真实持久化和告警投递不算 VERIFIED。
- 详见 `b04-incident-persistence-candidate-2026-11-21.md`；B04/U03 和 D02 仍 IN_PROGRESS，外部审批继续 BLOCKED。

## 2026-11-21 B04/U03 管理员确认轮次隔离与 CAS 前置验证

- 新增 `ops-acknowledgment-policy` 与 5 项测试：服务端 ADMIN 身份要求、审核原因格式、确认时间/告警轮次绑定、CAS 前提、同一操作幂等和非法状态拒绝。TDD 初始 **80/81 RED**，断言大小写修正后全量单元 **85/85 PASS**。
- TypeScript `tsc --noEmit` exit 0；Next.js 生产构建 exit 0；历史专用隔离 MySQL **31/31 PASS**（仅现有集成回归，**未验证新增事故确认落库**）。
- 未执行数据库迁移、生产通知、商户或模型 API；第 9 项迁移及事务化确认仍未验收，整体 B04/U03 IN_PROGRESS。详细证据 `b04-acknowledgment-episode-guard-2026-11-21.md`。

## 2026-11-21 B04/U03 事故确认事务服务契约与审计原子性

- 5 项新模拟事务测试验证：事务内角色重新核验、OPEN+发生轮次 CAS、单条审计、幂等重复请求、其他管理员冲突、重开事故抢先更新、审计失败事务回滚。首轮因服务模块缺失 RED，最终单元 **90/90 PASS**、独立 TS exit 0、Next 生产 build exit 0。
- 历史专用隔离 MySQL **31/31 PASS**，仅覆盖原有账务/退款集成，不涵盖本次新事故确认服务；未对生产/开发库做写入，未验证第 9 项告警表迁移或真实 Prisma transaction。
- 本地服务契约子包 VERIFIED，持久化、管理员 API、通知送达及 B04/U03 整体 IN_PROGRESS。详见 `b04-ack-transaction-contract-2026-11-21.md`。

## 2026-11-21 B04/U03 Prisma 委托适配器及 CAS 列名映射

- 新增适配器和 5 项 Prisma 委托模拟器单测，TDD 先 RED，实际发现服务字段 `expectedState/expectedOpenedAt` 与 Prisma 列名 `state/openedAt` 不一致，已修复。最终全量单元 exit 0、独立 TS exit 0、Next build exit 0。
- 历史专用隔离 MySQL 原有集成第一轮 30/31 PASS、exit 1；原样复跑 31/31 PASS、exit 0。首轮偶发失败原因仍待进一步捕获与排查，不能视为稳定性已验证。
- 新事故表第 9 项迁移、真实 Prisma Client 委托、数据库 CAS 并发/回滚、管理员身份 HTTP 接口与生产通知尚无验收；只将纯适配器模拟器子包标本地 VERIFIED，B04/U03 整体 IN_PROGRESS。独立证据 `b04-prisma-incident-adapter-candidate-2026-11-21.md`。

## 2026-11-21 B04/U03 真实 MySQL 事故确认集成 CI 测试候选

- 新增经现有 `test:integration` 收录的 Prisma 新事故表集成测试：权限隔离、同轮次确认与幂等、审计落库、旧轮次拒绝和双管理员并发 CAS。GitHub Actions 的 `CI=true` 在缺表时强制失败，旧本地专用库仅允许明确 SKIP。CI 实际工作流尚未取得验收结果。
- 本地独立 TS exit 0、npm 单元 exit 0、Next build exit 0；旧隔离 MySQL **32 total / 31 PASS / 1 SKIP / 0 FAIL / exit 0**，唯一 SKIP 是第 9 项迁移必需的新事故表测试，不是新功能的 MySQL PASS。本地模拟 CI 门禁演练被工具安全检查阻断，未宣称已通过。
- 未对正常开发或生产库执行迁移/写入。B04/U03、B07、D02 继续 IN_PROGRESS；独立证据 `b04-incident-ci-mysql-gate-2026-11-21.md`。

## 2026-11-21 GitHub Actions 退款异常扫描安全门禁断言修复

- 远端两次 CI `8442b89` / `8145fd2` 的 job logs 确认 `refund-finalization.test.ts` 固定 expect exit2 与 CI 安全拒绝 exit3 冲突，不能通过开放 CLI 到普通库修复。新条件断言在授权隔离库必须看到 ALERT/JSON、CI 普通库则必须看到拒绝/无 stdout。
- 本地 npm test、TS、Next build exit 0；专用隔离 MySQL 首轮 **32 total / 30 PASS / 1 FAIL / 1 SKIP**（其他 Agent `financial-risk-audit` 遇 `127.0.0.1:3306` 暂时不可连接），复跑 **32 total / 31 PASS / 0 FAIL / 1 SKIP**。新事故表迁移测试 SKIP，不是新表验收通过。
- 详细 `b04-ci-ops-scan-guard-fix-2026-11-21.md`；修复后远端 GitHub Actions 结果需新提交核实。B04/U03/B07/D02 仍未整体验收。

## 2026-11-21 远端 CI 新事故表真实 MySQL 完整通过及管理员确认入口候选

- 真实 GitHub Actions `efceb92` run `44872146477` validate success，原始日志显示全新 MySQL8 migrate deploy/repeat 与状态检查通过，**95/95 单元、31/31 集成、0 SKIP、0 FAIL**，含新 `B04/U03 migrated MySQL: admin CAS acknowledgment and audit are atomic/idempotent` 用例；build、smoke 均成功。这是 CI 新隔离库证据，不是生产或预发布库验收。
- 新增管理员确认 Server Action 独立禁用开关、服务端鉴权和限流、轮次/理由安全表单校验。新增表单单元覆盖，首次 TypeScript 类型错误修复后本地单元、tsc 和 Next build exit 0；老本地隔离库 MySQL **31 PASS/1 SKIP**，新表未落库所以明确跳过。
- 不宣称管理员 HTTP 真实登录态、CSRF、页面或独立开关启用已完成；需预发布迁移、浏览器及权限 E2E。证据 `b04-admin-incident-action-candidate-2026-11-21.md`；B04/U03 整体 IN_PROGRESS。

## 2026-11-21 B04/U03 管理员告警面板和只读投影

- 核验 GitHub Actions `1837f7e` run `44872780536` success；此前 CI 新 MySQL8 全量迁移和告警确认真实事务已通过。这不是本次管理员页面登录态 E2E。
- 新增仅管理员可访问、开关关闭时不读取新表的事故面板；仅 OPEN 允许明确人工提交，提交绑定 key/openedAt 并使用已实现的事务审计。新增纯只读投影三项安全单测；独立 npm test、tsc 和 Next.js build exit 0。
- 旧专用 MySQL：32 total / 31 PASS / 1 SKIP / 0 FAIL，唯一 SKIP 因历史库缺第 9 项迁移。未启用事故管理开关，尚无真实浏览器已登录权限/CSRF/表单提交验收；详细证据 `b04-admin-incidents-panel-2026-11-21.md`，B04/U03 整体仍 IN_PROGRESS。

## 2026-11-21 事故页面最小字段查询与匿名 HTTP 冒烟测试

- `224b084` GitHub Actions run `44876152273` success；此次增加 `incidentPanelSelect` 的六字段查询白名单与单元回归，实际 Prisma 委托不再取审核笔记/管理员 ID 等无关字段。npm test、tsc、Next build exit 0。
- 运行中旧 3000 服务的 `release:smoke` exit 1（新 `/admin/incidents` 尚不存在，HTTP 404）；临时独立 3100 端口启动本轮构建并实际检查 `/admin`、`/admin/incidents`、`/admin/refund-dispatch`，均 **307 /login**；没有触碰 3000 旧服务进程。HTTP 检查仅为匿名保护，不是登录态/CSRF E2E。
- 历史隔离 MySQL 全量回归 `32 total/31 PASS/1 SKIP/0 FAIL`，SKIP 是旧库缺第 9 项事故迁移；独立记录 `b04-admin-incident-minimal-select-smoke-2026-11-21.md`，B04/U03 总体依旧 IN_PROGRESS。

## 2026-11-21 B04/U03 只读权限与确认写入严格分离

- 核对 GitHub Actions `2290948` run `44876839721` 完成且 success。实现 `opsIncidentGates`，只读操作不会显示或授权写入，确认开关才放行人工事务；对错误大小写/空格默认拒绝。事故四个关键 FormData 字段拒绝重复值，新增针对性单测。
- 本地全量单元 exit 0、TypeScript exit 0、Next build exit 0。历史隔离 MySQL 首轮 **32 total/30 PASS/1 FAIL/1 SKIP**，FAIL 是其他 Agent 的 `financial-risk-audit` 测试遇 `127.0.0.1:3306` 暂时不可连接；复跑 **32 total/31 PASS/0 FAIL/1 SKIP**。唯一 SKIP 是旧隔离库缺第 9 项迁移，不能算本轮新表 UAT。
- 真实 ADMIN/USER/匿名登录态、CSRF、只读 HTTP 和事故数据库操作链还需要预发布 E2E；仅本轮单元/编译安全子包 VERIFIED，B04/U03 整体 IN_PROGRESS。证据 `b04-incident-read-write-gates-2026-11-21.md`。

## 2026-11-21 事故扫描状态同步事务候选

- 核实 `d252123` GitHub Actions `44877523145` 为 success；新建仅注入式服务 `syncOpsIncidentWithStore`、Prisma Serializable/CAS adapter，事务更新事故/追加状态审计，零计数未开新事故不落库；覆盖重开、无重复事件、CAS 冲突及审计失败回滚的单元用例。
- `npm test`、独立 TypeScript `tsc --noEmit` 和 Next build 全部 exit 0；本地历史隔离库 **33 total/31 PASS/0 FAIL/2 SKIP**，两个 SKIP 都因旧库没有第 9 项迁移，绝非新业务链路真实数据库已通过。新增 CI=true 缺表失败的新 MySQL 集成测试将由远端 CI 验证。
- 未开启事故自动落库/通知、无预发布迁移或恢复演练，商业资金和外部资质仍未验收。完整 `b04-incident-sync-prisma-candidate-2026-11-21.md`，B04/U03 整体 IN_PROGRESS。

## 2026-11-21 B04/U03 完整扫描三类别事务原子性

- 同一扫描完整计数通过 `assessOpsAlerts` 校验，再在一个 `store.transaction` 里对全部三类事故分别读状态、CAS 更新、追加审计。用 mock 注入模拟第三类审计失败，前两类状态及事件同时回滚；缺计数、不合法 count 或时间未启动事务。
- 本地 npm 单元、TypeScript、Next 生产构建 exit 0，历史隔离 MySQL **33 total / 31 PASS / 0 FAIL / 2 SKIP**；SKIP 是旧库缺第 9 项迁移。已核实前一提交 `91f867e` GitHub Actions run `44878355008` success：111/111 单元、32/32 集成，含单类别同步真实 MySQL 审计测试通过；**本轮新增三类同事务仍仅本地单测，待自己的 CI**。未启动自动扫描/通知，未改生产库或财务状态。
- 独立 `b04-incident-batch-scan-transaction-2026-11-21.md`。本轮纯逻辑 VERIFIED，完整 B04/U03 仍 IN_PROGRESS。

## 2026-11-21 三类事故整批 MySQL 原子回滚真实集成门禁

- `79d7c5b` 的远端 CI run `44878653947` 已 **success**，全部管线步骤通过。新增独立 `ops-incident-batch-mysql.test.ts`：三类事务中最后类别审计成功插入后故意抛错，断言真正数据库事务全回滚，再运行三类 OPENED/RESOLVED 及 6 个事件审计。禁止覆盖已有 key、不得访问实际资金和用户数据。
- 首轮新增测试的 TS 花括号语法错误导致 tsc、build、integration 失败，修复后全量 npm 单元 exit 0、tsc exit 0、Next build exit 0；历史 MySQL **34 total/31 PASS/0 FAIL/3 SKIP**，其中本测试由于旧库未迁第 9 项为 SKIP。**新增真实整批回滚并未在本机验证，必须等此提交 CI 新 MySQL 结果**。
- 此项子包只新增测试、无生产运行行为；管理员/用户权限 E2E、多 Worker、预发布迁移和恢复仍欠验收。证据 `b04-batch-scan-real-mysql-rollback-2026-11-21.md`；总体 NOT READY。

## 2026-11-21 B04/U03 扫描与管理员确认同轮次 MySQL 争用补测

- `f365c28` GitHub Actions run `44879055646` success，确认 114/114 单元、33/33 迁移 MySQL 集成（含整批回滚），0 跳过。扩展 `ops-incident-batch-mysql.test.ts`：真实 ADMIN 角色、扫描 count 更新与 ACK CAS 同时争用，容错后确认不被覆盖、操作人正确、ACK 审计恰好一条、三类最终解决且审计共 7 条。
- 本地 npm test、tsc、Next build exit 0；历史专用 MySQL 首轮 `34 total/30 PASS/1 FAIL/3 SKIP`，唯一 FAIL 是其他 Agent 财务审计查询时 `127.0.0.1:3306` 不可达；原样复跑 `34 total/31 PASS/0 FAIL/3 SKIP`。3 SKIP 因历史库缺事故第 9 迁移，**未在本机验收真实并发数据库**。现已查验 `859db27` GitHub Actions run `44879917200` 最终 success：全新 MySQL8 迁移、114/114 单元、33/33 集成、0 FAIL/0 SKIP，含扫描/ADMIN 交错测试真实通过，生产构建及 smoke 也 success。
- 不连接真实扫描任务、资金、退款或模型服务；不代表管理员会话/CSRF 或预发布部署已验收。详见 `b04-scan-admin-race-mysql-2026-11-21.md`，整体 B04/U03 IN_PROGRESS。

## 2026-11-21 B04/U03 事故页面 URL 伪结果及类别运行时校验

- 查验 `82d57a9` GitHub Actions run `44880164059` success。新增安全提示函数与页面接线，URL `incidentOutcome` 不再可制造“确认已记录”的虚假肯定提示；状态真实性仍由管理员看到的事故行与原子审计判定。
- 新增 `assertOpsIncidentKey` 运行时枚举校验，事故状态计划及迁移写入前拒绝未知类别；单元补覆盖空 key、伪造类别、数字/null 和伪造 ACK 查询串。
- 本地 npm test、tsc、Next build 均 exit 0；历史 MySQL **34 total / 31 PASS / 0 FAIL / 3 SKIP**（旧库缺第 9 事故迁移）。B04/U03 整体仍需真实登录态/CSRF HTTP、自动扫描与可靠通知及预发布恢复门禁。详见 `b04-incident-url-outcome-safety-2026-11-21.md`。

## 2026-11-21 B04/U03 事故完整计数与状态同步隔离入口

-  `ba15b8d` GitHub Actions `44880692126` success。独立双许可门禁 `approvedOpsIncidentSyncEnvironment`：原只读扫描许可 + 额外 `OPS_INCIDENT_SYNC_APPROVED=true`，生产及非专用 DB 拒绝、未授权 0 DB IO。新增 `createPrismaOpsIncidentCountReader` RepeatableRead 事务读取三类别计数，完整/合法后统一调用现有原子同步入口；读失败不会以 0 代替或自动解决事故。
- 全量 npm 单元、独立 TS、Next build exit 0；历史隔离 MySQL **34 total /31 PASS /0 FAIL /3 SKIP**（旧库缺事故第九迁移）。本轮新增协调器/适配器只有模拟的同快照事务与 fail-closed 单元测试，**没有声称真实迁移 MySQL 端到端或生产 Cron 已完成**。已核验 `49d258e` 的 GitHub Actions run `44881430687` 最终 success：119/119 单元、33/33 集成，0 FAIL/0 SKIP，迁移、构建、smoke 均通过。
- 证据 `b04-isolated-incident-scan-coordinator-2026-11-21.md`。仍欠可靠通知、真实管理会话/CSRF E2E 和预发布备份/恢复。B04/U03 IN_PROGRESS，生产开关保持关闭。

## 2026-11-21 B04/U03 真实读计数 → Prisma 事务事故端到端集成

- 核实 `ef5a77f` GitHub Actions run `44881854858` success。新增隔离 MySQL 专项：测试临时超时 RESERVED → RepeatableRead 真读数 1 → 协调器 OPENED → 注入读故障后事故仍 OPEN → 临时 ToolRun SUCCEEDED → 真读数 0 → RESOLVED 及事件审计。CI 缺第九迁移 FAIL，本地旧库显式 SKIP。CI 新 `jobs` 库使用**仅测试调用**的合成隔离许可环境；不会改变实际运行时白名单，不代表生产环境获授权。
- npm 单元、独立 TS、Next build exit 0；历史隔离 MySQL 初次 `35 total/30 PASS/1 FAIL/4 SKIP`（原有 auth-retention 查询时本地 MySQL 短暂不可达），复跑 `35 total/31 PASS/0 FAIL/4 SKIP`；新增真实 MySQL 用例未在本机执行，已核验远端 `a018ac2` GitHub Actions run `44882556403` **success**：全新 MySQL8 迁移、119/119 单元、34/34 集成、0 FAIL/0 SKIP，实际 `B04/U03 isolated MySQL: actual stale reservation count opens and resolves incident, failed scan does not resolve` 测试明确 PASS；生产 build/smoke 也成功。
- 本子包仅新增测试，原业务无变更；不接 Cron、真实通知、资金、模型。独立 `b04-real-mysql-coordinator-e2e-2026-11-21.md`，B04/U03 仍 IN_PROGRESS、商业 NOT READY。

## 2026-11-21 B04/U03 事故通知意图幂等（仅离线）

- 核实 `cd755a1` GitHub Actions run `44882754338` success。新增 `planOpsNotificationIntents` 从已持久化事故快照生成 SHA-256 轮次/通知种类/升级时间桶去重意图；同一轮首次 NOTIFY 稳定、同时间桶 ESCALATE 稳定、跨桶变化、ACK/已解决抑制、只输出类别/优先级/聚合数/轮次时间/哈希标识，无 PII 或商户数据。
- 本地 npm test、独立 TS、Next build exit 0。历史隔离 MySQL 首轮 `35 total/30 PASS/1 FAIL/4 SKIP`（已有 auth-retention 查询遇短时 DB 连接失败），原样复跑 `35 total/31 PASS/0 FAIL/4 SKIP`（旧库缺第九事故迁移）。本轮通知意图只做单元测试，非真实 Outbox 或发送测试。
- 独立证据 `b04-notification-idempotency-intents-2026-11-21.md`；后续仍需事务入队、唯一约束、claim 租约、投递重试/恢复及真实 MySQL/权限回归。B04/U03 IN_PROGRESS，NOT READY。

## 2026-11-21 B04/U03 通知 Outbox QUEUED 仅入队（第十迁移）

- 已验证第一小包 `89fbe7a` run `44884812385` **SUCCESS**：125/125 单元、34/34 MySQL 集成、0 FAIL/0 SKIP；离线通知计划器通过。
- 新增第十迁移队列表 `OpsIncidentNotificationIntent` 唯一 64 字节 hash 主键、事故 FK、QUEUED 状态；`queueInitialOpsNotificationIntent` 对实际轮次/OPEN 状态重新验证，Serializable + skipDuplicates 幂等只入队；测试覆盖重复、ACK/RESOLVED、错轮次与恶意 hash/等级，单独 MySQL 集成 CI 必须真实执行。
- 本地 npm test、独立 tsc、Next build、`prisma validate` exit 0；`prisma generate` 遇已有进程锁住 Windows query_engine.dll 的 EPERM，非 schema 校验失败，须由 CI 重生 client。历史专用 MySQL `36 total/31 PASS/0 FAIL/5 SKIP`，旧库缺第九/第十迁移，新表本地仍未验收，但已核验 `853d20b` GitHub Actions run `44885639216` **success**：第十迁移全新 MySQL8、129/129 单元、35/35 集成、0 FAIL/0 SKIP，测试 `B04/U03 migrated MySQL: durable notification queue is unique per episode, stale queue refused` 明确 PASS；生产构建及 smoke 成功。详见 `b04-notification-durable-queue-candidate-2026-11-21.md`。
- 当前无自动发送/领取/重试/投递回执，也不允许开启真实通知；B04/U03 仍 IN_PROGRESS，整体 NOT READY。

## 2026-11-21 B04/U03 通知任务 CLAIMED 领取租约（第十一迁移）

- `d2834d9` CI run `44886104615` 已 success。新十一迁移给内部 QUEUED 通知任务添加 CLAIMED、尝试次数、UUID token、租约截止时间；独立 claim 纯服务和 Prisma Serializable/条件更新适配只领取、不发送，不修改业务账本。
- 新单元测试验证有效租约 BUSY、租约到期换 token、5 次上限、旧轮次和非 OPEN 状态拒绝、错误参数 fail-closed、CAS 端口；原 MySQL 入队测试追加真领取→有效租约拒绝→超期重领→事故解决拒领，防止跨文件使用同一个事故 key 的并行冲突。
- 本地 npm test、独立 tsc、Next build、Prisma validate exit 0；旧隔离 MySQL `36 total/31 PASS/0 FAIL/5 SKIP`，旧库缺事故/通知新迁移不可算真实 DB 验收。已核验 `7ae462f` GitHub Actions run `44886846171` **success**：第十一迁移全新 MySQL8、133/133 单元、35/35 集成、0 FAIL/0 SKIP，实际租约 CLAIMED/BUSY/超期恢复/事故关闭拒领测试 PASS；生成 Client、typecheck、Next build、smoke 均成功。见 `b04-notification-claim-lease-2026-11-21.md`。CLAIMED 不表示已投递；真实 sender、ack、失败回收和人工合规门禁仍未完成，NOT READY。

## 2026-11-21 B04/U03 通知任务发送前只读校验（未发送）

- `1ab2428` CI run `44887201687` success，已验证的领取租约不重做。新增 `preflightOpsNotification`：只读 Serializable 快照校验 CLAIMED、当前 UUID claimToken、严格剩余租约、同轮次事故仍 OPEN/有告警；返 READY/MISSING/FENCED/EXPIRED/STALE，不能视为实际送达或发送许可。
- 新增 5 项单元用例核对旧 token、期限、失效事故与重开轮次；原 MySQL 队列测试扩展为首次 READY、重领取旧 token FENCED/新 token READY、事故解决 STALE。全套 `npm test`、tsc、Next build exit 0；历史隔离 MySQL `36 total/31 PASS/0 FAIL/5 SKIP`，因缺迁移，扩展的真实 DB 用例已核验 `1f2bae4` GitHub Actions run `44889847821` **SUCCESS**：全新 MySQL8、138/138 单元、35/35 集成、0 FAIL/0 SKIP，真实首次 READY、重领取旧 token FENCED/新 token READY、事故解决 STALE 均 PASS，Next build/smoke 通过。独立 `b04-notification-preflight-2026-11-21.md`。
- 缺真实 sender、外部渠道幂等、投递回执、崩溃重试与安全接收人审批；不允许直接使用 READY 作为网络发送授权。B04/U03 IN_PROGRESS，整体 NOT READY。

## 2026-11-21 B04/U03 通知失败回退与延时重领（第十二迁移）

- 之前 `517d50c` GitHub Actions run `44890089304` SUCCESS。新增 `OpsIncidentNotificationIntent` RETRY_WAIT、DEAD、nextAttemptAt、failureCode；仅当前有效 UUID 令牌持有者可在 Serializable CAS 下将 CLAIMED 转回延迟重试或最终 DEAD，旧 token / 过期 / 非法 code 拒绝。
- claim 服务对 RETRY_WAIT 在到点前拒绝（DEFERRED），到点清理旧失败属性后恢复 CLAIMED；单元与现有 MySQL 集成扩展覆盖重领、重复失败和事故解决后拒领。
- 本地 npm 单元、独立 tsc exit 0；Prisma validate 命令工具超时，Next 生产 build 编译+TS 通过但页面数据收集超时，**不得认定完整 build PASS**；第十二迁移及新增真库分支已核验 `6e51099` GitHub Actions run `44891465518` **SUCCESS**：全新 MySQL8、142/142 单元、35/35 集成、0 FAIL/0 SKIP，失败后延时重领、过早 DEFERRED、已解决 STALE 的真实用例 PASS，远端 typecheck/build/smoke 全通过。本地超时记录不覆盖。详见 `b04-notification-retry-disposition-2026-11-21.md`，状态 IN_PROGRESS，整体 NOT READY。

## 2026-11-21 B04/U03 故障事件按次持久审计（第十三迁移）

- 已核验 `a6b5c4a` GitHub Actions run `44891820268` SUCCESS。第十三迁移增加 `OpsNotificationFailureEvent`、任务 FK、`UNIQUE(intentKey,attemptCount)`；Prisma Serializable 事务中仅 CAS 更新成功后写审计，数据库异常不允许状态成功提交。仅保存机器失败码、尝试次数、RETRY_WAIT/DEAD，不存 claimToken 或 PII。
- 新单元覆盖成功写事件、CAS 冲突不写事件、重复失败无法重复审计、审计写入异常传播。扩展既有真实 MySQL 队列用例核实事件计数 1、失败码、序号、重复失败不加行；第十三迁移缺表 CI fail。独立 TS 和 npm test exit 0；本机 Prisma validate/Next build 被执行器超时中断，已核验 `ec9506e` GitHub Actions run `44892913723` **SUCCESS**：第十三迁移全新 MySQL8、145/145 单元、35/35 集成、0 FAIL/0 SKIP，真库失败事件写入、按次唯一及重复失败不新增记录均 PASS，typecheck/build/smoke 全通过；尚缺真库审计写入异常注入下的回滚演练。
- 证据 `b04-notification-failure-audit-2026-11-21.md`。没有发送器、送达确认、管理员死信处置、定时调度；B04/U03 IN_PROGRESS，NOT READY。

## 2026-11-21 B04/U03 真正审计落库 FK 失败后整笔事务回滚

- `b2c7d44` CI run `44893435390` SUCCESS。新增真实 MySQL 集成断言：测试内重用真实 Prisma Serializable tx 与状态 CAS，在审计 delegate 中注入不存在的 64 位 FK，触发真实数据库审计 insert 拒绝；随后数据库核对任务保持 CLAIMED、令牌与 attemptCount 不变、失败字段为空、审计数 0；最后正常写 RETRY_WAIT 和唯一审计事件。
- 本地独立 TypeScript、npm test exit 0。故障注入真库已核验 `a47e082` GitHub Actions run `44894008602` **SUCCESS**：全新 MySQL8、145/145 单元、35/35 集成，0 FAIL/0 SKIP，真实 FK 插入失败回滚及正常重试路径 PASS，typecheck/build/smoke 均通过；测试专用适配不接生产 sender、调度、商户或模型。证据 `b04-notification-fk-rollback-2026-11-21.md`；B04/U03 IN_PROGRESS，NOT READY。

## 2026-11-21 B04/U03 DEAD 通知内部管理员复核（第十四迁移）

- `c8d7b5c` CI run `44894374079` SUCCESS。新增第十四迁移 `OpsNotificationDeadReview`（intentKey PK+FK 保证一次复核，DB role lookup ADMIN）；`reviewDeadOpsNotification` 仅对 DEAD 创建审计，幂等重放、不同决定冲突、拒绝 USER/非 DEAD。
- 新单元覆盖权限、幂等、冲突、输入限制、Serializable Prisma Adapter；同一真实 MySQL 测试中使用自有队列记录及测试用户验证 USER 拒绝、ADMIN 首次成功、重复成功结果幂等、冲突失败、记录唯一并保持 DEAD；finally 只删除自身数据。
- 本地 npm test、独立 tsc exit 0；第十四迁移/真实 MySQL 权限审计已核验 `00fd34d` GitHub Actions run `44895376472` **SUCCESS**：全新 MySQL8、149/149 单元、35/35 集成，0 FAIL/0 SKIP，数据库角色查询、管理员唯一复核、普通用户被拒、冲突决定拒绝及任务保持 DEAD PASS；Prisma validate、typecheck、Next build、HTTP smoke 均通过。独立 `b04-notification-dead-review-2026-11-21.md`。无通知发送、死信复活、HTTP 或 Cron，B04/U03 IN_PROGRESS，NOT READY。

## 2026-11-21 U03/B04 默认关闭的管理员 DEAD 复核 Web 入口

- `c7170ba` GitHub Actions run `44895785888` SUCCESS。新增 Next.js 管理页面、Server Action 和独立开关/表单/同源校验；双开关均只有精确 `true` 启用复核，先核对 requireAdmin 登录态、Origin/Host、DB 限流，固定机器原因和用户确认，随后通过后端事务重新核对 ADMIN 与 DEAD；页面不泄露正文/令牌，没有发送/重入队。
- 新增单元验证默认关闭、恶意/缺失来源、伪装域名和请求表单、重复字段与非法原因、伪造角色忽略。独立 tsc、npm test exit 0；已核验 `a6da140` GitHub Actions run `44897021404` **SUCCESS**：全新 MySQL8、152/152 单元、35/35 集成，0 FAIL/0 SKIP，typecheck、Next build、HTTP smoke 全通过。**未执行真实浏览器管理员登录态、跨站 POST 与 CSRF E2E**，不能据此声明实际 HTTP 攻防已验收。独立 `b04-dead-review-web-gate-2026-11-21.md`；B04/U03 IN_PROGRESS、NOT READY。

## 2026-11-21 U03/B04 管理员 localhost HTTP 会话与 CSRF 端到端演练

- 已核验 `af0444a` GitHub Actions run `44897394234` SUCCESS。因原工作流有受保护字段，未修改它，新建独立 GitHub Actions MySQL8 + Next 生产构建 + `127.0.0.1:3101` 专用安全 E2E；真实支付/AI/通知关闭，临时打开仅复核读写门禁。
- 测试在隔离库仅创建随机无效邮箱的 ADMIN/USER、会话和自有 DEAD 通知；HTTP 匿名 GET/普通用户 GET 和 POST 拒绝、ADMIN GET 200、恶意/缺失 Origin POST 阻断且无副作用、有效同源 ADMIN POST 首次落审计、幂等重放、冲突拒绝、终态仍 DEAD。最后清理测试记录。
- 本地 `node --check` 与独立 tsc exit 0；**已核验 `3907def` GitHub Actions HTTP run `44899756149` SUCCESS，9/9 真 HTTP 检查通过；同提交主 CI run `44899756101` SUCCESS：152/152 单元、35/35 MySQL 集成，0 失败/跳过，迁移、生产构建、HTTP 冒烟通过。根因修复为仅提取目标死信复核表单 Action ID，不再误触导航登出；全部失败 run 和定位记录保留。**不包含 Playwright 浏览器截图、正式域名反向代理和完整商业 E2E，仍需后续独立验收。见 `b04-dead-review-http-e2e-2026-11-21.md`，B04/U03 IN_PROGRESS，整体 NOT READY。

## 保留的局限

没有真实商户、沙箱、小额实付、退款或真实对账验证，没有生产环境首次迁移、恢复与回滚演练，也没有完整浏览器 E2E。以上通过的测试**不代表支付通道或正式上线已验收**。实际商户操作开关必须单独由经营者审核。

## 2026-11-22 B06 支付宝退款响应金额严格匹配

- 新增 `tests/refund-submit-amount.test.ts`：无缺失、超额、少额、精度异常、非法金额被接受；纯规则要求精确到整数分。
- 扩展 `tests/integration/refund-submission.test.ts`：模拟 RSA2 已签名响应，测试偏大/偏小/缺失金额与伪造签名。独立执行指定 Alipay 测试 `1/1 PASS`，无真实商户请求。
- 完整 `npm test`、TypeScript `--noEmit`、Next.js 16.4.6 production build 均 exit 0；MySQL 全量集成、远端 CI、真实商户支付/退款和生产迁移未验收，详见 `b06-alipay-refund-reply-amount-2026-11-22.md`。

## 2026-11-22 B06 退款成功回包商户身份核验

- 支付宝退款查询测试新增已签名 `REFUND_SUCCESS` 空/缺失 seller_id 场景：修改前专项 exit 1，`Missing expected rejection`；修复后专项 1/1 PASS，exit 0。
- `npm --prefix F:/code/job-board-next test`、独立 `tsc --noEmit`、`npm --prefix F:/code/job-board-next run build` 均 exit 0。
- 只在 mock fetch/临时 RSA2 测试环境测试，未调用商户 API、MySQL 全量集成或资金终态写入。专项记录 `b06-refund-query-seller-id-2026-11-22.md`，B06 仍 IN_PROGRESS。

## 2026-11-22 B06 微信退款请求签名回应交易身份一致性

- 新增微信退款 POST 回包遗漏或伪造 transaction_id 的模拟签名回归，原代码专项 RED exit 1 (`Missing expected rejection`)；修复网关要求交易号与历史支付号精确一致，专项 1/1 PASS。
- 全量单元 `npm test`、独立 `tsc --noEmit`、Prisma generate/Next.js production build 均 exit 0。没有执行 MySQL 全量集成、真实商户联调或资金流水回退。详见 `b06-wechat-refund-transaction-identity-2026-11-22.md`，B06 仍 IN_PROGRESS。

## 2026-11-22 B06 微信退款 POST 异常状态 fail-closed

- 模拟 RSA 已签名微信回应复现 CLOSED 错误 ACK，专项先 RED；修改后只对 SUCCESS/PROCESSING 返回初步 ACK，CLOSED/ABNORMAL/未知状态要求查单。
- 本轮恢复后专项 `1/1 PASS`、全量单元、TypeScript、Next.js 生产构建全部 exit 0；MySQL 全量集成和真实商户 UAT 未执行。见 `b06-wechat-refund-status-handoff-2026-11-22.md`，B06 整体仍 IN_PROGRESS。

## 2026-11-22 B06 支付宝退款 POST seller_id 必填

- 签名成功但 `seller_id` 缺失的测试初次 RED exit 1（`Missing expected rejection`），修复后专项 GREEN 1/1，缺失和错误商户均拒绝；正常回包仍仅 ACK。
- `npm --prefix F:/code/job-board-next test`、独立 `tsc --noEmit` 和 `npm --prefix F:/code/job-board-next run build` 均 exit 0。没有执行完整 MySQL 集成、真实商户和新远端 CI；B06 IN_PROGRESS。见 `b06-alipay-refund-post-seller-identity-2026-11-22.md`。

## 2026-11-22 B06 支付宝退款查询终态缺原总额拒绝

- 已签名 `REFUND_SUCCESS` 缺少 `total_amount` 初始 RED exit 1（`Missing expected rejection`），修复后专项 1/1 PASS；补全原总额不匹配、未知状态缺原总额不认成功，退款只读查询全文件 3/3 PASS。
- 完整 `npm test`、独立 `tsc --noEmit`、`npm run build` 均 exit 0；未运行当前包完整 MySQL 集成、真实商户 UAT 或远端新提交 CI。见 `b06-alipay-refund-query-original-amount-2026-11-22.md`，B06 保持 IN_PROGRESS。

## 2026-11-22 D02 运营事故写入开关预上线门禁

- 新测试明确枚举三项运营写入开关（事故确认、DEAD 复核写入、事故同步），覆盖 `LOCAL_PREVIEW` 与 `PUBLIC_PRELAUNCH` 的 `true` 阻断和 `false` 安全默认。TDD RED 在旧实现下退出码 1，报告 `Untracked prelaunch gate: ENABLE_OPS_INCIDENT_ACK`；独立定向运行的额外 CLI cwd 错误不计入业务 RED。
- 扩展 `offFlags` 后完整 `npm --prefix F:/code/job-board-next test` exit 0；独立 TS `--noEmit` exit 0；`npm --prefix F:/code/job-board-next run build` exit 0（Prisma Client generate / Next.js 16.4.6 全流程）。未执行新包 MySQL 全量/真实代理 HTTPS/生产部署；D02 继续 IN_PROGRESS，详见 `d02-ops-mutation-prelaunch-gates-2026-11-22.md`。

## 2026-11-22 B07 运营事故/通知持久层恢复预检

- 新增 `tests/b07-recovery-schema.test.ts`：必需 5 张运营状态/通知/审计表及关键列、缺表/缺列、金额列类型错误的无数据库合成模拟。初次单元 suite exit 1（策略模块不存在），补代码后全量 `npm test` exit 0。
- 独立 `tsc --noEmit` exit 0、`npm --prefix F:/code/job-board-next run build` exit 0（Prisma generate + Next.js 16.4.6）。`b07-recovery-preflight.mjs` 继续只读隔离白名单、迁移 checksum 及资金事故计数；**未运行新的真实 DB 缺结构回放/备份恢复**。B07 继续 IN_PROGRESS。详见 `b07-recovery-operational-schema-2026-11-22.md`。

## 2026-11-22 B07 预检迁移目录不受执行器 cwd 影响

- 新增 `recoveryMigrationDirectoryFromScript` 纯函数的 `URL/string` 路径断言，初始单测 RED exit 1（函数未定义）；实现后从 `import.meta.url` 锚定本仓库迁移目录，不再使用启动终端的工作目录。
- `npm --prefix F:/code/job-board-next test` exit 0；独立 `tsc --noEmit` exit 0；`npm --prefix F:/code/job-board-next run build` exit 0（Prisma generate、Next.js 16.4.6 生产构建）。**无本轮真实 MySQL、非空备份恢复、真实商户或模型联调**；B07 IN_PROGRESS，交接 `b07-recovery-migration-path-2026-11-22.md`。

## 2026-11-22 B07 一次性 MySQL 8 只读预检 CI

- CI 安全策略单测首次 RED exit 1（`b07-recovery-readonly.yml` 不存在 ENOENT）；新建独立 workflow 后全量 `npm --prefix F:/code/job-board-next test` exit 0，TypeScript noEmit exit 0，Prisma Client / Next.js production build exit 0。
- Workflow 限制单独 MySQL 8 CI 服务、专有测试库名、默认关闭收费/退款/AI 开关、只在预检步骤开启 `DJS_RECOVERY_PREFLIGHT_APPROVED=READ_ONLY`；仅迁移至一次性库和 SELECT 检查，未触及任何本机数据库。见 `b07-recovery-ci-readonly-2026-11-22.md`，B07 总体 IN_PROGRESS。

## 2026-11-23 U01 管理员注销队列角色隔离与脱敏真实 HTTP（隔离 CI VERIFIED）

- 新 `tests/account-deletion-admin-http-policy.test.ts` 先 RED，增强真实 `scripts/ci-account-deletion-http-e2e.mjs` 后 2/2 GREEN，联合原队列规则/策略共 8/8 PASS；`node --check` exit 0。全程仍使用 `account_deletion_http_ci` 临时 MySQL8，模拟含管理员、普通用户和真实匿名请求。
- 新增 HTTP 断言包括匿名 GET 307 /login、USER 307 /、ADMIN 200 脱敏队列、完整用户邮箱不泄露、审核记录数/模拟 PAID 订单金额不变；原 10 项扩大至 14 项。**远端真实验收已通过：** `f5b77dc` GitHub Actions 管理员注销审核 HTTP run `45137974907` / job `137568710870` completed/success，实际日志 `CI_ACCOUNT_DELETION_HTTP pass=14 fail=0`，含匿名拒绝、USER 拒绝、ADMIN 只读/脱敏、账务不变；主 CI run `45137975011` / job `137568711263` completed/success（Prisma、TypeScript、全单测/真实 MySQL 集成、Next build/smoke），另外五条回归专项 SUCCESS。**仅这条一次性 HTTP 权限子包 VERIFIED，未处理真实用户或数据删除。**。交接 `u01-account-deletion-admin-http-2026-11-23.md`。

## 2026-11-23 U01 注销人工审核只读财务预检（隔离 MySQL VERIFIED）

- `account-deletion-review-policy.test.ts` RED（模块不存在）→4/4 GREEN：真实交易/退款/历史订单一律 FINANCIAL_HOLD，在途 AI/未消费权益 OPERATIONAL_HOLD，零风险仍 MANUAL_REVIEW，异常/缺计数 EVIDENCE_UNAVAILABLE，所有 `canAutoDelete=false`。
- `account-deletion-review-readonly-policy.test.ts` 页面不存在时 RED，新增管理员 route+批量 SELECT 服务后 2/2 GREEN；不包含写库/匿名可见的操作。新增 `tests/integration/account-deletion-review-queue.test.ts`，仅 `INTEGRATION_TEST_DATABASE=true` 一次性 MySQL8 使用合成订单/退款/权益/在途 AI/求职记录验证分组与前后行数不变。本地 tsc 仍有其他 Agent 的 `auth-retention.ts` TS2739，绝不混改；**已取得远端真实 MySQL8 回执：** `e385b3d` 主 CI run `45137031288` / job `137565666292` completed/success，日志 `U01 review queue is read-only, batched, tenant-scoped and blocks financial/operational exposure` PASS，分组/隔离/脱敏/有偿订单/退款/在途/余量/只读全通过，且 TypeScript、单元、生产 build/HTTP smoke SUCCESS；同提交另六条防回归专项均 SUCCESS。**仅本只读后台预检子包 VERIFIED，不是实际数据删除或法务批准**。交接 `u01-account-deletion-review-queue-2026-11-23.md`。

## 2026-11-23 U01 账户注销审核申请真实 HTTP（隔离 CI VERIFIED）

- 本包 `tests/account-deletion-http-ci-policy.test.ts` 起步缺工作流/脚本 RED 2/2，新增一次性 MySQL8 `account_deletion_http_ci` 专用 GitHub 工作流与 `ci-account-deletion-http-e2e.mjs` 后专项 2/2 PASS；联合上一单元策略 4/4 PASS；脚本 `node --check` exit 0。
- 真 HTTP 演练使用 Server Action 表单、有效已验证用户 Cookie，测试匿名、跨域与缺 Origin、错误密码、未确认、有效请求、重复请求、用户隔离与模拟 PAID 订单和 Session 完整；支付/AI/邮件全部 false，严格拒绝非一次性 DB。**远端真实验收已完成：** `8d7d494` GitHub Actions 账户注销 HTTP run `45134887116` / job `137558697836` completed/success，实际日志 `CI_ACCOUNT_DELETION_HTTP pass=10 fail=0`，匿名/CSRF/错密码/未确认/重复幂等/模拟 PAID 订单不变均 PASS；主 CI run `45134887170` 类型、迁移、单元、MySQL 集成、生产构建与 smoke SUCCESS，另五条回归专项均 SUCCESS。**仅合成账户注销审核申请 HTTP 子包 VERIFIED，不代表真实注销/数据删除获得合规批准。**。交接 `u01-account-deletion-http-e2e-2026-11-23.md`。

## 2026-11-23 U01 账户注销非破坏性人工审核申请（隔离 MySQL8 VERIFIED）

- `tests/account-deletion-request-policy.test.ts` 先 RED 2/2（缺 schema/迁移/Server Action）；新增模型、迁移、人工审核入口后定向 GREEN 2/2，Prisma schema validate 与 Client generate PASS。新增 `tests/integration/account-deletion-request.test.ts` 使用一次性 DB、合成模拟已付款订单，要求并发幂等、账户隔离、原财务订单和用户完整、外键禁止误硬删。
- 本地 `tsc --noEmit` 失败 TS2739：另一 Agent 正在修改未提交的 `lib/auth-retention.ts`，APPLIED 返回尚未覆盖新字段；本包未改/未 stage 该文件。全量 `npm test` 也未通过；**本地仍不能声称全绿，但已取得干净远端 MySQL8 实测回执**：`f1ef3d2` 主 CI run `45133996644` / job `137555780865` SUCCESS，包含新迁移+重复运行、TypeScript、单元、真实 MySQL 集成、Next build 与 HTTP smoke；原始日志 `U01 deletion review remains idempotent, retains simulated order and cannot hard-delete User` PASS。另外五条 B07 / HTTP E2E 工作流均 SUCCESS。**仅不破坏财务数据的人工注销请求受理子包 VERIFIED，不等同自动注销或个人信息最终删除。**。详见 `u01-account-deletion-request-2026-11-23.md`；仅审核申请、没有自动删除或外部通知。

## 2026-11-23 U01 邮箱验证真实 localhost HTTP E2E（待远端）

- `tests/email-verification-http-ci-policy.test.ts` 起步 RED 3/3（确认同源检查/工作流/脚本均缺失）；实现 `app/actions/email-verification.ts` 两条 Origin/Host 拦截、一次性 MySQL8 `.github/workflows/email-verification-http-e2e.yml` 和 `scripts/ci-email-verification-http-e2e.mjs` 后，专项 3/3、联合已有策略 6/6 GREEN，`node --check` 通过。
- 真实测试目标：旧账号未验证不许登录；GET 不激活；邮件外发全部 false；重发不能轮换令牌；攻击者或缺失 Origin 不能验证；过期拒绝；合法 POST 单次验证，之后才允许创建登录 session；重放拒绝。脚本仅限 `CI=true`+`INTEGRATION_TEST_DATABASE=true`+`email_verification_ci`，仅合成个人数据。
- 本地 `tsc --noEmit` 因另一 Agent 未提交的 `lib/auth-retention.ts` `AuthRetentionResult` 新字段缺 `APPLIED` 返回而报 TS2739，非本次包文件，严禁混改；**真实干净远端验收已确认：** `543b576` GitHub Actions 主 CI run `45129637497` / job `137541931079` completed/success（Prisma、TypeScript、单元/真实 DB 集成、build、smoke）；邮箱验证真实 HTTP run `45129637522` / job `137541931200` completed/success，实际日志 `CI_EMAIL_VERIFICATION_HTTP pass=10 fail=0`，未验证登录、GET 只读、禁发重发、CSRF、过期、有效令牌一次确认、重放、验证后建立登录会话均成功。找回密码 HTTP `45129637524`、管理员 E2E `45129637509`、B07 两条 `45129637538/45129637428` 也 SUCCESS。**仅一次性 MySQL/HTTP 邮箱验证子包 VERIFIED，不代表真实邮件、旧账号或账户注销完成**。见 `u01-email-verification-http-e2e-2026-11-23.md`。外部邮件、合规仍人工门禁。

## 2026-11-23 U01 真实 HTTP 找回密码与 CSRF 隔离演练（待 CI）

- `0daf679` 主 CI `45127453163`、原管理员 E2E `45127453001`、B07 隔离只读 `45127453148`、合成非空恢复 `45127453070` 四项 SUCCESS，仅前一 Web 单元/构建子包验收。
- `tests/action-origin-policy.test.ts` 模块未建时 RED exit1，新增 Origin/Host 纯校验后 2/2 GREEN；`tests/password-reset-http-ci-policy.test.ts` 配置/脚本缺失时 2/2 RED，补全隔离 `.github/workflows/password-reset-http-e2e.yml` + `scripts/ci-password-reset-http-e2e.mjs` 后 2/2 GREEN；动作策略新增两个 POST 同源守卫断言，定向 3/3 GREEN。完整 npm test、独立 tsc、生产 build、HTTP 脚本 node --check exit 0。
- 脚本在临时 MySQL8 + Next localhost 内构造伪用户与重置令牌，要求 GET 只读、攻击者/缺 Origin 不消费、同源单次修改密码并撤销旧会话、重放和旧 Cookie 拒绝。**远端真实 HTTP 已验收：** `d13456b` GitHub Actions run `45128326350` / job `137537737478` completed/success，实际 job 日志 `CI_PASSWORD_RESET_HTTP pass=10 fail=0`、邮件/支付/AI 全关闭；确认链接 GET 不消费、跨源及缺失 Origin 的 POST 不消费、合法 POST 后新密码生效和旧 session 失效、重放拒绝。**仅本隔离 HTTP 子包 VERIFIED，非真实邮箱投递或生产验收**；详细交接 `u01-password-reset-http-e2e-2026-11-23.md`。所有真实支付/邮件/AI 默认关闭。

## 2026-11-23 U01 找回密码页面、邮件外发与匿名接口（待真实 HTTP E2E）

- `98af09c` 真 MySQL 8 主 CI run `45126554312` / job `137532100371` completed/success，迁移/重复部署、单元 `185/185`、集成 `U01 password recovery is single-use and revokes sessions on disposable MySQL` PASS、生产 build/HTTP smoke 全成功，仅后端核心子包 VERIFIED。
- 新 `tests/password-reset-delivery.test.ts` 首次缺模块 RED exit 1，完成后 3/3 GREEN：外发开关默认 false，受控 Resend HTTPS 域名、网络错误 fail closed；`tests/password-reset-auth-policy.test.ts` 2/2 PASS，页面只 POST 消费、反账户枚举/请求确认双限流。
- `ENABLE_PASSWORD_RESET_DELIVERY` 纳入 D02 prelaunch offFlags，单测首先 RED 后 PASS；完整 `npm test`、独立 TypeScript、Next.js build exit 0。真实邮箱/UAT 与当前包真 HTTP Action 仍未验收，不能标 U01 VERIFIED；`u01-password-reset-web-2026-11-23.md`。

## 2026-11-23 U01 找回密码令牌核心（等待真实 MySQL8 CI）

- 上包 `b06feac` 真实 GitHub Actions 主 CI run `45125860248` / job `137529916098` completed/success，新增 `U01 auth retention removes only expired email verification records in disposable MySQL` PASS；主 CI 单元 `183/183` PASS、MySQL8 迁移及完整集成、Next build/HTTP smoke 全部 exit 0，同提交其他三条专项 Actions 均 SUCCESS。
- 新增 `tests/password-reset-policy.test.ts` 初次模块不存在 RED exit 1，实现后 2/2 PASS；`PasswordResetToken` 新迁移及 `issuePasswordReset/consumePasswordReset`：哈希、30min、仅 verified 用户、轮换、事务单次 claim、成功更新 scrypt 密码+撤销全部 session。静态 Prisma validate/generate、tsc、完整 npm test、Next build exit 0。
- 新 `tests/integration/password-reset.test.ts` 在隔离库验未验证账号、无明文、过期/重放、并发单次成功、新旧密码及会话撤销。**当前尚无本包真实 CI 回执，不能标 MySQL 专项 VERIFIED**；没启用外部邮件或真实用户账户操作。交接 `u01-password-reset-core-2026-11-23.md`。

## 2026-11-23 U01 过期验证令牌认证数据保留（等待 MySQL CI）

- 前一 `94350a6` GitHub Actions 主 CI `45124959965`、管理员真实 HTTP `45124959956`、恢复只读 `45124960196`、合成非空恢复 `45124959966` completed/success；HTTP 10/10 权限及 CSRF 检查，`unverified ADMIN GET rejected` PASS。**仅原 U01 Web 安全子包具备 CI 证据，实际邮件商户/真实邮箱仍未验收。**
- `tests/auth-retention-verification-policy.test.ts` 对旧实现先 RED；加入 `EmailVerificationToken` 的 expired/deleted 数量、只读预览、限定最多 batchSize 的索引排序以及同事务过期重检删表后专项 GREEN 1/1，完整 `npm test`、独立 tsc、Next 生产 build exit 0；`AUTH_RETENTION_APPLY_APPROVED=true` 运维门禁不变。新增 `tests/integration/auth-verification-retention.test.ts` 仅在 `INTEGRATION_TEST_DATABASE=true` 隔离库运行以验真实 DELETE/未到期保护/幂等，**本机未写库，待 GitHub CI 回执**。详见 `u01-verification-token-retention-2026-11-23.md`。

## 2026-11-23 U01 邮箱验证 Web/邮件守卫（待 HTTP 远端验收）

- `669fe82` 主 CI `45123821665` completed/success，Prisma 全新 MySQL8 迁移、`npm test`、完整真实 DB `test:integration`、重复迁移、Next build/HTTP smoke 全部成功。只代表后端底座 VERIFIED。
- `email-verification-delivery.test.ts` 先缺模块 RED exit 1，后 3/3 PASS（默认禁外发、错误配置与网络失败拒绝、固定提供商）；认证/页面策略 3/3 PASS。新增 `ENABLE_EMAIL_VERIFICATION_DELIVERY` 预发布门禁，测试先 RED `Untracked prelaunch gate` 后 GREEN。完整 npm test、独立 TypeScript、Next build、HTTP E2E 脚本语法检查 exit 0。
- 真实未验证管理员会话攻击路径已加到隔离 MySQL8 HTTP E2E，**仍待新远端运行核验，不凭静态策略就标 VERIFIED**。未提供批准的服务商凭据、不进行真实外部发信，旧用户迁移/密码找回/注销仍缺；详见 `u01-email-verification-web-2026-11-23.md`。U01 总体 IN_PROGRESS。

## 2026-11-23 U01 令牌后端与版本化迁移（等待远端集成）

- `tests/email-verification-policy.test.ts` 首次缺模块 RED exit 1；实现后 3/3 PASS：随机性、SHA-256、严格输入、24h 有效期、无效时钟拒绝。
- `prisma validate`/generate、独立 tsc、完整 `npm test`、`npm run build` exit 0。本地没有调用任何已存在 MySQL；新增 `tests/integration/email-verification.test.ts` 待 CI 一次性 MySQL 8 做真实事务及迁移验收。
- 原始令牌仅作为待批准邮件发送的进程内短时凭证，不存库；邮件供应商、前端确认、登录/注册门禁、旧用户验证未接入，本子包不能标记 U01 VERIFIED。参见 `u01-email-verification-core-2026-11-23.md`。

## 2026-11-23 B07 非空数据恢复合成实验（待远端实测）

- `tests/b07-disposable-restore-ci.test.ts` 初始 YAML/Shell 均不存在：专项 RED 2/2；实现后目标库门禁首次策略 RED，补守卫后专项 GREEN，`bash -n`/完整 `npm test`/独立 `tsc --noEmit`/Next 生产 build 均 exit 0。
- 缺显式授权时脚本 exit 2；单独 CI 工作流中支付/模拟支付/AI/退款/对账均 false。测试 fixture `User + ToolOrder + ToolGrant + ToolRun` 含一个 RESERVED，恢复后用行数/字段 SHA-256 比对。**远端实际恢复回执已补验：** `3d406ce` GitHub Actions run `45122328697` / job `137518703938` completed/success，日志 `B07_DISPOSABLE_NONEMPTY_RESTORE status=PASS fixtures=4`，源/目标一次性数据库独立，SQL 备份恢复后内容 SHA-256 与行数一致；CI 记录 restoreSeconds=0 仅为 CI 计时，不是生产 RTO/RPO。**仅合成恢复子包 VERIFIED，B07 整体仍 IN_PROGRESS**。 详见 `b07-disposable-restore-2026-11-23.md`。

## 2026-11-22 B07 实际 CI 预检成功回执

- GitHub Actions `45038958476` / job `137258883779` SUCCESS，日志 `B07_READ_ONLY_RECOVERY_PREFLIGHT PASS`，迁移文件 14/DB 14，pending/unknown/unfinished/checksumMismatch 全空，missingTables/missingColumns 全空，隔离库三类风险汇总均 0；同提交主 CI `45038958420`、DEAD HTTP E2E `45038958405` SUCCESS。仅本预检子包 VERIFIED，非空业务数据备份恢复、生产迁移与 RPO/RTO 仍未验收；B07 IN_PROGRESS、上线 NOT READY。


