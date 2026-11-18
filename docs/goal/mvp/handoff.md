# 长期 Goal 交接（2026-11-17）

## 工作区

- job-codexpro：`F:\code\job-board-next`，Git `main`；每轮重新检查 current-task、矩阵、Git 与 .ai-bridge，不能仅相信本文件。
- Windows MSYS2 Bash：项目目录 `/f/code/job-board-next`，Node `/d/nvm4w/nodejs/node.exe`，Docker MySQL `job-board-next-db-1`（`127.0.0.1:3306/jobs`）。严禁动 `djs-mysql-uat` 等其他项目数据库/进程。
- 构建/Prisma 在 Windows 上可能受本项目 Next.js 的 DLL 锁影响，只处理已确认的 localhost:3000 Next.js 进程。其他 Node、Agent、Docker 工作负载不属于本 Goal。

## 本轮已实现

- `lib/payment/merchant-observation.ts`：纯状态映射。
- `lib/payment/merchant-gateway.ts`：微信支付 API v3 交易查询和关单、签名验签；支付宝 OpenAPI 查询和关单、对原始 JSON 业务响应验签；任何异常均拒绝作为付款/关单凭证。微信关单 204 只代表接口接受，必须随后查单 CLOSED。
- `lib/career/payment-reconciliation.ts`：管理员鉴权、到期确认、先查单/请求关单/再查单、安全释放待支付占用、复用 `settleToolPayment` 幂等结算、`ToolOrderReconcileEvent` 审计。
- `app/actions/payment-reconciliation.ts` + `app/admin/tool-orders/page.tsx`：管理员查单/到期关单独立入口；`ENABLE_PAYMENT_RECONCILIATION` 默认 false，不触发真实商户 API。
- `prisma/schema.prisma` 和增量迁移 SQL：新增 `ToolOrderReconcileEvent` 及关系，开发库经 `db push --skip-generate` 同步；基线 `migrate deploy` 仍为未验收。
- `tests/integration/payment-reconciliation.test.ts`、`tests/integration/merchant-gateway.test.ts`：金额异常、未付/未知、已关闭、跨用户/管理员、幂等和密文签名相关离线模拟测试。
- `docs/goal/mvp/payment-reconciliation.md`：人工操作与安全不变量。

## 验收结果与阻断

- Prisma validate exit 0，开发库 push exit 0，Prisma Client generate exit 0。
- TypeScript exit 0，单元 8/8、集成 7/7、Next.js 生产构建 exit 0。见 `test-evidence.md`。
- 没有真实支付渠道测试、退款回款、自动对账、密钥审批、法律合规审批；不能启用真实收费。
- 之前独立库 `migrate deploy` 被安全检查阻断；**不能声称生产迁移通过**。
- 不要覆盖已有 `next-env.d.ts`、`package-lock.json`、`.dsh-meow/` 未提交工作。

## 2026-11-18 新增独立迁移验证（保护退款改动）

- 新建仅供本项目使用的 `jobs_mvp_migrate_20261118_8f72` 空库，当前工作树 3 个迁移首次 `migrate deploy` exit 0，status up to date；TS、单元 8/8、MySQL 集成 8/8 通过。
- CI 工作流改为对全新 MySQL 真实 `migrate deploy` / `migrate status`、再复跑；远端 CI 尚未运行，本地第二次 migrate deploy 被安全检查阻断，不能宣称幂等验收。
- 证据在 `docs/goal/mvp/migration-uat-2026-11-18.md` 和 `test-evidence.md`。退款相关预存未提交改动与 `.dsh-meow/`、lockfile、next-env 属于原有其他 Agent/工具状态，不得混提交。
- 不要碰 `djs-mysql-uat` 或其他项目容器，不要启用真实支付/AI。旧数据库迁移基线登记、备份恢复与真实商户 UAT 继续保留未完成状态。

## 2026-11-18 P0 退款渠道只读查询子包

