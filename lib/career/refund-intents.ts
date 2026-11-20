import "server-only";
import {db} from "../db";
import {product} from "./catalog";
import {assessRefundSnapshot,type RefundSnapshot} from "./refund-preflight";
import {prepareMerchantRefund} from "../payment/refund-request-payload";

/**
 * Record an immutable, manually reviewed refund INTENT before any future
 * merchant request is allowed. This does NOT send a refund or revoke credits.
 * PREPARED is deliberately distinct from PROCESSING (dispatched).
 */
export async function prepareReviewedRefund(caseId:string,operatorId:string,reason:string){
 const note=reason.trim();
 if(note.length<10||[...note].length>80||/[\u0000-\u001f\u007f]/.test(note))
  throw new Error("A specific, safe review reason (10-80 characters) is required");
 return db.$transaction(async tx=>{
  const admin=await tx.user.findUnique({where:{id:operatorId},select:{role:true}});
  if(admin?.role!=="ADMIN")throw new Error("Administrator required");
  const ticket=await tx.toolRefundCase.findUnique({where:{id:caseId}});
  if(!ticket)throw new Error("Refund request not found");
  const order=await tx.toolOrder.findUnique({
   where:{id:ticket.orderId},
   select:{
    id:true,userId:true,sku:true,provider:true,status:true,amountFen:true,
    credits:true,providerTradeId:true,refundHold:true,
    grant:{select:{total:true,remaining:true,runs:{select:{status:true},take:2001}}},
    refundCases:{select:{id:true,status:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:101}
   }
  });
  if(!order||order.userId!==ticket.userId)throw new Error("Refund ownership mismatch");
  if(order.provider==="MOCK")throw new Error("Mock orders cannot be refunded");
  const intentInput={
   caseId:ticket.id,orderId:order.id,provider:order.provider,
   providerTradeId:order.providerTradeId??"",originalAmountFen:order.amountFen,
   refundAmountFen:order.amountFen,reason:note
  };
  const payload=prepareMerchantRefund(intentInput);
  const existing=await tx.toolRefundIntent.findUnique({where:{caseId}});
  if(existing){
   // Retries with exactly the same reviewed request are idempotent.
   // Any changed amount, transaction or reason is a hard conflict.
   if(existing.orderId!==order.id||existing.outRefundNo!==payload.outRefundNo||
      existing.fingerprint!==payload.fingerprint||existing.amountFen!==payload.amountFen)
    throw new Error("Refund preparation conflicts with immutable record");
   if(ticket.status!=="PREPARED"||existing.state!=="PREPARED")
    throw new Error("Refund preparation requires reconciliation");
   return existing;
  }
  const sku=product(order.sku);
  if(!sku||sku.amountFen!==order.amountFen||sku.credits!==order.credits)
   throw new Error("Refund product ledger does not match server catalogue");
  if(order.refundCases.length>100||(order.grant?.runs.length??0)>2000)
   throw new Error("Refund history requires manual ledger reconciliation");
  const latest=order.refundCases[0];
  if(!latest||latest.id!==caseId||latest.status!=="OPEN"||ticket.status!=="OPEN")
   throw new Error("Only the latest open refund request can be prepared");
  const snapshot:RefundSnapshot={
   provider:order.provider,status:order.status,amountFen:order.amountFen,
   credits:order.credits,providerTradeId:order.providerTradeId,refundHold:order.refundHold,
   grant:order.grant?{
    total:order.grant.total,remaining:order.grant.remaining,runs:order.grant.runs
   }:null,
   refundCases:order.refundCases
  };
  const assessed=assessRefundSnapshot(order.id,snapshot);
  if(assessed.review!=="READY_FOR_MANUAL_REVIEW")
   throw new Error("Refund ledger requires manual reconciliation: "+assessed.issues.join(","));
  const changed=await tx.toolRefundCase.updateMany({
   where:{id:caseId,status:"OPEN"},
   data:{status:"PREPARED",reviewerId:operatorId,reviewReason:note,reviewedAt:new Date()}
  });
  if(changed.count!==1)throw new Error("Concurrent refund approval");
  return tx.toolRefundIntent.create({
   data:{
    caseId,orderId:order.id,operatorId,outRefundNo:payload.outRefundNo,
    fingerprint:payload.fingerprint,amountFen:payload.amountFen,reason:payload.reason,
    state:"PREPARED"
   }
  });
 },{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
}
