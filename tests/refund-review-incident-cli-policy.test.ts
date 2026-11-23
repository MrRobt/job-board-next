import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {readFileSync} from "node:fs";

const target=fileURLToPath(new URL("../scripts/refund-review-incident-scan.ts",import.meta.url));
test("B04 refund review scanner denies every unauthorised environment before DB access",()=>{
 const fixture={OPS_ALERT_READ_ONLY_APPROVED:"true",OPS_INCIDENT_SYNC_APPROVED:"true",
  OPS_REFUND_LEDGER_SYNC_APPROVED:"true",INTEGRATION_TEST_DATABASE:"true",NODE_ENV:"test",
  DATABASE_URL:"mysql://fake_secret@127.0.0.1:3306/jobs_mvp_migrate_20261124_ci"} as const;
 for(const overrides of [{OPS_REFUND_LEDGER_SYNC_APPROVED:"false"},{NODE_ENV:"production"},
  {DATABASE_URL:"mysql://fake_secret@127.0.0.1:3306/jobs"}] as const){
  const run=spawnSync(process.execPath,["--import","tsx",target],{
   encoding:"utf8",timeout:15000,env:{...process.env,...fixture,...overrides}
  });
  assert.equal(run.status,3,run.stderr);
  assert.equal(run.stdout.trim(),"");
  assert.match(run.stderr,/refused/);
  assert.ok(!run.stderr.includes("fake_secret"),"No credentials in diagnostic output");
 }
});
test("B04 manual scanner has no live scheduler, refund sender or network dispatch",()=>{
 const src=readFileSync(target,"utf8");
 assert.match(src,/approvedRefundReviewIncidentSyncEnvironment\(process\.env\)/);
 assert.match(src,/runIsolatedRefundReviewIncidentScan\(/);
 assert.doesNotMatch(src,/\bfetch\s*\(/);
 assert.doesNotMatch(src,/setInterval|setTimeout|node-cron/);
 assert.doesNotMatch(src,/\.tool(?:Grant|Order|RefundDispatch)\.(?:update|create|delete)/);
});
