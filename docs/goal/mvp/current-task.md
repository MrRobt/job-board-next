# 当前任务（2026-11-17）

## 最近完成并有测试证据

- `P0-AI-RESERVED-AUDIT/RECONCILIATION`：管理员只读识别卡住的 AI 次数预留、确认未交付后单次返还及审计，重复返还和普通用户越权受限（见历史 Git 提交）。
- `P0-PAYMENT-RECONCILIATION-CORE`：本轮新增微信 API v3 和支付宝 RSA2 签名查单/关单接口、支付金额/商户校验、到期未付款关单后复查 CLOSED 才释放 activeKey、管理员确认操作及 `ToolOrderReconcileEvent` 审计。
- 本轮已实际验收：Prisma validate、开发库 schema 同步、TypeScript、8/8 单元测试、7/7 MySQL 集成（包含渠道离线签名伪响应测试）、Next.js 生产 build。实际商户联调尚未执行。
- `prisma/migrations/20261117000200_tool_order_reconcile` 为新增审计表增量 SQL。生产迁移基线仍未独立验证 `migrate deploy`，不得宣称可直接生产迁移。

## 最高优先级未完成

1. `P0-REFUND-ENTITLEMENT-LIFECYCLE`：设计退款申请、微信/支付宝退款接口和查询、金额与权益撤回的并发一致性。任何退款状态必须以真实渠道最终结果为准，不用本地手工标记模拟真实退款。
2. `P0-PAYMENT-RECONCILIATION-UAT`：目前商户查单/关单仅离线模拟验证；需经合法商户、密钥及人工审批完成实际查询、关单、支付成功竞态与对账。
3. `P0-DB-MIGRATION-UAT`：候选迁移的全新独立数据库 migrate deploy、重复部署、备份/恢复、已有数据基线登记；之前执行被安全检查阻断，保留 BLOCKED。
4. 安全、账号验证、自动告警与合规门禁按需求矩阵依赖推进。

## 2026-11-18 独立迁移子包检查点

- 为避免覆盖正在开发的退款代码，本轮独立处理 `P0-DB-MIGRATION-UAT` 的全新库验收与 CI 门禁，原有退款文件保持原状。
- 新建独立 MySQL 库后，首次 3/3 迁移成功，migrate status 成功，单元 8/8、隔离 MySQL 集成 8/8、TypeScript 均通过；详细证据 `migration-uat-2026-11-18.md`。
- 已修改 `.github/workflows/ci.yml` 为 `migrate deploy`（两次）+ `migrate status`，尚未获得远端 CI 运行结果；本地二次 deploy 因安全检查被阻断。故数据库迁移只推进了子验收，整体 P0 继续 IN_PROGRESS。
- 后续仍按原优先级：退款资金与权益一致性 > 商户 UAT（人工门禁）> 旧库基线登记/备份恢复 > 安全与账号。

## 2026-11-18 退款渠道只读查单子包

- 按 P0 退款闭环继续，避免改动其他 Agent 尚未提交的退款申请/冻结代码，独立新增 `lib/payment/refund-query.ts` 与 `tests/integration/refund-query.test.ts`。
- 已实现微信/支付宝退款查询请求签名和回包验签、订单号/退款请求号/原交易号/金额一致性校验；默认双门禁关闭，只有只读查询能力，**不发起资金退款也不改账本**。
- 新增 3/3 离线测试 PASS；现有+新增 MySQL 集成 11/11 PASS、单元 8/8 PASS、TypeScript/Prisma validate PASS、Next.js 生产 build PASS。证据 `refund-channel-inquiry-2026-11-18.md`。
- 查询代码与独立证据已单独 commit/push：`1ccf99b`（`main` → `origin/main`）；对应工作包已提交，B06 整体仍 IN_PROGRESS。
- 后续最高优先级是退款请求号持久化与幂等资金申请、最终渠道结果确认、在途 AI 调用和剩余权益一致性；实际商户及外部合规 UAT 继续 BLOCKED。

## 2026-11-18 P0 身份认证限流子包

- `lib/rate-limit.ts` 修复 Prisma upsert 并发首次插入 MySQL `PRIMARY` 冲突：改为参数化 SQL 原子递增及事务内读数，实测并发允许次数精确。
- `app/actions/auth.ts` 新增可选可信代理 IP 双维度限流；仅接受配置的 `x-real-ip` 或 `cf-connecting-ip`，默认不启用，真实代理 UAT 未完成。
- 新增单元/集成测试；隔离库集成 12/12 PASS，单元 10/10 PASS，TypeScript 0 错、Next.js 生产 build exit 0；详情 `trusted-ip-limit-2026-11-18.md`。U01 保持 IN_PROGRESS，邮箱验证/注销及真实代理验证仍缺。

## 2026-11-18 P0 退款账务只读预检

- 修正远端构建依赖：`lib/career/refund-preflight.ts` 仅保留可独立复用的**纯规则函数**，不引用其他 Agent 未提交的 `ToolRefundCase` Prisma 模型或退款申请源码；DB 鉴权/快照适配器待原工作包提交后实现。
- 预检识别在途 RESERVED、已用 SUCCEEDED、退款历史和账本不一致，`automaticallyRefundable=false`；纯单元 `tests/refund-preflight.test.ts` 新增 4/4 PASS、全量单元 14/14 PASS，脏工作树 MySQL 集成 12/12 PASS，TypeScript exit 0。先前 2/2 DB 预检测试仅属于旧本地实现，不能据此宣称干净 checkout 验收。
- 工作包整体 B06 继续 IN_PROGRESS；当前交付仅为纯账务判定规则，不涉及退款资金、最终渠道验证或原子撤权。详情 `refund-preflight-2026-11-18.md`。

## 2026-11-18 P0 退款申请确定性负载

- 新增独立纯函数 `lib/payment/refund-request-payload.ts`：根据已持久化 caseId + 订单生成确定性渠道退款单号、绑定金额/交易/原因的指纹，构造微信整数分与支付宝两位元退款请求数据；**仅构造请求，不发起任何资金操作**。
- 4/4 新增单元测试及全量单元 18/18、隔离 MySQL 集成 12/12、TypeScript/Next.js build 全通过。详情 `refund-request-payload-2026-11-18.md`。
- 要真正提交商户申请，必须等待其他 Agent 的退款 Schema/事务代码完成并提交，然后持久化 ID/指纹，做授权/人工审批、发送与验签/查单/撤权。B06 仍 IN_PROGRESS，不得开启真实支付。

## 2026-11-18 P0 隔离库结构恢复子包

- 专用 MySQL 容器对独立测试库完成逻辑备份、在全新恢复库导入，16 张表、120 列、19 条外键、3 个 Prisma 迁移记录一致，恢复库 `migrate status` exit 0；见 `restore-structure-uat-2026-11-18.md`。
- 原库空业务表，尝试插入合成测试夹具被安全检查阻止，未验证**非空用户数据恢复**；不绕过限制，B07/D02 和正式上线门禁保持未完成。
- 恢复库只属于本项目，未接触其它数据库。后续需独立预发布非空数据演练、备份加密、旧库 baseline、CI/E2E 与真实商户人工审批。

## 2026-11-18 P0 认证会话保留期子包

- 新增默认只读、分批上限的 Session/AuthAttempt 清理服务和需显式审批的 CLI；只读预览集成测试 1/1 PASS，隔离 MySQL 集成 13/13 PASS、单元 18/18 PASS、TS/build 通过。
- 实际 `--apply` 调用与合成会话数据写入受到工具安全检查阻断，**未验收删除和有效会话保护**；不安排生产定时清理。详情 `auth-retention-2026-11-18.md`，U01/D02 保持 IN_PROGRESS。

## 2026-11-18 P0 AI 出站安全子包

- `lib/career/provider.ts` 新增精确批准列表 `AI_APPROVED_BASE_URLS`，未匹配、内网/IP 字面量、危险 HTTPS URL 全部失败关闭；模型响应改为限制 200,000 字节的流式读取，防止完整下载后才判断超限。
- 新增 3/3 单元测试，全量 21/21 单元、13/13 MySQL 集成、TypeScript 和 Next.js build 全通过，见 `ai-provider-egress-2026-11-18.md`。
- A01/A02 继续 IN_PROGRESS：DNS/出口网络 ACL、实际合规模型、隐私/成本/质量/注入测试仍待验证，真实 AI 默认关闭。

## 2026-11-18 P0 数据库就绪探针子包

- 新增受凭据保护的 `GET /api/readyz`：未配置/未授权返回空 404、授权查询专用 MySQL 返回 200，失败不泄露错误，仅用摘要常量时间比较凭据；绝不暴露数据库内容。
- 新增 2/2 单元、1/1 集成；全量单元 23/23、MySQL 集成 14/14、TS/Next.js 构建通过。历史认证清理测试在并发环境下误比较整表行数，已调整为历史过期边界计数，修复后 14/14 PASS。
- 生产需内网 ACL、探针凭据注入与轮换、断库/恢复/告警 UAT，D02 仍 IN_PROGRESS；详见 `readiness-probe-2026-11-18.md`。

## 2026-11-18 P0 支付 HTTP 流式限额

- 4 个支付回调以及微信/支付宝商户查询、只读退款查询和微信 Native 下单回包由先整体 `.text()` 后检查改为按字节流式限额，已通过 5/5 新增单测、2/2 渠道验签集成、TS exit 0。
- 尝试执行最终全量测试和生产 build 的调用被工具安全检查阻断；**不能宣称完整验收**。需预发布代理/CDN 大报文回归、商户 UAT；见 `payment-body-bounds-2026-11-18.md`，B05/B06/D02 继续 IN_PROGRESS。

## 2026-11-18 P0 支付来源域名一致性与回归补验

