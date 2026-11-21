import {test} from "node:test";
import assert from "node:assert/strict";
import {
 approvedOpsIncidentSyncEnvironment,runIsolatedOpsIncidentScan
} from "../lib/career/ops-incident-scan-coordinator";
import {createPrismaOpsIncidentCountReader} from "../lib/career/ops-incident-count-prisma-reader";
import type {OpsIncidentSyncStore} from "../lib/career/ops-incident-sync-service";

const approved={
 OPS_ALERT_READ_ONLY_APPROVED:"true",OPS_INCIDENT_SYNC_APPROVED:"true",
 INTEGRATION_TEST_DATABASE:"true",NODE_ENV:"test",
 DATABASE_URL:"mysql://root:example@127.0.0.1:3306/jobs_mvp_migrate_20261118_8f72"
};
const when=new Date("2026-11-21T16:00:00.000Z");
function storeFixture(){
 let calls=0;
 const store:OpsIncidentSyncStore={transaction:async fn=>{
  calls++;
  return fn({
   read:async()=>null,create:async()=>{},compareAndUpdate:async()=>1,append:async()=>{}
  });
 }};
 return {store,calls:()=>calls};
}
test("incident state write approval is distinct from read permission and fails closed",async()=>{
 for(const env of [
  {},{...approved,OPS_INCIDENT_SYNC_APPROVED:undefined},
  {...approved,OPS_INCIDENT_SYNC_APPROVED:"TRUE"},
  {...approved,OPS_ALERT_READ_ONLY_APPROVED:"false"},
  {...approved,INTEGRATION_TEST_DATABASE:"false"},
  {...approved,NODE_ENV:"production"},
  {...approved,DATABASE_URL:"mysql://root:example@127.0.0.1:3306/jobs"},
  {...approved,DATABASE_URL:"mysql://root:example@remote:3306/jobs_mvp_migrate_20261118_8f72"}
 ]){
  assert.equal(approvedOpsIncidentSyncEnvironment(env),false);
  const f=storeFixture();let reads=0;
  await assert.rejects(runIsolatedOpsIncidentScan(env,{
   readCompleteCounts:async()=>{reads++;return {staleReservations:0,uncertainRefunds:0,agedReadyRefunds:0};}
  },f.store,when),/refused/);
  assert.equal(reads,0);
  assert.equal(f.calls(),0);
 }
 assert.equal(approvedOpsIncidentSyncEnvironment(approved),true);
});
test("partial or failed observation cannot resolve any incident or begin write transaction",async()=>{
 for(const readCompleteCounts of [
  async()=>{throw Error("DB scanner timeout");},
  async()=>({staleReservations:0,uncertainRefunds:0} as never),
  async()=>({staleReservations:0,uncertainRefunds:0,agedReadyRefunds:NaN}),
  async()=>({staleReservations:0,uncertainRefunds:0,agedReadyRefunds:-1})
 ]){
  const f=storeFixture();
  await assert.rejects(runIsolatedOpsIncidentScan(approved,{readCompleteCounts},f.store,when));
  assert.equal(f.calls(),0);
 }
});
test("complete approved scan uses one write transaction; invalid clock refuses IO",async()=>{
 const f=storeFixture();let reads=0;
 const reader={readCompleteCounts:async()=>{reads++;return {staleReservations:2,uncertainRefunds:0,agedReadyRefunds:0};}};
 const result=await runIsolatedOpsIncidentScan(approved,reader,f.store,when);
 assert.equal(reads,1);assert.equal(f.calls(),1);
 assert.deepEqual(result.map(x=>x.state),["OPEN","ABSENT","ABSENT"]);
 await assert.rejects(runIsolatedOpsIncidentScan(approved,reader,f.store,new Date("invalid")));
 assert.equal(reads,1);
});
test("Prisma reader uses RepeatableRead one transaction and rejects middle-count failure",async()=>{
 const seen:string[]=[];let transactionCount=0;
 const make=(fail=false)=>createPrismaOpsIncidentCountReader({
  $transaction:async (fn,opts)=>{
   transactionCount++;assert.equal(opts.isolationLevel,"RepeatableRead");
   return fn({
    toolRun:{count:async args=>{seen.push("stale");assert.deepEqual((args.where as {status:string}).status,"RESERVED");return 2;}},
    toolRefundDispatch:{count:async args=>{
     if("OR" in (args.where as object)){seen.push("uncertain");if(fail)throw Error("DB down");return 3;}
     seen.push("aged");return 4;
    }}
   });
  }
 });
 assert.deepEqual(await make().readCompleteCounts(when),{
  staleReservations:2,uncertainRefunds:3,agedReadyRefunds:4
 });
 assert.deepEqual(seen,["stale","uncertain","aged"]);
 await assert.rejects(make(true).readCompleteCounts(when),/DB down/);
 assert.equal(transactionCount,2);
});
