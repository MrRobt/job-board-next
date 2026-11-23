# U01 邮箱验证注册与安全会话闭环 · 2026-11-23

## 代码与安全边界

- 已在 `669fe82` 完成版本化迁移与一次性哈希令牌服务：主 CI `45123821665` SUCCESS，独立 MySQL8 数据库集成包含令牌轮换、过期、并发单次消费。
- 新邮件适配器通过固定 Resend HTTPS API 提供**可选**发信，仅在 `ENABLE_EMAIL_VERIFICATION_DELIVERY=true` 且 `RESEND_API_KEY`、`EMAIL_FROM_ADDRESS`、`APP_PUBLIC_BASE_URL`（HTTPS 根地址）齐全时才能调用；默认不访问网络、不打印令牌和密钥，超时/错误均拒绝。运营者必须完成服务商/隐私数据处理审批，不由 Agent 设置真实凭据。
- 注册必须先满足限流及发信配置；用户创建后先签发哈希令牌再调用发信，不再直接创建 session。失败账号保持未验证、可稍后通过重发入口继续；绝不视为注册成功。登录在密码校验后要求 `emailVerifiedAt`，`currentUser` 还会拒绝旧的未验证会话，`startSession` 双重校验。
- `/verify-email` GET **不会消耗令牌**；页面提交 POST Server Action 才原子消费。确认及重发均使用数据库限流，生产要求可信代理 IP；重发不暴露邮箱是否存在，令牌不写入普通日志。邮件正文仅发确认链接，不触碰简历或求职内容。
- D02 预发布守卫新纳入 `ENABLE_EMAIL_VERIFICATION_DELIVERY`，LOCAL_PREVIEW/PUBLIC_PRELAUNCH 必须为 false；CLI 输出仅变量名称、不泄密。

## 已执行的测试

- 邮件 adapter 单元先 RED 缺模块，新增后 3/3 GREEN：缺审批、无凭证、非法来源、固定 API、网络故障 fail-closed。
- U01 会话/注册/页面结构断言 3/3 GREEN；原预发布策略未追踪邮件开关先 RED（明确 `Untracked prelaunch gate`），修复后专项 GREEN。
- 完整 `npm test`、独立 `tsc --noEmit`、Next.js 生产 build、独立 HTTP 测试脚本 `node --check` exit 0。
- 扩展原隔离 MySQL8 的管理员 HTTP E2E：新增一个实际数据库 `ADMIN` 角色但 `emailVerifiedAt=NULL` 的会话，要求匿名路径对该会话返回登录重定向；旧管理员/普通用户及 CSRF 路径不降低。**本包新增 HTTP 实测须等 GitHub run/job 才能宣布 VERIFIED。**

## 未解除的门禁和交接

- **正式邮箱服务商凭据与数据处理审批没有提供，未执行真实外部邮件投递**；尚未在真实邮箱收件箱验证完整送达、反垃圾、重发延迟。
- 旧账号默认 NULL 且原旧 session 被新版本拒绝；这是一项**有意的 fail-closed 变化**，部署前必须审批旧账号验证通知、管理员恢复与避免锁定的上线迁移计划，不得直接对现有生产库套用这次迁移。
- 密码找回、账户注销及真实邮箱 UAT 尚未完成；U01 总体 IN_PROGRESS，技术上线 NOT READY。
- 下一包：核对真实 GitHub HTTP/主 CI，回填 run/job；对未验收的密码找回和账户注销做后续独立工作包，保留资金/法律外部门禁。
- 其他 Agent 未提交的 `handoff.md`、需求矩阵、风险/发布清单、财务审计、缓存/lockfile 不得混提交。
