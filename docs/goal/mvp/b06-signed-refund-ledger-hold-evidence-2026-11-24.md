# B06 已验签退款成功与异常权益账本的非破坏性审计 · 2026-11-24

## 恢复定位与风险

- 恢复 `docs/goal/mvp/long-running-goal.md`、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register，实际 Git 起点 `2f85838` 且 `main...origin/main`，既有 B06 退款并发 + 管理员只读派发账本已 VERIFIED，不重复。
- 新发现 P0 失证缺口：经过商户身份/订单/金额验证的退款查单报告 `SUCCEEDED`，若已冻结的 `ToolGrant.remaining` 发生变化或存在 RESERVED/SUCCEEDED AI 调用，原终态逻辑会正确拒绝将订单设为 REFUNDED，却**没有持久化这条商户成功观察**。后续人工查账可能丢失关键线索。
- 此包只修复异常观察审计，不自动发送退款、不重试退款 POST、不改变资金或权益，不处理部分退款和已消费权益的人工争议决定。

## 变更边界

- `lib/career/refund-finalization.ts`：在默认商户查单完成验签、身份和金额核对，并在 Serializable 事务中重新确认派发/审批/订单/工单绑定未变后，对 `SUCCEEDED` 与权益数量不匹配、或出现 RESERVED/SUCCEEDED 运行的情况，追加一个 `ToolRefundInquiryEvent`：`observed=SUCCEEDED`、`outcome=MANUAL_LEDGER_REVIEW`，记录操作者并采用派发 ID 派生的确定性事件主键及 `createMany(skipDuplicates=true)` 保证相同派发只产生一条相同警报。事务完成后仍报错，要求人工核账；`IN_DOUBT`、`PAID`、`PREPARED`、`refundHold`、付费权益保持原样。
- 验签失败、提供者/金额/单号不匹配、未授权操作、工单/身份/领取凭据等结构异常，仍 fail-closed，**不得产生商户成功审计证据**；正常已签名成功且账本一致仍通过原有原子终态撤权。
- `app/admin/refund-dispatch/page.tsx` 已有管理员鉴权、只读预检旁，只附带每条派发最近一条 `MANUAL_LEDGER_REVIEW` 事件的 ID/时间，用于持续提示“曾有已验签成功但权益无法结算，需人工复核”；不公开完整商户凭据、不新增任何写入或补退款按钮。

## RED/GREEN 与本地隔离验证

- `tests/integration/refund-finalization.test.ts` 先在隔离 `jobs_preview_20261123` MySQL8 上 RED：商户成功观察 + 本地权益扣减后事件数为 0（预期 1）；新审计后 GREEN。验证重复签名查询只有 1 条异常审计且保持订单 PAID/派发 IN_DOUBT/权益 19 不变；恢复余额但注入 synthetic SUCCEEDED 运行，仍保留同一条事件、拒绝撤权；清理冲突后标准原子结算成功，额外成功审计准确。
- 原 `tests/integration/refund-finalization-race.test.ts` 不变，双管理员同一笔成功响应只有一个原子终态，不重复撤权；2/2 实际 MySQL 集成 PASS。
- `tests/refund-dispatch-integrity-admin-policy.test.ts` 增加后台查询仅选最新异常事件及醒目提醒的结构断言，先 RED，修复管理页后 GREEN，连同原账本规则 5/5 PASS。
- 本地独立测试均在 `INTEGRATION_TEST_DATABASE=true` 和隔离预览库运行，没有真实商户联网、退款发款或密钥。
- **远端干净验收已完成：** 提交 `4fc401a` 的 GitHub Actions 主 CI run `45224495649` / job `137867232851` completed/success，原始集成日志 `signed refund inquiry settlement requires confirmed matching refund, atomically revokes unused credits` PASS 及 `B06 signed refund reconciliation is single-winner under concurrent reviewers` PASS；Prisma 新库迁移/重复部署、TypeScript、单元 **222/222 PASS**、真实 MySQL 8 集成、Next 生产 build/HTTP smoke 全 SUCCESS。同提交另 **7 条**账户、邮件、后台及 B07 恢复专项流水线全部 SUCCESS。**仅本审计证据子包 VERIFIED**。 本地 `tsc --noEmit` 被其他 Agent 未提交 `lib/auth-retention.ts:83` 旧 TS2739 阻断；本包新增文件在本地检查未产生其他类型诊断，须干净 CI 验证。

## 交接与发布门禁

- 只 stage 本包的终态审计实现、管理员只读提示、上述两份测试及本工作包/当前任务/测试证据文件；不混入其他 Agent 已存在的 `handoff.md`、需求矩阵、发布/风险、认证数据保留或财务扫描草稿、lockfile、缓存。
- 本包 `4fc401a` 已正常推送，主 CI `45224495649` / job `137867232851` 和另外 7 条专项 CI 均 SUCCESS；本合成验签成功冲突审计子包已验收，不再重复。没有修改其他 Agent 的 dirty 文件或强推。
- B06 总体仍 IN_PROGRESS，技术上线 NOT READY，真实商户验签退款/账单核对、消费者售后、凭据及资质继续人工门禁。审计事件并非资金到账或全额/部分退款决策。
