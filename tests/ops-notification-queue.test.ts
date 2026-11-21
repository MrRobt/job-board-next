import {test} from "node:test";
import assert from "node:assert/strict";
import {planOpsNotificationIntents} from "../lib/career/ops-notification-intents";
import {queueInitialOpsNotificationIntent,type OpsNotificationQueueStore} from "../lib/career/ops-notification-queue";
import {createPrismaOpsNotificationQueueStore} from "../lib/career/ops-notification-queue-prisma-store";

const openedAt=new Date("2026-11-21T10:00:00Z");
const now=new Date("2026-11-21T10:02:00Z");
const counts={staleReservations:0,uncertainRefunds:1,agedReadyRefunds:0};
const intent=planOpsNotificationIntents(counts,[{
 key:"REFUND_IN_DOUBT",openedAt,lastNotifiedAt:null,acknowledgedAt:null
}],now)[0];

function stub(state:"OPEN"|"ACKNOWLEDGED"|"RESOLVED"="OPEN",episode=openedAt){
 const keys=new Set<string>();let transactions=0,inserted=0;
 const store:OpsNotificationQueueStore={
  transaction:async fn=>{
   transactions++;
   return fn({
    findIncident:async()=>({state,openedAt:episode,count:1}),
    insertOnce:async item=>{if(keys.has(item.idempotencyKey))return 0;keys.add(item.idempotencyKey);inserted++;return 1;}
   });
  }
 };
 return {store,transactions:()=>transactions,inserted:()=>inserted};
}
test("durable initial queue candidate is idempotent and only once",async()=>{
 const f=stub();
 assert.equal(await queueInitialOpsNotificationIntent(f.store,intent,now),"QUEUED");
 assert.equal(await queueInitialOpsNotificationIntent(f.store,intent,now),"EXISTS");
 assert.equal(f.transactions(),2);assert.equal(f.inserted(),1);
});
test("acknowledged/resolved/new incident episodes refuse stale queueing",async()=>{
 for(const state of ["ACKNOWLEDGED","RESOLVED"] as const){
  const f=stub(state);
  assert.equal(await queueInitialOpsNotificationIntent(f.store,intent,now),"STALE");
  assert.equal(f.inserted(),0);
 }
 const f=stub("OPEN",new Date(openedAt.getTime()+1000));
 assert.equal(await queueInitialOpsNotificationIntent(f.store,intent,now),"STALE");
});
test("forged keys, escalation, malformed timestamps and illegal counts reject before transaction",async()=>{
 for(const bad of [
  {...intent,idempotencyKey:"0".repeat(64)},
  {...intent,kind:"ESCALATE"},
  {...intent,dueBucket:1},
  {...intent,count:0},
  {...intent,count:-1},
  {...intent,key:"UNKNOWN"},
  {...intent,priority:"LOW"},
  {...intent,incidentOpenedAt:new Date("invalid")}
 ]){
  const f=stub();
  await assert.rejects(queueInitialOpsNotificationIntent(f.store,bad as never,now));
  assert.equal(f.transactions(),0);
 }
 const f=stub();
 await assert.rejects(queueInitialOpsNotificationIntent(f.store,intent,new Date("invalid")),/clock/);
 assert.equal(f.transactions(),0);
});
test("Prisma adapter enqueues only once via Serializable transaction and skipDuplicates",async()=>{
 const stored=new Set<string>();
 let calls=0;
 const prisma=createPrismaOpsNotificationQueueStore({
  $transaction:async(fn,opts)=>{
   assert.equal(opts.isolationLevel,"Serializable");calls++;
   return fn({
    opsAlertIncident:{findUnique:async()=>({state:"OPEN" as const,openedAt,count:1})},
    opsIncidentNotificationIntent:{createMany:async args=>{
     assert.equal(args.skipDuplicates,true);
     assert.equal(args.data.length,1);
     const row=args.data[0];
     if(stored.has(row.idempotencyKey))return {count:0};
     stored.add(row.idempotencyKey);return {count:1};
    }}
   });
  }
 });
 assert.equal(await queueInitialOpsNotificationIntent(prisma,intent,now),"QUEUED");
 assert.equal(await queueInitialOpsNotificationIntent(prisma,intent,now),"EXISTS");
 assert.equal(calls,2);assert.equal(stored.size,1);
});