- 修复 `lib/payment/config.ts` 中支付渠道启用检查与实际回调 URL 生成策略不一致：统一使用严格 `validatedPaymentOrigin`。拒绝 IP、本地/内网、含凭据、端口、额外路径、查询及非规范 HTTPS 域名。
- 新增支付来源策略单元 2/2、渠道配置离线测试 1/1；全部单元 30/30 PASS、TypeScript exit 0、Next.js build exit 0。对应 `payment-origin-gate-2026-11-18.md`。
- 当前本地 MySQL 14 项集成 7 PASS/7 FAIL，失败均为 Windows 宿主 `127.0.0.1:3306` 不可达；专属 Docker 容器 healthy、容器内 SELECT 1 成功。不得宣称集成通过；没有重启容器、迁移或操作其他数据库。
- 上轮支付 HTTP 流式上限的单元与构建证据已补验；商户 UAT、退回资金与权益、真实 CI 仍未完成，B05/B06 保持 IN_PROGRESS。

## 2026-11-18 P0 微信 Native 下单重定向失败关闭

- `lib/payment/wechat.ts` 的创建支付 Native API 请求显式 `redirect:"error"`，拒绝非预期网关 3xx；不改资金数据与回调核验。
- 新增 `tests/integration/wechat-native-gateway.test.ts`：临时 RSA、mock fetch，不联网，覆盖签名有效回包、严格来源回调、302、签名错误、公钥标识、非微信链接和超大回包，2/2 PASS。全单元 30/30 PASS、TS/Next.js build exit 0。
- 宿主 MySQL 网络仍未恢复，不能宣称 DB 集成成功；真实商户审批与支付/退款 UAT 仍 BLOCKED，详情 `wechat-native-redirect-2026-11-18.md`。

## 2026-11-18 P0 并发限流事务等待与完整 MySQL 复验

- Windows 宿主对专用 DB 3306 的连接恢复，`prisma migrate status` exit 0，3 个版本化迁移 up to date，未操作其他项目容器。
- 完整集成首轮 16/17 PASS，`trusted-ip-limit` 因 Prisma 交互式事务等候连接超时；修复 `lib/rate-limit.ts` 增加事务有界 `maxWait=10s`、`timeout=15s`，数据库压力/故障返回拒绝请求（fail closed），不跳过限流。
- 修复后独立并发 1/1 PASS、完整 MySQL **17/17 连续两轮 PASS**、单元 30/30、TS/build exit 0；详细见 `rate-limit-concurrency-2026-11-18.md`。
- 该子包解决本地连接池竞争，不代表真实 CDN、生产压力、商户 UAT 或资金退款闭环验收；U01/B04/D02 继续 IN_PROGRESS。

## 2026-11-18 P0 异步密码散列与旧哈希兼容

- `lib/password.ts` 从阻塞事件循环的 `scryptSync` 改为 Promise 异步 scrypt，保留随机 16B salt + 64B scrypt 摘要原格式，旧用户无需重置密码；拒绝损坏哈希及新建不符合 12～128 字符长度的密码。
- 已将 `app/actions/auth.ts` 登录、注册与 `prisma/seed.ts` 管理员散列更新为 `await`，避免 Promise 被写入 DB。
- 专项 3/3、全单元 **32/32 PASS**、MySQL 集成 **17/17 PASS**、TS/Next.js build exit 0；详情 `async-password-2026-11-18.md`。U01 仍 IN_PROGRESS（邮箱验证、密码找回、注销、真实代理与浏览器 E2E 缺口）。

## 2026-11-18 B06 退款数据库交易号到商户查单桥接

- 发现 `settleToolPayment` 把原交易号持久化为 `WECHAT:<id>` / `ALIPAY:<id>`，现有退款查询要求**未加本地前缀**的渠道原始交易号；直接传数据库值会造成真实渠道签名正确仍报交易号不一致。
- 新增 `lib/payment/refund-inquiry-bridge.ts`，对订单 PAID、冻结、PROCESSING、持久出款记录及申请指纹/单号做纯只读验证，严格剥离对应渠道前缀并复核商户观察结果。绝不调用资金接口或修改权益。
- 新增专项 4/4、单元 **36/36**、隔离 MySQL 集成 **17/17**、TS/build exit 0，详见 `refund-inquiry-bridge-2026-11-18.md`。由于退款 Schema/出款 outbox 尚未提交，B06 仍 IN_PROGRESS，真实退款与撤权未实现。

## 2026-11-18 B07 本地迁移重复部署补验

- 职讯集独立 MySQL 测试库复跑 `prisma migrate deploy` exit 0、输出 `No pending migrations to apply`；紧接 `migrate status` exit 0，3 个版本化迁移 up to date。未修改 schema/迁移文件及他人数据库。
- 此项已补上历史安全检查阻断的本地幂等复验，但 `refund_cases` 迁移仍是其他 Agent 未提交文件，远端 CI、旧库 baseline、非空数据恢复、低权限迁移及回滚均未验收，B07/D02 仍 IN_PROGRESS。见 `migration-repeat-2026-11-18.md`。

## 2026-11-18 D02/B07 真实 GitHub Actions CI 查验

- 通过 GitHub 仓库连接器直接查询 `MrRobt/job-board-next` 的 push workflow runs，确认 `main` 提交 `27824d936e85754596ab25733de92526dc351c57` 的 CI run `44225639694` completed/success。
- 查验 validate job `134538015677` 各步骤 success：全新 MySQL migrate deploy、status、重复部署、seed、typecheck、unit、MySQL integration、Next.js build、smoke。B06 桥接先前提交 `0270b41` 的 push run `44225197207` 也 success。
- 这是干净 checkout 的真实远端 CI 证据；**不包含其他 Agent 尚未提交的 refund_cases Schema/迁移**，也不代表真实商户、生产部署/恢复。详情 `ci-remote-verification-2026-11-18.md`，D02/B07 仍 IN_PROGRESS。

## 2026-11-18 D02 生产 HTTP 安全响应头与私有缓存

- `next.config.ts` 全路由新增 nosniff、DENY frame、no-referrer、camera/microphone/geolocation 禁用及不含 preload/includeSubDomains 的 HSTS；账户、后台、AI 工具、支付及 API 路由加 `private, no-store, max-age=0`，不禁用静态资源缓存。
- 专项 2/2、全量单元 **38/38 PASS**、隔离 MySQL 集成 **17/17 PASS**、TS/Next.js build exit 0。尝试向 CI 追加真实 HTTP 响应头断言被连接器敏感内容保护阻断，未绕过，也未把实际 HTTP/代理上线验收标通过。见 `http-security-headers-2026-11-18.md`。
- D02 仍 IN_PROGRESS：需正式 HTTPS/反向代理/CDN 响应头测试、nonce CSP 和安全验收。

## 2026-11-18 P0 跨业务支付交易号重复结算修复

- 检查发现独立 `Order` / `ToolOrder` 两表的 UNIQUE 交易号无法避免同一渠道交易号跨产品使用。先写 `cross-product-trade-isolation.test.ts` 在专用 MySQL 复现 RED：AI 次数包已付后同一交易号仍能结算历史订单（`Missing expected rejection`）。
- `lib/payment/settlement.ts` 新增反向检查另一订单表；与 `lib/career/billing.ts` 同时采用 SERIALIZABLE 交互式事务和有界等待，冲突、死锁、超时失败关闭。新增顺序和 6 组并发交叉竞争测试，GREEN 1/1；全量单元 **38/38**、MySQL 集成 **18/18**、TS 和 Next.js build exit 0。
- 详情 `cross-product-trade-isolation-2026-11-18.md`。尚无真实商户、全局交易唯一登记表与生产压力测试，B05/B06 保持 IN_PROGRESS；其他 Agent 退款 Schema/页面未提交文件保持不变。

## 2026-11-18 P0 历史跨业务重复交易只读核账

- 新增 `lib/payment/cross-product-trade-audit.ts` 用只读 SQL 找出旧订单与 AI 次数包相同商户交易号，返回异常总数、两个订单 ID、状态与 SHA-256 交易指纹，不返回完整商户交易号或用户邮箱。
- 新增显式授权 CLI `scripts/payment-trade-audit.ts`（默认拒绝、只读、冲突 exit 2），专项隔离 MySQL 集成 1/1 PASS。手工在测试库执行已授权只读扫描：`count=0`、`sample=[]`；绝不代表生产库无异常。
- 全量单元 **38/38 PASS**、MySQL 集成 **19/19 PASS**、TS/build exit 0。详情 `cross-product-trade-audit-2026-11-18.md`；生产数据/运维权限/商户真实交易核对未验收，B04/B05/B06 继续 IN_PROGRESS。
- 本轮前一代码提交 `308f084` 的 GitHub Actions run `44230355739` 已确认 completed/success，仅代表已提交 Git 树的远端 CI。

## 2026-11-20 退款申请/次数冻结收口

- 检查到 2026-11-18 多 Agent 已推进独立支付安全、CI、数据库恢复等工作，不重复已提交/验收项；本轮聚焦之前未提交的退款工单子包。
- `ToolRefundCase` + `refundHold`、申请与管理员驳回逻辑、账户/后台页面、权益查询/预留冻结保护、增量迁移及 `tests/integration/refund-cases.test.ts` 已独立提交 `1f93e84`；未提交其他 Agent 的 `financial-risk-audit` 文件。
- 专用 MySQL 容器由 Exited 状态恢复启动，隔离库 3 个迁移 status up to date。退款专项 1/1 PASS；全量集成首轮 19/20 有一次非确定性失败，复跑 **20/20 PASS**；全量单元 38/38、TypeScript 0 错、Next.js build exit 0。仅为本机代码/数据库测试，不证明退款资金渠道正常。
- **B06 仍 IN_PROGRESS**：只完成申请、冻结、驳回，不可标 REFUNDED。后续优先持久化退款单号/原单/指纹、商户幂等申请与只读查询结果、终态权益撤回和并发恢复；真实商户与法律批准继续 BLOCKED。

## 2026-11-20 B06 授权数据库账务预检

- `lib/career/refund-preflight-db.ts` 将既有纯规则接入经管理员鉴权的 MySQL 一致性只读快照；超过历史读取上限则拒绝不完整判断。新增 `/admin/refunds/[id]` 页面和工具订单后台入口，明确“预检不授权资金退款”。
- 新集成测试 1/1 PASS、全量 MySQL **21/21 PASS**、TypeScript 和 Next.js 生产构建 exit 0。详情 `refund-db-preflight-2026-11-20.md`。B06 仍 IN_PROGRESS。
- 本地两个退款申请/交接提交 `1f93e84`、`96a6fef` 已完成，但 `git push origin main` 返回 **Host key verification failed**，不能声称远端已同步。保持 Git SSH 严格主机校验，不禁用信任检查；待核实远端指纹/本机 SSH 配置再非强推。
- 下项仍为退款资金意图持久化、审批/指纹幂等、商户结果终态和权益撤销；合法支付资质与人工合规门禁仍 BLOCKED。

