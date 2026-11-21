# A02 模型出站隐私拦截 · Goal 交接（2026-11-21）

主 `handoff.md` 是其他 Agent 的未提交修改文件，故本轮使用独立交接，不覆盖其内容。

## 实现

- `lib/career/contracts.ts` 的 `hasContact` 现在识别全角邮箱、带短空格/连字符的中国大陆手机号、国际区号和分组身份证格式；输入仅做 Unicode NFKC 检测，**不擅自修改简历真实正文**。
- `lib/career/provider.ts` 的 `generate` 在任意模型网络请求前做 `inputSchema.parse` 和联系方式检查，避免绕过既有 `app/actions/career.ts` 表单检查。
- 新增 `tests/career-privacy-boundary.test.ts` 与 `tests/integration/ai-privacy-outbound.test.ts`。专项 2+1 PASS，出站请求数为 0；全量单元 46/46、MySQL 集成 29/29、TS/build exit 0。
- 不开启 `ENABLE_LIVE_AI`，不触碰付费订单、用户数据库、其他 Agent 的未提交财务审计。

## 阻断与下轮优先级

- U01 合成会话的认证态 HTTP 验收脚本被工作区敏感凭据写入安全检查拒绝：未添加、未绕过；后续交由有权执行器在独立测试环境做。
- A02 整体未完成：需独立隐私评审、用户明示授权、姓名/详细地址/银行卡等更广覆盖、实际模型服务的数据处理与留存审计、输出安全与成本账单验证。仅将这个**格式识别子包**视为本机 VERIFIED。
- B06 真实商户退款与账务对账、B07 非空异库恢复、D02 GitHub Actions 和登录态 E2E 继续保留人工/运行门禁。

## Git 安全

只能独立提交本轮模型输入校验、纯测试与 A02 文档；不能包含其他 Agent 的主需求矩阵、release-checklist、risk-register、handoff、financial-risk-audit、缓存与 lockfile。提交后按既有 Windows SSH 443 严格主机校验普通推送，不强推。
