import "server-only";
import {db} from "../db";
import {claimRefundDispatchOnce} from "./refund-dispatch-outbox";
import {prepareMerchantRefund,type MerchantRefundIntent} from "../payment/refund-request-payload";
import {
 liveRefundSubmissionGateway,refundSubmissionEnabled,type RefundSubmissionGateway
} from "../payment/refund-submit";

/**
 * One-shot attempt. A durable claim is committed BEFORE network I/O.
 * Any exception/timeout leaves the outbox IN_DOUBT: never automatically
 * retry a POST, even when we do not know whether bytes reached the merchant.
 * Financial settlement is exclusively via a separately verified GET inquiry.
 */
export async function submitPreparedRefundOnce(
 dispatchId:string,operatorId:string,gateway?:RefundSubmissionGateway
):Promise<"IN_DOUBT">{
 if(gateway&&(process.env.INTEGRATION_TEST_DATABASE!=="true"||
              process.env.NODE_ENV==="production"))
  throw new Error("Refund sender test gateway injection forbidden");
 const before=await db.toolRefundDispatch.findUnique({
  where:{id:dispatchId},include:{intent:{include:{order:true}}}
 });
 if(!before||
    (before.intent.order.provider!=="ALIPAY"&&before.intent.order.provider!=="WECHAT"))
  throw new Error("Unsupported or missing refund dispatch");
 if(!refundSubmissionEnabled(before.intent.order.provider))
  throw new Error("Refund submission disabled");

 // The one-time claim validates ADMIN, separate approval, full unused ledger,
 // immutable refund identity and READY -> IN_DOUBT with Serializable isolation.
 const claim=await claimRefundDispatchOnce(dispatchId,operatorId);
 const attempt=await db.toolRefundDispatch.findUniqueOrThrow({
  where:{id:dispatchId},
  include:{intent:{include:{order:true}}}
 });
 const intent=attempt.intent,order=intent.order;
 if(attempt.state!=="IN_DOUBT"||attempt.claimantId!==operatorId||
    claim.outRefundNo!==attempt.outRefundNo||
    claim.fingerprint!==attempt.fingerprint||claim.orderId!==order.id||
    claim.amountFen!==intent.amountFen||
    intent.fingerprint!==attempt.fingerprint||intent.outRefundNo!==attempt.outRefundNo||
    order.status!=="PAID"||!order.refundHold||order.provider==="MOCK")
  throw new Error("Refund dispatch changed after claim; signed inquiry required");
 const details:MerchantRefundIntent={
  caseId:intent.caseId,orderId:order.id,provider:order.provider,
  providerTradeId:order.providerTradeId??"",
  originalAmountFen:order.amountFen,refundAmountFen:intent.amountFen,
  reason:intent.reason
 };
 const prepared=prepareMerchantRefund(details,attempt.fingerprint);
 if(prepared.outRefundNo!==claim.outRefundNo)throw new Error("Refund request identity changed; inquiry required");

 let observed:"ACKNOWLEDGED"|"UNCERTAIN"="UNCERTAIN";
 try{
  observed=await (gateway??liveRefundSubmissionGateway).submit(details,claim.fingerprint);
 }catch{
  // Merchant may have received the POST even on HTTP timeout/connection error.
  // No retry or refund-state mutation occurs here.
  await db.toolRefundInquiryEvent.create({
   data:{dispatchId,operatorId,observed:"UNCERTAIN",outcome:"REQUIRES_QUERY"}
  });
  throw new Error("Refund submission outcome uncertain; signed merchant inquiry required");
 }
 await db.toolRefundInquiryEvent.create({
  data:{dispatchId,operatorId,observed,outcome:"REQUIRES_QUERY"}
 });
 // An accepted API response does not imply refunded funds.
 return "IN_DOUBT";
}
