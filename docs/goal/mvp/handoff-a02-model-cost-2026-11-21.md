# A02 模型成本预算门禁工作交接 · 2026-11-21

主 `docs/goal/mvp/handoff.md` 属于其他 Agent 的未提交改动，本包改用独立交接文件。

## 已完成

- 新 `lib/career/model-cost-policy.ts`；修改 `lib/career/provider.ts`，要求部署端显式设置输入/输出单价（分/百万 Token）和每次请求预算（分）；缺失、零价、异常输入或预计超限均禁止出站。
- 新单元 `tests/model-cost-policy.test.ts` 3/3、新模拟 API 集成 `tests/integration/ai-model-cost.test.ts` 1/1，证明缺配置和超预算时网络调用数为零；TypeScript、单元总计 49/49、独立 MySQL 总计 30/30、生产构建通过。
- 没有调用真实模型/商户、没有数据库迁移或财务数据变更；所有真实 API 开关不启用。
- 相关证据：`a02-model-cost-budget-2026-11-21.md`、`requirement-delta-a02-cost-2026-11-21.md` 和 `test-evidence.md`。

## 继续执行

1. A02 实际 Token usage / provider cost 采集、可靠的业务成本对账及管理员异常告警，需审批提供方报价；保守估算不等于实际计费。
2. U01 账户管理和认证态 E2E 仍未闭环；已有合成会话脚本曾触发工作区安全限制，不得绕过。
3. B06 真商户支付退款、B07 独立非空库恢复、D02 远端 CI/监控和外部资质与隐私审查继续保留门禁。
4. 恢复时以实际 Git 和当前检查点为准；不可覆盖其他 Agent 的需求矩阵/主 handoff/风险表/发布清单和财务扫描文件。

A02 子工作包本机 VERIFIED，A02 整体仍 IN_PROGRESS，技术上线仍 NOT READY。
