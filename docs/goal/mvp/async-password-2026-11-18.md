# P0 认证密码散列非阻塞改造（2026-11-18）

## 问题和实施

原 `lib/password.ts` 使用 `scryptSync` 进行密码散列和验证。认证请求多时会在 Node.js 事件循环中进行高成本同步计算，阻塞同进程其他 API/页面响应。

本包改为 Node.js 异步 `scrypt`（通过 `promisify`），把 KDF 放入 libuv worker pool：

- **不改变旧数据库哈希格式和算法参数**：仍是随机 16 字节 salt（32 位小写十六进制）+ `:` + 64 字节 scrypt 派生密钥（128 位十六进制），用户不需迁移或重设已有密码。
- 使用 `timingSafeEqual` 比较等长摘要；拒绝格式错误的数据库哈希，拒绝新建不满足 12–128 字符的密码。
- `app/actions/auth.ts` 的登录验证与注册散列使用 `await`；`prisma/seed.ts` 初始化管理员的密码散列也使用 `await`，不会保存 Promise 对象。
- 只修改已提交的认证和 seed 文件，不变更 `prisma/schema.prisma`、账户/退款页面、商户数据或支付开关。

## 自动化测试

- `tests/password.test.ts` 新增 3 项：两个随机 salt 不同但都能验证、从**旧版同步 scrypt** 构造的既有哈希能被新版验证、6 个同时进行的散列/验证返回正确结果及无效输入拒绝。
- 新增密码测试：**3/3 PASS**。
- 全量单元：**32/32 PASS**；全部隔离 MySQL 集成：**17/17 PASS**。
- TypeScript `tsc --noEmit`：exit 0；Next.js 16.4.6 生产 build：exit 0。
- 在 `job-board-next-db-1` 专用隔离测试库运行，没有访问其他项目数据库。

## 风险边界与后续

- 事件循环非阻塞不意味着可以无限承受密码尝试：scrypt 会竞争 Node worker pool，必须同时配合受控代理 IP/账号限流、连接池、负载与可观测性测试。
- 当前没有新增邮件验证、密码找回、管理员 MFA、会话撤销或真实代理 UAT；也没有完整浏览器注册/登录 E2E。
- `U01` 仍 `IN_PROGRESS`，且真实支付/退款、合规模型、部署及外部资质均保留原门禁。不得因本包通过而宣称已达上线就绪。
