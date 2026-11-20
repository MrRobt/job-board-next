import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {db} from "../../lib/db";
import {reserveToolOrder,settleToolPayment} from "../../lib/career/billing";
import {requestToolRefund} from "../../lib/career/refund-cases";
import {prepareReviewedRefund} from "../../lib/career/refund-intents";
import {approveRefundIntent} from "../../lib/career/refund-approvals";
import {queueApprovedRefund,claimRefundDispatchOnce} from "../../lib/career/refund-dispatch-outbox";
import {reconcileDispatchedRefund} from "../../lib/career/refund-finalization";
import type {RefundInquiryGateway} from "../../lib/payment/refund-query";
import {available} from "../../lib/career/credits";

test("signed refund inquiry settlement requires confirmed matching refund, atomically revokes unused credits",async()=>{
 if(process.env.INTEGRATION_TEST_DATABASE!=="true")throw new Error("Disposable MySQL required");
 const tag=randomUUID();
 const users:string[]=[];
 const create=async(name:string,role:"ADMIN"|"USER"="USER")=>{
  const u=await db.user.create({data:{email:tag+name+"@example.invalid",passwordHash:"test-only",role}});
  users.push(u.id);return u;
 };
 const buyer=await create("-buyer");
 const preparer=await create("-preparer","ADMIN");
 const approver=await create("-approver","ADMIN");
 const dispatcher=await create("-dispatcher","ADMIN");
 const reviewer=await create("-reviewer","ADMIN");
 const outsider=await create("-outsider");
 const priorReal=process.env.ENABLE_REAL_PAYMENT;
 const priorClaim=process.env.ENABLE_REFUND_DISPATCH_CLAIM;
 const priorQuery=process.env.ENABLE_REFUND_QUERY;
 try{
  const order=await reserveToolOrder(buyer.id,"STARTER20","ALIPAY");
  await settleToolPayment({provider:"ALIPAY",orderId:order.id,tradeId:"final-"+tag,amountFen:990});
  const ticket=await requestToolRefund(buyer.id,order.id,"尚未收到使用服务，要求核对后退款，客服已记录申请");
  const intent=await prepareReviewedRefund(ticket.id,preparer.id,"客服已核对全额未使用，并提交独立人员复核");
  await approveRefundIntent(intent.id,approver.id,"独立审核确认账本完整，允许进入内部待派发队列");
  const dispatch=await queueApprovedRefund(intent.id,dispatcher.id);
  let queryCount=0;
  let observed:"UNKNOWN"|"PROCESSING"|"FAILED"|"SUCCEEDED"="UNKNOWN";
  let mismatch=false;
  const gateway:RefundInquiryGateway={
   async query(provider,inquiry){
    queryCount++;
    assert.equal(provider,"ALIPAY");
    assert.equal(inquiry.providerTradeId,"final-"+tag);
    assert.equal(inquiry.orderId,order.id);
    assert.equal(inquiry.outRefundNo,dispatch.outRefundNo);
    assert.equal(inquiry.originalAmountFen,990);
    assert.equal(inquiry.refundAmountFen,990);
    return {provider,orderId:inquiry.orderId,outRefundNo:inquiry.outRefundNo,
     refundAmountFen:mismatch?991:990,state:observed};
   }
  };
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),/IN_DOUBT/);
  process.env.ENABLE_REAL_PAYMENT="true";
  process.env.ENABLE_REFUND_DISPATCH_CLAIM="true";
  await claimRefundDispatchOnce(dispatch.id,dispatcher.id);
  // Default live gateway cannot query a real merchant without its own gate/keys.
  delete process.env.ENABLE_REFUND_QUERY;
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id),/disabled/);
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,outsider.id,gateway),/Administrator/);
  mismatch=true;
  observed="SUCCEEDED";
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),/mismatch/);
  assert.equal(await db.toolRefundInquiryEvent.count({where:{dispatchId:dispatch.id}}),0);
  mismatch=false;
  observed="PROCESSING";
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"PROCESSING");
  observed="UNKNOWN";
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"UNKNOWN");
  observed="FAILED";
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"FAILED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,20);
  assert.equal((await db.toolRefundDispatch.findUniqueOrThrow({where:{id:dispatch.id}})).state,"IN_DOUBT");
  assert.equal(await db.toolRefundInquiryEvent.count({where:{dispatchId:dispatch.id}}),3);
  const grant=await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}});
  // Even a signed success must NOT revoke credits if the ledger changed.
  await db.toolGrant.update({where:{id:grant.id},data:{remaining:{decrement:1}}});
  observed="SUCCEEDED";
  await assert.rejects(reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),/ledger changed/);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"PAID");
  await db.toolGrant.update({where:{id:grant.id},data:{remaining:{increment:1}}});
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"SUCCEEDED");
  const done=await db.toolRefundDispatch.findUniqueOrThrow({where:{id:dispatch.id}});
  assert.equal(done.state,"SUCCEEDED");
  assert.ok(done.confirmedAt);
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).status,"REFUNDED");
  assert.equal((await db.toolOrder.findUniqueOrThrow({where:{id:order.id}})).refundHold,true);
  assert.equal((await db.toolRefundCase.findUniqueOrThrow({where:{id:ticket.id}})).status,"SUCCEEDED");
  assert.equal((await db.toolGrant.findUniqueOrThrow({where:{orderId:order.id}})).remaining,0);
  assert.equal(await available(buyer.id),0);
  assert.equal(await reconcileDispatchedRefund(dispatch.id,reviewer.id,gateway),"ALREADY_SUCCEEDED");
  assert.equal(await db.toolRefundInquiryEvent.count({where:{dispatchId:dispatch.id}}),4);
  const event=await db.toolRefundInquiryEvent.findFirstOrThrow({
   where:{dispatchId:dispatch.id,outcome:"CREDITS_REVOKED"}
  });
  assert.equal(event.operatorId,reviewer.id);
  assert.equal(event.observed,"SUCCEEDED");
  assert.ok(queryCount>=5);
 }finally{
  if(priorReal===undefined)delete process.env.ENABLE_REAL_PAYMENT;
  else process.env.ENABLE_REAL_PAYMENT=priorReal;
  if(priorClaim===undefined)delete process.env.ENABLE_REFUND_DISPATCH_CLAIM;
  else process.env.ENABLE_REFUND_DISPATCH_CLAIM=priorClaim;
  if(priorQuery===undefined)delete process.env.ENABLE_REFUND_QUERY;
  else process.env.ENABLE_REFUND_QUERY=priorQuery;
  await db.toolRefundInquiryEvent.deleteMany({where:{dispatch:{intent:{order:{userId:buyer.id}}}}});
  await db.toolRefundDispatch.deleteMany({where:{intent:{order:{userId:buyer.id}}}});
  await db.toolRefundIntent.deleteMany({where:{order:{userId:buyer.id}}});
  await db.toolRefundCase.deleteMany({where:{userId:buyer.id}});
  await db.toolRun.deleteMany({where:{userId:buyer.id}});
  await db.toolGrant.deleteMany({where:{userId:buyer.id}});
  await db.toolOrder.deleteMany({where:{userId:buyer.id}});
  await db.user.deleteMany({where:{id:{in:users}}});
  await db.$disconnect();
 }
});
