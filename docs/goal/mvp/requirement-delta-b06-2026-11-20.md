# 2026-11-20 B06 需求矩阵增量（等待所有者合并）

本轮因 `docs/goal/mvp/requirement-matrix.md`、`risk-register.md` 与 `release-checklist.md` 存在其他 Agent 未提交的独立修改，不覆盖、不混提交。在下一次由文件所有者处理时，请按以下客观证据合并：

| ID | 状态 | 本轮新增的可验证证据 | 尚缺 |
|---|---|---|---|
| B06 退款与剩余权益撤销及审计 | IN_PROGRESS | `ToolRefundIntent` PREPARED、唯一 `caseId/orderId/outRefundNo`、可重试不变的请求指纹、管理员审核、冻结/账本风险拒绝、专项 1/1 + MySQL 22/22、迁移 4/4 up to date | 真实商户出款/验签查询、持久分发/最终结果、退款额与用户已消费争议、原子撤权/售后对账、真实 UAT |
| B07 数据库迁移与恢复 | IN_PROGRESS | 隔离 MySQL 第 4 个增量迁移成功 + 重复 deploy 无 pending | 生产旧库基线、非空数据备份/恢复、权限、回滚和预发布演练 |
| D02 预发布部署与安全 | IN_PROGRESS | TS/build 本轮通过、管理员入口编译成功 | CI 本轮提交验证、浏览器全链路、负载/监控/备份、HTTPS |

人工门禁仍 BLOCKED：经营主体与适用备案/资质、商户审核、真实交易与退款 UAT、个人信息及模型服务数据处理批准。默认 `ENABLE_REAL_PAYMENT` 和 `ENABLE_LIVE_AI` 都必须保持关闭。

本文件仅记录本轮可验证增量，不将未完成的 B06/B07/D02 标为 VERIFIED。