- 新文件 `lib/payment/refund-query.ts`：微信支付 API v3 / 支付宝退款查询，校验签名、订单号、退款请求号、原交易号、金额；支付宝只有 `REFUND_SUCCESS` 才映射成功，其他/缺失保持 UNKNOWN。没有到账审计和真实渠道联调，不允许直接驱动权益撤回。
- `tests/integration/refund-query.test.ts` 覆盖 3 个离线场景；工作树 TypeScript、Prisma validate、单测 8/8、隔离 MySQL 集成 11/11 和 Next.js build 全通过。详情 `docs/goal/mvp/refund-channel-inquiry-2026-11-18.md`。
- 仍不改动早先其他 Agent 的 `ToolRefundCase`、Schema/迁移、后台和账户页面。真实退款申请、稳定退款请求号与金额账本、渠道 UAT、原始资金与权益一致性、备份恢复都未完成。
- 当前代码尚未建立管理员查询入口；读渠道必须双门禁 `ENABLE_REAL_PAYMENT` + `ENABLE_REFUND_QUERY`，测试仅用伪 fetch 和临时密钥，不得在生产开启。
- 上述独立新文件已通过 `1ccf99b` 分批 commit/push 到 `origin/main`，其他 Agent 的未提交内容仍保留。

## 2026-11-18 P0 可信代理限流与原子计数修复

- 登录注册新增可选 IP 级限流，默认关闭；在配置 `TRUSTED_CLIENT_IP_HEADER` 后仅从受控代理头读取 IP，异常头拒绝；原本按邮箱次数仍保留。
- MySQL 并发测试发现原 Prisma upsert 在 7 个同 key 请求时抛 `PRIMARY` 唯一冲突；已改为原生原子 SQL 与事务读数，复验集成 12/12、单测 10/10、TS 和 build 全通过。
- 明确生产前置：代理覆盖头、源站禁止绕过、真实环境联调。无生产代理配置变更；详见 `docs/goal/mvp/trusted-ip-limit-2026-11-18.md`。
- P0 资金退款/撤权、备份恢复、邮箱验证和外部合规门禁依旧未完成；其他 Agent 的原有未提交文件没有修改。

## 2026-11-18 P0 退款账务只读预检

- **远端可重现性修正**：`lib/career/refund-preflight.ts` 现在是纯账务判定，无 Prisma 或他人尚未提交退款依赖；独立单元测试已移至 `tests/refund-preflight.test.ts`，4/4 PASS，全量单元 14/14 PASS。当前脏工作树其它 DB 集成 12/12 PASS、TypeScript exit 0。
- 原先依赖未提交 Schema 的数据库权限/预检适配已从已提交模块移除；不能宣称现有退款预检服务端 DB API 已交付。未来须待退款 Schema、迁移和接口提交后实施鉴权及强一致资金复核。
- 纯规则涵盖 RESERVED 在途、已消费、失败返还、历史退款与异常账本；任何结果 `automaticallyRefundable=false`。原有退款申请/Schema 等其他 Agent 未提交文件仍原样保留，资金与撤权闭环未完成，详见 `docs/goal/mvp/refund-preflight-2026-11-18.md`。

## 2026-11-18 P0 确定性渠道退款请求负载

- `lib/payment/refund-request-payload.ts` 是纯函数（无 DB、无 HTTP、无秘钥），用已有 caseId + orderId 生成相同 outRefundNo，并将金额、渠道、交易引用、原因绑定指纹；不同内容的重试必须被已存指纹拦截。
- 微信 payload 含整数分和 CNY；支付宝含元/两位小数和 out_request_no。新增 4/4 单测，全量单元 18/18、隔离 DB 集成 12/12、TS/build 均通过，详见 `docs/goal/mvp/refund-request-payload-2026-11-18.md`。
- **没有发起真实退款！** 退款 caseId、金额、指纹须先经受控数据库事务持久化；真实 HTTP API、结果验签、人工审批、在途账务、撤权均未完成；B06 仍 IN_PROGRESS。

## 2026-11-18 MySQL 隔离库结构恢复验证

