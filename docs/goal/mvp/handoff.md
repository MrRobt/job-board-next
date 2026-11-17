# 工作交接（2026-11-17）

- 工作区：`F:\code\job-board-next`；`main`。每轮重新核对真实 Git 与正在运行的服务。
- Windows/MSYS2 Bash：Node `D:\nvm4w\nodejs\node.exe`；项目路径 `/f/code/job-board-next`。npm 可能不在 Bash PATH，可直接调用 Node + 本地 CLI 入口。
- 独立开发 MySQL：Docker `job-board-next-db-1`、localhost:3306、库 `jobs`。不要使用或修改其他项目的 `djs-mysql-uat`。
- 现已创建 `docs/goal/mvp` 正式恢复文件；之前 `.ai-bridge` 无交接。
- 已交付：>10 分钟 RESERVED 可在管理员工具订单页查询；管理员确认实际未交付后调用 `confirmCreditRefund`，核查依据及操作者写 `ToolRunAdjustment`，事务内返还一次；重复、未授权、过早返还均拒绝。
- 本轮仅开发库执行 `prisma db push`，**不是生产迁移**。新增 `ToolRunAdjustment` 表；已生成基线迁移 SQL 文件，但在临时独立 MySQL 容器上执行 migrate deploy 时被安全检查拦截，未验证实际迁移；临时容器 `job-board-next-migration-smoke` 已停止且 --rm 自动删除。该迁移当前只是候选版本，不得直接用于已有非空数据库；现有开发数据库未被迁移重放。
- Windows 当前生产 `next start` 可能占用 Prisma query_engine DLL，需先精确识别并仅停止本项目 3000 端口对应的 Next 进程、重新 Prisma generate、再恢复本地服务；勿终止其它 node/Docker/Agent 进程。本轮已完成该操作并复测 HTTP 200。
- 验证：Prisma validate exit 0、TypeScript exit 0、单元 8/8、集成 3/3、Next build exit 0，详情见 test-evidence。
- 真实 AI、真实商户支付仍默认关闭，没有相关合规/商户联调证据；继续 P0 渠道查单、关闭、对账、退款和上线门禁。
- 不可混提交 `next-env.d.ts`、`package-lock.json`、`.dsh-meow/`；`lib/jobs.ts` 上轮类型修复已独立提交（`f734138`），避免远端 CI 遗漏修复。
