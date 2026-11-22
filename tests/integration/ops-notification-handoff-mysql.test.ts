import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {syncOpsIncidentWithStore} from "../../lib/career/ops-incident-sync-service";
import {createPrismaOpsIncidentSyncStore,type OpsIncidentSyncPrismaPort} from "../../lib/career/ops-incident-sync-prisma-store";
import {planOpsNotificationIntents} from "../../lib/career/ops-notification-intents";
import {queueInitialOpsNotificationIntent} from "../../lib/career/ops-notification-queue";
import {createPrismaOpsNotificationQueueStore,type OpsNotificationQueuePrismaPort} from "../../lib/career/ops-notification-queue-prisma-store";
import {claimOpsNotificationIntent} from "../../lib/career/ops-notification-claim";
import {createPrismaOpsNotificationLeaseStore,type OpsNotificationClaimPrismaPort} from "../../lib/career/ops-notification-claim-prisma-store";
import {prepareOpsNotificationHandoff} from "../../lib/career/ops-notification-handoff";
import {createPrismaOpsNotificationHandoffStore,type OpsNotificationHandoffPrismaPort} from "../../lib/career/ops-notification-handoff-prisma-store";

test("B04/U03 migrated MySQL: claimed notification handoff reads persisted episode, current count and fencing",async t=>{
  if(process.env.INTEGRATION_TEST_DATABASE!=="true"||process.env.NODE_ENV==="production")
    throw Error("Dedicated integration database required");
  const migrations=await db.$queryRaw<Array<{n:bigint}>>`
    SELECT COUNT(*) AS n FROM information_schema.tables
    WHERE table_schema=DATABASE()
      AND table_name IN ('OpsAlertIncident','OpsAlertIncidentEvent','OpsIncidentNotificationIntent')`;
  if(Number(migrations[0]?.n)!==3){
    if(process.env.CI==="true"||process.env.OPS_NOTIFICATION_INTEGRATION_REQUIRED==="true")
      throw Error("Notification handoff requires migrated incident and queue tables in CI");
    t.skip("historical dedicated MySQL lacks the incident/notification migration");
    return;
  }
  const incidentKey="REFUND_READY_AGED" as const;
  if(await db.opsAlertIncident.count({where:{key:incidentKey}})!==0||
     await db.opsIncidentNotificationIntent.count({where:{incidentKey}})!==0)
    throw Error("Refuse to modify an existing incident/notification");
  const sync=createPrismaOpsIncidentSyncStore(db as unknown as OpsIncidentSyncPrismaPort);
  const queue=createPrismaOpsNotificationQueueStore(db as unknown as OpsNotificationQueuePrismaPort);
  const claim=createPrismaOpsNotificationLeaseStore(db as unknown as OpsNotificationClaimPrismaPort);
  const handoff=createPrismaOpsNotificationHandoffStore(db as unknown as OpsNotificationHandoffPrismaPort);
  const openedAt=new Date("2026-11-22T00:00:00.000Z");
  const at=(ms:number)=>new Date(openedAt.getTime()+ms);
  let ownsRows=false;
  try{
    ownsRows=true;
    assert.equal((await syncOpsIncidentWithStore(sync,incidentKey,2,openedAt)).event,"OPENED");
    const intents=planOpsNotificationIntents(
      {staleReservations:0,uncertainRefunds:0,agedReadyRefunds:2},
      [{key:incidentKey,openedAt,acknowledgedAt:null,lastNotifiedAt:null}],at(500)
    );
    assert.equal(intents.length,1);
    assert.equal(await queueInitialOpsNotificationIntent(queue,intents[0],at(500)),"QUEUED");
    const claimed=await claimOpsNotificationIntent(claim,intents[0].idempotencyKey,at(1000));
    assert.equal(claimed.status,"CLAIMED");
    if(claimed.status!=="CLAIMED")throw Error("Expected claim");
    const request={key:intents[0].idempotencyKey,claimToken:claimed.claimToken,
      now:at(1100),enabled:"true",operatorApproved:"true",
      destination:"https://alerts.example.org",approvedOrigins:["https://alerts.example.org"]};
    const first=await prepareOpsNotificationHandoff(handoff,request);
    assert.equal(first.status,"PREPARED");
    if(first.status!=="PREPARED")throw Error("Expected first prepared snapshot");
    assert.equal(first.envelope.count,2);
    assert.equal(first.envelope.idempotencyKey,intents[0].idempotencyKey);
    assert.equal(first.envelope.episodeOpenedAt,openedAt.toISOString());
    assert.equal(first.destination,"https://alerts.example.org");

    // The queued record remains count=2. Current OPEN incident count=3 must win.
    await syncOpsIncidentWithStore(sync,incidentKey,3,at(2000));
    const fresh=await prepareOpsNotificationHandoff(handoff,{...request,now:at(2100)});
    assert.equal(fresh.status,"PREPARED");
    if(fresh.status!=="PREPARED")throw Error("Expected updated snapshot");
    assert.equal(fresh.envelope.count,3);
    assert.equal((await db.opsIncidentNotificationIntent.findUniqueOrThrow({
      where:{idempotencyKey:request.key}
    })).count,2);

    assert.equal((await prepareOpsNotificationHandoff(handoff,{
      ...request,claimToken:randomUUID(),now:at(2200)
    })).status,"FENCED");
    assert.equal((await prepareOpsNotificationHandoff(handoff,{
      ...request,enabled:undefined,now:at(2300)
    })).status,"DENIED");
    assert.equal((await prepareOpsNotificationHandoff(handoff,{
      ...request,now:at(5*60_000+1000)
    })).status,"EXPIRED");

    assert.equal((await syncOpsIncidentWithStore(sync,incidentKey,0,at(3000))).event,"RESOLVED");
    assert.equal((await prepareOpsNotificationHandoff(handoff,{
      ...request,now:at(4000)
    })).status,"STALE");
  }finally{
    if(ownsRows){
      await db.opsIncidentNotificationIntent.deleteMany({where:{incidentKey}});
      await db.opsAlertIncidentEvent.deleteMany({where:{incidentKey}});
      await db.opsAlertIncident.deleteMany({where:{key:incidentKey}});
    }
    await db.$disconnect();
  }
});