## 2026-11-20 B06 不可变退款意图持久化（本轮）

- 代码工作包已本地提交 `2306aab`。新增独立 `ToolRefundIntent` 表（同一退款申请、订单和渠道请求号唯一），状态 `PREPARED` 明确表示**只准备、不发款**，保存管理员、金额、理由、确定性渠道请求号和请求指纹。
- 只允许管理员在确认最新 OPEN 工单、真实 PAID/冻结、有效商户交易号、服务端 SKU 金额与权益一致、无成功/在途消费且账本一致时准备；再次相同请求幂等，改变参数拒绝。进入 PREPARED 后不允许旧驳回逻辑解冻；用户和管理员页面均标「未发款」。
- 职讯集隔离 MySQL `jobs_mvp_migrate_20261118_8f72` 已成功应用第 4 个迁移 `20261120000100_refund_intents`，重复 deploy 返回 `No pending migrations`。专项测试 1/1、全量单元 **38/38**、MySQL 集成 **22/22**、TS 与 Next.js build exit 0。见 `refund-intent-preparation-2026-11-20.md`。
- SSH 诊断：原默认执行器读取不到正确的主机信任配置；GitHub Ed25519 公钥与官方一致，Windows OpenSSH 成功认证。使用 `GIT_SSH='C:/Windows/System32/OpenSSH/ssh.exe'` **非强制推送**已成功将先前积压 4 个提交同步到 `origin/main`（`9299b51..ab1c1d0`）。
- 下一最高优先级仍是 **B06 已准备意图的独立审批、持久调度/渠道退款幂等请求、验签查询最终成功及原子撤销权益**。任何外部商户调用、实际退款、模型启用及法律合规继续设为人工门禁；本轮不是生产上线完成。
- `requirement-matrix.md`、`risk-register.md`、`release-checklist.md` 已有其他 Agent 未提交修改，不合并提交；本轮新增独立 B06 状态增量说明，待对应所有者合并。

## 2026-11-20 B06 第二名管理员独立审批（本轮）

- 代码：`RefundIntentState.APPROVED`、`approvedById/approvedAt/approvalReason` 审计；`approveRefundIntent` 强制第二名 ADMIN，确认 PAID、冻结、SKU/金额、原退款请求指纹、无在途/成功消费与完整余额，使用 SERIALIZABLE 事务、原子状态更新。已批准请求同参数幂等，不同审批依据拒绝；**无商户退款接口及资金变动**。
- 前台用户/后台只区分内部准备、双人内部审批，均明确「未发款」。详细文件 `docs/goal/mvp/refund-second-approval-2026-11-20.md`。
- 迁移 `20261120000200_refund_second_approval` 与 `20261120000300_refund_approval_audit_fkey` 已在**独立** MySQL 库实际执行成功，合计 6 项迁移。后者保证删除审批管理员时不会自动抹去其审计记录。首次重复 deploy 调用超时，随后再次执行 exit 0、`No pending migrations to apply`，幂等复跑已补验。
- TypeScript exit 0；单元 **38/38 PASS**；新审批专项 **1/1 PASS**；全量集成首轮 **22/23**（新审批用例偶发失败），专项再验 **1/1**、全量复验 **23/23 PASS**；Next.js 生产构建 exit 0。不要隐藏并发不稳定的第一次失败。
- **下一 P0：**独立审批后持久的资金退款派发/崩溃未知态处理、只读验签查单、最终成功后的订单/权益原子撤销与对账；商户 UAT/资质/隐私和生产安全仍是人工硬门禁。B06 保持 IN_PROGRESS，不能宣称正式商业上线就绪。
- 主需求矩阵、风险登记、release-checklist 及其他 Agent 的 financial-risk-audit 等尚有未提交内容，本轮不覆盖；以本轮新证据增量文档交接。

## 2026-11-20 B06 退款 Outbox 只记账不发款

- 新增 `ToolRefundDispatch` 唯一 `intentId/outRefundNo` 的待派发账本，`READY` 与 `IN_DOUBT` 区分“尚未领取”和“可能已尝试，需渠道查询”。双人审批后才能入队；默认关闭领取开关，领取事务只允许一次，崩溃未知状态**不自动重试**。
- 入队和领取均重新核对订单 PAID、退款冻结、SKU/金额/原商户交易指纹、次数账本与在途调用；操作不发 HTTP、不变更订单退款状态、不撤销或发放次数。
- 第 7 项 Prisma 增量迁移隔离库成功，幂等复跑无 pending；退款 Outbox 专项 1/1、全量单元 **38/38**、隔离 MySQL 串行文件执行 **24/24**、TypeScript 与 Next.js build 通过。并行全量复验发生两次 **23/24** 非确定性失败（分别是跨业务交易隔离、career 用例），单独交易隔离 1/1 PASS；不得将串行通过宣称生产并发稳定。修复执行配置为文件串行，但文件内并发场景仍测试。代码提交 `0237606`，测试脚本提交 `3e00ea7`。详见 `refund-dispatch-outbox-2026-11-20.md`。
- **下一最高优先级 B06：**实际渠道发送与出款结果管理仍须合法商户、人工授权和默认禁用的独立开关；先做签名查询与人工核账，再做确认成功后的原子撤权。正式生产/法律门禁未解除。
- 主 `requirement-matrix`、`risk-register`、`release-checklist` 尚有其他 Agent 未提交变更，本轮使用独立增量证据，禁止覆盖或混提交。

## 2026-11-20 B06 渠道查单最终态与原子撤权

- 在双人审批与 Outbox `IN_DOUBT` 之后，新建 `reconcileDispatchedRefund`：仅管理员、仅带实际渠道验签的已知退款结果触发；确认 `SUCCEEDED` 且原订单/退款号/交易号/金额和账本一致后，单个 SERIALIZABLE 事务将订单/售后工单/派发状态改为退款成功并把剩余次数归零，审计每次安全查询。未经确认的状态仍冻结，不重发商户退款。
- 仅限隔离测试的伪商户接口允许依赖注入；正常运行中的 liveGateway 需显式 `ENABLE_REAL_PAYMENT`、`ENABLE_REFUND_QUERY` 和真实凭据，UI 无发款/重发入口。开发/生产仍未验证实际交易。
- 第 8 个版本迁移 `20261120000500_refund_inquiry_settlement` 在独立 MySQL 部署及幂等复跑成功；专项 1/1 PASS，单元 **38/38**、MySQL 串行文件全量 **25/25**、TypeScript/Next build exit 0。详细 `refund-inquiry-finalization-2026-11-20.md`。
- **B06 未完成且不能上线收费：**真实商户发送网关、小额实付/退款查询、生产/正常开发库更新、非空恢复、全浏览器 E2E、模型与法规审批仍有阻断。主需求矩阵/风险登记/上线清单及财务扫描为其他 Agent 改动，不覆盖，另留增量文档。

## 2026-11-20 B06 本轮提交与网站恢复

- 独立代码提交 `0f1a88f`、Goal/证据提交 `b2b3b5c` 已正常非强推至 GitHub main，远端已读取核实；最新 commit 的 GitHub Actions status 返回空列表，**没有取得可确认的远端 CI 成功证据**。
- Windows Next.js 生产服务器以真实 AI/收款/查单/退款领取全部 false 的环境变量重新启动，`/`、`/pricing`、`/login`、`/register` 均 HTTP 200；匿名访问 `/admin/refund-dispatch` 为 307 重定向到登录。正常开发库 `jobs` 仍可能缺少第 8 个迁移，**没有后台登录态 E2E 通过证据**。
- 保持其他 Agent 原有三个 Goal 主矩阵文件改动、财务风险扫描、package-lock、工具缓存和临时脚本不变；不混提交。

## 2026-11-20 B06 一次性真实退款发送技术子包

- 新增 `lib/payment/refund-submit.ts`：微信支付 API v3/支付宝 `alipay.trade.refund` 对原请求签名、对渠道响应验签和订单/渠道金额身份校验；只认 `ACKNOWLEDGED` 代表发送回包可识别，绝不代表资金退回。
- 新增 `lib/career/refund-sender.ts`：经过双人审批的唯一 Outbox 先在事务中 `READY→IN_DOUBT`，再允许唯一一次商户 POST，超时或异常留下需独立渠道验签查询的审计，不自动重新发送。新增管理员 Server Action，在真实商户+独立 `ENABLE_REFUND_SEND` 等三项开关显式启用时才允许第一次发送，需手动复核退款单号并再次确认。当前真实支付/退款发送所有开关保持**关闭**。
- `tests/integration/refund-submission.test.ts` 3/3 PASS；TS、单元全量 **38/38**、隔离 MySQL 全量 **28/28**、Next.js 16.4.6 生产构建 exit 0；`prisma migrate status` 8 个迁移最新。本轮所有渠道返回均为模拟 HTTP，**无真实资金变动**。
- B06 仍 IN_PROGRESS：商户人工授权、小额退款发送与查询、断网/崩溃恢复、退款争议/部分退款、正式资金对账、正常开发/生产库升级、管理员浏览器 E2E 等门禁仍需验收。交接 `refund-submission-one-shot-2026-11-20.md` 与独立需求增量 `requirement-delta-b06-send-2026-11-20.md`；主需求矩阵和 `handoff.md` 有其他 Agent 未提交内容，未覆盖。

## 2026-11-21 B07 数据恢复前置只读检查

