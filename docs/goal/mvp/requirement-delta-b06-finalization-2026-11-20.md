# B06/B07/D02 需求矩阵增量（2026-11-20）

主 `requirement-matrix.md`、`risk-register.md`、`release-checklist.md` 已有其他 Agent 未提交的更改，为防混提交，本轮单独记增量证据，不覆盖原文件。

| ID | 状态 | 本轮实际证据 | 剩余门禁 |
|---|---|---|---|
| B06 | IN_PROGRESS | IN_DOUBT 退款验签查单接入内部账务；匹配渠道 SUCCEEDED 后同一 SERIALIZABLE 事务处理订单/工单/派发状态及 `ToolGrant.remaining=0`；UNKNOWN/FAILED/PROCESSING 保持冻结，审计不可重放；专项 1/1、隔离 MySQL 全量 25/25 | **真实商户退款发送、实际渠道签名查询/实付退款验证、金额与争议处理、生产压测与合规** |
| B07 | IN_PROGRESS | 第 8 条增量迁移在隔离 MySQL 首次和重复部署验证成功 | 正常开发库/已有生产库迁移、非空数据备份恢复与回滚 UAT |
| D02 | IN_PROGRESS | TypeScript、38/38 单元、25/25 串行文件集成、Next.js 构建通过 | 本轮 GitHub CI 实际运行、完整登录浏览器 E2E、生产 HTTPS/监控/告警/应急恢复 |

外部合法经营资质、真实模型个人信息处理、商户审核和真实资金操作授权属于人工门禁，均不可由这些离线测试认定 VERIFIED。
