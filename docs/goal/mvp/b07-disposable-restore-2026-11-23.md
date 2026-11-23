# B07 一次性 MySQL8 非空数据备份恢复 CI 交接（2026-11-23）

## 边界与状态

- 子包：新增 **隔离的一次性 MySQL8 合成业务数据备份/恢复** CI 实验；**远端 CI 已实测 PASS，仅一次性合成非空数据库恢复子包 VERIFIED，B07 总体仍 IN_PROGRESS**。
- 与已验收的只读 B07 预检不同，新演练固定使用两个全新 CI 专属库 `jobs_mvp_migrate_20261123_restore_src` 和 `jobs_mvp_migrate_20261123_restore_dst`；从源库迁移开始，写入伪造用户、模拟已付款订单、权益和 RESERVED 调用，再用 mysqldump 单事务导出、只向不存在的目标库恢复，检查四表行数与内容指纹和迁移计数；记录仅限 CI 的恢复秒数。
- shell 入口强制 `DJS_B07_RESTORE_APPROVED=DISPOSABLE_ONLY`、`INTEGRATION_TEST_DATABASE=true`、非 production、完整固定 `DATABASE_URL` 和固定目标库环境变量；缺失或变更立即 exit 2。目标库存在即拒绝覆盖，没有 DROP/reset、业务真实请求或外部传输。临时 SQL 由 EXIT trap 删除，不上传构件。
- `ENABLE_REAL_PAYMENT`、`ENABLE_MOCK_PAYMENT`、`ENABLE_LIVE_AI`、`ENABLE_TOOL_PAYMENTS` 和退款/对账写开关全部关闭。测试里的 MOCK/PAID 只是数据库里的**虚构夹具**，不代表商户验收或真实到账。

## 本地 RED / GREEN

- 新增 `tests/b07-disposable-restore-ci.test.ts`：初始缺 YAML/shell 先 RED（两项 ENOENT）；写入后首次缺目标库标记而 RED；增加明确目标库声明与守卫后两项全部 GREEN。
- `node --import tsx --test tests/b07-disposable-restore-ci.test.ts` exit 0，`bash -n scripts/b07-disposable-restore.sh` exit 0，全量 `npm test` exit 0；独立 `tsc --noEmit` 与 `npm run build` exit 0。
- 缺任何审批环境变量时直接调用 shell：exit 2（安全拒绝）。
- 没有对本机 MySQL 执行写操作；远端一次性合成恢复虽成功，不得把 CI 恢复秒数称为生产 RTO/RPO。

## 远端真实 MySQL8 回执

- `3d406ce` GitHub Actions run `45122328697`、job `137518703938` 完成且均 SUCCESS；迁移和状态检查通过，随后真实执行 `mysqldump` 单事务备份及向独立新库恢复。
- 原始 job 日志：`B07_DISPOSABLE_NONEMPTY_RESTORE status=PASS fixtures=4 sourceDb=jobs_mvp_migrate_20261123_restore_src targetDb=jobs_mvp_migrate_20261123_restore_dst restoreSeconds=0`。四张业务表虚构夹具逐字段指纹及行数一致。
- 0 秒是该运行的整数秒计时精度，不表示零恢复开销，更不代表生产实际 RTO 或任何 RPO。**仅 synthetic disposable restore 子包 VERIFIED**。

## 下一轮交接

1. 独立恢复子包已验收，不要重复；下一步为经授权的隔离预发布**非空真实形态数据**备份恢复、回滚、故障演练与生产环境 RPO/RTO，须先有运维与安全门禁。
2. 即使实验成功，只能标记 *disposable synthetic restore 子包 VERIFIED*。真实授权的预发布**非空数据备份恢复、RPO/RTO、生产迁移、回滚演练**仍未通过，B07 `IN_PROGRESS`，技术上线 `NOT READY`。
3. 延续精确 stage、分批正常 push；其他 Agent 修改过的 `handoff.md`、矩阵/发布/风险、财务审计等不混入本包。