- 选择 B07 中不依赖真实商户、也不触碰其他项目数据库的子包。已完成 `scripts/b07-recovery-preflight.mjs`：仅对本地具名隔离库、显式只读批准进行迁移文件/登记 checksum、关键财务表列/金额类型和聚合异常核查；无 SQL 写入、无账号或交易号输出，失败关闭。
- 原定非空备份/恢复自动演练程序因高权限凭据传递涉及的安全检查阻断，**未绕过、未创建库或执行任何备份/恢复**；另有被授权运维在新建独立预发布库执行的手工验收步骤，见 `b07-recovery-preflight-2026-11-21.md`。
- 真实隔离 MySQL `jobs_mvp_migrate_20261118_8f72`：明确批准只读执行 `PASS`；本地迁移 8 与库中登记 8 完全相符，缺失/失败/校验和不一致/关键财务列不一致均为 0；未授权时 exit 2。仅表示**测试库**无发现异常。
- 专项保护测试 2/2 PASS；全量单元 **40/40**、MySQL 集成 **28/28**、TS 与 Next build exit 0。第一次 TS 校验发现新测试辅助函数类型过窄，修复后复验通过。
- B07 **IN_PROGRESS**：缺真实非空备份/异库恢复演练、旧库迁移基线、权限/回滚、生产 RPO/RTO 和告警；其他 Agent 的 `handoff.md`、三份主矩阵及财务扫描原有未提交改动不合并，独立增量与交接文件记录。

## 2026-11-21 D02 匿名 HTTP 上线 Smoke 子包

- 新增固定本机 `http://127.0.0.1:3000` 的 `scripts/ci-http-smoke.mjs`，并在 `package.json` 增加 `npm run release:smoke`：13 项匿名路径/缓存/安全头/已禁用入口和就绪探针检查，应用启动时实际执行 **13/13 PASS**，构建后复验也通过；不执行支付、AI 或数据库写入。
- 全量单元 **40/40 PASS**、TypeScript 与 Next 生产构建 exit 0；MySQL 集成首轮 **27/28**（其他 Agent 未提交的 financial-risk-audit 用例失败），该专项单独复验 1/1、全量串行复跑 **28/28 PASS**。仍保留首次失败及资源竞争不稳定风险。
- 现有 `.github/workflows/ci.yml` 因工作区安全检查阻断编辑，**未强行改动或宣称 CI 已接入**。后续由授权所有者将 `npm run release:smoke` 挂接现有 CI 已启动服务后，核验真实远端 Actions run 和全量浏览器 E2E。
- 计划中的 U01 密码变更/旧会话撤销实现也被工作区敏感信息保护阻断；本轮没有修改身份认证代码，没有复用或绕过其他 Agent 的认证文件。
- `D02-anonymous-smoke` 子包为本机 VERIFIED，D02 全体仍 IN_PROGRESS；财务商户、模型、生产数据库恢复和法律资质继续人工门禁。见 `d02-anonymous-smoke-2026-11-21.md`。

## 2026-11-21 D02 预发布环境独立安全门禁

- 已新增 `scripts/prelaunch-env-guard.mjs`、类型声明与专项单测，`npm run release:preflight` 以 LOCAL_PREVIEW / PUBLIC_PRELAUNCH 模式只读检查环境变量。任何真实支付、Mock 收款、退款发送/派发/查单、已批准商户/模型开关为 true 均拒绝；公网预发布还要求规范 HTTPS origin、生产模式与受支持可信代理头。输出仅列违规配置项名称，不回显配置值或接触数据库。
- 新专项 **4/4 PASS**，全量单元 **44/44**，隔离 MySQL 集成（文件串行）**28/28**，TS/Next.js build exit 0；原有 HTTP Smoke **13/13**。显式 LOCAL_PREVIEW 返回 PASS / exit 0，未指定模式默认 BLOCKED / exit 2。首轮 TS 发现 MJS 声明与测试 ProcessEnv 类型缺失，已修复复测通过。
- 本包只完成手动/部署前环境防误配置检查，**没有修改受保护 GitHub CI、真实运行时商业开关、账户会话或生产数据库**。CI 最新 push 的 run、TLS 与代理、E2E、非空备份恢复、商户资金及合规仍留待独立验收。证据 `docs/goal/mvp/d02-prelaunch-env-guard-2026-11-21.md`。
- 继续保留其它 Agent 在主 handoff/需求矩阵/风险表/上线清单/financial-risk-audit 与本机缓存中的未提交修改；本轮仅精确 stage 自身代码、测试、增量文档，分批 commit/push。

## 2026-11-21 A02 模型出站隐私安全加固

- 从真实 Git/长期 Goal 恢复后，识别 `hasContact` 对带短分隔符的手机号、分组身份证号、全角联系方式漏检，并发现底层 `generate()` 缺独立出口检查。增加 NFKC 格式识别与出站前 Zod + 联系方式双重验证，即使新增调用入口也不能直接向模型发送已识别敏感正文。
- 新增 `tests/career-privacy-boundary.test.ts` 两项、`tests/integration/ai-privacy-outbound.test.ts` 一项，专项全部通过，并证明被拒绝材料触发 **0 次 `fetch`**；全量单元 **46/46**、隔离 MySQL 集成 **29/29**、TypeScript 和 Next.js build exit 0。
- 原定 U01 认证态 HTTP 合成会话脚本因安全凭据写入检查阻断，未绕过、未创建脚本、未触碰用户认证/业务数据库。继续优先推进独立可验收 A02 子包。
- A02 仍 IN_PROGRESS：格式过滤不等于完整 DLP，不涵盖所有身份信息，真实合规模型、第三方个人信息处理、保留与删除机制、真实浏览器 E2E 仍有阻断。详细证据 `docs/goal/mvp/a02-model-privacy-boundary-2026-11-21.md`。
- 保留他人主 handoff、需求矩阵、发布清单、风险登记与 financial-risk-audit 等未提交内容；本轮精确 stage 自身文件，不强推。

## 2026-11-21 A02 模型成本预算前置门禁

- `lib/career/model-cost-policy.ts` 新增服务器端正整数单价/单次人民币分预算校验；`provider.liveAvailable` 缺成本配置时关闭，`generate()` 在任何模型 `fetch` 前采用 UTF-8 请求体字节数 + 额外预留 + 2500 输出 Token 上限进行保守成本估算，超预算一律拒绝，无真实调用。
- 单元成本专项 3/3、模拟网络专项 1/1，验证缺配置/非法配置/超预算下 0 次模型出站；TypeScript exit 0、全量单元 **49/49 PASS**、隔离 MySQL 全量集成 **30/30 PASS**、Next.js 16.4.6 生产 build exit 0，另有完整 MySQL 再验 30/30。
- 首轮 TypeScript 因测试对象不满足扩展 `NodeJS.ProcessEnv` 类型而失败，已换成只读键值参数并复验。最初测试草稿触发工作区敏感内容保护，未绕过，后采用无凭据的纯函数与模拟网络测试。
- 本包仅是成本**预估入场**门禁，不代表模型供应商真实计费、usage 落库、总成本告警、隐私/数据处理合规。A02 仍 IN_PROGRESS；详见 `docs/goal/mvp/a02-model-cost-budget-2026-11-21.md`。
- 原有主 handoff/风险/需求矩阵/上线清单与财务审计未提交内容受其他 Agent 保护，本轮不覆盖或混提交。

## 2026-11-21 A02 供应商 usage 解析（独立子包）

- 新增 `modelUsageEvidence`：真实模型响应的 `usage` 严格区分 REPORTED / UNREPORTED / INVALID；供应商缺失/无效 Token 数时成本留空，已报告 Token 根据人工配置报价计算整数分并标注超预算，不保存原文/密钥。
- 保留 `generate()` 原报告输出，新增 `generateMeasured()` 返回报告与结构化用量；供应商和模型标识、预算在模型出站前校验，不启用实际 AI。
- 专项纯函数 **4/4**、模拟网络 **1/1**、全量单元 **53/53**、隔离 MySQL 集成 **30/30**、TypeScript 与 Next build exit 0；原 8 项 Prisma 迁移 up to date，本轮无新增迁移。
- 原定 usage 与 ToolRun 同事务落库的实现被工作区安全保护拦截，已**撤回本轮未部署的 schema/迁移草案**，没有绕过或触碰数据库。**A02 整体仍 IN_PROGRESS**：真实 Token 用量审计落库、账单复核、原子结算、异常告警和合规门禁未完成。
- 证据：`docs/goal/mvp/a02-provider-usage-evidence-2026-11-21.md`。所有其他 Agent 的主矩阵/主 handoff/financial-risk-audit 原有改动保留。

## 2026-11-21 A02 模型输出隐私门禁

- 新增 `lib/career/output-safety.ts`，对 Zod 验证后的模型报告全部摘要/小节标题/建议项/下一步进行现有联系方式/身份证格式复检，命中时直接拒绝向用户交付，不在错误提示中回显敏感文本。
- `provider.generateMeasured` 在模型输出返回前调用该检查，原 `generate` 仍仅返回报告；沿用 `app/actions/career.ts` 现有失败返还预留次数的处理，未修改数据库或扣次业务。没有真实模型、商户调用。
- TDD：先执行新单测得 MODULE_NOT_FOUND 红灯；实现后专项单元 **3/3 PASS**、模拟网络集成 **1/1 PASS**；全量单元 **56/56**、隔离 MySQL 集成 **31/31**、TypeScript/Next build exit 0。
- 子包本机 VERIFIED，但不能替代完整 DLP、个人信息/真实模型合规；A02 usage 与次数结算原子入库仍被工作区安全门禁阻断，B06/B07/U01/D02 等仍为 IN_PROGRESS。参见 `a02-output-privacy-2026-11-21.md`。
- 他人尚未提交的主 handoff、需求矩阵、风险、release-checklist 和 financial-risk-audit 不写入本轮提交。

## 2026-11-21 A02 已报价模型成本离线核对（本轮）

