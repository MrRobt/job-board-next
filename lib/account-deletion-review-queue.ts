import "server-only";
import {db} from "./db";
import {assessDeletionReviewExposure,type DeletionExposure} from "./account-deletion-review-policy";

export type AccountDeletionQueueRow={
 requestId:string;userId:string;maskedEmail:string;requestedAt:Date;
 reviewEvents:{reasonCode:string;recordedAt:Date}[];
 assessment:ReturnType<typeof assessDeletionReviewExposure>;
 exposure:DeletionExposure;
};
const initial=():DeletionExposure=>({
 realToolOrders:0,pendingToolOrders:0,legacyOrders:0,refundCases:0,
 refundIntents:0,refundDispatches:0,reservedRuns:0,activeGrants:0,applications:0
});
const maskedEmail=(email:string)=>{
 const at=email.indexOf("@");
 return at>0?email.slice(0,1)+"***"+email.slice(at):"***";
};

/** Batched, read-only risk evidence. Even a clear result is NOT approval to delete. */
export async function listAccountDeletionReviewQueue(limit=20):Promise<AccountDeletionQueueRow[]>{
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new Error("Invalid bounded queue limit");
 const pending=await db.accountDeletionRequest.findMany({
  where:{status:"PENDING_MANUAL_REVIEW"},
  orderBy:[{requestedAt:"asc"},{id:"asc"}],take:limit,
  select:{id:true,userId:true,requestedAt:true,user:{select:{email:true}},
   reviewEvents:{select:{reasonCode:true,recordedAt:true},orderBy:{recordedAt:"asc"},take:3}}
 });
 if(!pending.length)return [];
 const ids=pending.map(row=>row.userId);
 const [toolOrders,legacyOrders,refundCases,refundIntents,reservedRuns,activeGrants,applications]=await Promise.all([
  db.toolOrder.groupBy({by:["userId","provider","status"],
   where:{userId:{in:ids}},_count:{_all:true}}),
  db.order.groupBy({by:["userId"],where:{userId:{in:ids}},_count:{_all:true}}),
  db.toolRefundCase.groupBy({by:["userId"],where:{userId:{in:ids}},_count:{_all:true}}),
  db.toolRefundIntent.findMany({where:{order:{userId:{in:ids}}},
   select:{order:{select:{userId:true}},dispatch:{select:{state:true}}}}),
  db.toolRun.groupBy({by:["userId"],
   where:{userId:{in:ids},status:"RESERVED"},_count:{_all:true}}),
  db.toolGrant.groupBy({by:["userId"],
   where:{userId:{in:ids},remaining:{gt:0}},_count:{_all:true}}),
  db.application.groupBy({by:["userId"],where:{userId:{in:ids}},_count:{_all:true}})
 ]);
 const byUser=new Map(ids.map(id=>[id,initial()]));
 for(const entry of toolOrders){
  const x=byUser.get(entry.userId);
  if(!x)continue;
  if(entry.provider!=="MOCK")x.realToolOrders+=entry._count._all;
  if(entry.status==="PENDING")x.pendingToolOrders+=entry._count._all;
 }
 for(const entry of legacyOrders)byUser.get(entry.userId)!.legacyOrders+=entry._count._all;
 for(const entry of refundCases)byUser.get(entry.userId)!.refundCases+=entry._count._all;
 for(const entry of refundIntents){
  const x=byUser.get(entry.order.userId);
  if(!x)continue;
  x.refundIntents++;
  if(entry.dispatch)x.refundDispatches++;
 }
 for(const entry of reservedRuns)byUser.get(entry.userId)!.reservedRuns+=entry._count._all;
 for(const entry of activeGrants)byUser.get(entry.userId)!.activeGrants+=entry._count._all;
 for(const entry of applications)byUser.get(entry.userId)!.applications+=entry._count._all;
 return pending.map(row=>{
  const exposure=byUser.get(row.userId)!;
  return {requestId:row.id,userId:row.userId,maskedEmail:maskedEmail(row.user.email),
   requestedAt:row.requestedAt,reviewEvents:row.reviewEvents,
   exposure,assessment:assessDeletionReviewExposure(exposure)};
 });
}
