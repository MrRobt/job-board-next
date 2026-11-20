import "server-only";
import {db} from "../db";
import {product} from "./catalog";
import {prepareMerchantRefund} from "../payment/refund-request-payload";

/**
 * Approves a *prepared* refund intent internally after a second administrator
 * rechecks the frozen order and complete credit ledger. Does NOT dispatch funds.
 * A matching second request is idempotent. Different approver/reason is denied.
 */
export async function approveRefundIntent(intentId:string,approverId:string,reason:string){
 const note=reason.trim();
 if(note.length<10||note.length>500||/[\u0000-\u001f\u007f]/.test(note))
  throw new Error("Approval reason must contain 10-500 safe characters");
 return db.$transaction(async tx=>{
  const admin=await tx.user.findUnique({where:{id:approverId},select:{role:true}});
  if(admin?.role!=="ADMIN")throw new Error("Administrator required");
  const intent=await tx.toolRefundIntent.findUnique({where:{id:intentId}});
  if(!intent)throw new Error("Refund intent not found");
  if(intent.operatorId===approverId)throw new Error("Independent second administrator required");
  if(intent.state==="APPROVED"){
   if(intent.approvedById===approverId&&intent.approvalReason===note)return intent;
   throw new Error("Refund intent already approved with different evidence");
  }
  if(intent.state!=="PREPARED")throw new Error("Refund intent not eligible");
  const ticket=await tx.toolRefundCase.findUnique({where:{id:intent.caseId}});
  if(!ticket||ticket.status!=="PREPARED"||ticket.orderId!==intent.orderId)
   throw new Error("Refund ticket no longer prepared");
  const order=await tx.toolOrder.findUnique({
   where:{id:intent.orderId},
   select:{
    id:true,userId:true,sku:true,provider:true,providerTradeId:true,
    status:true,refundHold:true,amountFen:true,credits:true,
    grant:{select:{id:true,total:true,remaining:true}},
    refundCases:{orderBy:[{createdAt:"desc"},{id:"desc"}],take:1,select:{id:true}}
   }
  });
  if(!order||order.userId!==ticket.userId||order.status!=="PAID"||
     !order.refundHold||order.provider==="MOCK"||!order.grant||
     order.refundCases[0]?.id!==intent.caseId)
   throw new Error("Refund order not safely frozen");
  const sku=product(order.sku);
  if(!sku||sku.amountFen!==order.amountFen||sku.credits!==order.credits||
     order.grant.total!==order.credits||order.grant.remaining!==order.credits||
     intent.amountFen!==order.amountFen)
   throw new Error("Refund entitlement or amount mismatch");
  const liveRuns=await tx.toolRun.count({
   where:{grantId:order.grant.id,status:{in:["SUCCEEDED","RESERVED"]}}
  });
  if(liveRuns!==0)throw new Error("Refund requires manual review of AI usage");
  const expected=prepareMerchantRefund({
   caseId:intent.caseId,orderId:order.id,provider:order.provider,
   providerTradeId:order.providerTradeId??"",originalAmountFen:order.amountFen,
   refundAmountFen:intent.amountFen,reason:intent.reason
  },intent.fingerprint);
  if(intent.outRefundNo!==expected.outRefundNo)
   throw new Error("Refund request identifier changed");
  const changed=await tx.toolRefundIntent.updateMany({
   where:{id:intent.id,state:"PREPARED",approvedById:null},
   data:{state:"APPROVED",approvedById:approverId,approvedAt:new Date(),approvalReason:note}
  });
  if(changed.count!==1)throw new Error("Concurrent approval; reload");
  return tx.toolRefundIntent.findUniqueOrThrow({where:{id:intent.id}});
 },{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
}