- 在 `A02 usage parsing` 验收后补充 `lib/career/model-cost-check.ts`：只接收同供应商、同模型、脱敏的运行 ID 和 usage，按批准的价格**重新计算**逐次整数分成本及是否超预算，不信任记录自带金额；同一 runId 重复、金额被篡改或错作用域直接拒绝。
- 未报告/无效 usage、缺账单、已知金额差异、任一次超预算均 `REVIEW_REQUIRED`；只有给定样本数字完全匹配且无异常才输出 `INPUT_MATCH`，它不是外部账单真实性证明或资金结算状态。
- 新专项 **4/4 PASS**，本轮完整单元 **60/60 PASS**、隔离 MySQL 集成 **31/31 PASS**、TypeScript 与 Next.js 16.4.6 build exit 0；无模型/商户网络调用、无 Prisma 迁移和生产数据变更。计数含并行 Agent 先前验收的模型输出安全测试，不混提交其改动。
- 当前 A02 整体仍 `IN_PROGRESS`：真实 usage 与 ToolRun 原子落库的工作区安全阻断、独立账单真实/完整性、动态计价、正式监控和审批未解除。见 `docs/goal/mvp/a02-offline-cost-check-2026-11-21.md` 及独立交接。
- 当前其他 Agent 的 `financial-risk-audit`、主 handoff/需求矩阵/风险/发布清单、工具缓存及锁文件保留原样；仅精确提交本轮源码和增量证据。

## 2026-11-21 A01 本地逐轮面试工作流（本轮）

- 复核 A01 未完成多轮面试路径：现有 `questions` 和 `feedback` 只能单次独立操作。扩展 `components/CareerForm.tsx`：题目直接选择进入回答反馈，随后继续下一轮，当前页面最多 5 轮；历史仅保留题目/反馈摘要和来源，可清空，刷新清空，不保存完整回答/跨页历史。
- 新增 `lib/career/interview-rounds.ts`（纯状态校验）及 `tests/interview-rounds.test.ts`（2/2 PASS），验证最多五轮、不可变历史数据、异常长度/方式拒绝及不保存答案字段。
- TypeScript exit 0，单元全量 **62/62**，专用 MySQL 文件串行集成 **31/31**、Next.js 16.4.6 生产 build exit 0；**尚缺真实浏览器交互/移动端 E2E**，没有调用真实模型/商户、没有更改数据库、AI 授权/计次/失败返还仍沿用已有服务端链路。
- A01 子包本地 VERIFIED，但 A01 整体 IN_PROGRESS，真正语义连贯的跨轮 AI 对话、正式隐私评审与获批模型 UAT 尚缺；不以本地 UI 通过代替生产就绪。详细证据 `docs/goal/mvp/a01-interview-rounds-2026-11-21.md`。
- 主 handoff、风险、需求矩阵、发布清单与财务风险扫描及各种工具缓存为其他 Agent 的未提交修改，继续精确 stage 自己文件，不覆盖不混提交。

## 2026-11-21 U01 公网注册/登录可信代理 IP 限流

- 复核生产端现有认证限流：未配置可信代理时仅按邮箱控制，易被更换邮箱规避。新增 `lib/auth-throttle-policy.ts`，生产环境缺少 `TRUSTED_CLIENT_IP_HEADER` 或代理头缺失/伪造/异常时直接拒绝登录和注册；有效头需同时通过邮箱和跨邮箱共享 IP 配额，DB 限流失败亦拒绝。开发环境保留原有邮箱限流。
- `app/actions/auth.ts` 使用上述独立规则；不修改密码、Session 或用户表。新专项先因模块不存在 `MODULE_NOT_FOUND` RED、实现后 **4/4 GREEN**；TypeScript exit 0、全量单元 **66/66**、隔离 MySQL 集成 **31/31**、Next.js 16.4.6 build exit 0。
- **部署门禁**：生产反向代理必须覆盖选定 `x-real-ip`/`cf-connecting-ip`，阻止外部直连源站；未完成此配置，账号认证将被拒绝。缺邮箱验证、账户删除、浏览器真实 E2E、生产网关检查，U01 整体仍 IN_PROGRESS。见 `u01-production-auth-proxy-gate-2026-11-21.md`。
- 其他 Agent 的主 handoff/需求矩阵/风险/发布清单和 financial-risk-audit 未提交文件保持原样，独立增量交接，精确暂存，不强推。

## 2026-11-21 A02 模型报告外链拦截（本轮）

- 复核现有 `validateSafeModelOutput`：虽已过滤手机号/邮箱/身份证，却未过滤模型生成的外部收集网页、下载 URL、邮件/电话跳转。扩展 `lib/career/output-safety.ts` 对报告所有摘要、小节和下一步文本检查常见外部目的地，不回显被拒链接；Unicode NFKC 和部分零宽字符混淆也纳入过滤。
- TDD：新 `tests/ai-output-links.test.ts` 首轮 1/3（外链漏检 RED），加入过滤后发现误将 `Node.js` 当成外部网站导致 2/3，收紧裸域名后最终新测试 **3/3**，加原有隐私输出专项 **6/6 PASS**。
- TypeScript exit 0、全量单元 **69/69 PASS**、Next.js 16.4.6 生产构建 exit 0；隔离 MySQL 全量第一次 **30/31**（其他 Agent 财务风险审计测试失败），该专项单跑 **1/1**、完整串行重跑 **31/31 PASS**。原本偶发失败仍需后续调查，不归功于本次外链修复。
- 该子包只能过滤常见 URL/跳转，不能替代完整反钓鱼/DLP、真实模型数据处理审查与 usage 落库；A02 整体仍 IN_PROGRESS。另尝试 U01 登录时序加固测试草稿触发敏感凭据安全检查，**未写入、未绕过、未修改认证代码**。
- 本轮独立交接与证据 `docs/goal/mvp/a02-output-external-links-2026-11-21.md`，只精确暂存自身源码/测试与增量记录；其他 Agent 的共享 handoff、矩阵、风险/发布清单及财务审计文件全部保留。

## 2026-11-21 B06 Outbox 领取人竞态补验（增量）

- 在已签名商户退款查询后、最终 SERIALIZABLE 事务中复核 Outbox 领取人 ID 和领取时间，防止查询过程中的派发记录变更被错误当作可入账状态。
- 专用 `jobs_mvp_migrate_20261118_8f72` 隔离 MySQL 库的 8 项迁移 up-to-date；文件串行集成 **31/31 PASS**（包含新竞态注入测试），单元、TS、生产构建通过。完整 `npm run typecheck` 的 Prisma Client generate 曾 Windows EPERM；独立 TypeScript exit 0，不能掩盖该异常。
- 本地子包 VERIFIED，B06 整体仍 IN_PROGRESS；真实商户、远端 CI、浏览器 E2E、生产迁移和合法上线门禁未解除。独立证据 `refund-claimant-race-2026-11-21.md`；共享 handoff/风险/矩阵等其他 Agent 修改继续保护。

## 2026-11-21 B04/B06 运维异常只读扫描（独立子包）

- 新增只读运维规则与测试库专用扫描 CLI，统计超过 10 分钟的 AI `RESERVED`、超过 15 分钟的退款 `IN_DOUBT` 以及超过 30 分钟的待派发 `READY`。输出仅为分类和数量，无用户/财务明细；异常 exit 2，未授权和查询失败 exit 3，默认不连接数据库，不自动返还/出款。
- 规则专项 2/2、全量单元 **71/71**、隔离 MySQL 集成 **31/31**、TypeScript 和 Next.js 生产构建通过。历史专用隔离库只读扫描三项计数均为 0、exit 0；默认阻断 exit 3。详情 `b04-ops-alert-scan-2026-11-21.md`。
- 本地子包 VERIFIED，生产真实自动告警投递/轮值、商户与模型、生产迁移/备份恢复/E2E 均未验收。共享 handoff、矩阵、风险、发布清单和其他 Agent 财务审计改动不得覆盖。

## 2026-11-21 B04/B06 退款未知态时间戳缺失防漏报

- 修复专用只读扫描漏报：`IN_DOUBT` 派发若 `claimedAt IS NULL` 也必须产生人工核账告警，而不是被“超过 15 分钟”筛选忽略；其他阈值不变，不改变任何资金或权益。
- 先补失败测试 71/72 RED，再修复为单元 **72/72 PASS**；隔离 MySQL 全量 **31/31 PASS**、TS/Next 生产构建 exit 0，实际隔离库授权扫描 exit 0、异常计数为 0。证据 `b04-refund-null-claim-alert-2026-11-21.md`。
- 本地规则子包 VERIFIED，但没有对异常 NULL 数据进行真实 DB 夹具回放，生产监控/告警送达/商户核对仍 IN_PROGRESS。共享 Goal 变更与财务扫描均不得混提交。

## 2026-11-21 B04/B06 IN_DOUBT 空领取时间专用 MySQL 真实告警回放

- 本包只扩展退款最终结算的现有合成 MySQL 集成夹具：将本包的 `IN_DOUBT` 派发 `claimedAt` 临时置为 `NULL`，Prisma 实查 1 条；正式只读告警 CLI 子进程返回 `ALERT`、exit 2，`REFUND_IN_DOUBT` 命中。订单继续 PAID、20 次权益未变，`finally` 恢复后再次查询为 0。
- 完整隔离 MySQL 集成 **31/31 PASS**、单元 **72/72 PASS**、独立 TS/Next.js 生产构建 exit 0；详见 `b04-null-claim-mysql-replay-2026-11-21.md`。初次单文件测试使用错误启动方式触发 `server-only` 导入失败，正式脚本复验成功。
- 本地数据库级告警回放子包 VERIFIED；生产实际通知/响应、商户/模型、恢复/部署/登录态 E2E 等仍缺，B04/B06 整体仍 IN_PROGRESS。不修改其他 Agent 的共享 handoff、风险、矩阵和财务审计。

## 2026-11-21 B04/B06/U03 运维告警去重与确认升级纯策略

- `ops-incident-policy.ts` 新增三类只读运维事故的稳定键、严重度和 `NOTIFY / SUPPRESS / ESCALATE / ACKNOWLEDGED` 决策；退款资金未知态 CRITICAL/15 分钟升级，其余 HIGH/30 分钟，已确认抑制重复提示，已恢复类别不再活跃。所有历史时间和计数失败关闭。
- TDD 初次 72/73 RED（策略未存在）；完善后单元 **76/76 PASS**，独立 TypeScript exit 0、专用隔离 MySQL 全量集成 **31/31 PASS**、Next.js 生产 build exit 0。见 `b04-incident-policy-2026-11-21.md`。
- 该子包只验证**无副作用规则**，没有持久事故记录、管理员确认 API、实际通知送达/重试或数据库迁移，不能宣称生产告警去重已经生效。B04/B06/U03 仍 IN_PROGRESS；其他 Agent 共享文档和财务风险审计不得混提交。

