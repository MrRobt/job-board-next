import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {approvedOpsIncidentSyncEnvironment,runIsolatedOpsIncidentScan} from "../../lib/career/ops-incident-scan-coordinator";
import {createPrismaOpsIncidentCountReader,type OpsIncidentCountPrismaPort} from "../../lib/career/ops-incident-count-prisma-reader";
import {createPrismaOpsIncidentSyncStore,type OpsIncidentSyncPrismaPort} from "../../lib/career/ops-incident-sync-prisma-store";

test("B04/U03 isolated MySQL: actual stale reservation count opens and resolves incident, failed scan does not resolve",async t=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true"||process.env.NODE_ENV==="production")
  throw Error("Dedicated integration database required");
 const migration=await db.$queryRaw<Array<{n:bigint}>>`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema=DATABASE() AND table_name IN ('OpsAlertIncident','OpsAlertIncidentEvent')`;
 if(Number(migration[0]?.n)!==2){
  if(process.env.CI==="true"||process.env.OPS_INCIDENT_INTEGRATION_REQUIRED==="true")
   throw Error("Ninth ops incident migration is required in CI");
  t.skip("historical dedicated disposable MySQL lacks ninth incident migration");
  return;
 }
 const key="STALE_AI_RESERVATIONS" as const;
 const existing=await db.opsAlertIncident.count({where:{key}});
 if(existing!==0)throw Error("Refusing to overwrite existing incident row");
 const reader=createPrismaOpsIncidentCountReader(db as unknown as OpsIncidentCountPrismaPort);
 const store=createPrismaOpsIncidentSyncStore(db as unknown as OpsIncidentSyncPrismaPort);
 const now=new Date();
 const baseline=await reader.readCompleteCounts(now);
 if(baseline.staleReservations!==0||baseline.uncertainRefunds!==0||baseline.agedReadyRefunds!==0)
  throw Error("Expected a clean dedicated test DB; refuse to resolve others' alerts");
 // The real production gate only accepts local disposable migration DBs. CI's
 // newly migrated database is named jobs, so a known-safe synthetic policy
 // environment is injected ONLY in this isolated test call. Production code,
 // environment variables and CLI approval behavior are never changed.
 let approval:Readonly<Record<string,string|undefined>>=process.env;
 if(!approvedOpsIncidentSyncEnvironment(approval)){
  const dbUrl=new URL(process.env.DATABASE_URL??"");
  if(process.env.CI!=="true"||!["localhost","127.0.0.1"].includes(dbUrl.hostname)||
    dbUrl.protocol!=="mysql:"||dbUrl.pathname!=="/jobs")
   throw Error("Cannot apply CI-only policy fixture outside fresh CI MySQL");
  approval={
   OPS_ALERT_READ_ONLY_APPROVED:"true",
   OPS_INCIDENT_SYNC_APPROVED:"true",
   INTEGRATION_TEST_DATABASE:"true",NODE_ENV:"test",
   DATABASE_URL:"mysql://unused@127.0.0.1:3306/jobs_mvp_migrate_20261121_ci"
  };
 }
 assert.equal(approvedOpsIncidentSyncEnvironment(approval),true);
 const marker=randomUUID();
 let userId:string|null=null;
 let grantId:string|null=null;
 let runId:string|null=null;
 let incidentOwned=false;
 try{
  const user=await db.user.create({data:{
   email:marker+"-scan@example.invalid",passwordHash:"not-a-login"
  }});
  userId=user.id;
  const grant=await db.toolGrant.create({data:{
   userId:user.id,total:1,remaining:1,trialKey:"isolated-scan-"+marker
  }});
  grantId=grant.id;
  const run=await db.toolRun.create({data:{
   userId:user.id,grantId:grant.id,requestId:marker,kind:"resume",
   status:"RESERVED",createdAt:new Date(now.getTime()-11*60_000)
  }});
  runId=run.id;
  const scanAt=new Date(now.getTime()+1000);
  const counts=await reader.readCompleteCounts(scanAt);
  assert.deepEqual(counts,{staleReservations:1,uncertainRefunds:0,agedReadyRefunds:0});
  incidentOwned=true;
  const opened=await runIsolatedOpsIncidentScan(approval,reader,store,scanAt);
  assert.deepEqual(opened.map(x=>x.event),["OPENED",null,null]);
  assert.equal((await db.opsAlertIncident.findUnique({where:{key}}))?.count,1);
  assert.deepEqual((await db.opsAlertIncidentEvent.findMany({
   where:{incidentKey:key},select:{action:true}
  })).map(x=>x.action),["OPENED"]);
  // Query failure is never equivalent to observing zero: the active incident stays OPEN.
  await assert.rejects(runIsolatedOpsIncidentScan(approval,{
   readCompleteCounts:async()=>{await reader.readCompleteCounts(scanAt);throw Error("Simulated partial observation");}
  },store,new Date(now.getTime()+2000)),/partial observation/);
  assert.equal((await db.opsAlertIncident.findUnique({where:{key}}))?.state,"OPEN");
  await db.toolRun.update({where:{id:runId},data:{status:"SUCCEEDED",finishedAt:new Date(now.getTime()+3000)}});
  const resolved=await runIsolatedOpsIncidentScan(
   approval,reader,store,new Date(now.getTime()+4000)
  );
  assert.deepEqual(resolved.map(x=>x.event),["RESOLVED",null,null]);
  assert.equal((await db.opsAlertIncident.findUnique({where:{key}}))?.state,"RESOLVED");
  const events=await db.opsAlertIncidentEvent.findMany({
   where:{incidentKey:key},select:{action:true},orderBy:{createdAt:"asc"}
  });
  assert.deepEqual(events.map(x=>x.action),["OPENED","RESOLVED"]);
 }finally{
  if(incidentOwned){
   await db.opsAlertIncidentEvent.deleteMany({where:{incidentKey:key}});
   await db.opsAlertIncident.deleteMany({where:{key}});
  }
  if(runId)await db.toolRun.delete({where:{id:runId}});
  if(grantId)await db.toolGrant.delete({where:{id:grantId}});
  if(userId)await db.user.delete({where:{id:userId}});
  await db.$disconnect();
 }
});
