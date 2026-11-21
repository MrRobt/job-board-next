# A02 · AI 供应商 Token 用量解析（2026-11-21）

## 本包已完成

上个 A02 子包只实现单次模型请求**预估预算**，尚无真正的供应商用量反馈。本包在保持原有页面调用契约不变的基础上，实现 **HTTP 响应中的 usage 解析及结构化返回**：

- `lib/career/model-usage.ts`：严格解析 OpenAI-compatible `usage.prompt_tokens`、`usage.completion_tokens`、可选的 `usage.total_tokens`；只接受有限范围的非负整数，拒绝字符串、负数、非整数、总数不一致及异常过大数值。采用部署端人工审核的输入/输出单价计算整数分的**报价口径成本**并标记超越预设单次预算。
- `REPORTED` 代表有完整、格式有效的供应商 Token 数；`UNREPORTED` 代表响应没有 usage；`INVALID` 代表响应有 usage 但格式异常。未报告或无效时 **`costFen=null`**，不会误记为 0 成本，也不会推断商户实际发票。
- `lib/career/provider.ts`：原有 `generate(input)` 仍仅返回简历/面试报告；新增 `generateMeasured(input)` 返回 `{report,usage}`。模型/供应商审计标识和上个子包的价格/预算校验都在真实网络请求之前执行；未调用外部模型进行验收。
- 结构化用量字段**不包含**简历正文、面试回答、密钥或 HTTP 原始回包。原有 `practice` 页面/Server Action 的功能与次数结算路径保持不变。

## 测试证据

- 新 `tests/model-usage.test.ts`：**4/4 PASS**，覆盖正常用量及整数分成本、预算超限、无 usage/异常用量记为未知、审计标识格式校验。
- 原 `tests/integration/ai-model-cost.test.ts` 扩展模拟响应：正常 `generate` 兼容旧输出；`generateMeasured` 可解析已报告的 Token 用量/成本，缺失 usage 时标为 UNREPORTED。集成专项 **1/1 PASS**。
- TypeScript exit 0，单元全量 **53/53 PASS**，独立 MySQL 集成（文件串行）**30/30 PASS**，Next.js 16.4.6 生产构建 exit 0。
- Prisma schema 恢复到本轮开始时一致，隔离 MySQL `migrate status` 仍为 **8 项已登记且 up to date**。没有执行新的数据库迁移、没有用户或商户数据变更。
- 源码最初曾尝试设计 Token 用量审计表及与 `ToolRun` 成功状态的原子提交，但这部分数据库事务实现触发了工作区敏感内容安全检查。已撤回本轮数据库 schema 与增量迁移草案，**未绕过、未提交、未执行**；不能把用量解析误报为已持久化审计。

## 明确的未完成 P0 门禁

**A02 整体 IN_PROGRESS：模型使用记录持久化、同一次数扣减的原子一致性、失败/崩溃恢复、管理员成本汇总、供应商实际账单核验、超额告警，全部未完成。**

特别注意：解析后的报价成本只是使用供应商报告 Token 数与配置单价的测算，不代表真实计费金额；供应商可能另有缓存、推理 Token、阶梯价格、折扣或计费项。实际商户和模型账号、真实调用、隐私与个人数据处理审批、历史生产库备份/迁移均保留独立人工或授权门禁。当前不能开启真实 AI 收费。

本轮不编辑其他 Agent 的主 `handoff.md`、`requirement-matrix.md`、`release-checklist.md`、`risk-register.md`、`financial-risk-audit` 和本机缓存；按明确文件分批提交/推送。
