import "server-only";
import {db} from "../db";
import {product} from "./catalog";
import {prepareMerchantRefund} from "../payment/refund-request-payload";

/**
 * Durable pre-send outbox only. Neither method performs a merchant request,
 * marks a refund successful, nor changes credit balances.
 */
export async function queueApprovedRefund(intentId:string,operatorId:string){
 return db.$transaction(async tx=>{
  const admin=await tx.user.findUnique({where:{id:operatorId},select:{role:true}});
  if(admin?.role!=="ADMIN")throw new Error("Administrator required");
  const intent=await tx.toolRefundIntent.findUnique({where:{id:intentId}});
  if(!intent||intent.state!=="APPROVED"||!intent.approvedById||!intent.approvedAt)
   throw new Error("Independent refund approval required");
  if(intent.operatorId===intent.approvedById)throw new Error("Invalid two-person approval");
  const ticket=await tx.toolRefundCase.findUnique({where:{id:intent.caseId}});
  if(!ticket||ticket.orderId!==intent.orderId||ticket.status!=="PREPARED")
   throw new Error("Refund case not prepared");
  const order=await tx.toolOrder.findUnique({
   where:{id:intent.orderId},select:{
    userId:true,sku:true,provider:true,providerTradeId:true,status:true,
    refundHold:true,amountFen:true,credits:true,
    grant:{select:{id:true,total:true,remaining:true}}
   }
  });
  if(!order||order.userId!==ticket.userId||order.status!=="PAID"||
     !order.refundHold||order.provider==="MOCK"||!order.grant)
   throw new Error("Refund order not safely frozen");
  const sku=product(order.sku);
  if(!sku||sku.amountFen!==order.amountFen||sku.credits!==order.credits||
     order.grant.total!==order.credits||order.grant.remaining!==order.credits||
     intent.amountFen!==order.amountFen)throw new Error("Refund amount or credit ledger mismatch");
  const inUse=await tx.toolRun.count({
   where:{grantId:order.grant.id,status:{in:["RESERVED","SUCCEEDED"]}}
  });
  if(inUse>0)throw new Error("AI calls need separate refund review");
  const expected=prepareMerchantRefund({
   caseId:intent.caseId,orderId:intent.orderId,provider:order.provider,
   providerTradeId:order.providerTradeId??"",
   originalAmountFen:order.amountFen,refundAmountFen:intent.amountFen,
   reason:intent.reason
  },intent.fingerprint);
  if(expected.outRefundNo!==intent.outRefundNo)
   throw new Error("Persisted refund identity mismatch");
  const existing=await tx.toolRefundDispatch.findUnique({where:{intentId}});
  if(existing){
   if(existing.outRefundNo!==intent.outRefundNo||
      existing.fingerprint!==intent.fingerprint)
    throw new Error("Immutable dispatch identity conflict");
   return existing; // identical retries never enqueue a second request
  }
  return tx.toolRefundDispatch.create({
   data:{intentId,outRefundNo:intent.outRefundNo,fingerprint:intent.fingerprint,state:"READY"}
  });
 },{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
}

/**
 * The first authorized caller moves READY -> IN_DOUBT *before* any network call.
 * It is intentionally never automatically reclaimable. Even a crash before
 * sending needs signed merchant inquiry and manual reconciliation.
 * This function ONLY claims the record, it never executes payment/refund IO.
 */
export async function claimRefundDispatchOnce(dispatchId:string,operatorId:string){
 if(process.env.ENABLE_REAL_PAYMENT!=="true"||
    process.env.ENABLE_REFUND_DISPATCH_CLAIM!=="true")
   throw new Error("Refund dispatch claiming disabled");
 return db.$transaction(async tx=>{
  const admin=await tx.user.findUnique({where:{id:operatorId},select:{role:true}});
  if(admin?.role!=="ADMIN")throw new Error("Administrator required");
  const dispatch=await tx.toolRefundDispatch.findUnique({
   where:{id:dispatchId},
   include:{intent:{include:{refundCase:true,order:{include:{grant:true}}}}}
  });
  if(!dispatch||dispatch.state!=="READY")throw new Error("Dispatch requires inquiry, not retry");
  const intent=dispatch.intent,order=intent.order;
  if(intent.state!=="APPROVED"||!intent.approvedById||!intent.approvedAt||
     intent.operatorId===intent.approvedById||
     intent.outRefundNo!==dispatch.outRefundNo||
     intent.fingerprint!==dispatch.fingerprint||
     intent.refundCase.status!=="PREPARED"||
     intent.refundCase.orderId!==order.id||
     intent.refundCase.userId!==order.userId||
     order.status!=="PAID"||!order.refundHold||order.provider==="MOCK"||!order.grant||
     order.grant.remaining!==order.grant.total||order.grant.total!==order.credits)
    throw new Error("Dispatch no longer safely authorized");
  const sku=product(order.sku);
  if(!sku||sku.amountFen!==order.amountFen||sku.credits!==order.credits||
     intent.amountFen!==order.amountFen)
   throw new Error("Dispatch amount no longer matches server catalogue");
  const expected=prepareMerchantRefund({
   caseId:intent.caseId,orderId:order.id,provider:order.provider,
   providerTradeId:order.providerTradeId??"",
   originalAmountFen:order.amountFen,refundAmountFen:intent.amountFen,
   reason:intent.reason
  },intent.fingerprint);
  if(expected.outRefundNo!==dispatch.outRefundNo)
   throw new Error("Dispatch merchant request number changed");
  const outstanding=await tx.toolRun.count({
   where:{grantId:order.grant.id,status:{in:["RESERVED","SUCCEEDED"]}}
  });
  if(outstanding!==0)throw new Error("Refund has unsettled AI use");
  const changed=await tx.toolRefundDispatch.updateMany({
   where:{id:dispatchId,state:"READY"},
   data:{state:"IN_DOUBT",claimantId:operatorId,claimedAt:new Date()}
  });
  if(changed.count!==1)throw new Error("Already claimed; merchant inquiry required");
  return {outRefundNo:dispatch.outRefundNo,orderId:intent.orderId,
   fingerprint:dispatch.fingerprint,amountFen:intent.amountFen};
 },{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
}
