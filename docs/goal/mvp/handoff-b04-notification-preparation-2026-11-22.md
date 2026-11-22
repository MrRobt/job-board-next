# B04/U03 发送前只读准备交接（2026-11-22）

新增 `prepareOpsNotificationHandoff(store, request)` 和受限 Prisma 只读 adapter。调用需显式 enabled/operatorApproved、严格 HTTPS 精确目的地 allowlist、通知 SHA256 key/UUID claim token/当前时间；拒绝过期租约、非 CLAIMED、旧 token、失效事故轮次与异常存储行。返回 `PREPARED` 时仅包含经服务器端记录验证的脱敏 envelope 与已批准的 origin，**不代表可以发送网络请求**。

专项单元 5/5、全量单元 exit 0、tsc exit 0、生产 build exit 0；本次不改迁移、不调用 DB 真库和外部服务。证据：`b04-notification-preparation-2026-11-22.md`。下一步：受控 sender/供应商幂等和回执协议，先确定 crash-after-provider-accept 的不确定结果恢复设计，然后开展新 MySQL 和受控模拟发送器验收，真实通知保持关闭。

共享 `current-task.md` 在本轮读取后被并行 Agent 更新，SHA 乐观锁拒绝覆盖，故本包进度仅存于独立证据/需求增量/本交接，待后续安全合并；不改写对方的 B06 记录。

保留其他 Agent 脏文件与原有 docs；B04/U03 `IN_PROGRESS`，总体 `NOT READY`，外部审批继续人工门禁。
