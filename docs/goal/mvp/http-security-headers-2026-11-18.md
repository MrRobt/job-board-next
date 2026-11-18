# D02 P0 HTTP 响应头与敏感路由缓存控制（2026-11-18）

## 实施范围

`next.config.ts` 新增统一的 `headers()` 配置，保持 Next.js 16 单体架构，不修改其他 Agent 的账号、退款 Schema、支付/权限页面或真实环境开关。

全路由统一：
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`，降低个人求职页面来源泄漏
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=15552000`（180 天，**不加入 preload 或 includeSubDomains**；实际生效要求生产网关 HTTPS）

`/account/:path*`、`/admin/:path*`、`/tracker/:path*`、`/report/:path*`、`/api/:path*`、`/tools/:path*`、`/pay/:path*`、`/tool-pay/:path*`、`/checkout/:path*`、`/login`、`/register` 增加 `Cache-Control: private, no-store, max-age=0`。不对全站设置该缓存头，以免禁用带指纹的 `/_next/static` 资源缓存。

**没有添加未经 nonce 适配验证的全站 CSP**：Next.js 内联脚本和支付宝/微信页面支付流程必须先单独验证 CSP，避免上线后脚本和支付流程被意外阻断。没有修改支付通知、会话 Cookie、商户凭据或服务端权限检查。

## 本地测试

| 验收 | 结果 |
|---|---|
| 新增 `tests/security-headers.test.ts` | 2/2 PASS：全站头部、敏感路由 no-store、静态资源不被全站禁止缓存 |
| 全量单元 | 38/38 PASS |
| 独立 MySQL 集成 | 17/17 PASS |
| TypeScript | exit 0 |
| Next.js 16.4.6 生产构建 | exit 0 |

首次 TypeScript 测试文件存在类型推断错误；明确类型注解后复验全部通过。

## 仍未验收

- 尝试在 `.github/workflows/ci.yml` 添加实际生产 HTTP 响应头 smoke 断言时，连接器安全检查拦截修改。**没有绕过工具限制，也没有提交 CI HTTP 断言**。新规则尚未通过远端 CI 或真实浏览器/网关响应头测试；不能据此宣称完整 D02 已验收。
- 生产 TLS 证书、反向代理头覆盖/缓存/CDN、HSTS 生效与域名所有权、登录 Cookies 的安全属性、CSP nonce、跨站请求测试、DNS/出口策略仍需预发布验收。
- 有关法律资质、真实 AI/支付/商户合规及正式部署门禁保持关闭。D02 仍 `IN_PROGRESS`，项目仍 NOT READY。
