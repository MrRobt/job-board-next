import "server-only";
import {db} from "../db";
import {assessRefundSnapshot,type RefundPreflight,type RefundSnapshot} from "./refund-preflight";

/**
 * Authorized, read-only view of the actual refund ledger.
 * Advisory only: no merchant call, funds movement or entitlement mutation.
 */
export async function inspectRefundPreflight(orderId:string,adminId:string):Promise<RefundPreflight>{
 if(!/^T[a-f0-9]{30}$/.test(orderId))throw new Error("Invalid refund order");
 return db.$transaction(async tx=>{
  const operator=await tx.user.findUnique({where:{id:adminId},select:{role:true}});
  if(operator?.role!=="ADMIN")throw new Error("Administrator required");
  const order=await tx.toolOrder.findUnique({
   where:{id:orderId},
   select:{
    provider:true,status:true,amountFen:true,credits:true,providerTradeId:true,refundHold:true,
    grant:{select:{total:true,remaining:true,runs:{select:{status:true},take:2001}}},
    refundCases:{select:{status:true},orderBy:[{createdAt:"desc"},{id:"desc"}],take:101}
   }
  });
  if(!order)throw new Error("Refund order not found");
  // A truncated run or request history could hide consumed credits or a previous
  // processing request. Refuse an incomplete assessment rather than permitting it.
  if((order.grant?.runs.length??0)>2000||order.refundCases.length>100){
   throw new Error("Refund history exceeds bounded assessment; manual ledger reconciliation required");
  }
  const snapshot:RefundSnapshot={
   provider:order.provider,status:order.status,amountFen:order.amountFen,credits:order.credits,
   providerTradeId:order.providerTradeId,refundHold:order.refundHold,
   grant:order.grant?{total:order.grant.total,remaining:order.grant.remaining,runs:order.grant.runs}:null,
   refundCases:order.refundCases
  };
  return assessRefundSnapshot(orderId,snapshot);
 },{isolationLevel:"RepeatableRead",maxWait:10000,timeout:15000});
}