- 仅在 `job-board-next-db-1` 容器导出 `jobs_mvp_migrate_20261118_8f72`，容器内 SQL 22,573 bytes、SHA-256 `cd9dfc159014a1b25a9bb02d59a17ab8b2bdf2018424cabf623e809af07cc550`；创建全新库 `jobs_mvp_restore_20261118_61ac` 并成功导入。
- 源/目标 16 表、120 列、19 FK、3 迁移记录及关键空表行数匹配，恢复库 Prisma migrate status exit 0。尝试创建合成非空数据被工具安全检查阻止，故不能证明数据恢复；B07/D02 仍未完成。
- SQL 快照只在容器 `/tmp`，不提交仓库；恢复库未覆盖源库。详情 `docs/goal/mvp/restore-structure-uat-2026-11-18.md`；未来需预发布真实授权非空数据回归和备份加密/RPO/RTO。

## 2026-11-18 认证保留期只读维护子包

- `lib/auth-retention.ts`、`scripts/prune-auth.ts`、`npm run auth:retention`：只读预览默认启用，实际删除需独立 `--apply` 和 `AUTH_RETENTION_APPLY_APPROVED=true`，每批最多 200 条，删除前按过期条件二次约束。
- 测试：预览 1/1、MySQL 集成 13/13、单元 18/18、TS/build 全通过；实际删除/有效会话保护测试被工具安全检查阻断，**不允许标 VERIFIED 或在生产调度**。详见 `docs/goal/mvp/auth-retention-2026-11-18.md`。
- 与退款资金 Schema/用户界面改动无交叉；其他 Agent 的未提交文件仍保持原样。继续从未验收的 P0 安全、退款及 AI 提供方处理边界推进。

## 2026-11-18 P0 AI 模型出口安全子包

- `lib/career/provider-safety.ts` 限定服务器批准列表中的公网 DNS HTTPS 精确 base URL，并以最大 200,000 字节流式读取响应。原 `lib/career/provider.ts` 已接入检查，未批准地址不调用模型且不发送用户内容/凭据。
- 测试 3/3 新增、全量单元 21/21、MySQL 集成 13/13、TS/build exit 0，详见 `docs/goal/mvp/ai-provider-egress-2026-11-18.md`。仍须实际网络出口 ACL/DNS 和合规模型人工 UAT；不设置 `ENABLE_LIVE_AI`。
- 其他 Agent 退款 Schema/UI 未提交工作原样保留，后续 P0 仍包括退款资金、账号邮箱验证、清理 apply、部署监控与 E2E。

## 2026-11-18 P0 受保护数据库就绪探针

- 新增 `/api/readyz`，服务器端 `READINESS_PROBE_TOKEN` 未配置则固定 404；正确 `x-readiness-token` 才只读执行 MySQL SELECT 1，成功 200、失败 503，统一安全响应无泄漏。
- 新增单元 2/2、集成 1/1；全量单元 23/23、MySQL 集成 14/14、TS/build PASS。曾因上轮 auth-retention 测试用整表计数导致并发假失败，已改为固定历史截止时间过滤并再次通过；详见 `docs/goal/mvp/readiness-probe-2026-11-18.md`。
- 部署、反向代理 ACL、真实负载均衡探针、故障恢复与告警未验收，D02 仍 IN_PROGRESS。其他 Agent 的退款/Schema 文件继续保留。

## 2026-11-18 P0 支付 HTTP 字节上限防内存耗尽

- 新增 `lib/http-body-limit.ts`，四个支付通知入站 65,536 字节限额、渠道查询和回包 100,000 字节限额；在读取过程中检查实际 UTF-8 字节并限制 Content-Length，保留已有原文验签顺序。
- 新增单测 5/5、原微信/支付宝商户验签集成 2/2、TypeScript exit 0。最终全量回归/build 被执行工具安全检查阻断，不能认定已验证完整支付闭环；详见 `docs/goal/mvp/payment-body-bounds-2026-11-18.md`。
- 不修改任何资金账本或真实密钥；其他 Agent 原有退款 Schema、页面及 lockfile 未提交改动继续原样保留。后续优先完整回归与支付/退款资金 P0。

## 2026-11-18 P0 支付来源域名门禁与宿主数据库阻断

