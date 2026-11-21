import {test} from "node:test";
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
 try{
  await assert.rejects(syncOpsAlertScanWithStore(failing,counts,now),/Injected last-category failure/);
  assert.equal(await db.opsAlertIncident.count({where:{key:{in:keys}}}),0,
   "First two incident rows must roll back when third audit fails");
  assert.equal(await db.opsAlertIncidentEvent.count({where:{incidentKey:{in:keys}}}),0,
   "All created audit events must roll back");
  owned=true; // From here this test owns any newly created rows, including partial failures.
  const opened=await syncOpsAlertScanWithStore(real,counts,new Date(now.getTime()+1000));
  assert.deepEqual(opened.map(x=>x.event),["OPENED","OPENED","OPENED"]);
  const closed=await syncOpsAlertScanWithStore(real,{
   staleReservations:0,uncertainRefunds:0,agedReadyRefunds:0
  },new Date(now.getTime()+2000));
  assert.deepEqual(closed.map(x=>x.event),["RESOLVED","RESOLVED","RESOLVED"]);
  const rows=await db.opsAlertIncident.findMany({where:{key:{in:keys}}});
  assert.equal(rows.length,3);
  assert.ok(rows.every(x=>x.state==="RESOLVED"&&x.count===0));
  const events=await db.opsAlertIncidentEvent.findMany({where:{incidentKey:{in:keys}}});
  assert.equal(events.length,6);
  for(const key of keys){
   assert.deepEqual(events.filter(x=>x.incidentKey===key).map(x=>x.action).sort(),["OPENED","RESOLVED"]);
  }
 }finally{
  if(owned){
   await db.opsAlertIncidentEvent.deleteMany({where:{incidentKey:{in:keys}}});
   await db.opsAlertIncident.deleteMany({where:{key:{in:keys}}});
  }
  await db.$disconnect();
 }
});
