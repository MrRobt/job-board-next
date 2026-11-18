# D02/B07 P0 GitHub Actions 真正远端 CI 证据（2026-11-18）

## 查验方式与工作区

使用已授权的 GitHub repository connector 直接读取 `MrRobt/job-board-next` 的 Actions workflow run 集合和指定 run 的 job steps；不是仅靠 Commit Combined Status 空列表推测。所有内容均为 GitHub 远端实际 run 信息，不是本地 mock。

- 目标库：`MrRobt/job-board-next`
- 分支：`main`；触发事件：`push`
- 完整提交 SHA：`27824d936e85754596ab25733de92526dc351c57`
- workflow：`CI`
- run ID：`44225639694`；Job `validate` ID：`134538015677`
- [该次 GitHub Actions 运行](https://github.com/MrRobt/job-board-next/actions/runs/44225639694)
- 启动时间：2026-11-18T02:46:03Z；更新：2026-11-18T02:47:27Z
- **run status = completed，conclusion = success**；`validate` job = completed / success。

## 实际验证的步骤（run steps 中全部 success）

1. checkout / setup Node 22 / `npm install --no-audit --no-fund`。
2. `npx prisma validate`。
3. **Deploy migrations to fresh MySQL**。
4. **Check migration status**。
5. **Confirm migrate deploy is repeatable**（重复 `migrate deploy` + `migrate status`）。
6. `npx tsx prisma/seed.ts`。
7. `npm run typecheck`。
8. `npm test`。
9. `npm run test:integration`。
10. `npm run build`。
11. **Smoke test**（匿名主页、价格、登录、管理员重定向、授权页拦截和旧购买 404 等由 workflow 当前脚本检查）。

此前一次 `0270b41255d35631185d9faabf6bd61c88e563e0` 的 push run `44225197207` 同样 completed/success，证实上述新增 B06 只读桥接代码也已包含在通过的远端版本中。

## 未解除的门禁

- GitHub checkout 仅包含当时已经提交的文件。工作树当前还存在其他 Agent **未提交**的 `prisma/schema.prisma`、`prisma/migrations/20261117000300_refund_cases`、`lib/career/refund-cases.ts` 等，**远端 CI 并未验证这些工作树变更**。不能把 CI success 当作退款 DB schema 完整交付。
- CI 使用 `npm install` 而非锁定依赖的 `npm ci`，因为 `package-lock.json` 属于其他 Agent 未提交文件。依赖可复现性需要其所有权人完成审查/提交后再收口。
- CI green 只证明仓库当前已有测试、构建和 smoke；没有真实商户渠道、资金退款、AI 服务/隐私审批、浏览器完整 E2E、生产部署、加密备份和跨实例恢复。必须保留原有人工与技术上线门禁。
- 需求矩阵、release checklist、risk register 当前属于其他 Agent 未提交工作；本轮不修改/混提交，阶段性真实证据优先记录于 `current-task`/`handoff`/`test-evidence`。

**结论：远端 CI 的 P0 基础门禁可确认为当前提交版本通过，但 D02/B07 整体仍 IN_PROGRESS，正式上线仍 NOT READY。**
