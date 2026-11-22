# B04/U03 需求矩阵增量：实际 MySQL 发送准备验证

- 状态仍 `IN_PROGRESS`。为通知租约→只读候选准备新增真实 Prisma/MySQL 集成测试文件，针对单次任务身份和最新 OPEN 事故轮次及数量，覆盖 FENCED / DENIED / EXPIRED / STALE。
- 本地单元和类型通过；新增测试必须在新迁移的隔离库通过后，才可以把“真实 MySQL handoff 已验收”写入主矩阵。缺迁移在 CI 直接 FAIL。
- 不改变原有生产禁用、安全和人工审批边界；主矩阵正有并行未提交修改，保留原状。
