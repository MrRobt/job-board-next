import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {acknowledgeOpsIncidentWithStore} from "../../lib/career/ops-incident-acknowledgment-service";
import {createPrismaOpsIncidentStore,type OpsPrismaClientPort} from "../../lib/career/ops-incident-prisma-store";

/**
 * Requires the ninth migration in CI. Old dedicated local disposable MySQL
 * environments may lack it and are explicitly SKIPPED, never counted as PASS.
 * Real Prisma model delegates are exercised; no external payment/AI/alert IO.
 */
test("B04/U03 migrated MySQL: admin CAS acknowledgment and audit are atomic/idempotent",async t=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true"||process.env.NODE_ENV==="production")
  throw new Error("Dedicated integration database required");
 const tables=await db.$queryRaw<Array<{n:bigint}>>`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema=DATABASE() AND table_name IN ('OpsAlertIncident','OpsAlertIncidentEvent')`;
 if(Number(tables[0]?.n)!==2){
  if(process.env.CI==="true"||process.env.OPS_INCIDENT_INTEGRATION_REQUIRED==="true")
   throw new Error("Required ninth ops incident migration missing");
  t.skip("local historical disposable MySQL lacks ninth ops incident migration; not verified");
  return;
 }
 const key="REFUND_IN_DOUBT";
 const existing=await db.$queryRaw<Array<{n:bigint}>>`
  SELECT COUNT(*) AS n FROM OpsAlertIncident WHERE \`key\`=${key}`;
 if(Number(existing[0]?.n)!==0)throw new Error("Dedicated incident key already occupied; refuse destructive testing");
 const tag=randomUUID();
 const admin=await db.user.create({data:{
  email:tag+"-ops-admin@example.invalid",passwordHash:"not-a-login",role:"ADMIN"
 }});
 const nonAdmin=await db.user.create({data:{
  email:tag+"-ops-user@example.invalid",passwordHash:"not-a-login",role:"USER"
 }});
 const secondAdmin=await db.user.create({data:{
  email:tag+"-ops-second-admin@example.invalid",passwordHash:"not-a-login",role:"ADMIN"
 }});
 const openedAt=new Date("2026-11-21T06:00:00.000Z");
 const now=new Date("2026-11-21T06:05:00.000Z");
 const reopenedAt=new Date(openedAt.getTime()+10*60_000);
 const reason="已核对退款异常凭据，并提交人工签名渠道查询待确认";
 let seeded=false;
 try{
  await db.$executeRaw`INSERT INTO OpsAlertIncident
   (\`key\`,state,\`count\`,openedAt,lastSeenAt)
   VALUES (${key},'OPEN',2,${openedAt},${openedAt})`;
  seeded=true;
  // This cast bridges the old local generated Prisma client to the ninth
  // migration delegates. CI regenerates the actual client before running.
  const store=createPrismaOpsIncidentStore(db as unknown as OpsPrismaClientPort);
  const command={key:"REFUND_IN_DOUBT" as const,
   expectedOpenedAt:openedAt,operatorId:admin.id,reason};
  await assert.rejects(acknowledgeOpsIncidentWithStore(
   store,{...command,operatorId:nonAdmin.id},now),/Administrator/);
  await assert.rejects(acknowledgeOpsIncidentWithStore(
   store,{...command,expectedOpenedAt:new Date(openedAt.getTime()-1000)},now),/episode/);
  assert.equal(await acknowledgeOpsIncidentWithStore(store,command,now),"ACKNOWLEDGED");
  assert.equal(await acknowledgeOpsIncidentWithStore(
   store,command,new Date(now.getTime()+1000)),"ALREADY_ACKNOWLEDGED");
  const incidents=await db.$queryRaw<Array<{
   state:string;acknowledgedById:string|null;acknowledgedAt:Date|null;
  }>>`SELECT state,acknowledgedById,acknowledgedAt FROM OpsAlertIncident
    WHERE \`key\`=${key}`;
  assert.equal(incidents[0]?.state,"ACKNOWLEDGED");
  assert.equal(incidents[0]?.acknowledgedById,admin.id);
  assert.equal(incidents[0]?.acknowledgedAt?.getTime(),now.getTime());
  const events=await db.$queryRaw<Array<{
   action:string;operatorId:string|null;count:number;
  }>>`SELECT action,operatorId,\`count\` FROM OpsAlertIncidentEvent
     WHERE incidentKey=${key}`;
  assert.deepEqual(events,[{action:"ACKNOWLEDGED",operatorId:admin.id,count:2}]);
  await assert.rejects(acknowledgeOpsIncidentWithStore(
   store,{...command,reason:"另一个未经审核的新原因不能覆盖已确认记录"},now),/already acknowledged/);

  // Simulate a distinct new incident episode after resolution. Historical
  // acknowledgment must NOT authorize a stale UI request in the new episode.
  await db.$executeRaw`UPDATE OpsAlertIncident SET state='OPEN',
   openedAt=${reopenedAt},lastSeenAt=${reopenedAt},resolvedAt=NULL,
   acknowledgedAt=NULL,acknowledgedById=NULL,acknowledgmentNote=NULL
   WHERE \`key\`=${key}`;
  await assert.rejects(acknowledgeOpsIncidentWithStore(
   store,command,new Date(reopenedAt.getTime()+1000)),/episode/);
  const fresh={...command,expectedOpenedAt:reopenedAt};
  const raced=await Promise.allSettled([
   acknowledgeOpsIncidentWithStore(store,fresh,new Date(reopenedAt.getTime()+2000)),
   acknowledgeOpsIncidentWithStore(store,{...fresh,operatorId:secondAdmin.id},new Date(reopenedAt.getTime()+2000))
  ]);
  assert.equal(raced.filter(x=>x.status==='fulfilled'&&x.value==='ACKNOWLEDGED').length,1,
   'Only one administrator may acknowledge a reopened incident');
  const latest=await db.$queryRaw<Array<{n:bigint}>>`
   SELECT COUNT(*) AS n FROM OpsAlertIncidentEvent WHERE incidentKey=${key}`;
  assert.equal(Number(latest[0]?.n),2,'One audit per episode, not per raced request');
 }finally{
  if(seeded){
   await db.$executeRaw`DELETE FROM OpsAlertIncidentEvent
     WHERE incidentKey=${key} AND operatorId IN (${admin.id},${secondAdmin.id})`;
   await db.$executeRaw`DELETE FROM OpsAlertIncident
     WHERE \`key\`=${key} AND openedAt IN (${openedAt},${reopenedAt})`;
  }
  await db.user.deleteMany({where:{id:{in:[admin.id,nonAdmin.id,secondAdmin.id]}}});
  await db.$disconnect();
 }
});
