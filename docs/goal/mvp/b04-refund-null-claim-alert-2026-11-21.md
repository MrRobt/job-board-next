# B04/B06 退款 IN_DOUBT 缺少领取时间监控防漏报 — 2026-11-21

状态：VERIFIED（纯规则和隔离 MySQL 回归子包）；完整生产告警与商业上线仍 IN_PROGRESS。

## 风险与修复
历史只读扫描只统计 `IN_DOUBT AND claimedAt < now-15min`，遗漏 `claimedAt IS NULL` 的不一致退款派发记录。此类异常不能因为无时间戳就被视为正常。

- `lib/career/ops-alert-policy.ts` 新增 `opsAlertQueryFilters(now)`，统一生成只读 Prisma 查询。对 `IN_DOUBT` 统计条件为 `claimedAt IS NULL OR claimedAt < now-15min`；若时钟非法直接拒绝。
- `scripts/ops-alert-scan.ts` 使用同一规则查询，仍然只输出汇总计数和异常类型；零个资金网络操作、零笔退款状态写入。
- `tests/ops-alert-policy.test.ts` 增加查询形状/阈值/空领取时间/非法时钟测试。无授权时继续拒绝连接数据库。

## RED / GREEN 和实际验证
- 新测试添加后，完整单元首轮 **71 PASS / 1 FAIL**（缺少 `opsAlertQueryFilters`）。
- 修复后单元 **72/72 PASS，exit 0**。
- 直接 TypeScript `tsc --noEmit`：**exit 0**。
- 职讯集历史专用 `jobs_mvp_migrate_20261118_8f72` 隔离 MySQL 文件串行集成：**31/31 PASS，exit 0**。
- Next.js 16.4.6 生产构建：**exit 0**。
- 隔离库、只读显式批准的实际扫描：**exit 0**，`staleReservations=0, uncertainRefunds=0, agedReadyRefunds=0`。

## 限制和下个工作包
此包验证查询条件并在现有隔离数据库执行只读扫描，**未在数据库中造出 claimedAt 为 NULL 的 IN_DOUBT 记录**；所以不声称该异常的真实数据库端到端注入回归已通过。生产报警通知、人工签名渠道回查、恢复/备份、真实商户资金 UAT、浏览器 E2E 和法律审批仍未验收。

只提交本次扫描规则、CLI、测试与增量证据；既有其他 Agent 的 `handoff.md`、`requirement-matrix.md`、`risk-register.md`、`release-checklist.md`、财务审计及缓存文件均不得混提交。
