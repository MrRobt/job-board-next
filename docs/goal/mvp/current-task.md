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

## Git 安全

工作区历史保留 `next-env.d.ts`、`package-lock.json` 和 `.dsh-meow/` 的其他 Agent/工具变更；仅暂存本轮工作包文件。遵守 `AGENTS.md`，分批 commit/push、禁止 reset/clean、force push。未经实际商户、模型、生产 UAT 和资质确认，`ENABLE_REAL_PAYMENT`、`ENABLE_LIVE_AI` 保持禁用。
