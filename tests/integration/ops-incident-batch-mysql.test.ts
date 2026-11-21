import {test} from "node:test";
import {randomUUID} from "node:crypto";
import {acknowledgeOpsIncidentWithStore} from "../../lib/career/ops-incident-acknowledgment-service";
import {createPrismaOpsIncidentStore,type OpsPrismaClientPort} from "../../lib/career/ops-incident-prisma-store";
import assert from "node:assert/strict";
import {db} from "../../lib/db";
import {syncOpsAlertScanWithStore,type OpsIncidentSyncStore} from "../../lib/career/ops-incident-sync-service";
import {createPrismaOpsIncidentSyncStore,type OpsIncidentSyncPrismaPort} from "../../lib/career/ops-incident-sync-prisma-store";
import type {OpsIncidentKey} from "../../lib/career/ops-incident-policy";

/** Migrated, isolated MySQL only; no payment, credit, user or external IO. */
test("B04/U03 migrated MySQL: full scan is atomic even when last category audit fails",async t=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true"||process.env.NODE_ENV==="production")
  throw Error("Dedicated integration database required");
 const tables=await db.$queryRaw<Array<{n:bigint}>>`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema=DATABASE() AND table_name IN ('OpsAlertIncident','OpsAlertIncidentEvent')`;
 if(Number(tables[0]?.n)!==2){
  if(process.env.CI==="true"||process.env.OPS_INCIDENT_INTEGRATION_REQUIRED==="true")
   throw Error("Required ninth incident migration missing");
  t.skip("historical dedicated local database has no incident tables; not verified");
  return;
 }
 const keys:OpsIncidentKey[]=["STALE_AI_RESERVATIONS","REFUND_IN_DOUBT","REFUND_READY_AGED"];
 const existing=await db.opsAlertIncident.count({where:{key:{in:keys}}});
 if(existing!==0)throw Error("Incident keys occupied; refuse to alter other test data");
 const real=createPrismaOpsIncidentSyncStore(db as unknown as OpsIncidentSyncPrismaPort);
 const failing:OpsIncidentSyncStore={
  transaction:callback=>real.transaction(async tx=>callback({
   ...tx,
   append:async event=>{
    await tx.append(event);
    if(event.incidentKey==="REFUND_READY_AGED")throw Error("Injected last-category failure");
   }
  }))
 };
 const now=new Date("2026-11-21T17:00:00.000Z");
 const counts={staleReservations:2,uncertainRefunds:1,agedReadyRefunds:3};
 let owned=false;
 let adminId:string|null=null;
 try{
  await assert.rejects(syncOpsAlertScanWithStore(failing,counts,now),/Injected last-category failure/);
  assert.equal(await db.opsAlertIncident.count({where:{key:{in:keys}}}),0,
   "First two incident rows must roll back when third audit fails");
  assert.equal(await db.opsAlertIncidentEvent.count({where:{incidentKey:{in:keys}}}),0,
   "All created audit events must roll back");
  owned=true; // From here this test owns any newly created rows, including partial failures.
  const opened=await syncOpsAlertScanWithStore(real,counts,new Date(now.getTime()+1000));
  assert.deepEqual(opened.map(x=>x.event),["OPENED","OPENED","OPENED"]);
  // Test a real two-connection race: the next scanner refresh competes with
  // authenticated manual acknowledgment of the same incident episode.
  const admin=await db.user.create({data:{
   email:randomUUID()+"-ops-scan-race@example.invalid",
   passwordHash:"not-a-login",role:"ADMIN"
  }});
  adminId=admin.id;
  const ackStore=createPrismaOpsIncidentStore(db as unknown as OpsPrismaClientPort);
  const ackRequest={
   key:"REFUND_READY_AGED" as const,
   expectedOpenedAt:new Date(now.getTime()+1000),
   operatorId:admin.id,
   reason:"已检查退款调度积压，准备核实支付渠道结果及后续人工处理"
  };
  const refreshCounts={...counts,agedReadyRefunds:4};
  const raceAt=new Date(now.getTime()+2000);
  const raced=await Promise.allSettled([
   syncOpsAlertScanWithStore(real,refreshCounts,raceAt),
   acknowledgeOpsIncidentWithStore(ackStore,ackRequest,raceAt)
  ]);
  assert.ok(raced.some(x=>x.status==="fulfilled"),
   "At least one competing transaction must commit");
  // A serializable conflict is not success; retry only the rejected step
  // against the durable state. Neither operation is allowed to drop the audit.
  if(raced[0].status==="rejected")
   await syncOpsAlertScanWithStore(real,refreshCounts,new Date(now.getTime()+3000));
  if(raced[1].status==="rejected")
   assert.equal(await acknowledgeOpsIncidentWithStore(
    ackStore,ackRequest,new Date(now.getTime()+3000)),"ACKNOWLEDGED");
  const beforeResolution=await db.opsAlertIncident.findUnique({where:{key:"REFUND_READY_AGED"}});
  assert.equal(beforeResolution?.state,"ACKNOWLEDGED");
  assert.equal(beforeResolution?.count,4);
  assert.equal(beforeResolution?.acknowledgedById,admin.id);
  assert.equal(await db.opsAlertIncidentEvent.count({
   where:{incidentKey:"REFUND_READY_AGED",action:"ACKNOWLEDGED"}
  }),1,"An acknowledgement race must produce exactly one audit event");
  const closed=await syncOpsAlertScanWithStore(real,{
   staleReservations:0,uncertainRefunds:0,agedReadyRefunds:0
  },new Date(now.getTime()+4000));
  assert.deepEqual(closed.map(x=>x.event),["RESOLVED","RESOLVED","RESOLVED"]);
  const rows=await db.opsAlertIncident.findMany({where:{key:{in:keys}}});
  assert.equal(rows.length,3);
  assert.ok(rows.every(x=>x.state==="RESOLVED"&&x.count===0));
  const events=await db.opsAlertIncidentEvent.findMany({where:{incidentKey:{in:keys}}});
  assert.equal(events.length,7);
  for(const key of keys){
   assert.deepEqual(events.filter(x=>x.incidentKey===key).map(x=>x.action).sort(),
    key==="REFUND_READY_AGED"?["ACKNOWLEDGED","OPENED","RESOLVED"]:["OPENED","RESOLVED"]);
  }
 }finally{
  if(owned){
   await db.opsAlertIncidentEvent.deleteMany({where:{incidentKey:{in:keys}}});
   await db.opsAlertIncident.deleteMany({where:{key:{in:keys}}});
  }
  if(adminId)await db.user.delete({where:{id:adminId}});
  await db.$disconnect();
 }
});
