import type {DeadReviewStore,DeadReviewTx} from "./ops-notification-dead-review";
type Review=Awaited<ReturnType<DeadReviewTx["existing"]>>;
type Tx=Readonly<{
 user:{findUnique(args:{where:{id:string};select:{role:true}}):Promise<{role:string}|null>};
 opsIncidentNotificationIntent:{findUnique(args:{where:{idempotencyKey:string};select:{state:true}}):Promise<{state:string}|null>};
 opsNotificationDeadReview:{
  findUnique(args:{where:{intentKey:string};select:{operatorId:true;reasonCode:true}}):Promise<Review>;
  create(args:{data:{intentKey:string;operatorId:string;reasonCode:string;reviewedAt:Date}}):Promise<unknown>;
 };
}>;
export type DeadReviewPrismaPort=Readonly<{
 $transaction<T>(fn:(tx:Tx)=>Promise<T>,options:{isolationLevel:"Serializable";maxWait:number;timeout:number}):Promise<T>
}>;
export function createPrismaDeadReviewStore(db:DeadReviewPrismaPort):DeadReviewStore{
 return {transaction(fn){
  return db.$transaction(tx=>fn({
   async operatorRole(operatorId){
    const user=await tx.user.findUnique({where:{id:operatorId},select:{role:true}});
    return user?.role??null;
   },
   task(key){return tx.opsIncidentNotificationIntent.findUnique({
    where:{idempotencyKey:key},select:{state:true}
   })},
   existing(key){return tx.opsNotificationDeadReview.findUnique({
    where:{intentKey:key},select:{operatorId:true,reasonCode:true}
   })},
   async insert(data){await tx.opsNotificationDeadReview.create({data})}
  }),{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
 }};
}
