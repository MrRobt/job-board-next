# D02 预发布环境保护工作包交接 · 2026-11-21

本轮基于 `F:\code\job-board-next` 最新 Goal / Git 状态执行，另一个 Agent 的主 `docs/goal/mvp/handoff.md` 存在未提交修改，故用独立交接文件。

## 新代码与入口

- `scripts/prelaunch-env-guard.mjs`：只读预发布环境配置检查，默认无模式时拒绝，拒绝全部真实支付、Mock 收款、退款发送/派发/查单、AI 模型及已批准开关的误开启。
- `scripts/prelaunch-env-guard.d.mts`：给 TypeScript 规则测试提供声明。
- `tests/prelaunch-env-guard.test.ts`：四项可重复的安全配置测试。
- `package.json`：`npm run release:preflight`；仅是手动/可集成的检查命令，当前没有自动执行在启动或 CI 中。

## 实测

- 显式 `DJS_PRELAUNCH_MODE=LOCAL_PREVIEW` 且功能开关关闭时，命令 `PASS` / exit 0；未指定模式 `BLOCKED` / exit 2。
- 全量单元 44/44，隔离 MySQL 集成 28/28，TypeScript、Next.js 生产构建 exit 0，匿名 HTTP smoke 13/13。初次 TypeScript 因 MJS 声明与测试参数类型出错，修复后真实复验成功。
- 对敏感环境值不输出，仅显示配置名；本包不调用支付/AI、不写数据库、不执行生产变更。
- 主 `handoff.md`、`requirement-matrix.md`、`risk-register.md`、`release-checklist.md`、其他 Agent 的 financial-risk-audit 与本机缓存均保留。

## 待续跑

- D02：将该门禁和 `release:smoke` 按授权接入可信 CI/CD，并核验 GitHub Actions 对真实新 commit 的运行结论；补认证态浏览器 E2E、TLS 终止、可信反向代理正确覆盖 header、源站只允许代理入口、告警和故障回滚。
- B07：完成合法授权的非空备份/异库恢复和旧生产库迁移。
- U01：邮件验证、忘记密码/撤销会话、账号注销与隐私保护，仍未完整交付。
- B06/L01/L02：真实资金/模型服务与审批保持关闭和人工门禁。

子包 `D02-prelaunch-env-guard` 本机 VERIFIED，整体 D02/MVP 仍 IN_PROGRESS。
