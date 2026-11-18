# P0 支付回调域名与支付开关安全门禁（2026-11-18）

## 问题与实现

以前 `enabled(channel)` 只确认 `APP_ORIGIN` 的 URL 协议为 HTTPS，但 `origin()` 在生成支付宝/微信回调 URL 时另行校验路径、凭据等属性，两个策略不同步，存在渠道在配置层被误判为已启用、实际支付回调地址不合法的风险。

本子包新增：
- `lib/payment/origin-policy.ts` 纯函数 `validatedPaymentOrigin`：仅接受规范的公共域名 HTTPS origin，不接受 IP（含 IPv6）、localhost/内网域名后缀、用户凭据、自定义端口、额外路径、查询参数、片段、空白、反斜杠或非规范写法。返回标准化 origin，不读取请求头。
- `lib/payment/config.ts` 统一 `enabled()` 和 `origin()` 使用上述单一规则；`ENABLE_REAL_PAYMENT` 及渠道凭据检查仍保留，默认禁用，不会发起真实支付请求。
- `tests/payment-origin-policy.test.ts` 与 `tests/integration/payment-origin-config.test.ts` 覆盖正常配置、变造 URL 与支付启用边界，不使用真实商户凭据。

URL 校验只能排除显而易见的非公开地址与格式；**不能证明 DNS 解析、CDN、TLS、源站隔离、证书与商户回调地址配置已获验收**。生产仍需由有权主体审批真实商户和来源域名，验证网络及回调地址可达性。

## 实测门禁

- 新增纯单元：**2/2 PASS**；渠道配置启用边界离线集成：**1/1 PASS**。
- 完整单元套件（含上轮支付 HTTP 流式限额）：**30/30 PASS**。
- TypeScript `tsc --noEmit`：**exit 0**。
- Next.js 16.4.6 生产构建：**exit 0**，包含支付与就绪探针路由。
- 尝试运行完整 MySQL 集成：**7/14 PASS、7/14 因 DB 连接不可达 FAIL**。`job-board-next-db-1` 容器状态 healthy、3306 映射存在，容器内 `SELECT 1` 成功；但 Windows 宿主连接 `127.0.0.1:3306` 超时，连 `prisma migrate status` 都超时。这是当前隔离测试环境的访问阻断，**不是完整集成通过**。没有重启、重建、清库或访问其他项目容器。
- CI 远端运行未确认；无真实商户、资金或模型网络调用。

## 后续

1. 恢复仅本项目宿主到 Docker MySQL 的连接，复跑完整 MySQL 集成与独立迁移状态检查；查清是 Docker 端口代理、防火墙或主机网络问题。
2. 在合法商户 UAT 下确认批准的 `APP_ORIGIN` 域名、证书、回调 URL、反向代理、支付通知幂等、验签与订单/金额核对。
3. B05/B06 仍 `IN_PROGRESS`、真实商户/合规仍 `BLOCKED`，`ENABLE_REAL_PAYMENT` 和 `ENABLE_LIVE_AI` 保持关闭。
