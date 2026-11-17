# 当前交付状态：AI 求职工具 MVP（2026-11-17）

- 产品已具备本地可运行首页、简历文本规则示例、AI Provider 适配、面试练习、个人求职记录、模拟次数包、账户和运营后台。
- AI 用量异常：>10 分钟 RESERVED 后台核查，管理员确认未交付后事务返还 1 次并记录 `ToolRunAdjustment`，测试覆盖权限与重复操作。
- 本轮新增支付对账代码：支付宝 RSA2 / 微信 API v3 签名查询、渠道安全关单、复查 CLOSED 后才释放待支付占用、管理员入口与 `ToolOrderReconcileEvent` 审计；`ENABLE_PAYMENT_RECONCILIATION` 默认禁用。
- 本轮本机验证：Prisma Schema、开发库同步、Client 生成、TypeScript 通过；8/8 单元测试、7/7 MySQL 集成测试和 Next.js 生产 build 通过。签名测试使用本地模拟 HTTP，不是真实通道 UAT。
- 生产迁移：此前生成基线，当前新增审计表增量迁移 SQL；开发库已 db push，**未取得独立新库 migrate deploy 的通过证据**。
- P0 上线阻断：真实商户支付/查询/关闭/退款/对账 UAT、模型实际合法服务联调、生成式 AI 和个人信息处理审查、工商与 ICP 等资质、客服退款协议、生产迁移/备份/监控/恢复、注册邮箱验证/IP 限流、安全与浏览器 E2E。
- 真实 AI、真实支付与商户对账开关默认关闭。商业定价仍属经营假设，不能将测试通过等同于正式上线。
- 恢复进度：`docs/goal/mvp/` 下的 current-task、handoff、test-evidence、requirement-matrix、release-checklist、risk-register。