## 2026-11-21 B04/U03 运维事故持久化结构候选（待迁移 UAT）

- 为跨进程告警确认准备 `OpsAlertIncident`、`OpsAlertIncidentEvent` Prisma 模型和独立 SQL 迁移候选；本轮未在任何数据库应用，未改资金/次数账本。新增 `transitionOpsIncident` 无副作用状态转换，异常归零 RESOLVED，重新出现必须 REOPENED 并重置原确认，防止旧确认永久抑制新事故。
- 新单元 4 项，TDD 先 RED 76/77 后全量 **80/80 PASS**；Prisma validate exit 0、直接 TS exit 0、Next.js build exit 0。`prisma generate` Windows DLL EPERM，专用隔离库 migrate deploy 被安全门禁拦截，本轮集成复验调用也被拦截；不宣称 9 项迁移/持久化/数据库 E2E 验收成功。
- 本轮纯状态转换子包 VERIFIED，**事故持久化与迁移整体 BLOCKED/IN_PROGRESS**；独立证据 `b04-incident-persistence-candidate-2026-11-21.md`。其他 Agent 共享 handoff/矩阵/风险、财务审计保持原样。

## 2026-11-21 B04/U03 告警管理员确认防旧轮次误操作（独立子包）

- 新增无副作用 `prepareOpsAcknowledgment`：校验 ADMIN 身份、10–500 字符理由、时间一致性、告警类别和 `expectedOpenedAt`；旧轮次/已解决事故拒绝，已确认仅原管理员原理由相同重试幂等。输出状态 OPEN 与发生时间绑定的 CAS 前提，后续持久化必须在事务内复验和记审计。
- TDD 首次 80/81 RED（模块未实现），补实现与修正大小写断言后全量单元 **85/85 PASS**、TypeScript exit 0、Next.js 构建 exit 0；现有专用隔离 MySQL 集成回归 **31/31 PASS**（不包含新确认操作落库）。证据 `b04-acknowledgment-episode-guard-2026-11-21.md`。
- 该子包本地规则 VERIFIED；第 9 项迁移 UAT、实际管理员确认服务/权限、事务审计及告警发送仍 IN_PROGRESS/BLOCKED。其他 Agent 的共享 handoff、风险、矩阵、发布清单和财务审计继续保护。

## 2026-11-21 B04/U03 告警确认事务服务契约（本地子包）

- 接续前轮 CAS 确认策略，新增 `acknowledgeOpsIncidentWithStore` 事务服务：管理员身份必须从存储侧重新查询，事务内读取事故快照、按类别/当前 OPEN/发生轮次 CAS 更新一行后写审计；相同确认重试幂等，旧事故轮次、并发抢先更新及审计失败必须拒绝或回滚，不接触资金账本。
- 新增 5 项事务存储模拟器单测，先 RED（服务不存在），后全量单元 **90/90 PASS**、TypeScript exit 0、Next.js build exit 0，隔离 MySQL 现有回归 **31/31 PASS**。这不是新事务的 MySQL 验收；未接真实 Prisma adapter，未应用第 9 项迁移，真实持久化和通知仍 BLOCKED/IN_PROGRESS。见 `b04-ack-transaction-contract-2026-11-21.md`。
- 本地事务契约子包 VERIFIED，B04/U03 整体依旧 IN_PROGRESS；共享 handoff、矩阵、风险与其他 Agent 的财务审计保护不动。

## 2026-11-21 B04/U03 Prisma 事故确认适配器候选（CAS 字段修复）

- 接续 `0d1d9f2`，新增 `createPrismaOpsIncidentStore`：按 Serializable 事务依次查询服务端角色、事故快照，以 `key+state=OPEN+openedAt` 条件 updateMany，并同事务插入审计。新模拟 Prisma 委托的 5 组单测覆盖非管理员、更新竞态、审计失败回滚、幂等及事务参数。
- TDD 发现 `expectedState/expectedOpenedAt` 错传给 Prisma 字段的实际缺陷并修复为 `state/openedAt`。全量单元 exit 0、直接 TS exit 0、Next.js build exit 0；现有隔离 MySQL 回归第一次 30/31 失败，第二次 31/31 PASS，保留测试稳定性风险。
- 此为注入委托候选，不读取真实新告警表；第 9 项迁移、Prisma Client 生成、真 MySQL 事务/审计与权限 HTTP E2E 尚未验收，B04/U03 仍 IN_PROGRESS。独立证据 `b04-prisma-incident-adapter-candidate-2026-11-21.md`；其它 Agent 的共享文档与财务审计均不混提交。

## 2026-11-21 B04/U03 新事故表 MySQL 集成回归 CI 门禁

- 接续 `8145fd2`，新增真正调用 Prisma 事务适配器的 `tests/integration/ops-incident-mysql.test.ts`：核验已迁移双表、服务器管理员角色、事故轮次 CAS、审计落库、重复确认幂等、重开后旧轮次拒绝以及双管理员竞争。该文件由既有 CI 全量 `test:integration` 自动纳入；CI=true 缺第 9 项迁移时抛错，绝不隐性跳过。
- 本地历史专用隔离 MySQL 仍只有旧迁移，新测试明确 SKIP；集成结果 **32 total / 31 PASS / 1 SKIP / 0 FAIL**，不能解释为新告警确认 MySQL 已通过。独立 TS exit 0、npm 单元 exit 0、Next 构建 exit 0。CI=true 单独演练调用受安全门禁影响，没有有效通过证据。
- 独立证据 `b04-incident-ci-mysql-gate-2026-11-21.md`；第 9 项迁移、真实 Prisma Client、GitHub Actions 实际结果及 B04/U03 总体验收仍 IN_PROGRESS；其他 Agent 未提交文件均保护不动。

## 2026-11-21 B04/B06 修复真实 GitHub Actions 财务扫描误报失败

- 查 GitHub run `44870889080` 与 `44871860531` 的 job 原始日志，确认连续 CI failure 来自 `refund-finalization.test.ts` 强制断言 `ops-alert-scan` exit 2，而 CI `jobs` 库被生产只读隔离安全门禁正确拒绝 exit 3。修复测试仅在 `approvedOpsScanEnvironment` 许可时校验 ALERT，否则校验安全拒绝 exit 3、stderr 提示和无 stdout，不更改扫描白名单。
- 本地 npm 单元、TS 和 Next build exit 0；历史专用库集成第一次 30 PASS/1 FAIL/1 SKIP（其他 Agent 未提交 `financial-risk-audit` 测试遇 MySQL 暂时不可连接），原命令复跑 31 PASS/0 FAIL/1 SKIP。新第 9 项迁移测试仍 SKIP，不能视为已验收。
- 修复独立证据 `b04-ci-ops-scan-guard-fix-2026-11-21.md`；当前本地测试修复子包 VERIFIED，远端新 commit CI 状态仍待核验，B04/U03 总体继续 IN_PROGRESS。其他 Agent 所有脏文件保留。

## 2026-11-21 B04/U03 CI 新 MySQL 验收与管理员确认 Server Action 候选

- 已核实 GitHub Actions `efceb92` run `44872146477` success：全新 MySQL8 所有迁移成功应用、重复 deploy 无 pending；95/95 单元、31/31 集成（含第 9 项 OpsIncident 真实 MySQL CAS/审计测试）均无 skip，Next build 与 smoke 通过。仅是 CI 隔离数据库证据，非生产迁移。
- 新增 `ops-ack-form.ts` 白名单及严格发生轮次/理由解析，`confirmOpsIncident` Server Action：requireAdmin 取服务器身份、独立开关 `ENABLE_OPS_INCIDENT_ACK=true`（默认关闭）、5 次/小时 DB 限流、事务确认与审计，统一错误重定向；**未开放 UI/真实通知/资金操作**。新单测校验非法类别、伪造管理员、过期/格式错误与确认勾选。
- 首轮测试 helper 类型不匹配已修；最终 npm test/TS/Next build exit 0，旧历史隔离 MySQL 31 PASS/1 SKIP（库未迁第 9 项，不能混同 CI 已成功新库）。本动作 HTTP E2E 和预发布迁移未验收，B04/U03 继续 IN_PROGRESS。详见 `b04-admin-incident-action-candidate-2026-11-21.md`；保护其他 Agent 脏文件。

## 2026-11-21 B04/U03 受控管理员事故面板（独立子包）

- 核对 `1837f7e` GitHub Actions run `44872780536` 已 success；不重复之前 CI 全新 MySQL8 的第 9 项迁移/事故确认事务验收。
- 新增 `/admin/incidents` 页面、只读汇总投影和导航，要求 `requireAdmin`；独立开关未开启时绝不查询新事故表。启用后最多展示最近 25 条事故状态，仅 OPEN 可提交事故类别 + openedAt + 理由 + 人工确认，复用现有管理员身份/限流/事务 CAS 审计。调整 Server Action 重定向到新页面；禁止资金、AI 和通知动作。
- 新增三个只读安全投影测试；本地 npm 单元、TypeScript、Next build exit 0；旧历史隔离 MySQL 32 total/31 PASS/1 SKIP（旧库缺第 9 项迁移），不作为页面 E2E。管理员已登录提交、CSRF/越权、预发布迁移仍未验收，B04/U03 继续 IN_PROGRESS。见 `b04-admin-incidents-panel-2026-11-21.md`。保留其他 Agent 脏文件。

## 2026-11-21 B04/U03 事故页面最小字段查询与匿名权限 HTTP 收口

- 确认 `224b084` GitHub Actions run `44876152273` 实际 success。精简事故页数据库 `select` 为 key/state/count/openedAt/lastSeenAt/acknowledgedAt 六个必要字段，禁止查询审核笔记/操作人 ID；新增精确键集回归单测。
- 更新匿名 HTTP smoke 加入 `/admin/incidents`，支持严格限制到 `127.0.0.1` 的可选本地端口。初次对既有 3000 服务运行 smoke exit 1（旧服务缺新路由返回 404）；未动其他 Agent 进程，另起当前构建临时 3100 服务，`/admin`、`/admin/incidents`、`/admin/refund-dispatch` 实际均 307→/login，临时子进程随后退出。
- npm 单元、TS、Next build exit 0；历史独立 MySQL **31 PASS/1 SKIP/0 FAIL**（第 9 项迁移在旧库缺失，该测试在既有 CI 新 MySQL 有 PASS 证据）。完整管理员登录态/CSRF/E2E、部署库迁移、扫描通知仍 IN_PROGRESS。独立证据 `b04-admin-incident-minimal-select-smoke-2026-11-21.md`。其它 Agent 的脏文件保护不动。

