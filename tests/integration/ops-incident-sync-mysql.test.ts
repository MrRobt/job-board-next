import {test} from "node:test";
import assert from "node:assert/strict";
import {db} from "../../lib/db";
import {syncOpsIncidentWithStore} from "../../lib/career/ops-incident-sync-service";
import {createPrismaOpsIncidentSyncStore,type OpsIncidentSyncPrismaPort} from "../../lib/career/ops-incident-sync-prisma-store";

/** Isolated ninth-migration contract: no refund, credit, or user mutations. */
test("B04/U03 migrated MySQL: incident scan OPENED / RESOLVED / REOPENED audit is atomic",async t=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true"||process.env.NODE_ENV==="production")
  throw new Error("Dedicated integration database required");
 const tables=await db.$queryRaw<Array<{n:bigint}>>`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema=DATABASE() AND table_name IN ('OpsAlertIncident','OpsAlertIncidentEvent')`;
 if(Number(tables[0]?.n)!==2){
  if(process.env.CI==="true"||process.env.OPS_INCIDENT_INTEGRATION_REQUIRED==="true")
   throw new Error("Required incident tables missing from migrated CI MySQL");
  t.skip("historical local dedicated MySQL lacks incident migration; not verified");
  return;
 }
 const key="STALE_AI_RESERVATIONS" as const;
 const original=await db.$queryRaw<Array<{n:bigint}>>`
  SELECT COUNT(*) AS n FROM OpsAlertIncident WHERE \`key\`=${key}`;
 if(Number(original[0]?.n)!==0)throw new Error("Refusing to overwrite existing incident data");
 const now=new Date("2026-11-21T13:00:00.000Z");
 const store=createPrismaOpsIncidentSyncStore(db as unknown as OpsIncidentSyncPrismaPort);
 let owned=false;
 try{
  assert.equal((await syncOpsIncidentWithStore(store,key,0,now)).state,"ABSENT");
  const opened=await syncOpsIncidentWithStore(store,key,2,new Date(now.getTime()+1000));
  owned=true;
  assert.deepEqual(opened,{key,state:"OPEN",event:"OPENED",count:2});
  assert.equal((await syncOpsIncidentWithStore(store,key,3,new Date(now.getTime()+2000))).event,null);
  const resolved=await syncOpsIncidentWithStore(store,key,0,new Date(now.getTime()+3000));
  assert.equal(resolved.event,"RESOLVED");
  assert.equal((await syncOpsIncidentWithStore(store,key,0,new Date(now.getTime()+4000))).event,null);
  const reopened=await syncOpsIncidentWithStore(store,key,1,new Date(now.getTime()+5000));
  assert.equal(reopened.event,"REOPENED");
  const incidents=await db.$queryRaw<Array<{state:string;count:number;acknowledgedAt:Date|null}>>`
   SELECT state,\`count\`,acknowledgedAt FROM OpsAlertIncident WHERE \`key\`=${key}`;
  assert.deepEqual(incidents,[{state:"OPEN",count:1,acknowledgedAt:null}]);
  const events=await db.$queryRaw<Array<{action:string;count:number}>>`
   SELECT action,\`count\` FROM OpsAlertIncidentEvent WHERE incidentKey=${key} ORDER BY createdAt ASC`;
  assert.deepEqual(events.map(e=>e.action),["OPENED","RESOLVED","REOPENED"]);
  assert.deepEqual(events.map(e=>e.count),[2,0,1]);
 }finally{
  if(owned){
   await db.$executeRaw`DELETE FROM OpsAlertIncidentEvent WHERE incidentKey=${key}`;
   await db.$executeRaw`DELETE FROM OpsAlertIncident WHERE \`key\`=${key}`;
  }
  await db.$disconnect();
 }
});
