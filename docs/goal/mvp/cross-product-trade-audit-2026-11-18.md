# P0 跨业务交易号重复历史记录只读核账（2026-11-18）

## 背景与用途

已修复的跨表重复结算漏洞曾允许 `Order`（历史招聘订单）和 `ToolOrder`（AI 次数包）各自将同一个 `providerTradeId` 记为已支付。仅阻止新结算不能发现已经存在的历史冲突。该工作包提供一个**只读、人工核账辅助**，不进行自动退款、补发权益、撤权或修改任何数据库记录。

## 交付

- `lib/payment/cross-product-trade-audit.ts`：关联已存在的两张订单表相同、非 NULL 的 `providerTradeId`。返回冲突总数与最多 50 条内部核账样本，只含历史订单 ID、次数包订单 ID、订单状态和交易引用 SHA-256 指纹；**不返回原始商户交易号、用户电子邮箱、联系方式或支付密钥**。
- `scripts/payment-trade-audit.ts`：仅在运维显式设置 `PAYMENT_TRADE_AUDIT_APPROVED=true` 时运行；默认拒绝执行。结果 JSON 输出只读扫描，总冲突数大于零时退出码 2，正常 0，执行错误 1。需要可信服务端 DATABASE_URL 及 Node React Server 运行条件；**禁止公开提供给用户或注入生产密钥到日志**。
- `tests/integration/cross-product-trade-audit.test.ts`：在专用隔离 MySQL 库创建人工冲突夹具，验证查询能检测同号跨表、只返回 SHA-256 而非商户原始交易号、输入样本上限验证，完成后清理夹具；不访问真实商户或生成真实资金指令。

## 本地实测

仅在职讯集独立 MySQL `jobs_mvp_migrate_20261118_8f72` 测试库运行：

| 检查 | 结果 |
|---|---|
| 新增核账集成 | **1/1 PASS**，人工合成重复交易可检出，正文无原始交易 ID |
| 手工授权只读 CLI | exit 0，输出 `{"count":0,"sample":[]}`（当前测试库快照） |
| 全量单元 | **38/38 PASS** |
| 全量 MySQL 集成 | **19/19 PASS** |
| TypeScript | exit 0 |
| Next.js 16.4.6 生产构建 | exit 0 |

首次测试运行因 SQL tagged template 对 MySQL 反引号转义错误导致编译失败；修复为受控、编译期常量 `Prisma.raw("&#96;Order&#96;")` 后专项及全量验收通过。不存在字符串拼接用户提供的 SQL 标识符或任意查询内容。

## 运维使用与局限

- 只读运维调用示例（在可信预发布/运维环境，不需要明文记录生产凭据）：
  `PAYMENT_TRADE_AUDIT_APPROVED=true NODE_OPTIONS=--conditions=react-server npx tsx scripts/payment-trade-audit.ts`
- 需具备只读数据库权限。发现异常时由授权管理员核验真实商户收款流水、原始订单/次数包及用户权益，不得仅因该报告自动 `REFUNDED`、退款或者撤权。
- `count` 和 `sample` 是两个相邻只读 SQL 结果，**不构成跨整个时段的事务一致性快照**；写入中的订单可能使两者暂时不一致，异常事件须进一步人工复核。
- 测试库当前零异常，**不代表生产历史交易无重复**；没有生产数据扫描、生产只读账号验证、实际商户交易凭据/合规 UAT。B04/B05/B06 仍 IN_PROGRESS。
