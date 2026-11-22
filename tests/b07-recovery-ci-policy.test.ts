import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import assert from "node:assert/strict";

test("B07 CI preflight uses isolated MySQL, explicit read-only approval and disabled business switches",()=>{
 const workflow=fileURLToPath(new URL("../.github/workflows/b07-recovery-readonly.yml",import.meta.url));
 const yaml=readFileSync(workflow,"utf8");
 assert.match(yaml,/MYSQL_DATABASE:\s*jobs_mvp_migrate_[0-9]{8}_[a-z0-9]+/);
 assert.match(yaml,/DATABASE_URL:.*\/jobs_mvp_migrate_[0-9]{8}_[a-z0-9]+/);
 assert.match(yaml,/INTEGRATION_TEST_DATABASE:\s*"true"/);
 assert.match(yaml,/DJS_RECOVERY_PREFLIGHT_APPROVED:\s*"READ_ONLY"/);
 assert.match(yaml,/npx prisma migrate deploy/);
 assert.match(yaml,/node scripts\/b07-recovery-preflight\.mjs/);
 for(const flag of [
  "ENABLE_REAL_PAYMENT","ENABLE_MOCK_PAYMENT","ENABLE_LIVE_AI",
  "ENABLE_TOOL_PAYMENTS","ENABLE_REFUND_QUERY","ENABLE_REFUND_SEND",
  "ENABLE_REFUND_DISPATCH_CLAIM","ENABLE_PAYMENT_RECONCILIATION"
 ]){
  assert.match(yaml,new RegExp(flag+':\\s*"false"'),flag);
 }
 assert.doesNotMatch(yaml,/--force-reset|--accept-data-loss|prisma db push|DROP DATABASE/i);
});
