import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {test} from "node:test";
import assert from "node:assert/strict";

test("B07 synthetic nonempty restore CI uses two disposable databases and closes financial switches",()=>{
  const path=fileURLToPath(new URL("../.github/workflows/b07-disposable-restore.yml",import.meta.url));
  const yaml=readFileSync(path,"utf8");
  assert.match(yaml,/MYSQL_DATABASE:\s*jobs_mvp_migrate_[0-9]{8}_restore_src/);
  assert.match(yaml,/jobs_mvp_migrate_[0-9]{8}_restore_dst/);
  assert.match(yaml,/INTEGRATION_TEST_DATABASE:\s*"true"/);
  assert.match(yaml,/DJS_B07_RESTORE_APPROVED:\s*"DISPOSABLE_ONLY"/);
  for(const flag of [
    "ENABLE_REAL_PAYMENT","ENABLE_MOCK_PAYMENT","ENABLE_LIVE_AI","ENABLE_TOOL_PAYMENTS",
    "ENABLE_REFUND_QUERY","ENABLE_REFUND_SEND","ENABLE_REFUND_DISPATCH_CLAIM","ENABLE_PAYMENT_RECONCILIATION"
  ])assert.match(yaml,new RegExp(flag+':\\s*"false"'),flag);
  assert.match(yaml,/npx prisma migrate deploy/);
  assert.match(yaml,/scripts\/b07-disposable-restore\.sh/);
  assert.doesNotMatch(yaml,/--force-reset|--accept-data-loss|prisma db push|production\.env/i);
});

test("B07 recovery exercise refuses undeclared targets or missing approval",()=>{
  const path=fileURLToPath(new URL("../scripts/b07-disposable-restore.sh",import.meta.url));
  const sh=readFileSync(path,"utf8");
  assert.match(sh,/DJS_B07_RESTORE_APPROVED/);
  assert.match(sh,/DISPOSABLE_ONLY/);
  assert.match(sh,/INTEGRATION_TEST_DATABASE/);
  assert.match(sh,/NODE_ENV/);
  assert.match(sh,/jobs_mvp_migrate_20261123_restore_src/);
  assert.match(sh,/jobs_mvp_migrate_20261123_restore_dst/);
  assert.match(sh,/mysqldump/);
  assert.match(sh,/sha256sum/);
  assert.match(sh,/trap .*EXIT/);
  assert.doesNotMatch(sh,/DROP DATABASE|--force-reset|--accept-data-loss/);
});
