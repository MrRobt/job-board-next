# B07 一次性 MySQL8 非空数据备份恢复 CI 交接（2026-11-23）

## 边界与状态

- 子包：新增 **隔离的一次性 MySQL8 合成业务数据备份/恢复** CI 实验；**当前本机仅脚本/策略测试 GREEN，远端真正的 mysqldump → restore CI 尚待 run/job 回执确认**。不提前宣称整包 VERIFIED。
- 与已验收的只读 B07 预检不同，新演练固定使用两个全新 CI 专属库 `jobs_mvp_migrate_20261123_restore_src` 和 `jobs_mvp_migrate_20261123_restore_dst`；从源库迁移开始，写入伪造用户、模拟已付款订单、权益和 RESERVED 调用，再用 mysqldump 单事务导出、只向不存在的目标库恢复，检查四表行数与内容指纹和迁移计数；记录仅限 CI 的恢复秒数。
- shell 入口强制 `DJS_B07_RESTORE_APPROVED=DISPOSABLE_ONLY`、`INTEGRATION_TEST_DATABASE=true`、非 production、完整固定 `DATABASE_URL` 和固定目标库环境变量；缺失或变更立即 exit 2。目标库存在即拒绝覆盖，没有 DROP/reset、业务真实请求或外部传输。临时 SQL 由 EXIT trap 删除，不上传构件。
- `ENABLE_REAL_PAYMENT`、`ENABLE_MOCK_PAYMENT`、`ENABLE_LIVE_AI`、`ENABLE_TOOL_PAYMENTS` 和退款/对账写开关全部关闭。测试里的 MOCK/PAID 只是数据库里的**虚构夹具**，不代表商户验收或真实到账。

## 本地 RED / GREEN

- 新增 `tests/b07-disposable-restore-ci.test.ts`：初始缺 YAML/shell 先 RED（两项 ENOENT）；写入后首次缺目标库标记而 RED；增加明确目标库声明与守卫后两项全部 GREEN。
- `node --import tsx --test tests/b07-disposable-restore-ci.test.ts` exit 0，`bash -n scripts/b07-disposable-restore.sh` exit 0，全量 `npm test` exit 0；独立 `tsc --noEmit` 与 `npm run build` exit 0。
- 缺任何审批环境变量时直接调用 shell：exit 2（安全拒绝）。
- 没有对本机 MySQL 执行写操作；远端 Actions 运行未确认前不得声明备份恢复成功，也不得把 CI 合成数据恢复时长称为生产 RTO/RPO。

## 下一轮交接

1. 核验 `.github/workflows/b07-disposable-restore.yml` 的真实 GitHub Actions run/job，审阅 `B07_DISPOSABLE_NONEMPTY_RESTORE status=PASS` 以及出错日志；如失败先修复真实错误，再记回执。
2. 即使实验成功，只能标记 *disposable synthetic restore 子包 VERIFIED*。真实授权的预发布**非空数据备份恢复、RPO/RTO、生产迁移、回滚演练**仍未通过，B07 `IN_PROGRESS`，技术上线 `NOT READY`。
3. 延续精确 stage、分批正常 push；其他 Agent 修改过的 `handoff.md`、矩阵/发布/风险、财务审计等不混入本包。
