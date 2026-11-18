# P0 微信 Native 下单防重定向与回包验签回归（2026-11-18）

## 背景与变更

`lib/payment/wechat.ts` 的 `createWechatUrl` 使用固定的微信支付 API v3 地址，但请求原先没有指定 `redirect`，会采用 Fetch 默认的跟随策略。支付网关涉及商户签名请求与支付凭据，应在任何 3xx 重定向时失败关闭。

已将微信 Native 下单请求显式设置 `redirect: "error"`，原有商户请求加签、支付金额、回调 HTTPS origin 校验、100,000 字节流式响应限额、公钥序列号及时戳/签名校验均保持不变。没有调用真实微信 API，也不设置任何真实支付开关。

新增 `tests/integration/wechat-native-gateway.test.ts`，运行时生成临时 RSA 密钥，并拦截 `fetch`（不向外联网），确认：
- POST 仅向固定微信 API 路径发送，`redirect="error"`、`cache="no-store"`；
- JSON 订单号与整数分金额正确，通知地址由经验证的 `APP_ORIGIN` 生成；
- 模拟微信 RSA 签名的有效回包返回 `weixin://wxpay/...`；
- 302、无签名、错误微信支付公钥标识、非微信二维码地址、超 100,000 字节回包均拒绝。

## 测试证据

| 项目 | 实测 |
| --- | --- |
| 新增微信下单离线验签集成 | 2/2 PASS |
| 全量单元 | 30/30 PASS |
| TypeScript | exit 0 |
| Next.js 16.4.6 生产构建 | exit 0 |

**尚不能宣称完整回归**：专用 MySQL `job-board-next-db-1` 容器内 `SELECT 1` 正常，但 Windows 宿主对 `127.0.0.1:3306` 访问仍超时，之前本轮完整集成 7/14 PASS、7/14 因 DB 不可达失败。商户真实支付/退款、微信沙箱和 CI 均未验收，`B05/B06/D02` 保持 `IN_PROGRESS`。

## 后续

- 恢复 Windows 宿主与职讯集隔离 MySQL 连接，完整复测集成和迁移。
- 商户持有人在合法测试环境中确认真实证书、DNS、回调、支付竞态、退款与权益账务。
- 不启用 `ENABLE_REAL_PAYMENT` 或真实 AI；法律、商户、个人信息相关审批仍为人工门禁。
