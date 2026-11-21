import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {failOpsNotificationClaim,type OpsNotificationFailureStore,type OpsNotificationFailureRow} from "../lib/career/ops-notification-failure";
import {claimOpsNotificationIntent,type OpsNotificationLeaseStore} from "../lib/career/ops-notification-claim";
const key="c".repeat(64),token=randomUUID(),now=new Date("2026-11-21T13:00:00Z");
const openedAt=new Date(now.getTime()-30_000);
function fixture(attemptCount=1){
 let row:OpsNotificationFailureRow={idempotencyKey:key,state:"CLAIMED",claimToken:token,leaseExpiresAt:new Date(now.getTime()+60_000),attemptCount};
 let writes=0;
 const store:OpsNotificationFailureStore={transaction:async fn=>fn({
  read:async()=>({...row}),
  compareAndSet:async(previous,update)=>{
   if(previous.claimToken!==row.claimToken||previous.attemptCount!==row.attemptCount)return 0;
   row={...row,...update};
   writes++;return 1;
  }
 })};
 return{store,row:()=>row,writes:()=>writes};
}
test("failure with current lease schedules bounded retry and drops ownership",async()=>{
 const f=fixture();
 const result=await failOpsNotificationClaim(f.store,key,token,"TEMPORARY_FAILURE",now);
 assert.equal(result.status,"RETRY_WAIT");
 if(result.status==="RETRY_WAIT")assert.equal(result.nextAttemptAt.getTime(),now.getTime()+120_000);
 assert.equal(f.row().state,"RETRY_WAIT");
 assert.equal(f.row().claimToken,null);
 assert.equal(f.writes(),1);
 assert.equal((await failOpsNotificationClaim(f.store,key,token,"TEMPORARY_FAILURE",now)).status,"FENCED");
});
test("fifth failure is DEAD and never requeues automatically",async()=>{
 const f=fixture(5);
 assert.equal((await failOpsNotificationClaim(f.store,key,token,"RETRY_EXHAUSTED",now)).status,"DEAD");
 assert.equal(f.row().state,"DEAD");assert.equal(f.writes(),1);
});
test("old owner, expired lease and invalid codes fail closed",async()=>{
 const f=fixture();
 assert.equal((await failOpsNotificationClaim(f.store,key,randomUUID(),"NETWORK_ERROR",now)).status,"FENCED");
 assert.equal((await failOpsNotificationClaim(f.store,key,token,"NETWORK_ERROR",new Date(now.getTime()+60_000))).status,"EXPIRED");
 for(const [k,t,c,d] of [
  ["x",token,"NETWORK_ERROR",now],
  [key,"wrong-token","NETWORK_ERROR",now],
  [key,token,"contains sensitive details!",now],
  [key,token,"NETWORK_ERROR",new Date("invalid")]
 ] as const)await assert.rejects(failOpsNotificationClaim(f.store,k,t,c,d),/Invalid/);
 assert.equal(f.writes(),0);
});
test("scheduled RETRY_WAIT enforces due time and claim retry clears schedule",async()=>{
 let current:{idempotencyKey:string;state:"QUEUED"|"CLAIMED"|"RETRY_WAIT"|"DEAD";incidentKey:string;episodeOpenedAt:Date;claimToken:string|null;leaseExpiresAt:Date|null;attemptCount:number;nextAttemptAt:Date|null}={idempotencyKey:key,state:"CLAIMED",incidentKey:"STALE_AI_RESERVATIONS",episodeOpenedAt:openedAt,
  claimToken:token,leaseExpiresAt:new Date(now.getTime()+60_000) as Date|null,attemptCount:1,
  nextAttemptAt:null as Date|null};
 const failure:OpsNotificationFailureStore={transaction:async fn=>fn({
  read:async()=>current,
  compareAndSet:async(_p,u)=>{current={...current,...u};return 1}
 })};
 const claim:OpsNotificationLeaseStore={transaction:async fn=>fn({
  read:async()=>current,
  readIncident:async()=>({state:"OPEN",openedAt,count:1}),
  compareAndClaim:async(_p,newToken,_time,expiresAt)=>{
   current={...current,state:"CLAIMED",attemptCount:2,claimToken:newToken,leaseExpiresAt:expiresAt,nextAttemptAt:null};return 1;
  }
 })};
 assert.equal((await failOpsNotificationClaim(failure,key,token,"TEMPORARY_FAILURE",now)).status,"RETRY_WAIT");
 assert.equal((await claimOpsNotificationIntent(claim,key,new Date(now.getTime()+1000))).status,"DEFERRED");
 assert.equal((await claimOpsNotificationIntent(claim,key,new Date(now.getTime()+120_000))).status,"CLAIMED");
 assert.equal(current.attemptCount,2);
});
