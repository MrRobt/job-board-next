import {test} from "node:test";
import assert from "node:assert/strict";
import {reviewDeadOpsNotification,type DeadReviewStore} from "../lib/career/ops-notification-dead-review";
import {createPrismaDeadReviewStore} from "../lib/career/ops-notification-dead-review-prisma-store";
const key="e".repeat(64);
const req={key,operatorId:"admin-test",reasonCode:"REVIEWED_NO_REQUEUE"};
const now=new Date("2026-11-21T15:00:00Z");
function fixture(role="ADMIN",state="DEAD"){
 let previous:{operatorId:string;reasonCode:string}|null=null,writes=0;
 const store:DeadReviewStore={transaction:async fn=>fn({
  operatorRole:async()=>role,
  task:async()=>({state}),
  existing:async()=>previous,
  insert:async data=>{previous={operatorId:data.operatorId,reasonCode:data.reasonCode};writes++}
 })};
 return{store,writes:()=>writes};
}
test("only ADMIN can review DEAD once, same decision replay is idempotent",async()=>{
 const f=fixture();
 assert.equal(await reviewDeadOpsNotification(f.store,req,now),"REVIEWED");
 assert.equal(await reviewDeadOpsNotification(f.store,req,now),"ALREADY_REVIEWED");
 assert.equal(f.writes(),1);
 await assert.rejects(reviewDeadOpsNotification(f.store,{...req,reasonCode:"CHANGED_DECISION"},now),/already reviewed/);
 assert.equal(f.writes(),1);
});
test("non-admin and missing tasks or non-DEAD tasks are not reviewed",async()=>{
 for(const role of ["USER","", "SUPPORT"]){
  const f=fixture(role);
  await assert.rejects(reviewDeadOpsNotification(f.store,req,now),/Administrator required/);
  assert.equal(f.writes(),0);
 }
 for(const state of ["QUEUED","RETRY_WAIT","CLAIMED"]){
  const f=fixture("ADMIN",state);
  assert.equal(await reviewDeadOpsNotification(f.store,req,now),"NOT_DEAD");
  assert.equal(f.writes(),0);
 }
});
test("input rejects arbitrary notes, bad keys and invalid timestamps",async()=>{
 const f=fixture();
 for(const r of [{...req,key:"x"},{...req,reasonCode:"contact customer@example.com"},{...req,operatorId:""},{...req,reasonCode:"a".repeat(41)}])
  await assert.rejects(reviewDeadOpsNotification(f.store,r,now),/Invalid/);
 await assert.rejects(reviewDeadOpsNotification(f.store,req,new Date("invalid")),/Invalid/);
 assert.equal(f.writes(),0);
});
test("Prisma adapter reads server role in Serializable transaction before inserting",async()=>{
 let inserted=0;
 const store=createPrismaDeadReviewStore({
  $transaction:async(fn,options)=>{
   assert.equal(options.isolationLevel,"Serializable");
   return fn({
    user:{findUnique:async args=>{assert.equal(args.where.id,"admin-test");return{role:"ADMIN"}}},
    opsIncidentNotificationIntent:{findUnique:async()=>({state:"DEAD"})},
    opsNotificationDeadReview:{
     findUnique:async()=>null,
     create:async args=>{inserted++;assert.equal(args.data.reasonCode,req.reasonCode);return {}}
    }
   });
  }
 });
 assert.equal(await reviewDeadOpsNotification(store,req,now),"REVIEWED");
 assert.equal(inserted,1);
});
