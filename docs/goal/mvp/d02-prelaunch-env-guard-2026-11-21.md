# D02 上线前环境安全门禁 · 2026-11-21

## 范围和新增文件

- `scripts/prelaunch-env-guard.mjs`：独立的只读预发布环境配置检查，不会启动服务、写数据库或向支付/模型 API 发送请求，也不会打印环境变量的值。
- `scripts/prelaunch-env-guard.d.mts`：供 TypeScript 单元测试导入的类型声明。
- `tests/prelaunch-env-guard.test.ts`：默认拒绝、错误模式拒绝、真实支付/模拟支付/退款/AI 等开关误启用时拒绝、公网域名及代理头校验、日志不泄露配置值。
- `package.json` 增加 `npm run release:preflight`。此命令是手动/部署前安全检查，不会直接修改已部署应用运行时开关，也没有自动接入 GitHub Actions。

## 使用方法与门禁

执行前明确设置 `DJS_PRELAUNCH_MODE`：

- `LOCAL_PREVIEW`：仅用于本机预览，要求非 production 环境；若设置 `APP_ORIGIN`，则必须是标准的 localhost/127.0.0.1 HTTP 根地址。
- `PUBLIC_PRELAUNCH`：仅是面向公网预发布的**配置检查**，要求 `NODE_ENV=production`、规范的 HTTPS `APP_ORIGIN`（非 IP、非 localhost、非内网/保留测试域名、无用户信息/路径/查询参数/端口），且 `TRUSTED_CLIENT_IP_HEADER` 为 `x-real-ip` 或 `cf-connecting-ip`。
- 任何模式都要求以下变量**未设置或显式 false**：`ENABLE_REAL_PAYMENT`、`ENABLE_TOOL_PAYMENTS`、`TOOL_PAYMENT_APPROVED`、`ENABLE_MOCK_PAYMENT`、`ENABLE_LIVE_AI`、`AI_COMPLIANCE_APPROVED`、`ENABLE_PAYMENT_RECONCILIATION`、`ENABLE_REFUND_QUERY`、`ENABLE_REFUND_DISPATCH_CLAIM`、`ENABLE_REFUND_SEND`。其它形式例如 `true` 或含糊的开关值都会 BLOCKED。
- 不指定模式时返回 `BLOCKED`、进程 exit 2；审核通过时 `PASS`、exit 0。输出只有模式、检测状态、违规的配置**名称**和未覆盖的外部门禁；不输出配置实际值。

## 2026-11-21 实际验收

- 新专项 **4/4 PASS**；测试包括所有受控开关、非规范公网 URL、可信代理头、CLI 配置值不泄漏、默认拒绝。
- 首轮 TypeScript 类型检查发现 `.mjs` 缺少类型声明、测试环境变量类型不匹配，已新增 `.d.mts` 和修正类型；之后 `tsc --noEmit` **exit 0**。
- 全量单元 **44/44 PASS**；隔离 MySQL 全量集成（文件串行）**28/28 PASS**；Next.js 16.4.6 生产 build exit 0。
- 手动执行 `npm run release:preflight`，只读安全的 `LOCAL_PREVIEW` 配置返回 `PASS`、exit 0；完全不设置门禁模式返回 `BLOCKED`、exit 2。
- 原有 `npm run release:smoke` 再执行 **13/13 PASS**，不需要真实账号、商户或 AI 服务。
- 本轮不修改任何金融交易记录、数据库 schema、用户会话或真实业务开关。继续保留其他 Agent 未提交的风险审计、需求矩阵、发布清单、主 handoff、缓存与锁文件。

## 上线边界

**此检查不是生产安全认证，也不是商业上线授权。** 它不能证明 TLS 证书、DNS/IP 解析、反向代理覆盖客户端 IP、阻断直接访问源站、数据库迁移、监控告警、压测、真实退款和独立合规审批已经完成。

当前仅提供手动/部署前可运行命令；现有 GitHub Actions 工作流包含受保护配置，之前修改被工作区安全检查拦截，**本轮未尝试绕过、未声称 CI 已自动运行该检查**。等待授权所有者将该命令纳入可信 CI/CD，再用真实 run 证据验收。

状态：`D02-prelaunch-env-guard: VERIFIED`（本机子工作包），`D02: IN_PROGRESS`，整个 MVP 仍未达到技术上线就绪标准。
