# /goal A02 模型成本离线核验交接 · 2026-11-21

本轮起点：`F:\code\job-board-next` main，与 GitHub 上一次已验收的模型 usage 解析版本一致；主 `handoff.md`、主需求矩阵、风险清单、发布清单及模型输出安全源码存在其他 Agent 的未提交改动，本轮均未改写。

### 可交付

- `lib/career/model-cost-check.ts`：按同供应商同模型聚合脱敏用量，重新按审批价格计算、校验重复运行号、金额篡改、预算异常、缺失用量、未提供/不匹配账单。
- `tests/model-cost-check.test.ts`：4 项专项测试；本轮全量单元 60/60、MySQL 集成 31/31、TS/build exit 0。
- `docs/goal/mvp/a02-offline-cost-check-2026-11-21.md`：运行边界和缺口说明；本次仅允许本机离线对账输入测试。

### 恢复时最高优先级

1. A02 模型 usage 与 ToolRun 同一事务原子持久化及崩溃未知态：此前工作区安全保护阻断数据库事务实现，未获授权不得绕过。当前报价核对函数还未挂接实际账本，没有审计数据源，不得声称真实成本统计已上线。
2. 真实服务商 Token 用量、账单来源/完整性、动态价格及异常预算告警，需独立审批和测试。
3. 其他 P0：U01 邮箱验证与账户注销及认证态 E2E；B06 资金小额 UAT/对账；B07 非空恢复；D02 GitHub push Actions 完整验收、HTTPS/监控/回滚。
4. 保留其他 Agent 的 `lib/career/provider.ts`、`lib/career/output-safety.ts` 及对应测试、`financial-risk-audit`、主 Goal 矩阵、`next-env.d.ts`、工具缓存和 lockfile；小包精确 Git add，正常推送不强推。

状态：`A02-offline-quoted-cost-check: VERIFIED (local/offline)`；A02/MVP 整体 `IN_PROGRESS`，生产与法律商户审批仍为硬门禁。