## 2026-11-21 B04/U03 独立只读/人工确认开关与重复表单防护

- GitHub Actions `2290948` run `44876839721` success。拆分独立 `ENABLE_OPS_INCIDENT_READ=true`（只读）和 `ENABLE_OPS_INCIDENT_ACK=true`（写且可读）；默认均关闭，非精确 `true` 不放行。管理员页面仅写开关可提交、只读 OPEN 不再误显示为已解决；导航与服务端 Action 双重保持一致。
- 事故确认表单 `confirmed/key/expectedOpenedAt/reason` 必须各恰好一个值，拒绝多值污染，补组合开关与重复字段单元用例。npm test、TS、Next build exit 0。历史 MySQL 首轮 `30 PASS/1 FAIL/1 SKIP`（其他 Agent 未提交财务审计测试遇短时连接故障）；原命令复跑 `31 PASS/0 FAIL/1 SKIP`。旧库新事故表仍 SKIP，不能算真实页面 E2E。
- 详细 `b04-incident-read-write-gates-2026-11-21.md`；B04/U03 仍 IN_PROGRESS，外部商户/模型/合规门禁未改变；其余 Agent 脏文件未修改。

## 2026-11-21 B04/U03 持久事故状态同步事务候选（未接生产）

- 已核实 `d252123` GitHub Actions run `44877523145` success。继续未验收的扫描→事故持久化链路，新增独立 `syncOpsIncidentWithStore` 与 Prisma Serializable/CAS adapter，对 OPENED/RESOLVED/REOPENED 在同一事务追加审计；不接定时器/真实通知/资金动作。
- 新增模拟事务回滚/CAS 冲突/重复扫描/解决重开等单元测试，以及 CI 新 MySQL8 第 9 项迁移下强制运行的 `ops-incident-sync-mysql.test.ts`；本地 npm test、TS、Next build exit 0，历史 MySQL `33 total/31 PASS/0 FAIL/2 SKIP`（两个旧库缺表测试不能算 PASS），待远端真实新库 CI 验证。
- 详细 `b04-incident-sync-prisma-candidate-2026-11-21.md`；B04/U03、B07/D02 仍 IN_PROGRESS，生产启用和外部门禁不变；保留其他 Agent 脏文件。

## 2026-11-21 B04/U03 完整三类扫描单事务同步（独立补充包）

- `91f867e` 的按单类别同步若分别调用，后一个类别失败会留先前类别已成功的部分扫描结果。新增 `syncOpsAlertScanWithStore`：验证三个计数和扫描时间后，使用同一个 Prisma 事务一次同步全部类别，任何 CAS/审计错误须回滚整批。
- 新增 `ops-incident-batch-sync.test.ts` 验证一次事务、解决复扫、最后一类失败整批回滚、缺字段/非法计数无事务。npm test、TypeScript、Next build exit 0；旧本地 MySQL 33 total/31 PASS/0 FAIL/2 SKIP（缺第 9 项迁移，不能算新事务 MySQL 验收）。尚未接入生产扫描/通知。
- 独立证据 `b04-incident-batch-scan-transaction-2026-11-21.md`；现已核对前一提交 `91f867e` 的远端 run `44878355008` success：111/111 单元、32/32 MySQL 集成（含新事务事件测试）均无跳过。本轮整批入口仍待自己的远端 CI。其他 Agent 未提交内容不动，B04/U03 仍 IN_PROGRESS。

## 2026-11-21 B04/U03 三类扫描真实 MySQL 回滚测试补验（子包）

- 已核实 `79d7c5b` GitHub Actions run `44878653947` success，单元/集成/构建/smoke 都通过；继续补此前仅模拟验证的三类整批同事务真实 MySQL 回滚。
- 新增 `tests/integration/ops-incident-batch-mysql.test.ts`：仅在专用迁移库执行；第三类审计 INSERT 后注入故障，要求三类事故/事件一起回滚；再真实 OPENED/RESOLVED 三类与六事件核验，完毕只清理本测试数据。CI 缺第 9 项迁移须 FAIL。
- 测试首轮花括号语法错误导致 TypeScript/Build/集成入口失败，修复后最终 npm test、TypeScript、Next build exit 0；历史专用 MySQL **34 total/31 PASS/0 FAIL/3 SKIP**，新增真实事务用例旧库缺表明确 SKIP，待新提交 CI MySQL 验证。见 `b04-batch-scan-real-mysql-rollback-2026-11-21.md`。其他 Agent 变更保留，不动真实资金/AI/通知。

## 2026-11-21 B04/U03 真实 MySQL 扫描/人工确认交错并发补验

- GitHub Actions `f365c28` run `44879055646` success；实际全新 MySQL8 迁移、114/114 单元、33/33 集成均 0 FAIL/0 SKIP，整批回滚真实用例 PASS，不重复验收。
- 在已有隔离 MySQL 整批事务测试中新增真实并发交错：扫描刷新 `REFUND_READY_AGED` count 3→4 与临时 ADMIN 的 CAS 确认同时执行，实际 Serializable 冲突需独立安全重试，最终确认状态/数量/操作人不丢失、ACK 审计只一条；完成后只清理本测试创建的数据。
- 本地 npm test、TS、Next build exit 0；历史 MySQL 首轮 `30 PASS/1 FAIL/3 SKIP`（其他 Agent 未提交财务审计测试遇短时 DB 连接故障），复跑 `31 PASS/0 FAIL/3 SKIP`。3 SKIP 均因旧库缺第 9 项事故迁移。现已核验新提交 `859db27` GitHub Actions run `44879917200` **success**：全新 MySQL8 迁移、114/114 单元、33/33 集成、build 与 smoke 均成功且 0 FAIL/0 SKIP；并发交错测试实际 PASS。独立证据 `b04-scan-admin-race-mysql-2026-11-21.md`；不启用生产扫描/支付/AI/通知，保护其他 Agent 文件。

## 2026-11-21 B04/U03 事故页 URL 伪结果与 key 白名单安全收口

- `82d57a9` GitHub Actions run `44880164059` 已 success。发现 /admin/incidents 原先仅凭可伪造的 URL `incidentOutcome=ACKNOWLEDGED` 就展示“确认已记录”，存在管理员误判事故成功的风险；改为始终提示核对数据库事故状态/审计，不把 GET 作为确认结果。
- `transitionOpsIncident` 新增运行时事故类别白名单校验，避免 JS/未知 key 绕过 TS 类型而持久化未许可类别；`planOpsIncidents` 复用相同验证。新增伪造 URL 和非法类别回归测试。
- npm 单元、TypeScript、Next build exit 0；历史隔离 MySQL **34 total / 31 PASS / 0 FAIL / 3 SKIP**（旧库未迁第 9 项，不能算全部 DB 重新验收）。独立证据 `b04-incident-url-outcome-safety-2026-11-21.md`；本轮远端 CI 待核验。其他 Agent 未提交内容不动、生产开关均不变，B04/U03 仍 IN_PROGRESS。

## 2026-11-21 B04/U03 隔离事故扫描协调器安全入口（未接生产）

- 已核实 `ba15b8d` GitHub Actions run `44880692126` success。当前只读 CLI 和事务同步服务原未有受控协调层；新增 `runIsolatedOpsIncidentScan`，只有历史 localhost 专用 MySQL + 只读许可 + 单独 `OPS_INCIDENT_SYNC_APPROVED=true` 才有权获取完整三类计数并写事务；生产、远端、开发普通库全部 fail closed，默认无操作。
- 新增 Prisma `RepeatableRead` 同快照三计数读取适配；任一计数查询异常、漏字段、负数或时钟无效都不会开始事故同步事务。仅作为隔离候选，未接生产 Cron/CLI、通知或资金/AI 服务。
- 新增单元覆盖门禁 0 IO、部分观测拒绝、同快照事务与失败传播；npm test、TS、Next build exit 0，历史 MySQL `34 total /31 PASS /0 FAIL /3 SKIP`（旧库缺事故第九迁移）。详细 `b04-isolated-incident-scan-coordinator-2026-11-21.md`；已核验 `49d258e` GitHub Actions run `44881430687` **success**，全新 MySQL8 全部迁移、119/119 单元、33/33 集成、build/smoke 均 PASS、0 FAIL/0 SKIP；该 CI 仅覆盖协调器单元与此前的 MySQL 集成，不代表新协调器已完成真库端到端。B04/U03 整体 IN_PROGRESS、上线 NOT READY。其他 Agent 脏文件未修改。

## 2026-11-21 B04/U03 真实 MySQL 协调器端到端测试门禁

- 已核实 `ef5a77f` GitHub Actions run `44881854858` success。新增 `tests/integration/ops-incident-coordinator-mysql.test.ts`：在独立全新 MySQL 新建测试临时 User/Grant/超时 RESERVED，使用真实 Prisma RepeatableRead 三计数读取 + 隔离协调器 + Serializable 事务存储，验证 OPENED、部分读取故障不误解决、SUCCEEDED 后 RESOLVED 及审计，只删除自己创建的记录。
- CI 新库实际名 `jobs` 不符合生产隔离扫描白名单；测试仅在 CI=true、实际 localhost `/jobs` 且 integration=true 的受控 harness 内注入历史专用库策略配置用于调用，**不更改生产运行许可，也不声称实际 CI URL 已满足生产批准策略**。CI 缺第九事故迁移直接 FAIL。
- npm 单元、TS、Next build exit 0；本地历史 MySQL 首轮 `35 total/30 PASS/1 FAIL/4 SKIP`（既有 auth-retention 临时 DB 连接断开），原样复跑 `35 total/31 PASS/0 FAIL/4 SKIP`；四个 SKIP 是历史库缺第九迁移，新增真库用例已核验 `a018ac2` GitHub Actions run `44882556403` **success**：全新 MySQL8 全量迁移、119/119 单元、34/34 集成、0 FAIL/0 SKIP，新增真实读取→OPENED→读取失败不误解决→RESOLVED 用例明确 PASS；Next build 与 smoke 通过。详见 `b04-real-mysql-coordinator-e2e-2026-11-21.md`。保持 B04/U03 IN_PROGRESS；禁止实收款/模型/自动通知，保护他人未提交内容。

