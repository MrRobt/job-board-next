import {test} from "node:test";
import assert from "node:assert/strict";
import {claimOpsNotificationIntent,type OpsNotificationLeaseRow,type OpsNotificationLeaseStore} from "../lib/career/ops-notification-claim";
import {createPrismaOpsNotificationLeaseStore} from "../lib/career/ops-notification-claim-prisma-store";
const openedAt=new Date("2026-11-21T10:00:00Z");
const now=new Date("2026-11-21T10:02:00Z");
const key="a".repeat(64);
const base:OpsNotificationLeaseRow={idempotencyKey:key,state:"QUEUED",incidentKey:"STALE_AI_RESERVATIONS",episodeOpenedAt:openedAt,attemptCount:0,claimToken:null,leaseExpiresAt:null};
function fixture(){
 let row:OpsNotificationLeaseRow={...base};
 let state:"OPEN"|"ACKNOWLEDGED"|"RESOLVED"="OPEN",incidentOpenedAt=openedAt,updates=0;
 const store:OpsNotificationLeaseStore={transaction:async fn=>fn({
  read:async()=>({...row}),
  readIncident:async()=>({state,openedAt:incidentOpenedAt,count:1}),
  compareAndClaim:async (previous,claimToken,at,expiresAt)=>{
   if(row.state!==previous.state||row.attemptCount!==previous.attemptCount||
     row.claimToken!==previous.claimToken||row.leaseExpiresAt?.getTime()!==previous.leaseExpiresAt?.getTime())return 0;
   row={...row,state:"CLAIMED",attemptCount:row.attemptCount+1,claimToken,leaseExpiresAt:expiresAt};
   updates++;return 1;
  }
 })};
 return {store,row:()=>row,updates:()=>updates,setState:(s:typeof state)=>{state=s},setEpisode:(d:Date)=>{incidentOpenedAt=d}};
}
test("only one lease within window; expired lease recovery rotates claim token",async()=>{
 const f=fixture();
 const first=await claimOpsNotificationIntent(f.store,key,now);
 assert.equal(first.status,"CLAIMED");
 assert.equal(f.row().attemptCount,1);
 assert.equal((await claimOpsNotificationIntent(f.store,key,new Date(now.getTime()+60_000))).status,"BUSY");
 const retry=await claimOpsNotificationIntent(f.store,key,new Date(now.getTime()+5*60_000));
 assert.equal(retry.status,"CLAIMED");
 if(first.status==="CLAIMED"&&retry.status==="CLAIMED")
  assert.notEqual(first.claimToken,retry.claimToken);
 assert.equal(retry.status==="CLAIMED"&&retry.attempt,2);
 assert.equal(f.updates(),2);
});
test("resolved, acknowledged or reopened incidents cannot claim queued or expired work",async()=>{
 for(const state of ["RESOLVED","ACKNOWLEDGED"] as const){
  const f=fixture();f.setState(state);
  assert.equal((await claimOpsNotificationIntent(f.store,key,now)).status,"STALE");
  assert.equal(f.updates(),0);
 }
 const f=fixture();f.setEpisode(new Date(openedAt.getTime()+1000));
 assert.equal((await claimOpsNotificationIntent(f.store,key,now)).status,"STALE");
});
test("claim limit stops infinite retry and input must fail before transaction",async()=>{
 const f=fixture();
 for(let i=0;i<5;i++){
  const t=new Date(now.getTime()+i*5*60_000);
  assert.equal((await claimOpsNotificationIntent(f.store,key,t)).status,"CLAIMED");
 }
 assert.equal((await claimOpsNotificationIntent(f.store,key,new Date(now.getTime()+25*60_000))).status,"EXHAUSTED");
 assert.equal(f.updates(),5);
 for(const [id,date,minutes] of [["oops",now,5],[key,new Date("invalid"),5],[key,now,0],[key,now,16],[key,now,1.5]] as const)
  await assert.rejects(claimOpsNotificationIntent(f.store,id,date,minutes),/Invalid/);
});
test("Prisma serializable adapter uses conditional updateMany and never inserts or sends",async()=>{
 let state:OpsNotificationLeaseRow={...base},calls=0;
 const store=createPrismaOpsNotificationLeaseStore({
  $transaction:async(fn,opts)=>{
   assert.equal(opts.isolationLevel,"Serializable");calls++;
   return fn({
    opsAlertIncident:{findUnique:async()=>({state:"OPEN" as const,openedAt,count:1})},
    opsIncidentNotificationIntent:{
     findUnique:async()=>state,
     updateMany:async args=>{
      assert.equal(args.where.idempotencyKey,key);
      assert.equal(args.where.state,state.state);
      assert.equal(args.where.attemptCount,state.attemptCount);
      state={...state,...args.data};return {count:1};
     }
    }
   });
  }
 });
 const first=await claimOpsNotificationIntent(store,key,now);
 assert.equal(first.status,"CLAIMED");
 assert.equal((await claimOpsNotificationIntent(store,key,new Date(now.getTime()+1000))).status,"BUSY");
 assert.equal(calls,2);
});