- `lib/payment/origin-policy.ts` 为纯规则；`lib/payment/config.ts` 统一 `enabled`/`origin` 使用公共 HTTPS 回调源验证；新增单元 2/2、离线配置 1/1。全量单元 30/30 PASS、TS/Next.js build exit 0。
- 完整 MySQL 集成 7/14：7 项 DB 访问失败，容器 `job-board-next-db-1` healthy、映射 `127.0.0.1:3306`、容器内 `SELECT 1` 正常；Windows 宿主 Prisma 连接超时。保留现场，后续必须排查端口代理/网络并复验，不可标 VERIFIED。
- `docs/goal/mvp/payment-origin-gate-2026-11-18.md` 记录详细证据；支付 HTTP 流式加固的单元和生产构建均已补验，但 DB/商户联调仍缺。
- 其他 Agent 的退款申请、Schema、页面、lockfile 等未提交变更全部保持，不与本包混提交。

## 2026-11-18 P0 微信 Native 下单网关重定向防护

- `createWechatUrl` 显式拒绝 HTTP 重定向，防止商户签名下单跟随意外 3xx；新增 2/2 离线 RSA 签名与危险回包测试，完整单元 30/30、TS/Next.js build PASS。
- 详见 `docs/goal/mvp/wechat-native-redirect-2026-11-18.md`；无商户真实调用。数据库宿主网络阻断不变，不可将全量 MySQL、商户或资金验收标为通过。
- 其他 Agent 的退款申请/Schema 等原未提交工作保留，继续从最高优先级资金账务或独立 P0 恢复。

## 2026-11-18 P0 并发限流连接等待稳定性修复

- 宿主 Windows→Docker MySQL 连接恢复，`prisma migrate status` 3/3 上线迁移记录一致。初次完整 17 项测试 16/17，其中限流 7 并发在综合测试负载下报 Prisma 事务启动超时。
- `lib/rate-limit.ts` 保留原 SQL 原子计数，新增交互式事务 `maxWait:10_000, timeout:15_000` 与数据库错误 fail closed；修复后独立 1/1、完整 MySQL 两次 **17/17 PASS**、单元 30/30、TS/Next.js build PASS。
- `docs/goal/mvp/rate-limit-concurrency-2026-11-18.md` 保存根因与实测。原有退款 Schema/UI 和 lockfile 等他人未提交文件保持不变；生产商户/高压/真实代理 UAT 仍待完成。

## 2026-11-18 P0 密码 scrypt 异步非阻塞转换

- `lib/password.ts` 使用 Promise 异步 scrypt，**与原同步 scrypt 存储格式及参数完全兼容**；`app/actions/auth.ts` 和 `prisma/seed.ts` 也已等待异步结果，无 Schema 改动。
- 新增 3 项专项测试含从旧同步 scrypt 生成的真实哈希兼容、6 并发注册散列与非法格式；完整单元 32/32、MySQL 集成 17/17、TS/Next.js build exit 0，见 `docs/goal/mvp/async-password-2026-11-18.md`。
- 仍缺邮箱验证、账户删除、密码找回、生产代理及登录浏览器 E2E；其他 Agent 未提交退款和 Schema 仍保持不变。

## 2026-11-18 B06 退款查询渠道原始交易号桥接

- 新增独立纯/只读 `lib/payment/refund-inquiry-bridge.ts`，解决支付已结算 `providerTradeId=WECHAT:/ALIPAY:` 本地前缀与商户退款查询原始交易 ID 不相等的问题，保护已持久化退款单号、指纹、状态、订单及渠道身份一致性；显式注入只读网关，不依赖其他 Agent 的退款 Prisma 模型。
- 新增 4/4 单元；全单元 36/36、MySQL 集成 17/17、TS/Next.js build exit 0；详见 `docs/goal/mvp/refund-inquiry-bridge-2026-11-18.md`。**没有钱款请求、实际资金或账本变更**。
- 后续等待其他 Agent 独立验收并提交 ToolRefundCase/迁移；新增并发安全 outbox/退款单号指纹持久化、审核/出款授权、查单终态与原子撤权；真实商户和合规继续人工门禁。

## 2026-11-18 B07 MySQL 重复迁移已本地验收

- 对专用 `jobs_mvp_migrate_20261118_8f72` 执行第二次 `migrate deploy` exit 0（`No pending migrations to apply`），随后 `migrate status` exit 0（3 migrations up to date）；只使用既有独立测试库，未重建或清理。完整证据见 `docs/goal/mvp/migration-repeat-2026-11-18.md`。
- **不能将本地重复部署等同于生产升级**：退款 SQL/schema 文件尚属其他 Agent 未提交，CI 远端未确认，旧库 baseline/备份恢复和低权限生产演练缺失。B07/D02 仍 IN_PROGRESS。

