# 2026-11-18 P0 登录/注册可信代理 IP 限流与并发修复

## 实现边界

- `lib/trusted-client-ip.ts`：仅在显式配置 `TRUSTED_CLIENT_IP_HEADER` 时读取单个可信代理 IP；允许值 `x-real-ip`、`cf-connecting-ip`，拒绝不可信 `x-forwarded-for`、逗号列表、IP:port、非法 IPv4/IPv6、Zone ID 等。IPv6 规范化以避免等价形式分别计数。
- `app/actions/auth.ts`：在现有邮箱限流之外，新增同一 IP 共享配额：登录 15 分钟 60 次、注册 60 分钟 12 次；缺失或非法代理头在已配置时拒绝。未配置时维持原先按邮箱限流的行为。
- `lib/rate-limit.ts`：修复原 Prisma `authAttempt.upsert` 在同一身份/窗口并发初次写入时产生 `PRIMARY` 唯一键冲突的问题。采用参数化 MySQL `INSERT ... ON DUPLICATE KEY UPDATE` + 事务内行锁读数，固定窗口 UTC 结束时间，超过阈值返回 false，无并发报错。
- 测试：`tests/trusted-client-ip.test.ts` 验证默认禁用、头信任和输入规范化；`tests/integration/trusted-ip-limit.test.ts` 并发 7 次同 IP 调用、阈值 3 次，仅 3 次成功。

## 生产部署前提：不能默认把请求头当身份

`TRUSTED_CLIENT_IP_HEADER` **默认不设置**。只有完成以下条件，管理员才可以显式设置：
1. 所有入站请求都经受控的 CDN/反向代理；应用源站通过防火墙、网络策略或私有网络拒绝绕过代理的直连。
2. 代理**清除客户端同名请求头并写入实际客户端 IP**；配置 `TRUSTED_CLIENT_IP_HEADER=x-real-ip` 或 `cf-connecting-ip` 与代理实际行为一致。不得直接设置为 `x-forwarded-for`。
3. 通过真实预发布代理做正常请求、伪造 Header、绕过代理、IPv6、限流阈值等联调。缺 Header 的请求会被拒绝，因此配置错误会造成登录不可用，必须先演练回滚。

本轮**未修改部署环境变量、反向代理或真实网络入口**，因此 IP 限流实现仅达到本地可验证状态；部署集成仍是 P0 IN_PROGRESS，不能宣称完整生产安全验收。

## 真实验证

最初新增 7 次并发同 IP 集成测试为 **FAIL**：Prisma emulated upsert 抛出 MySQL 主键唯一冲突，这正是本轮发现并修复的 P0 风险。修复后重新执行：
- 单独并发数据库测试：1/1 PASS。
- 项目隔离 MySQL 数据库 `jobs_mvp_migrate_20261118_8f72` 全量集成：12/12 PASS，exit 0。
- 单元测试：10/10 PASS，exit 0。
- TypeScript `tsc --noEmit`：exit 0。
- Next.js 16.4.6 生产构建（显式项目路径）：exit 0，编译、TS 和页面生成均成功。

以上检查不会证明真实 CDN 的 Header 清洗，也不能代替邮箱验证、账户注销、密码重置、持续 IP 滥用监控和完整 E2E。

## 后续

- U01 仍 `IN_PROGRESS`：完成可信代理 UAT、邮箱验证、密码找回、账户注销、会话清理与安全回归。
- B06 退款主闭环、真实商户资金 UAT、模型和法律门禁保持原状态，未触碰其他 Agent 预存的未提交退款/Schema/UI 变更。
