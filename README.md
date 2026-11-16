# 职讯集 · AI 求职工具平台
Next.js App Router + TypeScript + Prisma + MySQL 8。面向自主求职者的独立工具：简历诊断、模拟面试、回答反馈、个人投递跟踪、按次工具服务。历史招聘业务已停止发布和销售，仅保留历史订单售后。
## 本地启动
需要 Node.js 22、npm、Docker 或 MySQL 8。
1. 复制 .env.example 为 .env，设置管理员邮箱及至少12位强密码。
2. docker compose up -d db
3. npm install
4. npm run db:push（仅开发/测试库）
5. npm run db:seed
6. npm run dev
首页 http://localhost:3000；后台 /admin；免费规则示例无模型密钥也可运行。登录后使用工具及投递看板。开发环境可显式 ENABLE_MOCK_PAYMENT=true 测试次数包，不会收款；生产环境禁用模拟支付。
## 真实服务
默认关闭真实 AI 和支付。模型 API 接入参见 docs/AI-PROVIDER.md；次数包与支付参见 docs/TOOL-BILLING.md。真实经营前需落实大陆适用资质、数据处理和生成式 AI 合规，并完成真实商户支付、退款、账务和安全验收。禁止将密钥提交仓库。
## 验收
npm run typecheck、npm test、npm run build。一次性测试数据库进行 schema push 后以 INTEGRATION_TEST_DATABASE=true 执行 npm run test:integration。GitHub Actions 配置已存在，运行结果以 Actions 为准。
产品需求 docs/PRD-AI.md；当前状态 docs/STATUS.md；部署 docs/DEPLOY.md。旧需求 docs/PRD.md 为历史文档，不作为当前上线范围。
