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

## 保留的局限

没有真实商户、沙箱、小额实付、退款或真实对账验证，没有生产环境首次迁移、恢复与回滚演练，也没有完整浏览器 E2E。以上通过的测试**不代表支付通道或正式上线已验收**。实际商户操作开关必须单独由经营者审核。
