# 2026-11-20 B06 退款账务只读预检工作包

## 实现范围

- `lib/career/refund-preflight-db.ts`：管理员身份验证，在 MySQL REPEATABLE READ 只读逻辑下加载服务端订单、权益、调用记录、退款历史，调用现有纯规则 `assessRefundSnapshot`。历史记录超过上限时直接拒绝给出可能不完整的判断。
- `app/admin/refunds/[id]/page.tsx`：登录管理员可查看退款相关的支付状态、次数包余额、RESERVED/SUCCEEDED/FAILED 统计及风险提示；只读，不显示任何自动退款操作。
- `app/admin/tool-orders/page.tsx`：待处理退款工单旁新增详情入口。
- `tests/integration/refund-preflight-db.test.ts`：测试非管理员拒绝、无冻结/无工单、在途与已使用次数、账本一致及只读行为。

## 本机测试证据

- 专用 MySQL `job-board-next-db-1` 已恢复，`jobs_mvp_migrate_20261118_8f72` 迁移状态为三项 up-to-date。
- 新专项集成 1/1 PASS；全量集成 21/21 PASS；TypeScript `tsc --noEmit` PASS；Next.js 生产 build exit 0。
- 独立的退款申请子包此前 1/1 PASS，全量集成首轮 19/20、复跑 20/20（并发测试可能存在非确定性，未隐瞒）。

## 限制与安全边界

以上仅为**只读建议**，不调用商户接口、不生成真实退款、不更改 `ToolOrder`、`ToolGrant` 或 `ToolRefundCase`。即使显示“可供人工复核”，也不代表自动可退、消费者权利判断或渠道已经退款。真正 B06 资金出款、幂等记账与最终撤权仍未完成，合法商户/合规人工门禁继续阻断生产。

## Git

新增代码和本证据必须与其它 Agent 未提交的 financial-risk-audit、工具缓存及 package-lock 分开提交。本次 Git 推送受到 SSH `Host key verification failed` 阻断；不得禁用 StrictHostKeyChecking 绕过安全。待独立核验 GitHub host key 并修复本机 SSH 配置后，重新非强制推送。
