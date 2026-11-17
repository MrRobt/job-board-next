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

## Git 安全

工作区历史保留 `next-env.d.ts`、`package-lock.json` 和 `.dsh-meow/` 的其他 Agent/工具变更；仅暂存本轮工作包文件。遵守 `AGENTS.md`，分批 commit/push、禁止 reset/clean、force push。未经实际商户、模型、生产 UAT 和资质确认，`ENABLE_REAL_PAYMENT`、`ENABLE_LIVE_AI` 保持禁用。
