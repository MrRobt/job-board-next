# /goal A02 供应商 usage 解析交接 · 2026-11-21

本次仅提交独立子包，不改其他 Agent 正在修改的 `docs/goal/mvp/handoff.md` 和主矩阵。

## 已完成 / 测试

- `lib/career/model-usage.ts`：解析 OpenAI-compatible usage，区分 REPORTED / UNREPORTED / INVALID；价格来自上一包已验证的服务器端成本策略，计算结果是**报价估算**而非供应商正式账单。
- `lib/career/provider.ts`：`generateMeasured` 返回 `{report,usage}`；原 `generate` 报告-only 合约不变；身份/预算检查前置到出站之前。
- `tests/model-usage.test.ts` 4/4；扩展 `tests/integration/ai-model-cost.test.ts` 1/1（包括有/无 usage 响应）；全量单元 53/53、隔离 MySQL 集成 30/30、TypeScript/Next build exit 0。
- Prisma 仍为先前 8 个已验收迁移，没有执行新的 schema 变更；无真实模型/商户调用。

## 核心未完成项（下一最高 P0）

- **usage 与 ToolRun 状态的原子落库**：本轮尝试审计表/事务代码，工作区敏感操作保护阻断事务文件写入；已撤回 schema/未执行迁移，**没有持久化 usage，也没有修改原有扣次数动作**。需授权的开发/迁移环境完成 schema、事务幂等测试、模拟供应商报告、进程崩溃、以及异常成本审计。
- 缺失/INVALID 的 usage 不能作为 0 成本，须由管理员对账并保持 UNKNOWN；费用预估也不能替代模型真实开票。
- 仍缺真实模型使用数据、隐私审核、报警与成本汇总、U01 认证态 E2E、B06 商户 UAT、B07 非空恢复、D02 远端 CI 等门禁。
- 本次精确提交代码、测试与增量文档；`financial-risk-audit`、其他 Agent 主 handoff/需求矩阵/风险和发布清单等保持原样。

子包 `A02 usage parsing: VERIFIED (offline)`，A02 整体 `IN_PROGRESS`，商业上线 `NOT READY`。
