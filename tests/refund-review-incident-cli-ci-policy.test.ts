import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const workflow=new URL("../.github/workflows/b04-refund-review-incident-cli-drill.yml",import.meta.url);
const script=new URL("../scripts/ci-refund-review-incident-cli-drill.ts",import.meta.url);

test("B04 isolated signed-refund review scanner runs only on disposable GitHub MySQL8",()=>{
 const yml=readFileSync(fileURLToPath(workflow),"utf8");
 assert.match(yml,/mysql:8\.0/);
 assert.match(yml,/MYSQL_DATABASE: jobs_mvp_migrate_20261124_b04ci/);
 assert.match(yml,/INTEGRATION_TEST_DATABASE: "true"/);
 assert.match(yml,/ENABLE_REAL_PAYMENT: "false"/);
 assert.match(yml,/ENABLE_REFUND_SEND: "false"/);
 assert.match(yml,/ENABLE_LIVE_AI: "false"/);
 assert.match(yml,/ci-refund-review-incident-cli-drill\.ts/);
 assert.doesNotMatch(yml,/schedule:|workflow_dispatch:|production:/);
});
test("B04 positive CLI drill cannot run against original jobs or production",()=>{
 const src=readFileSync(fileURLToPath(script),"utf8");
 assert.match(src,/process\.env\.CI!=="true"/);
 assert.match(src,/jobs_mvp_migrate_20261124_b04ci/);
 assert.match(src,/OPS_REFUND_LEDGER_SYNC_APPROVED:allowed\?"true":"false"/);
 assert.match(src,/MANUAL_LEDGER_REVIEW/);
 assert.match(src,/ACKNOWLEDGED/);
 assert.match(src,/RESOLVED/);
 assert.doesNotMatch(src,/\bfetch\s*\(/);
 assert.doesNotMatch(src,/ENABLE_REAL_PAYMENT="true"/);
});
