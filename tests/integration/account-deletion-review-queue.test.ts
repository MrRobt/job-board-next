import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {requestAccountDeletionReview} from "../../lib/account-deletion-requests";
import {listAccountDeletionReviewQueue} from "../../lib/account-deletion-review-queue";

test("U01 review queue is read-only, batched, tenant-scoped and blocks financial/operational exposure",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable database required");
 const ids:string[]=[];
 const orderIds:string[]=[];
 try{
  const users=await Promise.all(["finance","inflight","private"].map(label=>
   db.user.create({data:{
    email:"u01-review-"+label+"-"+randomUUID()+"@example.invalid",
    passwordHash:"placeholder",emailVerifiedAt:new Date()
   }})
  ));
  ids.push(...users.map(u=>u.id));
  for(const user of users)await requestAccountDeletionReview(user.id);
  const realOrder=randomUUID().replace(/-/g,"").slice(0,32);
  const mockOrder=randomUUID().replace(/-/g,"").slice(0,32);
  orderIds.push(realOrder,mockOrder);
  await db.toolOrder.createMany({data:[
   {id:realOrder,userId:users[0].id,sku:"STARTER20",credits:20,amountFen:990,provider:"ALIPAY",status:"PAID"},
   {id:mockOrder,userId:users[1].id,sku:"STARTER20",credits:20,amountFen:990,provider:"MOCK",status:"PAID"}
  ]});
  await db.toolRefundCase.create({data:{
   userId:users[0].id,orderId:realOrder,reason:"Synthetic refund review evidence",
   status:"OPEN"
  }});
  const grant=await db.toolGrant.create({data:{
   userId:users[1].id,orderId:mockOrder,total:20,remaining:19
  }});
  await db.toolRun.create({data:{
   userId:users[1].id,grantId:grant.id,
   requestId:"u01-"+randomUUID(),kind:"RESUME",status:"RESERVED"
  }});
  await db.application.create({data:{
   userId:users[2].id,title:"Synthetic application",
   company:"Example",notes:"Synthetic"
  }});
  const before=await Promise.all([
   db.toolOrder.count({where:{userId:{in:ids}}}),
   db.toolRefundCase.count({where:{userId:users[0].id}}),
   db.toolRun.count({where:{userId:users[1].id}})
  ]);
  const queue=await listAccountDeletionReviewQueue(50);
  const finance=queue.find(x=>x.userId===users[0].id);
  const inflight=queue.find(x=>x.userId===users[1].id);
  const personal=queue.find(x=>x.userId===users[2].id);
  assert.ok(finance&&inflight&&personal);
  assert.equal(finance.assessment.disposition,"FINANCIAL_HOLD");
  assert.equal(finance.exposure.realToolOrders,1);
  assert.equal(finance.exposure.refundCases,1);
  assert.equal(inflight.assessment.disposition,"OPERATIONAL_HOLD");
  assert.equal(inflight.exposure.reservedRuns,1);
  assert.equal(inflight.exposure.activeGrants,1);
  assert.equal(personal.assessment.disposition,"MANUAL_REVIEW");
  assert.equal(personal.exposure.applications,1);
  for(const row of [finance,inflight,personal]){
   assert.equal(row.assessment.canAutoDelete,false);
   assert.match(row.maskedEmail,/\*\*\*/);
   assert.ok(!row.maskedEmail.includes("u01-review-"));
  }
  assert.deepEqual(await Promise.all([
   db.toolOrder.count({where:{userId:{in:ids}}}),
   db.toolRefundCase.count({where:{userId:users[0].id}}),
   db.toolRun.count({where:{userId:users[1].id}})
  ]),before,"Reading the queue cannot mutate evidence");
  await assert.rejects(listAccountDeletionReviewQueue(0),/limit/);
  await assert.rejects(listAccountDeletionReviewQueue(51),/limit/);
 }finally{
  if(ids.length){
   await db.toolRun.deleteMany({where:{userId:{in:ids}}});
   await db.toolRefundCase.deleteMany({where:{userId:{in:ids}}});
   await db.toolGrant.deleteMany({where:{userId:{in:ids}}});
   await db.application.deleteMany({where:{userId:{in:ids}}});
   if(orderIds.length)await db.toolOrder.deleteMany({where:{id:{in:orderIds}}});
   await db.accountDeletionRequest.deleteMany({where:{userId:{in:ids}}});
   await db.user.deleteMany({where:{id:{in:ids}}});
  }
  await db.$disconnect();
 }
});
