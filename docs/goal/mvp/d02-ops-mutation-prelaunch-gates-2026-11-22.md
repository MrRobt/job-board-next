# D02 预上线运营写入开关门禁补全（2026-11-22）

## 恢复点与范围

按 `AGENTS.md` 和 `docs/goal/mvp/long-running-goal.md` 恢复 `current-task`、`handoff`、矩阵、测试证据与真实 Git 状态。`main` 与本地跟踪的 `origin/main` 同步；上轮 B06 两项代码已在历史提交中，未重复开发。本轮选择不依赖商户、模型或生产数据库的 D02 P0 预上线安全检查缺口。

现有 `scripts/prelaunch-env-guard.mjs` 已默认拦截真实支付、模拟支付、真实 AI 和退款操作，却遗漏了三个已存在且会改变运营事故状态的开关：

- `ENABLE_OPS_INCIDENT_ACK` — 管理员确认运营事故
- `ENABLE_OPS_DEAD_REVIEW_WRITE` — 管理员死信通知复核写入
- `OPS_INCIDENT_SYNC_APPROVED` — 事故计数同步写入

它们并非支付或通知外部发送，但应在技术预览阶段显式保持禁用。仅修补预上线检查，不修改实际事故授权逻辑，不改变生产开关的当前值。

## 变更与 RED/GREEN

- `tests/prelaunch-env-guard.test.ts` 新增固定三项名单回归，分别对 `LOCAL_PREVIEW`、`PUBLIC_PRELAUNCH` 测试 `true` 必须 `BLOCKED`，显式 `false` 可继续；还要求名单实际存在于 `offFlags`，避免遍历空缺导致假绿。
- 初次 RED：定向测试报告 `Untracked prelaunch gate: ENABLE_OPS_INCIDENT_ACK`（exit 1）。单独用 `npm exec` 调用时 CLI 子进程因执行器默认 cwd 偏离项目目录而多出一项路径错误；真实回归以正确项目工作目录的 `npm --prefix ... test` 为准。
- `scripts/prelaunch-env-guard.mjs` 将三个状态写入开关加入 `offFlags`。沿用现有 fail-closed 规则（未设置/空/明确 false 才允许），不输出环境变量值。
- 完整 `npm --prefix F:/code/job-board-next test` **exit 0**。
- 独立 `node F:/code/job-board-next/node_modules/typescript/bin/tsc --noEmit --project F:/code/job-board-next/tsconfig.json` **exit 0**。
- `npm --prefix F:/code/job-board-next run build` **exit 0**，Prisma Client 生成及 Next.js 16.4.6 生产构建完成。

## 仍未验收

本轮只是纯配置预检，未执行完整 MySQL 集成、生产反向代理/HTTPS、备份恢复、真实浏览器全业务 E2E、真实渠道支付/退款或模型隐私 UAT。D02 整体仍 `IN_PROGRESS` / 技术上线 `NOT READY`；L01/L02 的资质、商户和合规审批继续 `BLOCKED`，不得自动开启实际收费与模型服务。

## Git 与交接

本轮仅提交 `scripts/prelaunch-env-guard.mjs`、`tests/prelaunch-env-guard.test.ts`、本文件与 `current-task.md`、`test-evidence.md` 两处增量检查点。其他 Agent 已有未提交的共享 `handoff.md`、`requirement-matrix.md`、`release-checklist.md`、`risk-register.md`、financial-risk-audit 源码与证据、`next-env.d.ts`、lockfile 和缓存均不得覆盖/混提交。下轮先重新检查真实 Git / CI 与 P0 剩余缺口，再推进不依赖商户审批的 B04、B07、U01 和 D02；禁止 reset/clean、强推。
