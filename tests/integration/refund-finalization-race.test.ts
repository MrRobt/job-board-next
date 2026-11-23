import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";
import {requestToolRefund} from "../../lib/career/refund-cases";
import {prepareReviewedRefund} from "../../lib/career/refund-intents";
import {approveRefundIntent} from "../../lib/career/refund-approvals";
import {queueApprovedRefund} from "../../lib/career/refund-dispatch-outbox";
import {reconcileDispatchedRefund} from "../../lib/career/refund-finalization";
import {reserve,finish,available} from "../../lib/career/credits";
import type {RefundInquiryGateway} from "../../lib/payment/refund-query";

test("B06 signed refund reconciliation is single-winner under concurrent reviewers",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true"||process.env.NODE_ENV==="production")
  throw Error("Disposable MySQL only");
 const tag=randomUUID(),ids:string[]=[];
 let buyerId="";
 const person=async(name:string,role:"ADMIN"|"USER"="USER")=>{
  const u=await db.user.create({data:{email:"b06-race-"+tag+name+"@example.invalid",
   passwordHash:"[REDACTED_SECRET]",role}});
  ids.push(u.id);return u;
 };
 try{
  const buyer=await person("buyer");buyerId=buyer.id;
  const maker=await person("maker","ADMIN"),checker=await person("checker","ADMIN");
  const dispatcher=await person("dispatcher","ADMIN");
  const reviewer1=await person("reviewer1","ADMIN"),reviewer2=await person("reviewer2","ADMIN");
  const order=await reserveToolOrder(buyer.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"race-"+tag,amountFen:990});
  const ticket=await requestToolRefund(buyer.id,order.id,
   "Synthetic unused entitlement refund requiring independent review");
  const intent=await prepareReviewedRefund(ticket.id,maker.id,
   "Synthetic full credit ledger, require independent approval");
  await approveRefundIntent(intent.id,checker.id,
   "Second admin confirms unused synthetic credits and internal review");
  const dispatch=await queueApprovedRefund(intent.id,dispatcher.id);
  const paidGrant=await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}});
  assert.equal(paidGrant.remaining,20);
  assert.equal(await available(buyer.id),0,"Held paid credits must be unavailable");

  const use=await reserve(buyer.id,"refund-race-"+tag,"resume");
  if(use.state==="reserved"){
   const run=await db.toolRun.findUniqueOrThrow({where:{id:use.id}});
   assert.notEqual(run.grantId,paidGrant.id,"Frozen paid grant cannot be consumed");
   await finish(run.id,false);
  }
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{id:paidGrant.id}})).remaining,20);

  // A claimed dispatch is seeded directly in this isolated test: no sender,
  // payment/refund API or live-merchant mode is ever enabled.
  await db.toolRefundDispatch.update({where:{id:dispatch.id},data:{
   state:"IN_DOUBT",claimantId:dispatcher.id,claimedAt:new Date()
  }});
  let calls=0,release!:()=>void;
  const bothQueries=new Promise<void>(done=>{release=done;});
  const gateway:RefundInquiryGateway={async query(provider,inquiry){
   calls++;
   assert.equal(provider,"ALIPAY");
   assert.equal(inquiry.orderId,order.id);
   assert.equal(inquiry.outRefundNo,dispatch.outRefundNo);
   assert.equal(inquiry.providerTradeId,"race-"+tag);
   if(calls===2)release();
   await bothQueries;
   return {provider,orderId:inquiry.orderId,outRefundNo:inquiry.outRefundNo,
    refundAmountFen:990,state:"SUCCEEDED" as const};
  }};
  const results=await Promise.allSettled([
   reconcileDispatchedRefund(dispatch.id,reviewer1.id,gateway),
   reconcileDispatchedRefund(dispatch.id,reviewer2.id,gateway)
  ]);
  assert.equal(calls,2,"Both reviewers observed a synthetic verified merchant response");
  assert.equal(results.filter(x=>x.status==="fulfilled"&&x.value==="SUCCEEDED").length,1,
   "Only one refund finalization may win");
  const other=results.find(x=>x.status!=="fulfilled"||x.value!=="SUCCEEDED");
  assert.ok(other,"Second reconciler must not settle twice");
  if(other.status==="fulfilled")assert.equal(other.value,"ALREADY_SUCCEEDED",
   "Second reviewer may only observe the already-settled state");
  assert.equal((await db.toolRefundDispatch.findUniqueOrThrow({where:{id:dispatch.id}})).state,"SUCCEEDED");
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}})).status,"SUCCEEDED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"REFUNDED");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{id:paidGrant.id}})).remaining,0);
  assert.equal(await db.toolRefundInquiryEvent.count({
   where:{dispatchId:dispatch.id,outcome:"CREDITS_REVOKED"}}),1,
   "Only one success audit event allowed");
  assert.equal(await available(buyer.id),1,"Separate free-trial entitlement remains intact");
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer1.id,gateway),"ALREADY_SUCCEEDED");
  assert.equal(calls,2,"No repeat merchant inquiry after terminal success");
 }finally{
  if(buyerId){
   await db.toolRefundInquiryEvent.deleteMany({where:{dispatch:{intent:{order:{userId:buyerId}}}}});
   await db.toolRefundDispatch.deleteMany({where:{intent:{order:{userId:buyerId}}}});
   await db.toolRefundIntent.deleteMany({where:{order:{userId:buyerId}}});
   await db.toolRefundCase.deleteMany({where:{userId:buyerId}});
   await db.toolRun.deleteMany({where:{userId:buyerId}});
   await db.toolGrant.deleteMany({where:{userId:buyerId}});
   await db.toolOrder.deleteMany({where:{userId:buyerId}});
  }
  if(ids.length)await db.user.deleteMany({where:{id:{in:ids}}});
  await db.$disconnect();
 }
});
