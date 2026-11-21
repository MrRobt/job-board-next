/** Internal review only: never requeues DEAD notifications, never sends. */
export type DeadReviewTx=Readonly<{
 operatorRole(operatorId:string):Promise<string|null>;
 task(key:string):Promise<{state:string}|null>;
 existing(key:string):Promise<{operatorId:string;reasonCode:string}|null>;
 insert(row:{intentKey:string;operatorId:string;reasonCode:string;reviewedAt:Date}):Promise<void>;
}>;
export type DeadReviewStore=Readonly<{transaction<T>(fn:(tx:DeadReviewTx)=>Promise<T>):Promise<T>}>;
export type DeadReviewResult="REVIEWED"|"ALREADY_REVIEWED"|"NOT_DEAD";
export async function reviewDeadOpsNotification(
 store:DeadReviewStore,
 request:{key:string;operatorId:string;reasonCode:string},now:Date
):Promise<DeadReviewResult>{
 if(!/^[a-f0-9]{64}$/.test(request.key)||
  !/^[a-zA-Z0-9_-]{1,191}$/.test(request.operatorId)||
  !/^[A-Z][A-Z0-9_]{1,39}$/.test(request.reasonCode)||
  !(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("Invalid dead review request");
 return store.transaction(async tx=>{
  if(await tx.operatorRole(request.operatorId)!=="ADMIN")throw Error("Administrator required");
  const task=await tx.task(request.key);
  if(!task||task.state!=="DEAD")return "NOT_DEAD";
  const existing=await tx.existing(request.key);
  if(existing){
   if(existing.operatorId===request.operatorId&&existing.reasonCode===request.reasonCode)
    return "ALREADY_REVIEWED";
   throw Error("Dead notification already reviewed by another decision");
  }
  await tx.insert({intentKey:request.key,operatorId:request.operatorId,
   reasonCode:request.reasonCode,reviewedAt:now});
  return "REVIEWED";
 });
}
