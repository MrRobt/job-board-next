import "server-only";
import {Prisma} from "@prisma/client";
import {db} from "./db";
import type {DeletionReviewReasonCode} from "./account-deletion-review-event-policy";

/** Append-only, idempotent record of a human's review-routing decision.
 * This does not approve deletion or mutate balances, refunds or user state.
 */
export async function recordAccountDeletionReview(input:{
 requestId:string;operatorId:string;reasonCode:DeletionReviewReasonCode;
}):Promise<"RECORDED"|"ALREADY_RECORDED">{
 if(!/^c[a-z0-9]{20,35}$/.test(input.requestId)||
  !input.operatorId||
  !["NEEDS_PRIVACY_REVIEW","FINANCIAL_HOLD_RECORDED",
    "NEEDS_OFFLINE_VERIFICATION"].includes(input.reasonCode)){
  throw Error("Invalid review input");
 }
 return db.$transaction(async tx=>{
  const [operator,request]=await Promise.all([
   tx.user.findUnique({where:{id:input.operatorId},
    select:{role:true,emailVerifiedAt:true}}),
   tx.accountDeletionRequest.findUnique({where:{id:input.requestId},
    select:{userId:true,status:true}})
  ]);
  if(operator?.role!=="ADMIN"||!operator.emailVerifiedAt||
   request?.status!=="PENDING_MANUAL_REVIEW"||request.userId===input.operatorId){
   throw Error("Review is not authorized");
  }
  const created=await tx.accountDeletionReviewEvent.createMany({
   data:[{requestId:input.requestId,operatorId:input.operatorId,
    reasonCode:input.reasonCode}],
   skipDuplicates:true
  });
  return created.count===1?"RECORDED":"ALREADY_RECORDED";
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}
