# A02 · AI 模型输出隐私门禁（2026-11-21）

## 本次交付范围

此前 A02 已验证模型请求前的联系方式过滤，`generateMeasured()` 接收外部模型 JSON 后则只做 Zod 结构约束，未检查模型是否主动生成邮箱、电话号码或证件号。这会导致敏感文本出现在用户可见的报告中。

- 新增 `lib/career/output-safety.ts` 的 `validateSafeModelOutput()`，严格解析原有 `output` Schema 后，对摘要、全部小节标题、各项建议以及全部后续步骤逐字段运行现有 `hasContact`（包括 NFKC 全角变体）。
- `lib/career/provider.ts` 现在返回模型报告前必须经过该检查；一旦命中，抛出**不包含原始敏感文本**的统一错误，不会把不安全报告交给页面。
- 既有 `app/actions/career.ts` 对 `generate()` 的失败处理仍调用 `finish(runId,false)` 返还预留次数；本包未重写次数账本或新增资金路径。这个返还机制是沿用现有逻辑，不将它宣称为新的端到端 UI 验收。
- 不上传文件、不保存模型原文、不改动任何 DB schema，也不启用真实模型或支付。

## TDD 和回归结果

- 新 `tests/ai-output-privacy.test.ts`：先运行得到 MODULE_NOT_FOUND 红灯（尚未实现输出检查）；新增纯函数后 **3/3 PASS**：正常报告保持原样、四类可见字段发现联系方式会拒绝、无效 Schema 会拒绝。
- 新 `tests/integration/ai-output-privacy.test.ts`：模拟模型返回有效 Schema、但含邮箱的报告；旧 `generate()` 与 `generateMeasured()` 都会拒绝交付，**1/1 PASS**；两次 HTTP 只命中本机内存中的模拟 `fetch`。
- 额外 TypeScript `tsc --noEmit` exit 0；全量单元 **56/56 PASS**；隔离 MySQL 集成（文件串行）**31/31 PASS**；Next.js 16.4.6 生产 build exit 0。
- 本轮无 Prisma 迁移，不处理正常开发库与生产库；Git 暂存时仅包含本包代码、测试与证据。

## 未解除的 P0 门禁

这只是**格式性输出过滤**，不是完整 PII/DLP、内容真实性审查或法律合规保证。仍可能漏检姓名、详细地址、非大陆号码、银行卡号、被刻意拆散的联系方式，也可能误判某些数字字符串。需要后续更完整的隐私分类/脱敏策略、实际模型评估、用户明示同意、第三方数据处理审查与数据保留/删除权验证。

上轮 usage 解析之后，A02 用量与 `ToolRun` 的原子持久化仍被工作区安全检查阻断，**本包没有绕过，也没有把 usage 错报为落库**。B06 真商户支付退款、B07 非空异库恢复、U01 认证态浏览器 E2E、D02 远端 CI、HTTPS/监控、法律资质均依旧未通过正式门禁。

**状态：A02 输出隐私子包本地 VERIFIED；整体 A02 和 MVP 仍 IN_PROGRESS。**
