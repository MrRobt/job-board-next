import {test} from "node:test";
import assert from "node:assert/strict";
import {db} from "../../lib/db";
import {claimOpsNotificationIntent} from "../../lib/career/ops-notification-claim";
import {preflightOpsNotification} from "../../lib/career/ops-notification-preflight";
import {createPrismaOpsNotificationPreflightStore,type OpsNotificationPreflightPrismaPort} from "../../lib/career/ops-notification-preflight-prisma-store";
import {createPrismaOpsNotificationLeaseStore,type OpsNotificationClaimPrismaPort} from "../../lib/career/ops-notification-claim-prisma-store";
import {planOpsNotificationIntents} from "../../lib/career/ops-notification-intents";
import {queueInitialOpsNotificationIntent} from "../../lib/career/ops-notification-queue";
import {createPrismaOpsNotificationQueueStore,type OpsNotificationQueuePrismaPort} from "../../lib/career/ops-notification-queue-prisma-store";
import {syncOpsIncidentWithStore} from "../../lib/career/ops-incident-sync-service";
import {createPrismaOpsIncidentSyncStore,type OpsIncidentSyncPrismaPort} from "../../lib/career/ops-incident-sync-prisma-store";

test("B04/U03 migrated MySQL: durable notification queue is unique per episode, stale queue refused",async t=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true"||process.env.NODE_ENV==="production")
  throw Error("Dedicated integration database required");
 const migrations=await db.$queryRaw<Array<{n:bigint}>>`
  SELECT COUNT(*) AS n FROM information_schema.tables
  WHERE table_schema=DATABASE()
  AND table_name IN ('OpsAlertIncident','OpsAlertIncidentEvent','OpsIncidentNotificationIntent')`;
 if(Number(migrations[0]?.n)!==3){
  if(process.env.CI==="true"||process.env.OPS_NOTIFICATION_INTEGRATION_REQUIRED==="true")
   throw Error("Tenth notification outbox migration missing");
  t.skip("historical dedicated local MySQL has no tenth notification migration");
  return;
 }
 const key="STALE_AI_RESERVATIONS" as const;
 if(await db.opsAlertIncident.count({where:{key}})>0)
  throw Error("Refuse to modify existing incident");
 if(await db.opsIncidentNotificationIntent.count({where:{incidentKey:key}})>0)
  throw Error("Refuse to modify existing notification");
 const sync=createPrismaOpsIncidentSyncStore(db as unknown as OpsIncidentSyncPrismaPort);
 const queue=createPrismaOpsNotificationQueueStore(db as unknown as OpsNotificationQueuePrismaPort);
 const openedAt=new Date("2026-11-21T12:00:00.000Z");
 let own=false;
 try{
  own=true; // From here the test owns the new incident and queue rows.
  assert.equal((await syncOpsIncidentWithStore(sync,key,1,openedAt)).event,"OPENED");
  const intents=planOpsNotificationIntents({
   staleReservations:1,uncertainRefunds:0,agedReadyRefunds:0
  },[{key,openedAt,acknowledgedAt:null,lastNotifiedAt:null}],
  new Date(openedAt.getTime()+1000));
  assert.equal(intents.length,1);
  const intent=intents[0];
  assert.equal(await queueInitialOpsNotificationIntent(queue,intent,new Date(openedAt.getTime()+1000)),"QUEUED");
  assert.equal(await queueInitialOpsNotificationIntent(queue,intent,new Date(openedAt.getTime()+2000)),"EXISTS");
  const rows=await db.opsIncidentNotificationIntent.findMany({where:{incidentKey:key}});
  assert.equal(rows.length,1);
  assert.equal(rows[0].idempotencyKey,intent.idempotencyKey);
  assert.equal(rows[0].state,"QUEUED");
  assert.equal(rows[0].kind,"NOTIFY");
  assert.equal(rows[0].count,1);
  const lease=createPrismaOpsNotificationLeaseStore(db as unknown as OpsNotificationClaimPrismaPort);
  const first=await claimOpsNotificationIntent(lease,intent.idempotencyKey,new Date(openedAt.getTime()+2200));
  assert.equal(first.status,"CLAIMED");
  const preflight=createPrismaOpsNotificationPreflightStore(db as unknown as OpsNotificationPreflightPrismaPort);
  if(first.status!=="CLAIMED")throw Error("Expected first claim");
  assert.equal(await preflightOpsNotification(preflight,intent.idempotencyKey,first.claimToken,new Date(openedAt.getTime()+2250)),"READY");
  assert.equal((await claimOpsNotificationIntent(lease,intent.idempotencyKey,new Date(openedAt.getTime()+2300))).status,"BUSY");
  const recovered=await claimOpsNotificationIntent(lease,intent.idempotencyKey,new Date(openedAt.getTime()+302200));
  assert.equal(recovered.status,"CLAIMED");
  if(recovered.status!=="CLAIMED")throw Error("Expected recovery claim");
  assert.notEqual(first.claimToken,recovered.claimToken);
  assert.equal(await preflightOpsNotification(preflight,intent.idempotencyKey,first.claimToken,new Date(openedAt.getTime()+302250)),"FENCED");
  assert.equal(await preflightOpsNotification(preflight,intent.idempotencyKey,recovered.claimToken,new Date(openedAt.getTime()+302250)),"READY");
  const claimRow=await db.opsIncidentNotificationIntent.findUniqueOrThrow({
   where:{idempotencyKey:intent.idempotencyKey}
  });
  // The local Windows Prisma client may still predate migration 11 (DLL locked).
  assert.equal((claimRow as unknown as {attemptCount:number}).attemptCount,2);
  const resolved=await syncOpsIncidentWithStore(sync,key,0,new Date(openedAt.getTime()+303000));
  assert.equal(resolved.event,"RESOLVED");
  assert.equal(await preflightOpsNotification(preflight,intent.idempotencyKey,recovered.claimToken,new Date(openedAt.getTime()+303100)),"STALE");
  assert.equal((await claimOpsNotificationIntent(lease,intent.idempotencyKey,new Date(openedAt.getTime()+602200))).status,"STALE");
  assert.equal(await queueInitialOpsNotificationIntent(queue,intent,new Date(openedAt.getTime()+304000)),"STALE");
  assert.equal(await db.opsIncidentNotificationIntent.count({where:{incidentKey:key}}),1);
 }finally{
  if(own){
   await db.opsIncidentNotificationIntent.deleteMany({where:{incidentKey:key}});
   await db.opsAlertIncidentEvent.deleteMany({where:{incidentKey:key}});
   await db.opsAlertIncident.deleteMany({where:{key}});
  }
  await db.$disconnect();
 }
});
