import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {join} from "node:path";

const script=join(process.cwd(),"scripts","b07-recovery-preflight.mjs");
function run(env:Record<string,string|undefined>){
 return spawnSync(process.execPath,[script],{
  env:{...process.env,
   DJS_RECOVERY_PREFLIGHT_APPROVED:"READ_ONLY",
   INTEGRATION_TEST_DATABASE:"true",
   NODE_ENV:"test",
   ...env
  },encoding:"utf8",timeout:10_000
 });
}
test("B07 recovery preflight refuses non-disposable and off-host URLs without querying DB",()=>{
 for(const url of [
  "mysql://localhost:3306/jobs",
  "mysql://localhost:3306/jobs_mvp_restore_synthetic",
  "mysql://remote.example.invalid:3306/jobs_mvp_migrate_20261118_8f72",
  "mysql://localhost:13306/jobs_mvp_migrate_20261118_8f72",
  "mysql://localhost:3306/jobs_mvp_migrate_20261118_8f72?unsafe=1"
 ]){
  const result=run({DATABASE_URL:url});
  assert.equal(result.status,2,"must refuse "+url);
  assert.match(result.stderr,/read-only preflight refused/);
  assert.doesNotMatch(result.stdout,/migration|operationalSignals/i);
 }
});
test("B07 recovery preflight fails closed when approval or safe execution flag is absent",()=>{
 for(const env of [
  {DJS_RECOVERY_PREFLIGHT_APPROVED:""},
  {INTEGRATION_TEST_DATABASE:"false"},
  {NODE_ENV:"production"}
 ]){
  const result=run({DATABASE_URL:"mysql://localhost:3306/jobs_mvp_migrate_20261118_8f72",...env});
  assert.equal(result.status,2);
  assert.match(result.stderr,/refused/);
 }
});