## 2026-11-18 GitHub Actions 已确认远端 CI 通过

- 使用 GitHub connector fetch Actions push runs，实际查得 `27824d9` CI run `44225639694` completed/success；`validate` job 及迁移初次/重复、Prisma validate/status、seed、TS、单测、集成、build、smoke 均 success。`0270b41` push run `44225197207` 也 success。
- 证据：`docs/goal/mvp/ci-remote-verification-2026-11-18.md`，run 链接 `https://github.com/MrRobt/job-board-next/actions/runs/44225639694`。先前 commit-status 空列表不代表 CI 未通过。
- CI 验证的是已提交快照，**其他 Agent 未提交的退款申请/Schema/迁移、未提交 package-lock** 未进入 run；旧库、非空备份恢复、商户资金/AI/资质仍 BLOCKED，不能将 D02/B07 全部标 VERIFIED。

## 2026-11-18 D02 Next.js HTTP 安全头部

- `next.config.ts` 全路由 nosniff、禁止 iframe、no-referrer、浏览器硬件权限禁用、HSTS 180 天无 preload/includeSubDomains；私有账户、管理员、AI/支付路由禁用 HTTP 缓存，不影响静态资源。新增 `tests/security-headers.test.ts` 2/2。
- 全量单元 38/38、MySQL 集成 17/17、TypeScript 和 Next build 均成功。尝试向 CI 追加运行时 header smoke 被敏感内容工具保护阻断，未绕过；CI 尚无此项新校验，需预发布真实 HTTPS/代理联调。见 `docs/goal/mvp/http-security-headers-2026-11-18.md`。
- 不修改退款资金/其他 Agent 的未提交内容，不启用真实商户和 AI。

## 2026-11-18 P0 跨历史订单 / AI 次数包交易号重复结算风险修复

- RED：在 `tests/integration/cross-product-trade-isolation.test.ts` 中复现同一支付宝交易号先发放 AI 次数包，再成功解锁历史订单的漏洞。两张表各自 UNIQUE 不等于跨表唯一。
- GREEN：两条结算路径互查交易号并使用 MySQL SERIALIZABLE 事务；顺序双向及 6 组并发竞争测试 1/1 PASS，所有冲突只能至多放行一个结算，失败不发额外权益。完整单元 38/38、MySQL 集成 18/18、TS 和 Next build PASS。见 `docs/goal/mvp/cross-product-trade-isolation-2026-11-18.md`。
- 后续仍应设计全局支付交易登记表、冲突/死锁告警及真实商户重试 UAT；B05/B06 未完成。其他 Agent 退款 Schema/页面/迁移未经本轮修改，不混提交。

## 2026-11-18 P0 跨业务重复交易历史只读核账

- 新增 `lib/payment/cross-product-trade-audit.ts` + `scripts/payment-trade-audit.ts`，只读 JOIN `Order`/`ToolOrder` 的相同渠道交易号，返回总数和最多 50 条状态/订单号/哈希指纹样本；CLI 未设置 `PAYMENT_TRADE_AUDIT_APPROVED=true` 时拒绝执行，不修改订单/资金/权益。
- 新增 `tests/integration/cross-product-trade-audit.test.ts` 合成冲突 1/1 PASS，专用测试库运维只读执行 `count=0`/`sample=[]`，全量单元 38/38、MySQL 19/19、TS/build exit 0。详细见 `docs/goal/mvp/cross-product-trade-audit-2026-11-18.md`。
- 已核实前一提交 `308f084` 的 GitHub Actions run `44230355739` success。远端 CI 对本核账子包需待提交 push 后单独确认。
- 优先级仍 B06 退款持久化/终态撤权；其他 Agent 的未提交 Schema/迁移/页面不得混提交，不开启真实收款。

## 续跑

从 `current-task.md` 中的 P0 退款权益设计开始；先读真实源码和检查凭据/门禁，缺外部材料保留 BLOCKED、推进可离线验证的内部账务模块。下一次 Git 操作仅提交本包文件，保护其他 Agent 的变更。
