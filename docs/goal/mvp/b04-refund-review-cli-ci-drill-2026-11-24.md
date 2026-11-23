# B04 退款人工核账事故 CLI · 一次性真实 MySQL8 CI 演练（2026-11-24）

## 目标与边界

- 延续已在 `c6d4525` 主 CI `45248128498` / job `137950245274` VERIFIED 的 B04 隔离事故状态机与手动扫描 CLI，证据提交 `dc3d0cd`。之前的 MySQL 集成是在测试进程直接调用带合成环境策略的服务，CLI 仅验证了**默认拒绝**；缺少真正匹配数据库身份条件的实际进程级准入验证。本包补这一条，**不重复开发事故状态机**。
- 新增 `.github/workflows/b04-refund-review-incident-cli-drill.yml`：仅 push/PR，在 GitHub 一次性 MySQL8 容器 `jobs_mvp_migrate_20261124_b04ci`（与本机 `jobs`、其他项目的 `djs-mysql-uat` 无关）中重新部署完整版本化迁移。测试账号/凭据只在临时 Actions 环境，真实支付、退款派发/查询、AI、模拟支付及工具收款开关全部 false；无定时调度、人工公网入口或真实通知。
- `scripts/ci-refund-review-incident-cli-drill.ts` 从执行前就强制 `CI=true`、`INTEGRATION_TEST_DATABASE=true`、非生产、固定本机地址/端口/数据库名、真实通道全部禁用；任何不符合都拒绝，不写测试数据。合成 ALIPAY 固定次数包、随机虚构用户、独立管理员退款审批及冻结权益，在 *注入式无网络商户模拟响应* 下只产生退款成功+余额冲突的持久审计，然后由子进程运行真正的 `scripts/refund-review-incident-scan.ts`：
  1. 无单独写入批准时拒绝并且不访问事故库；
  2. 空库批准扫描显示 ABSENT/0；
  3. 合成异常出现后 CLI 退出码 2、OPENED/OPEN/1；
  4. 重复运行不重复 OPENED；
  5. 通过真实 MySQL 管理员 CAS 审核接手后，CLI 显示 ACKNOWLEDGED；
  6. 先断言订单仍 PAID、权益余额未被扫描器改变、派发仍 IN_DOUBT；再让已批准的测试网关成功进行原子结算；
  7. 重新运行 CLI 显示 RESOLVED/0，历史 OPENED/ACKNOWLEDGED/RESOLVED 审计保持完整，重复运行不重开事故；
  8. 最终仅清理该一次性库的随机 synthetic 夹具，无外部网络或商户发款。
- 新 `tests/refund-review-incident-cli-ci-policy.test.ts` 先缺工作流/脚本 RED 2/2，补全后 2/2 GREEN，保证 workflow 仅临时 mysql:8.0、关闭外部通道、CI 脚本检查数据库名和 CI/生产门禁。

## 当前验收 / 交接

- 本地新 workflow/script 策略 2/2 PASS、`tsc` 中新脚本无类型诊断；全量 TypeScript 仍只有其他 Agent 未提交的 `lib/auth-retention.ts:83` TS2739；不修改、不暂存 `handoff.md`、`requirement-matrix.md`、其他财务扫描草稿及 lockfile。
- **此时尚无这条新工作流真正运行的 GitHub run/job；CLI 正向真实 MySQL 演练未 VERIFIED。** 提交正常 push 后必须核对新 Actions 运行结果中的 `B04_REFUND_REVIEW_CLI_MYSQL8 status=PASS`、实际 process exit/事件/财务无变更证据，并同时确认主 CI 与其它 P0 专项没有回归。失败只修复本包且分批推送。
- B04 整体仍 IN_PROGRESS：生产级定时触发、外部运营通知投递与回执、真实商户/合规人工授权尚未打通。技术上线 NOT READY，不允许用测试替代商户资金真账证据。
