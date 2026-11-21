# B04/U03 通知失败回退与重试终止（第十二迁移）— 2026-11-21

状态：**本地单元/独立 TypeScript VERIFIED；Prisma validate 与 Next build 在工作区工具时限内未完成，必须经全新 CI 确认。** B04/U03 仍 IN_PROGRESS、整体 NOT READY。

## 现场恢复
- 已确认上一轮 `517d50c` GitHub Actions run [44890089304](https://github.com/MrRobt/job-board-next/actions/runs/44890089304) SUCCESS，原第十一迁移租约和只读 preflight 已通过；不重复开发。
- 读 AGENTS、long-running-goal、current-task、handoff、requirement-matrix、test-evidence、release-checklist、risk-register、真实 Git；工作树中其他 Agent 的 handoff/矩阵/发布清单/风险、财务审计、next-env、package-lock 等均未纳入本包。

## 改动
- 第十二迁移 `20261121000400_ops_notification_failure_disposition`：扩展 QUEUED/CLAIMED 为 RETRY_WAIT/DEAD，增加 `nextAttemptAt` 和仅允许短枚举式的 `failureCode`，添加查询索引。无通知外发、无商户/用户/财务表变化。
- `failOpsNotificationClaim` + Prisma Serializable CAS 适配：任务当前必须 CLAIMED、同一 UUID fencing token、租约尚未到期且尝试数 1–5；成功则清除 token/租约，以指数退避形成 RETRY_WAIT，五次尝试后 DEAD。重复失败、旧 token、过期租约拒绝修改，失败码限定短大写机器标识，不保存敏感错误原文。
- `claimOpsNotificationIntent` 更新：RETRY_WAIT 的 nextAttemptAt 未到返回 DEFERRED；到点才允许再次 CAS 领取；DEAD 始终 EXHAUSTED。领取时清掉旧重试时间与失败码。沿用 OPEN 当前轮次的事故核验。
- 新增 `tests/ops-notification-failure.test.ts`，覆盖退避、状态清理、第五次终止、旧令牌与过期、非法失败码、定点延期重领。扩展既有 `tests/integration/ops-notification-queue-mysql.test.ts`，全新 MySQL 内真实验证 CLAIМED→RETRY_WAIT、重复失败拒绝、提前领取 DEFERRED、到点再领并递增次数、事故关闭后拒绝处理；只清理测试独有数据。

## 已得到的验证和阻断
- `npm test` exit 0，独立 `tsc --noEmit` exit 0。
- `prisma validate` 本地工作区命令超时，无法宣称通过；`next build` 编译与 TypeScript 阶段完成，但收集页面数据时工具超时，**不记全量 build PASS**。不可终止其他 Agent 进程或强制删除工作区缓存。
- 第十二迁移/新 Prisma Client/真 MySQL 入队重试**只有 GitHub Actions 全新隔离库运行结果才可记为 VERIFIED**；现已核验提交 `6e51099` GitHub Actions [run 44891465518](https://github.com/MrRobt/job-board-next/actions/runs/44891465518) 最终 **SUCCESS**：全新 MySQL8 第十二迁移成功及重复 deploy，142/142 单元、35/35 集成、0 FAIL/0 SKIP，扩展的真实 MySQL 任务用例验证失败 RETRY_WAIT、旧 token 拒绝、提前 DEFERRED、到点再次 CLAIMED、事故解决拒领。Prisma generate/typecheck、Next build、HTTP smoke 均成功；本地 validate/build 工具超时事实仍保留。没有开启真实发送、自动 Worker、商户或模型。
- 仍待实际 sender/回执/接收人授权、故障 dead-letter 人工处置、自动调度、预发布备份恢复和完整管理员/支付/退款/AI E2E。