## 2026-11-21 B04/U03 通知幂等意图与升级时间桶（离线候选）

- 已核验 `cd755a1` GitHub Actions run `44882754338` success；事故计数→事务同步的真实 MySQL 闭环不再重做。新增纯 `planOpsNotificationIntents`：**仅持久化事故轮次**可生成 NOTIFY/ESCALATE 意图，按 key+openedAt+种类+升级时间桶生成 SHA-256 幂等标识；同一轮首次通知重复扫描不生成不同 key，15/30 分钟升级跨桶，已确认/已解决不生成；只返回聚合非敏感字段，无外部发送。
- 单元覆盖未存事故禁止发送、轮次和时间桶去重、人工确认抑制、重新开启唯一标识、异常数据 fail-closed。npm test、TS、Next build exit 0。旧本地 MySQL 首轮 `35 total/30 PASS/1 FAIL/4 SKIP` 为已有 auth-retention 测试短时 DB 不可达，原样复跑 `35 total/31 PASS/0 FAIL/4 SKIP`（旧库缺事故第 9 迁移）。证据 `b04-notification-idempotency-intents-2026-11-21.md`。
- 当前仅离线规划，**Outbox UNIQUE 存储、可恢复 claim、发送确认、Crash/Retry 与 CI MySQL 端到端均未实现**；不得声称真实通知可靠投递。B04/U03 仍 IN_PROGRESS，资金/AI/通知与生产门禁保持关闭，其他 Agent 改动不碰。

## 2026-11-21 B04/U03 通知 QUEUED 持久化候选（第二小包）

- 已核实上一小包 `89fbe7a` GitHub Actions run `44884812385` success：125/125 单元、34/34 集成、0 FAIL/0 SKIP。新增第十 Prisma 迁移 `OpsIncidentNotificationIntent`，以 SHA256 轮次/NOTIFY 幂等主键记录持久化 QUEUED 意图，外键关联事故；不改资金表、不启动通知。
- 新增 `queueInitialOpsNotificationIntent` 和 Serializable Prisma Adapter：仅首通知，校验真实 hash、事故 key/等级/轮次/非零数量；事务内重新检查事故必须 OPEN 且轮次匹配，DB 唯一键 + skipDuplicates 使重复请求仅一个 QUEUED，ACK/RESOLVED/旧轮次拒绝。单元覆盖伪造/重复/错轮次、数据库适配；新增迁移 MySQL 集成测试，CI 缺表 FAIL。
- 本地 npm test、独立 TS、Next build、Prisma schema validate exit 0；`npm run typecheck` 内 `prisma generate` 因 Windows DLL 正被其他进程占用触发 EPERM，**未杀进程**，须 CI 全新 Client 验收。历史 MySQL **36 total/31 PASS/0 FAIL/5 SKIP**（旧库无第九/第十迁移），新真实入队已通过 `853d20b` GitHub Actions run `44885639216` **success**：第十迁移全新 MySQL8 apply/repeatable、129/129 单元、35/35 集成、0 FAIL/0 SKIP，真实队列唯一/重复幂等/已解决禁止再次入队明确 PASS，生产 build/smoke 通过。独立 `b04-notification-durable-queue-candidate-2026-11-21.md`。尚无领取/发送/确认/崩溃恢复、保持 NOT READY。

## 2026-11-21 B04/U03 通知任务排他领取与租约超期回收候选（第 11 迁移）

- 已核实 `d2834d9` GitHub Actions run `44886104615` success；第十迁移 QUEUED 唯一入队已验证。本轮新增第 11 迁移，通知任务允许 CLAIMED 状态及 attemptCount、UUID claimToken、claimedAt、leaseExpiresAt，**未接 sender/HTTP/Cron**。
- `claimOpsNotificationIntent` 只对符合当前 OPEN 轮次的 QUEUED/过期 CLAIMED 任务使用 Serializable CAS 领取；有效租约 BUSY、已解决/已确认/旧轮次 STALE；最长 15 分钟，5 次尝试封顶。测试覆盖竞争、超期更换 token、上限、参数及事故状态；扩展原有第十迁移集成测试加入真实 MySQL 租约闭环，CI 缺表 FAIL。
- 本地 npm 单元、tsc、Next build、Prisma validate 均 exit 0；旧隔离 MySQL `36 total/31 PASS/0 FAIL/5 SKIP`（缺第九至十一迁移），新真实事务已核验 `7ae462f` GitHub Actions run `44886846171` **success**：第十一迁移及重复 deploy 全新 MySQL8、133/133 单元、35/35 集成、0 FAIL/0 SKIP，入队→首次 CLAIMED→有效租约 BUSY→租约过期更换 token→事故解决 STALE 的真实测试 PASS，Prisma generate/typecheck、build/smoke 均成功。详情 `b04-notification-claim-lease-2026-11-21.md`。没有外部通知发送/确认/续租/失败重试与生产部署验收，B04/U03 继续 IN_PROGRESS，整体 NOT READY。

## 2026-11-21 B04/U03 通知领取后只读 preflight 校验

- 已核实 `1ab2428` GitHub CI run `44887201687` success，上一轮领取租约验收不重复。新增 `preflightOpsNotification` + Serializable 只读 Prisma 适配，在任何将来的外部处理前查询当前 CLAIMED 任务、匹配 UUID fencing token、有效租约和对应 OPEN 事故轮次；过期/旧令牌/已解决/已确认/新轮次分别 fail-closed。**READY 只是只读时点快照，不授权外部发送**。
- 新增 5 项单元测试与既有真实 MySQL 领取集成测试中的 READY/FENCED/STALE 检查，未新增 DB 表或真实通知 Worker；npm 单元、独立 tsc、Next build exit 0；历史 MySQL `36 total/31 PASS/0 FAIL/5 SKIP`（缺第九至十一迁移），扩展的真库 preflight 已核验提交 `1f2bae4` GitHub Actions run `44889847821` **SUCCESS**：全新 MySQL8 迁移、138/138 单元、35/35 集成，0 FAIL/0 SKIP，真实令牌 READY/FENCED/事故 RESOLVED 后 STALE 通过，typecheck、build、smoke 也成功。详见 `b04-notification-preflight-2026-11-21.md`，B04/U03 IN_PROGRESS、整体 NOT READY。
- 保持真实支付、AI、通知开关关闭；未触碰其他 Agent 的 handoff、矩阵、风险、发布清单、财务审计和缓存。

## 2026-11-21 B04/U03 通知失败处理与重试截止（第十二迁移）

- 已核验 `517d50c` GitHub Actions run `44890089304` success。本轮新增第十二迁移：通知任务状态 RETRY_WAIT/DEAD、下一次可领时间、脱敏故障码；仅内部任务状态，无外部通知发送、HTTP、Cron 或资金/AI 开关变更。
- `failOpsNotificationClaim` 以 Serializable CAS 检查当前 CLAIMED、同一令牌、租约有效；1～4 次失败进入指数退避 RETRY_WAIT 并释放 token，5 次后 DEAD，旧令牌/重复失败拒绝；`claimOpsNotificationIntent` 提前重领 DEFERRED、到点可再次领取。扩展真实 MySQL 队列测试和单元状态机测试。
- 本地 `npm test`、独立 tsc exit 0；Prisma schema validate 命令超时，Next build 编译及 TS 阶段成功但页面数据收集时工具超时，不能记完成。已核验 `6e51099` GitHub Actions run `44891465518` **SUCCESS**：第十二迁移全新 MySQL8 apply/repeatable、142/142 单元、35/35 集成、0 FAIL/0 SKIP，真实失败 RETRY_WAIT→到期重领→事故解决后拒领用例 PASS；远端 Prisma generate/typecheck、Next build/HTTP smoke 全部成功。本地工具超时仍如实保留。详见 `b04-notification-retry-disposition-2026-11-21.md`；B04/U03 IN_PROGRESS、整体 NOT READY。

## 2026-11-21 B04/U03 通知失败尝试事务审计（第十三迁移）

- 核验 `a6b5c4a` CI run `44891820268` SUCCESS。新增 `OpsNotificationFailureEvent` 及第十三迁移，`UNIQUE(intentKey,attemptCount)` 保证同一次尝试仅一个失败事件，字段不含个人信息或令牌。Prisma Serializable Store 在更新通知状态 CAS 成功后同事务插入审计；CAS 冲突不记事件，审计异常阻断整个事务，保持外部发送关闭。
- 新增单元审计失败传播与重复令牌去重测试；原 MySQL 队列集成测试核验首次失败事件存在且重复提交不新增，并只清理本测试产生的审计。单元、独立 TS exit 0；本机 Prisma validate 与完整 Next build 因执行器超时未完成。已核验 `ec9506e` GitHub Actions run `44892913723` **SUCCESS**：第十三迁移全新 MySQL8 部署可重复、145/145 单元、35/35 集成、0 FAIL/0 SKIP，真实首次失败事件存在及重复令牌不增加事件 PASS，Prisma generate/typecheck、Next build/HTTP smoke 成功；尚未单独完成审计写入故障的真实数据库回滚注入演练。独立证据 `b04-notification-failure-audit-2026-11-21.md`。B04/U03 仍 IN_PROGRESS，整体 NOT READY。

## Git 安全

工作区历史保留 `next-env.d.ts`、`package-lock.json` 和 `.dsh-meow/` 的其他 Agent/工具变更；仅暂存本轮工作包文件。遵守 `AGENTS.md`，分批 commit/push、禁止 reset/clean、force push。未经实际商户、模型、生产 UAT 和资质确认，`ENABLE_REAL_PAYMENT`、`ENABLE_LIVE_AI` 保持禁用。
