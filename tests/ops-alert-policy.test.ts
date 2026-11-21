import {test} from "node:test";
import assert from "node:assert/strict";
import {approvedOpsScanEnvironment,assessOpsAlerts} from "../lib/career/ops-alert-policy";

test("operations alert policy returns only bounded aggregate signals",()=>{
  assert.deepEqual(assessOpsAlerts({staleReservations:0,uncertainRefunds:0,agedReadyRefunds:0}),{
    status:"PASS",counts:{staleReservations:0,uncertainRefunds:0,agedReadyRefunds:0},alerts:[]
  });
  assert.deepEqual(assessOpsAlerts({staleReservations:2,uncertainRefunds:1,agedReadyRefunds:3}).alerts,[
    "STALE_AI_RESERVATIONS","REFUND_IN_DOUBT","REFUND_READY_AGED"
  ]);
  for(const n of [-1,0.1,Infinity,NaN,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>assessOpsAlerts({staleReservations:n,uncertainRefunds:0,agedReadyRefunds:0}),/count/);
  }
});

test("scan requires explicit permission and a local disposable migration database",()=>{
  const safe={OPS_ALERT_READ_ONLY_APPROVED:"true",INTEGRATION_TEST_DATABASE:"true",
    NODE_ENV:"test",DATABASE_URL:"mysql://root:placeholder@127.0.0.1:3306/jobs_mvp_migrate_20261118_8f72"};
  assert.equal(approvedOpsScanEnvironment(safe),true);
  for(const overrides of [
    {OPS_ALERT_READ_ONLY_APPROVED:"false"},
    {INTEGRATION_TEST_DATABASE:"false"},
    {NODE_ENV:"production"},
    {DATABASE_URL:"mysql://root:placeholder@127.0.0.1:3306/jobs"},
    {DATABASE_URL:"mysql://root:placeholder@remote:3306/jobs_mvp_migrate_20261118_8f72"},
    {DATABASE_URL:"mysql://root:placeholder@127.0.0.1:3306/jobs_mvp_migrate_20261118_8f72?schema=public"},
    {DATABASE_URL:"not-a-url"}
  ])assert.equal(approvedOpsScanEnvironment({...safe,...overrides}),false);
});
