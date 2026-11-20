import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment,mockToolOrder} from "../../lib/career/billing";
import {requestToolRefund,rejectToolRefund} from "../../lib/career/refund-cases";
import {available,reserve} from "../../lib/career/credits";

test("refund request freezes only paid entitlements; review can reject with audit, without moving money",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable database required");
 const tag=randomUUID();
 const user=await db.user.create({data:{email:tag+"@example.invalid",passwordHash:"test-only"}});
 const other=await db.user.create({data:{email:tag+"-other@example.invalid",passwordHash:"test-only"}});
 const admin=await db.user.create({data:{email:tag+"-admin@example.invalid",passwordHash:"test-only",role:"ADMIN"}});
 try{
  const order=await reserveToolOrder(user.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:tag,amountFen:990});
  assert.equal(await available(user.id),20);
  const reason="本次数包因使用体验问题申请售后人工处理，请核实权益和实际服务";
  await assert.rejects(requestToolRefund(other.id,order.id,reason));
  await assert.rejects(requestToolRefund(user.id,order.id,"太短"));
  const [first,second]=await Promise.allSettled([requestToolRefund(user.id,order.id,reason),requestToolRefund(user.id,order.id,reason)]);
  assert.equal([first,second].filter(x=>x.status==="fulfilled").length,1,"concurrent requests must create a single active hold");
  const ticket=await db.toolRefundCase.findFirstOrThrow({where:{userId:user.id,orderId:order.id}});
  assert.equal(ticket.status,"OPEN");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).refundHold,true);
  assert.equal(await available(user.id),0,"paid pack must be frozen immediately");
  const trial=await reserve(user.id,randomUUID(),"resume");
  assert.equal(trial.state,"reserved","other usable trial entitlement remains available");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,20,"frozen purchased pack must not be consumed");
  await assert.rejects(rejectToolRefund(user.id,ticket.id,"经过核查决定不予处理该请求"));
  await assert.rejects(rejectToolRefund(admin.id,ticket.id,"短"));
  assert.equal(await available(user.id),0);
  const review="经核实当前申请需用户补充凭证，建议重新提交并提供服务问题说明";
  await rejectToolRefund(admin.id,ticket.id,review);
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}})).reviewReason,review);
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}})).reviewerId,admin.id);
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}})).status,"REJECTED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).refundHold,false);
  assert.equal(await available(user.id),20);
  await assert.rejects(rejectToolRefund(admin.id,ticket.id,review),"duplicate review prohibited");
  assert.equal(await available(user.id),20);
  const mock=await mockToolOrder(user.id,"PRO100",randomUUID());
  await assert.rejects(requestToolRefund(user.id,mock.id,reason),"mock order must not be refunded");
  const next=await requestToolRefund(user.id,order.id,reason);
  assert.notEqual(next.id,ticket.id);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).refundHold,true);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID","submission must not mark funds refunded");
 }finally{
  const ids=[user.id,other.id,admin.id];
  await db.toolRefundCase.deleteMany({where:{userId:user.id}});
  await db.toolRun.deleteMany({where:{userId:user.id}});
  await db.toolGrant.deleteMany({where:{userId:user.id}});
  await db.toolOrder.deleteMany({where:{userId:user.id}});
  await db.user.deleteMany({where:{id:{in:ids}}});
  await db.$disconnect();
 }
});
