# P0 支付回调和商户 HTTP 正文限额（2026-11-18）

## 修复目标

修复先 `request.text()` / `response.text()` 整体读取、之后才检查长度带来的内存占用风险。新增 `lib/http-body-limit.ts`：对 `Request` / `Response` 的原始 UTF-8 正文流式读取、分块累计字节、检查 Content-Length、超过阈值主动取消读取，并拒绝无正文、无效 UTF-8 与超限；返回未经更改的有效原文供现有签名验证。

**变更范围（均无真实资金操作）：**
- 4 个异步回调：`app/api/payment/{alipay,wechat}/notify/route.ts` 与 `app/api/tool-payment/{alipay,wechat}/notify/route.ts`。64 KiB 接收上限现在提前并流式检查，原有渠道验签、订单匹配、业务响应码不改变。
- `lib/payment/merchant-gateway.ts`：微信查单/支付宝商户查单 100,000 字节上限提前执行；微信无正文的 204 关单维持原有特殊分支。
- `lib/payment/refund-query.ts`：仅只读渠道退款查单，响应上限 100,000 字节。
- `lib/payment/wechat.ts`：创建微信 Native 下单请求，检查 HTTP 成功后再按 100,000 字节上限读取并验签。

## 已实际获得的测试证据

| 证据 | 结果 |
| --- | --- |
| `tests/http-body-limit.test.ts` | 5/5 PASS：合法字节数、UTF-8 多字节、伪造 Content-Length、超限流式正文、空/无效字节拒绝 |
| `tests/integration/merchant-gateway.test.ts` | 2/2 PASS：微信/支付宝查单与验签模拟 |
| TypeScript `tsc --noEmit` | exit 0 |

**阻断**：试图执行全量集成、全量单元及 Next.js 生产构建的调用被工具安全检查阻止。本工作包**未取得最终完整回归和构建证据**，不能作为生产或完整支付验收。没有变通绕过或代替工具的限制。

## 边界与下一步

- 仍须在可信反向代理和 CDN 设置请求体上限、请求速率限制；应用层限额不能替代网络防护。
- 签名逻辑仍验证原始正文，未添加自动支付成功、退款到账或权益撤回逻辑；真实商户沙箱/正式渠道均未联调。
- 全量测试、生产构建、部署环境大请求联调、恶意报文/超时/中断回归继续 `IN_PROGRESS`，真实支付和模型开关不得启用。
