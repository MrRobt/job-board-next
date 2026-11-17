# P0 AI 提供方出站安全门禁（2026-11-18）

## 变更

- `lib/career/provider-safety.ts`：新增 `approvedModelBaseUrl`，必须同时明确配置 `AI_BASE_URL` 和服务器侧 `AI_APPROVED_BASE_URLS`（逗号分隔、精确匹配含路径）。只接受 HTTPS、规范公网 DNS 名称与默认端口；拒绝本地/内网域名后缀、IP 字面量、用户信息、查询参数、片段及非默认端口。
- `lib/career/provider.ts`：`liveAvailable()` 在已有 `ENABLE_LIVE_AI=true`、`AI_COMPLIANCE_APPROVED=true`、隐私说明 HTTPS、模型名称和服务端凭据等前提上，再要求 `AI_BASE_URL` 精确属于批准列表；所有非批准配置继续处于 DISABLED。
- `readBoundedModelResponse`：先检查 Content-Length，再用流式字节累计，超过 200,000 字节立即取消读取，避免 `response.text()` 先把超大响应全部读进内存；无正文或无效 UTF-8 会拒绝。

## 生产配置及警戒线

```text
ENABLE_LIVE_AI=false
AI_COMPLIANCE_APPROVED=false
AI_BASE_URL=https://api.example-provider.com/v1
AI_APPROVED_BASE_URLS=https://api.example-provider.com/v1
AI_PRIVACY_NOTICE_URL=https://www.example-provider.com/privacy
```

以上地址是**示例占位，非已审批的供应商**，不得复制示例后启用真实 AI。真实配置必须由获授权管理员审批供应商、DPA/数据跨境及隐私告知，并由部署端配置精确 URL 及 egress 防火墙规则。生产不要允许用户表单/查询参数修改批准列表。

**局限**：URL 规则拒绝 IP 字面量和常见非公开域名，不代表 DNS 解析后的地址一定公网；恶意 DNS、代理、DNS rebinding、云元数据地址和网络层绕过仍须由生产出口网络策略、可信解析以及基础设施安全验证防护。未实测真实 AI、没有模型质量与成本计量验收。

## 实际证据

工作树 `F:\code\job-board-next`，本轮没有向供应商发送内容或凭据：
- 新增纯测试 `tests/provider-safety.test.ts`：**3/3 PASS**（批准清单精确匹配、内网/IP/危险 URL 拒绝、流式响应大小限制）。
- 全量单元：**21/21 PASS**。
- 隔离 MySQL 集成：**13/13 PASS**。
- TypeScript：exit 0；Next.js 16.4.6 生产构建：exit 0。

## 后续

- A01/A02 仍 `IN_PROGRESS`：合规模型真实沙箱调用、内容脱敏评估、用户许可、Token/成本指标、质量与 Prompt Injection 对抗测试、生产出口 ACL 与 DNS 防护。
- 真实 AI 和支付开关保持默认关闭，外部供应商与法律合规审批继续人工门禁，不能据本子包宣称技术/商业上线就绪。
