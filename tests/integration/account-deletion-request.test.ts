import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {requestAccountDeletionReview} from "../../lib/account-deletion-requests";

test("U01 deletion review remains idempotent, retains simulated order and cannot hard-delete User",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable database required");
 const ids:string[]=[];
 let orderId:string|null=null;
 try{
  const user=await db.user.create({data:{
   email:"u01-closure-"+randomUUID()+"@example.invalid",passwordHash:"placeholder",
   emailVerifiedAt:new Date()
  }});
  ids.push(user.id);
  const other=await db.user.create({data:{
   email:"u01-other-"+randomUUID()+"@example.invalid",passwordHash:"placeholder"
  }});
  ids.push(other.id);
  orderId=randomUUID().replace(/-/g,"").slice(0,32);
  await db.toolOrder.create({data:{
   id:orderId,userId:user.id,sku:"STARTER20",amountFen:990,
   credits:20,provider:"MOCK",status:"PAID"
  }});
  const before=await db.toolOrder.findUniqueOrThrow({where:{id:orderId}});
  const requests=await Promise.all([
   requestAccountDeletionReview(user.id),
   requestAccountDeletionReview(user.id),
   requestAccountDeletionReview(user.id)
  ]);
  assert.equal(new Set(requests.map(x=>x.id)).size,1);
  assert.equal(requests[0].status,"PENDING_MANUAL_REVIEW");
  assert.equal(await db.accountDeletionRequest.count({where:{userId:user.id}}),1);
  assert.equal(await db.accountDeletionRequest.count({where:{userId:other.id}}),0);
  const after=await db.toolOrder.findUniqueOrThrow({where:{id:orderId}});
  assert.equal(after.status,before.status);
  assert.equal(after.amountFen,before.amountFen);
  assert.equal((await db.user.findUniqueOrThrow({where:{id:user.id}})).email,user.email);
  await assert.rejects(db.user.delete({where:{id:user.id}}),/P2003|Foreign key/i);
  assert.equal(await db.accountDeletionRequest.count({where:{userId:user.id}}),1);
 }finally{
  if(orderId)await db.toolOrder.deleteMany({where:{id:orderId}});
  if(ids.length){
   await db.accountDeletionRequest.deleteMany({where:{userId:{in:ids}}});
   await db.user.deleteMany({where:{id:{in:ids}}});
  }
  await db.$disconnect();
 }
});
