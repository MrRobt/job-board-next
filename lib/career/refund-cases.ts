import "server-only";
import {db} from "../db";

/** This module only records/refuses requests. It NEVER moves money. */
export async function requestToolRefund(userId:string,orderId:string,reason:string){
 const note=reason.trim();
 if(note.length<10||note.length>500)throw new Error("Reason must have 10-500 characters");
 return db.$transaction(async tx=>{
  const updated=await tx.toolOrder.updateMany({
   where:{id:orderId,userId,status:"PAID",refundHold:false,provider:{in:["ALIPAY","WECHAT"]}},
   data:{refundHold:true}
  });
  if(updated.count!==1)throw new Error("Order not eligible or already under review");
  return tx.toolRefundCase.create({
   data:{orderId,userId,reason:note,status:"OPEN"}
  });
 });
}
export async function rejectToolRefund(adminId:string,caseId:string,reason:string){
 const note=reason.trim();
 if(note.length<10||note.length>500)throw new Error("Review explanation required");
 return db.$transaction(async tx=>{
  const admin=await tx.user.findUnique({where:{id:adminId},select:{role:true}});
  if(admin?.role!=="ADMIN")throw new Error("Administrator required");
  const ticket=await tx.toolRefundCase.findUnique({where:{id:caseId}});
  if(!ticket||ticket.status!=="OPEN")throw new Error("Request already handled");
  const reviewed=await tx.toolRefundCase.updateMany({
   where:{id:caseId,status:"OPEN"},
   data:{status:"REJECTED",reviewerId:adminId,reviewReason:note,reviewedAt:new Date()}
  });
  if(reviewed.count!==1)throw new Error("Concurrent review");
  const restored=await tx.toolOrder.updateMany({
   where:{id:ticket.orderId,status:"PAID",refundHold:true},
   data:{refundHold:false}
  });
  if(restored.count!==1)throw new Error("Order state needs manual reconciliation");
  return true;
 });
}
