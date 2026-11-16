# 职讯集 · job-board-next

轻量招聘信息聚合平台。Next.js App Router + TypeScript + Prisma + MySQL 8。
当前目标：公开招聘列表、付费详情、后台发布、用户订单和支付渠道。

## 本地启动
需要 Node.js 22 LTS、npm、Docker（或 MySQL 8）。
1. 复制 .env.example 为 .env，设置管理员邮箱及强密码。
2. docker compose up -d db
3. npm install
4. npm run db:push
5. npm run db:seed
6. npm run dev
访问 http://localhost:3000；后台 /admin。

开发环境使用模拟支付（显式开启）。正式环境必须关闭模拟支付，完成商户配置、支付验签、退款与合规审查后才能开放付费服务。禁止将 .env 或私钥提交到 GitHub。

查看 docs/PRD.md 与 docs/STATUS.md。
