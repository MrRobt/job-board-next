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

## 续跑

从 `current-task.md` 中的 P0 退款权益设计开始；先读真实源码和检查凭据/门禁，缺外部材料保留 BLOCKED、推进可离线验证的内部账务模块。下一次 Git 操作仅提交本包文件，保护其他 Agent 的变更。
