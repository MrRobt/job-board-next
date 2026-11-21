import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {preflightOpsNotification,type OpsNotificationPreflightStore,type OpsNotificationPreflightRow,type OpsNotificationPreflightIncident} from "../lib/career/ops-notification-preflight";
import {createPrismaOpsNotificationPreflightStore} from "../lib/career/ops-notification-preflight-prisma-store";
const key="b".repeat(64);
const token=randomUUID();
const now=new Date("2026-11-21T12:05:00Z");
const openedAt=new Date("2026-11-21T12:00:00Z");
const row:OpsNotificationPreflightRow={
 idempotencyKey:key,incidentKey:"STALE_AI_RESERVATIONS",episodeOpenedAt:openedAt,
 state:"CLAIMED",claimToken:token,leaseExpiresAt:new Date(now.getTime()+60_000),attemptCount:1
};
const incident={state:"OPEN" as const,openedAt,count:1};
function store(item:OpsNotificationPreflightRow|null=row,record:OpsNotificationPreflightIncident|null=incident){
 let transactions=0,incidentReads=0;
 const db:OpsNotificationPreflightStore={transaction:async cb=>{
  transactions++;
  return cb({
   readIntent:async()=>item,
   readIncident:async()=>{incidentReads++;return record}
  });
 }};
 return {db,transactions:()=>transactions,incidentReads:()=>incidentReads};
}
test("only current token with unexpired lease and OPEN episode passes preflight",async()=>{
 const s=store();
 assert.equal(await preflightOpsNotification(s.db,key,token,now),"READY");
 assert.equal(s.transactions(),1);assert.equal(s.incidentReads(),1);
});
test("old token, queued state, missing work and expired lease fail closed",async()=>{
 for(const [item,expected]of [
  [null,"MISSING"],
  [{...row,claimToken:randomUUID()},"FENCED"],
  [{...row,state:"QUEUED" as const},"FENCED"],
  [{...row,leaseExpiresAt:now},"EXPIRED"],
  [{...row,leaseExpiresAt:new Date(now.getTime()-1000)},"EXPIRED"]
 ] as const){
  const s=store(item);
  assert.equal(await preflightOpsNotification(s.db,key,token,now),expected);
  assert.equal(s.incidentReads(),0);
 }
});
test("acknowledged, resolved, missing and reopened incidents cannot pass",async()=>{
 for(const record of [
  {...incident,state:"ACKNOWLEDGED" as const},
  {...incident,state:"RESOLVED" as const},
  {...incident,count:0},
  {...incident,openedAt:new Date(openedAt.getTime()+1000)},
  null
 ]){
  assert.equal(await preflightOpsNotification(store(row,record).db,key,token,now),"STALE");
 }
});
test("malformed ids, clock, lease and attempt counter reject",async()=>{
 for(const [id,owner,date]of [
  ["x",token,now],[key,"bad-token",now],[key,token,new Date("invalid")]
 ] as const)
  await assert.rejects(preflightOpsNotification(store().db,id,owner,date),/Invalid/);
 for(const item of [{...row,attemptCount:0},{...row,leaseExpiresAt:null}]){
  await assert.rejects(preflightOpsNotification(store(item).db,key,token,now),/Invalid/);
 }
});
test("read-only Prisma adapter uses a Serializable transaction and projections only",async()=>{
 let calls=0;
 const prisma=createPrismaOpsNotificationPreflightStore({
  $transaction:async(fn,opts)=>{
   calls++;assert.equal(opts.isolationLevel,"Serializable");
   return fn({
    opsIncidentNotificationIntent:{findUnique:async args=>{
     assert.deepEqual(args.where,{idempotencyKey:key});
     assert.equal(args.select.claimToken,true);return row;
    }},
    opsAlertIncident:{findUnique:async args=>{
     assert.deepEqual(args.where,{key:"STALE_AI_RESERVATIONS"});return incident;
    }}
   });
  }
 });
 assert.equal(await preflightOpsNotification(prisma,key,token,now),"READY");
 assert.equal(calls,1);
});
