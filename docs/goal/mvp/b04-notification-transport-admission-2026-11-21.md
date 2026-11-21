# B04/U03 通知发送前安全授权候选（2026-11-21）

## 范围和变更
- 新增 `lib/career/ops-notification-delivery-policy.ts`，纯函数检查两项显式开关、规范 HTTPS 根 Origin、精确受批准列表。默认 DENY，不允许 HTTP、认证信息、端口、路径、查询、内网/本机 IP 直接当作目的地。
- 新增 `tests/ops-notification-delivery-policy.test.ts` 三组权限/域名校验测试。
- **本次没有 sender 接线、网络 I/O、Secret 注入或通知发送**；策略未来接线前仍需真实 DNS/网络出口约束（防 DNS rebinding）、接收人批准、供应商幂等、当前租约复核、投递回执和可靠告警。

## 验收事实
- 首轮 CodexPro Bash 默认落到 MSYS2 用户目录，`npm test` 找不到项目 package.json；首轮单项 Node loader 由于 Windows 路径 URL 格式异常未执行。未把它们记为代码失败。
- 使用 `npm --prefix F:/code/job-board-next test`：exit 0（包含新专项）。
- `F:/code/job-board-next/node_modules/.bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json`：exit 0。
- `npm --prefix F:/code/job-board-next run build`：exit 0，Prisma Client 生成与 Next.js 16.4.6 编译、页面生成完成。
- `npm --prefix F:/code/job-board-next run test:integration`：exit 1，至少一个用例报 `Disposable MySQL required`；未提供合规隔离测试授权，不得称 MySQL 全套通过。
- 未做真实支付、实际通知、外部商户或生产环境验证。

## 后续
B04/U03 继续 IN_PROGRESS：实现与验证供应商发送、强身份目标配置、网络 ACL、claim token 防重投、送达结果、超时/崩溃恢复，最后部署和浏览器回归。正式收费与对外发送继续默认禁止。保护其他 Agent 未提交的主 handoff/矩阵/财务审计文件，不混提交。
