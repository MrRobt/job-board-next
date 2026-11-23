import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";
import {requestToolRefund} from "../../lib/career/refund-cases";
import {prepareReviewedRefund} from "../../lib/career/refund-intents";
import {approveRefundIntent} from "../../lib/career/refund-approvals";
import {queueApprovedRefund} from "../../lib/career/refund-dispatch-outbox";
import {assessRefundDispatchIntegrity} from "../../lib/career/refund-dispatch-integrity";

test("B06 admin refund preflight reads actual isolated MySQL relationships without changing ledgers",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true"||process.env.NODE_ENV==="production")
  throw Error("Disposable database required");
 const tag=randomUUID(),users:string[]=[];
 let buyerId="";
 const create=async(label:string,role:"ADMIN"|"USER"="USER")=>{
  const user=await db.user.create({data:{
   email:"b06-integrity-"+label+"-"+tag+"@example.invalid",
   passwordHash:"[REDACTED_SECRET]",role
  }});
  users.push(user.id);return user;
 };
 try{
  const buyer=await create("buyer");buyerId=buyer.id;
  const preparer=await create("preparer","ADMIN");
  const approver=await create("approver","ADMIN");
  const operator=await create("operator","ADMIN");
  const order=await reserveToolOrder(buyer.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"integrity-"+tag,amountFen:990});
  const ticket=await requestToolRefund(buyer.id,order.id,
   "Synthetic refund safety audit, untouched paid credits");
  const intent=await prepareReviewedRefund(ticket.id,preparer.id,
   "Prepared from isolated synthetic order with no successful calls");
  await approveRefundIntent(intent.id,approver.id,
   "Approved by separate operator on isolated test ledger only");
  const dispatch=await queueApprovedRefund(intent.id,operator.id);
  const inspect=async()=>{
   const item=await db.toolRefundDispatch.findUniqueOrThrow({
    where:{id:dispatch.id},include:{intent:{select:{
     state:true,approvedById:true,
     order:{select:{status:true,refundHold:true,credits:true,
      grant:{select:{total:true,remaining:true,runs:{
       where:{status:{in:["RESERVED","SUCCEEDED"]}},select:{id:true},take:1
      }}}}},
     refundCase:{select:{status:true}}
    }}}
   });
   return assessRefundDispatchIntegrity({
    state:item.state,intentState:item.intent.state,
    caseStatus:item.intent.refundCase.status,orderStatus:item.intent.order.status,
    refundHold:item.intent.order.refundHold,credits:item.intent.order.credits,
    grantTotal:item.intent.order.grant?.total??null,
    grantRemaining:item.intent.order.grant?.remaining??null,
    hasReservedOrSuccessfulRun:Boolean(item.intent.order.grant?.runs.length),
    approvedById:item.intent.approvedById,claimedAt:item.claimedAt,
    claimantId:item.claimantId,confirmedAt:item.confirmedAt
   });
  };
  const clean=await inspect();
  assert.equal(clean.status,"PENDING_OPERATOR_REVIEW");
  assert.equal(clean.canAutoSendRefund,false);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  await db.toolRefundDispatch.update({where:{id:dispatch.id},data:{claimedAt:new Date()}});
  const brokenClaim=await inspect();
  assert.equal(brokenClaim.status,"LEDGER_MISMATCH");
  assert.ok(brokenClaim.issues.includes("CLAIM_LIFECYCLE_MISMATCH"));
  await db.toolRefundDispatch.update({where:{id:dispatch.id},data:{
   state:"IN_DOUBT",claimedAt:new Date(),claimantId:operator.id
  }});
  assert.equal((await inspect()).status,"CHANNEL_INQUIRY_REQUIRED");
  const grant=await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}});
  await db.toolGrant.update({where:{id:grant.id},data:{remaining:{decrement:1}}});
  try{
   const brokenCredits=await inspect();
   assert.equal(brokenCredits.status,"LEDGER_MISMATCH");
   assert.ok(brokenCredits.issues.includes("INVALID_CREDIT_LEDGER"));
  }finally{
   await db.toolGrant.update({where:{id:grant.id},data:{remaining:{increment:1}}});
  }
  assert.equal((await inspect()).status,"CHANNEL_INQUIRY_REQUIRED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{id:grant.id}})).remaining,20);
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}})).status,"PREPARED");
  assert.equal(await db.toolRefundInquiryEvent.count({where:{dispatchId:dispatch.id}}),0,
   "Diagnostic reads may never create merchant inquiry evidence");
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
  if(users.length)await db.user.deleteMany({where:{id:{in:users}}});
  await db.$disconnect();
 }
});
