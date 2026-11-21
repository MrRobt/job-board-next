import "server-only";
import {db} from "../db";
import {product} from "./catalog";
import {prepareMerchantRefund} from "../payment/refund-request-payload";
import {
 liveRefundInquiryGateway,validateRefundInquiry,
 type RefundInquiryGateway,type RefundInquiry
} from "../payment/refund-query";

export type RefundReconciliationResult =
 "SUCCEEDED"|"ALREADY_SUCCEEDED"|"PROCESSING"|"FAILED"|"UNKNOWN";

/**
 * A merchant refund can only become terminal after a signed merchant inquiry.
 * The default gateway performs signature/identity/amount verification. A test
 * gateway may ONLY be injected into isolated integration tests, never a runtime.
 * No refund POST is issued here; IN_DOUBT is not automatically retried.
 */
export async function reconcileDispatchedRefund(
 dispatchId:string,operatorId:string,gateway?:RefundInquiryGateway
):Promise<RefundReconciliationResult>{
 if(gateway&&(process.env.INTEGRATION_TEST_DATABASE!=="true"||
              process.env.NODE_ENV==="production"))
  throw new Error("Test refund gateway injection forbidden");
 if(!dispatchId||dispatchId.length>191)throw new Error("Invalid dispatch ID");
 const operator=await db.user.findUnique({where:{id:operatorId},select:{role:true}});
 if(operator?.role!=="ADMIN")throw new Error("Administrator required");

 const dispatch=await db.toolRefundDispatch.findUnique({
  where:{id:dispatchId},
  include:{intent:{include:{refundCase:true,order:{include:{grant:true}}}}}
 });
 if(!dispatch)throw new Error("Refund dispatch not found");
 const intent=dispatch.intent,order=intent.order,ticket=intent.refundCase;
 if(dispatch.state==="SUCCEEDED"){
  if(order.status==="REFUNDED"&&ticket.status==="SUCCEEDED"&&
     order.grant?.remaining===0&&dispatch.confirmedAt)return "ALREADY_SUCCEEDED";
  throw new Error("Refund terminal ledger is inconsistent");
 }
 if(dispatch.state!=="IN_DOUBT"||!dispatch.claimedAt||!dispatch.claimantId)
  throw new Error("Refund inquiry requires claimed IN_DOUBT outbox");
 if(intent.state!=="APPROVED"||!intent.approvedAt||!intent.approvedById||
    intent.operatorId===intent.approvedById||ticket.status!=="PREPARED"||
    ticket.orderId!==intent.orderId||ticket.userId!==order.userId||
    order.status!=="PAID"||!order.refundHold||order.provider==="MOCK"||!order.grant)
  throw new Error("Refund is not independently approved and safely held");
 const sku=product(order.sku);
 if(!sku||sku.amountFen!==order.amountFen||sku.credits!==order.credits||
    intent.amountFen!==order.amountFen||
    order.grant.total!==order.credits||dispatch.fingerprint!==intent.fingerprint||
    dispatch.outRefundNo!==intent.outRefundNo)
  throw new Error("Refund stored amount or request fingerprint differs");
 const expected=prepareMerchantRefund({
  caseId:intent.caseId,orderId:order.id,provider:order.provider,
  providerTradeId:order.providerTradeId??"",
  originalAmountFen:order.amountFen,refundAmountFen:intent.amountFen,
  reason:intent.reason
 },dispatch.fingerprint);
 if(expected.outRefundNo!==dispatch.outRefundNo)
  throw new Error("Stored merchant refund reference mismatch");
 const prefix=order.provider+":";
 if(!order.providerTradeId?.startsWith(prefix))
  throw new Error("Invalid stored merchant payment identity");
 const inquiry:RefundInquiry={
  orderId:order.id,outRefundNo:dispatch.outRefundNo,
  providerTradeId:order.providerTradeId.slice(prefix.length),
  originalAmountFen:order.amountFen,refundAmountFen:intent.amountFen
 };
 validateRefundInquiry(inquiry);
 const verified=await (gateway??liveRefundInquiryGateway).query(order.provider,inquiry);
 if(verified.provider!==order.provider||verified.orderId!==inquiry.orderId||
    verified.outRefundNo!==inquiry.outRefundNo||
    verified.refundAmountFen!==inquiry.refundAmountFen||
    !["SUCCEEDED","PROCESSING","FAILED","UNKNOWN"].includes(verified.state))
  throw new Error("Merchant inquiry identity or amount mismatch");

 return db.$transaction(async tx=>{
  const current=await tx.toolRefundDispatch.findUniqueOrThrow({
   where:{id:dispatchId},
   include:{intent:{include:{refundCase:true,order:{include:{grant:true}}}}}
  });
  const nowIntent=current.intent,nowOrder=nowIntent.order,nowCase=nowIntent.refundCase;
  if(current.state==="SUCCEEDED"){
   if(nowOrder.status==="REFUNDED"&&nowCase.status==="SUCCEEDED"&&
      nowOrder.grant?.remaining===0&&current.confirmedAt)return "ALREADY_SUCCEEDED";
   throw new Error("Refund terminal ledger inconsistent");
  }
  if(current.state!=="IN_DOUBT"||!current.claimedAt||
      current.claimantId!==dispatch.claimantId||
      current.claimedAt.getTime()!==dispatch.claimedAt!.getTime()||
     nowIntent.id!==intent.id||nowIntent.state!=="APPROVED"||
     nowIntent.fingerprint!==dispatch.fingerprint||
     nowIntent.outRefundNo!==dispatch.outRefundNo||
     nowIntent.amountFen!==intent.amountFen||nowIntent.reason!==intent.reason||
     nowIntent.approvedById!==intent.approvedById||
     nowOrder.id!==order.id||nowOrder.userId!==order.userId||
     nowOrder.provider!==order.provider||
     nowOrder.providerTradeId!==order.providerTradeId||
     nowOrder.amountFen!==order.amountFen||nowOrder.credits!==order.credits||
     nowOrder.status!=="PAID"||!nowOrder.refundHold||
     nowCase.status!=="PREPARED"||nowCase.orderId!==order.id||
     nowCase.userId!==order.userId||!nowOrder.grant||
     nowOrder.grant.total!==order.credits||
     nowOrder.grant.remaining!==order.credits)
   throw new Error("Refund ledger changed since signed inquiry");

  if(verified.state!=="SUCCEEDED"){
   await tx.toolRefundInquiryEvent.create({
    data:{dispatchId,operatorId,observed:verified.state,outcome:"HELD_FOR_REVIEW"}
   });
   return verified.state;
  }
  // The frozen entitlement must be entirely unused, including in-flight work.
  // A refund for a consumed pack is a separate manual/partial-refund process.
  const unsafeRuns=await tx.toolRun.count({
   where:{grantId:nowOrder.grant.id,status:{in:["RESERVED","SUCCEEDED"]}}
  });
  if(unsafeRuns!==0)throw new Error("Paid AI usage requires manual reconciliation");

  const g=await tx.toolGrant.updateMany({
   where:{id:nowOrder.grant.id,total:order.credits,remaining:order.credits},
   data:{remaining:0}
  });
  if(g.count!==1)throw new Error("Concurrent credit consumption");
  const o=await tx.toolOrder.updateMany({
   where:{id:order.id,status:"PAID",refundHold:true},
   data:{status:"REFUNDED"}
  });
  if(o.count!==1)throw new Error("Concurrent refund order transition");
  const c=await tx.toolRefundCase.updateMany({
   where:{id:nowCase.id,status:"PREPARED"},data:{status:"SUCCEEDED"}
  });
  if(c.count!==1)throw new Error("Concurrent refund case transition");
  const d=await tx.toolRefundDispatch.updateMany({
   where:{id:dispatchId,state:"IN_DOUBT"},
   data:{state:"SUCCEEDED",confirmedAt:new Date()}
  });
  if(d.count!==1)throw new Error("Concurrent refund reconciliation");
  await tx.toolRefundInquiryEvent.create({
   data:{dispatchId,operatorId,observed:"SUCCEEDED",outcome:"CREDITS_REVOKED"}
  });
  return "SUCCEEDED";
 },{isolationLevel:"Serializable",maxWait:10_000,timeout:15_000});
}
