# A02 · 模型调用前成本预算门禁（2026-11-21）

## 工作包与实现

基于真实职讯集 `F:\code\job-board-next` 工作树，完成一个独立可测试的 A02/P0 子包。没有调用真实模型、商户或改变数据库。

- `lib/career/model-cost-policy.ts`：为批准的模型供应商引入严格正整数的“每百万输入 Token 分价”“每百万输出 Token 分价”“每次请求最高预算（分）”。所有字段都必须由部署端显式配置；缺失、负数、小数、零单价、超出合理范围一律拒绝。
- 模型实际出站函数 `lib/career/provider.ts` 先做已存在的入参/隐私检查，再计算预计成本，最后才允许执行 `fetch`。`liveAvailable()` 在成本策略不存在时也返回 false，避免前台显示“真实 AI 可用”却在使用次数预留之后因未配价格失败。
- 估算包括实际请求 JSON 的 UTF-8 字节数、额外 1024 Token 的服务端提示/格式预留、输出上限 2500 Token；全部使用 BigInt 整数分算术且向上取整，拒绝超预算及异常大的请求体。
- 新增 `tests/model-cost-policy.test.ts`（3/3）与 `tests/integration/ai-model-cost.test.ts`（1/1），覆盖缺价格、价格非法或超预算时没有任何模型网络请求，以及预算允许时仅进入本地模拟的模型请求。

## 部署配置（不存放任何真实密钥）

- `AI_INPUT_PRICE_FEN_PER_MILLION_TOKENS`：整数分/100 万输入 Token，正整数。
- `AI_OUTPUT_PRICE_FEN_PER_MILLION_TOKENS`：整数分/100 万输出 Token，正整数。
- `AI_MAX_REQUEST_COST_FEN`：单次调用最大容忍成本，人民币分，正整数。

以上属于**人工部署时必须审核的模型报价与预算**，由运营确认后从环境配置/秘密管理设置；仓库不写入任何真实 API Key 或商户数据。没有价格和预算时，真实 AI 默认关闭。除此之外仍然要求原有 `ENABLE_LIVE_AI`、`AI_COMPLIANCE_APPROVED`、经过批准的 HTTPS 模型供应商地址、隐私告知与密钥。

## 测试证据

- 成本策略专项 3/3 PASS；模拟供应商网络专项 1/1 PASS，缺失价格或超预算时 `fetch` 次数为 0。
- TypeScript exit 0、全量单元 **49/49**、全量隔离 MySQL 集成（测试文件串行）**30/30**、Next.js 16.4.6 生产构建 exit 0。最后一次完整 MySQL 集成独立复测再次 30/30 PASS。
- 首轮 TypeScript 检查因函数参数使用了项目扩展 `NodeJS.ProcessEnv`、而测试用的是普通键值对象，出现类型错误。已收窄为 `Readonly<Record<string,string|undefined>>`，后续所有检查通过。
- 最初的测试文件草稿触发工作区敏感内容保护，未绕过；调整为不包含凭据的纯配置与模拟请求断言，完成测试。模拟出站不等于真实供应商联调。

## 明确限制（不能将本子包认定为完整模型成本审计）

字节数估算只是一种**保守的入场成本预算启发式**，不是供应商分词器的可验证 Token 上界，也不代表真实开票费用。输出上限 2500 Token 不能保证所有供应商都按相同规则计费。

A02 整体仍 `IN_PROGRESS`：后续必须增加实际模型返回的 usage/token 计数、真实账单核验、按用户与提供方归集成本、异常告警、计价变更管控及实际使用压力测试，并完成模型个人信息处理和数据留存的独立合规审批。没有真实调用或合规授权前不得打开真实 AI。

其它 Agent 的 `handoff.md`、主需求矩阵、风险表、上线清单、`financial-risk-audit` 和锁文件均未修改；分批 commit/push。
