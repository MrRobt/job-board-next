# B04/B06 只读运维告警扫描 — 2026-11-21

状态：VERIFIED（仅本地隔离库与规则子包）；B04/B06、生产监控和正式上线整体仍 IN_PROGRESS。

## 目标与实现
- 新增 `lib/career/ops-alert-policy.ts`，对超时 AI 预留、退款 `IN_DOUBT` 和长期 `READY` 派发进行只读计数判定，数值无效时失败关闭。
- 新增 `scripts/ops-alert-scan.ts`，只读取三项 MySQL 聚合计数：RESERVED 超过 10 分钟、IN_DOUBT claimedAt 超过 15 分钟、READY 创建超过 30 分钟。无异常退出 0，有异常退出 2，未授权/查询失败退出 3。
- 强制 `OPS_ALERT_READ_ONLY_APPROVED=true`、`INTEGRATION_TEST_DATABASE=true`、非生产环境及专用本地 `jobs_mvp_migrate_*` 数据库白名单，默认拒绝运行。绝不将此测试脚本误作为生产部署的自动告警服务。
- 仅输出总体计数及异常类型；无邮箱、用户 ID、订单号、数据库凭据、简历正文。无资金发送、状态改变、自动释放或返还；需要管理员人工核查。

## 真实测试证据
- 新 `tests/ops-alert-policy.test.ts`：2/2 通过（正常/异常/非法计数及禁用/伪装库拒绝），全量单元 **71/71 PASS，exit 0**。
- 直接 TypeScript `tsc --noEmit` **exit 0**。
- 仅专用隔离库 `jobs_mvp_migrate_20261118_8f72`：完整 MySQL 文件串行集成 **31/31 PASS，exit 0**。
- Next.js 16.4.6 生产 build **exit 0**。
- 对上述隔离库显式开启只读审核执行 CLI：**exit 0**，`staleReservations=0`、`uncertainRefunds=0`、`agedReadyRefunds=0`；这只是测试库在扫描时的状态，不代表生产安全。
- 无批准环境运行 CLI：**exit 3** 且拒绝，不连接数据库。
- 最初尝试的 `node --import <Windows 路径>` 因 Node ESM Windows 路径不兼容 exit 1，改为项目 tsx CLI 后上述测试通过。

## 未完成 / 下一包
- 生产监控权限模型、真实告警投递（消息/邮件/值班路由）、告警确认/升级/去重、误报与故障演练；需要独立非测试版本和审批。
- 真实商户退款、生产迁移与恢复、浏览器 E2E、合规模型与行政审核仍 BLOCKED；本工具不改变这些门禁。
- 本轮仅精确提交独立源码、测试、证据和增量 current-task/test-evidence；保护其他 Agent 的共享 handoff、需求矩阵、上线清单、风险登记、财务审计及本机工具缓存。
