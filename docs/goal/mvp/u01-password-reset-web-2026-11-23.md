# U01 找回密码页面与默认关闭的邮件发送 · 2026-11-23

## 工作包内容

- 依托 `98af09c` 已验收后端独立令牌：新增 `/forgot-password` 和 `/reset-password`，以及 Server Actions `requestPasswordReset`、`confirmPasswordReset`。用户只能通过 POST 显式重置密码，GET 浏览链接没有数据库写操作；确认后跳转登录，原会话在后端同事务撤销。
- 请求接口统一响应是否存在账号，不披露账户枚举信息。仅已验证邮箱账户有资格获取找回令牌。确认时严格校验一枚令牌和一项新密码（12～128 位），数据库级按 email/令牌摘要 + 可信代理 IP 限流；生产缺受信任代理配置 fail closed。
- `lib/password-reset-delivery.ts` 使用独立 `ENABLE_PASSWORD_RESET_DELIVERY=true` 和邮件供应商配置门禁；固定 Resend HTTPS API、禁用跳转、8 秒超时、失败拒绝；邮件正文只包含找回链接，不包含求职数据。复用验证邮箱的 HTTPS 源检查，外发默认关闭；没有配置任何真实密钥或发送真实邮件。
- D02 `scripts/prelaunch-env-guard.mjs` 同步纳入 `ENABLE_PASSWORD_RESET_DELIVERY`，LOCAL_PREVIEW 和 PUBLIC_PRELAUNCH 均必须关闭；只读预检不打印凭据。
- 用户登录页面增加找回链接和成功提示；新增页面 `robots noindex`、`referrer=no-referrer`，避免索引包含临时链接的 URL。

## 测试证据与局限

- `tests/password-reset-delivery.test.ts` 先 RED 模块缺失，代码后 3/3 GREEN：禁发送配置、固定提供商、异常故障 fail closed。
- 预发布开关策略先 RED（新 flag 未纳入 offFlags），修复后通过；`tests/password-reset-auth-policy.test.ts` 2/2 GREEN：POST-only、限流、反枚举和表单严格检查。
- 完整 `npm test`、独立 `tsc --noEmit` 与 `npm run build` 均 exit 0；本地未访问/迁移现有 MySQL，也未进行任何外部邮件调用。
- 上一底座提交 `98af09c` 主 CI `45126554312` / job `137532100371` completed/success；实际 job 日志 `U01 password recovery is single-use and revokes sessions on disposable MySQL` PASS，单元 185/185 PASS；仅底座 VERIFIED。
- **本包新增页面与 Server Actions 尚未取得新远端真实 HTTP E2E 回执；只凭静态策略与构建不能声称完整找回流程 VERIFIED**。下一小包应在全新 MySQL8 + localhost Next 真实 HTTP 验证匿名请求防枚举、同源提交、令牌单次消费与旧会话撤销。需要外部邮件供应商批准、真实收件箱测试；U01 整体 IN_PROGRESS、NOT READY。

## Git 及人工门禁

仅提交本包相关代码、策略测试和独立交接，其他 Agent 的 `handoff.md`、矩阵、风险/发布清单、财务审计、工具缓存及 lockfile 不动。实际邮件/商户/AI 以及隐私与合规审批始终保留人工控制。
