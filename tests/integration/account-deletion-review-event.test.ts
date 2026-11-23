import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {recordAccountDeletionReview} from "../../lib/account-deletion-review-event";
import {requestAccountDeletionReview} from "../../lib/account-deletion-requests";
import {listAccountDeletionReviewQueue} from "../../lib/account-deletion-review-queue";

test("U01 manual deletion review audit is admin-only, idempotent and non-destructive in isolated MySQL",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw Error("Disposable MySQL required");
 const users:string[]=[];
 let orderId:string|null=null;
 try{
  const admin=await db.user.create({data:{email:"u01-review-admin-"+randomUUID()+"@example.invalid",
   passwordHash:"synthetic",role:"ADMIN",emailVerifiedAt:new Date()}});
  const subject=await db.user.create({data:{email:"u01-review-person-"+randomUUID()+"@example.invalid",
   passwordHash:"synthetic",emailVerifiedAt:new Date()}});
  const other=await db.user.create({data:{email:"u01-review-other-"+randomUUID()+"@example.invalid",
   passwordHash:"synthetic",emailVerifiedAt:new Date()}});
  users.push(admin.id,subject.id,other.id);
  const request=await requestAccountDeletionReview(subject.id);
  orderId=randomUUID().replace(/-/g,"").slice(0,32);
  await db.toolOrder.create({data:{id:orderId,userId:subject.id,sku:"STARTER20",
   credits:20,amountFen:990,provider:"MOCK",status:"PAID"}});
  const initialOrder=await db.toolOrder.findUniqueOrThrow({where:{id:orderId}});
  await assert.rejects(recordAccountDeletionReview({
   requestId:request.id,operatorId:other.id,reasonCode:"NEEDS_PRIVACY_REVIEW"
  }));
  await assert.rejects(recordAccountDeletionReview({
   requestId:request.id,operatorId:admin.id,reasonCode:"APPROVED_DELETE" as never
  }));
  const attempts=await Promise.all([
   recordAccountDeletionReview({requestId:request.id,operatorId:admin.id,
    reasonCode:"FINANCIAL_HOLD_RECORDED"}),
   recordAccountDeletionReview({requestId:request.id,operatorId:admin.id,
    reasonCode:"FINANCIAL_HOLD_RECORDED"}),
   recordAccountDeletionReview({requestId:request.id,operatorId:admin.id,
    reasonCode:"FINANCIAL_HOLD_RECORDED"})
  ]);
  assert.equal(attempts.filter(x=>x==="RECORDED").length,1);
  assert.equal(attempts.filter(x=>x==="ALREADY_RECORDED").length,2);
  assert.equal(await db.accountDeletionReviewEvent.count({
   where:{requestId:request.id}}),1);
  const one=await db.accountDeletionReviewEvent.findFirstOrThrow({
   where:{requestId:request.id}});
  assert.equal(one.operatorId,admin.id);
  assert.equal(one.reasonCode,"FINANCIAL_HOLD_RECORDED");
  const second=await recordAccountDeletionReview({requestId:request.id,operatorId:admin.id,
   reasonCode:"NEEDS_OFFLINE_VERIFICATION"});
  assert.equal(second,"RECORDED");
  const queue=await listAccountDeletionReviewQueue(50);
  const row=queue.find(q=>q.userId===subject.id);
  assert.ok(row);
  assert.equal(row.reviewEvents.length,2);
  assert.equal(row.assessment.canAutoDelete,false);
  const stillPending=await db.accountDeletionRequest.findUniqueOrThrow({where:{id:request.id}});
  assert.equal(stillPending.status,"PENDING_MANUAL_REVIEW");
  assert.ok(await db.user.findUnique({where:{id:subject.id}}));
  const stillPaid=await db.toolOrder.findUniqueOrThrow({where:{id:orderId}});
  assert.equal(stillPaid.status,initialOrder.status);
  assert.equal(stillPaid.amountFen,initialOrder.amountFen);
  assert.equal(await db.accountDeletionReviewEvent.count({where:{
   requestId:{not:request.id}}}),0,"Synthetic disposable database must have no unrelated events");
 }finally{
  if(users.length){
   await db.accountDeletionReviewEvent.deleteMany({where:{operatorId:{in:users}}});
   if(orderId)await db.toolOrder.deleteMany({where:{id:orderId}});
   await db.accountDeletionRequest.deleteMany({where:{userId:{in:users}}});
   await db.user.deleteMany({where:{id:{in:users}}});
  }
  await db.$disconnect();
 }
});
