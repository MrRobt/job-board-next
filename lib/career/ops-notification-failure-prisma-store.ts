import type {OpsNotificationFailureRow,OpsNotificationFailureStore,OpsNotificationFailureTx} from "./ops-notification-failure";
type Row=Awaited<ReturnType<OpsNotificationFailureTx["read"]>>;
type Update=Parameters<OpsNotificationFailureTx["compareAndSet"]>[1];
type Tx=Readonly<{opsNotificationFailureEvent:{
 create(args:{data:{intentKey:string;attemptCount:number;disposition:"RETRY_WAIT"|"DEAD";failureCode:string}}):Promise<unknown>
};opsIncidentNotificationIntent:{
 findUnique(args:{where:{idempotencyKey:string};select:{
  idempotencyKey:true;state:true;claimToken:true;leaseExpiresAt:true;attemptCount:true
 }}):Promise<Row>;
 updateMany(args:{where:{idempotencyKey:string;state:OpsNotificationFailureRow["state"];claimToken:string|null;leaseExpiresAt:Date|null;attemptCount:number};data:Update}):Promise<{count:number}>;
}}>;
export type OpsNotificationFailurePrismaPort=Readonly<{
 $transaction<T>(fn:(tx:Tx)=>Promise<T>,options:{isolationLevel:"Serializable";maxWait:number;timeout:number}):Promise<T>;
}>;
export function createPrismaOpsNotificationFailureStore(db:OpsNotificationFailurePrismaPort):OpsNotificationFailureStore{
 return {transaction(fn){
  return db.$transaction(tx=>fn({
   read(key){return tx.opsIncidentNotificationIntent.findUnique({
    where:{idempotencyKey:key},
    select:{idempotencyKey:true,state:true,claimToken:true,leaseExpiresAt:true,attemptCount:true}
   })},
   async compareAndSet(previous,update){
    const changed=await tx.opsIncidentNotificationIntent.updateMany({
     where:{idempotencyKey:previous.idempotencyKey,state:previous.state,
      claimToken:previous.claimToken,leaseExpiresAt:previous.leaseExpiresAt,
      attemptCount:previous.attemptCount},
     data:update
    });if(changed.count===1){
      await tx.opsNotificationFailureEvent.create({data:{
       intentKey:previous.idempotencyKey,attemptCount:previous.attemptCount,
       disposition:update.state,failureCode:update.failureCode
      }});
     }
     return changed.count;
   }
  }),{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
 }};
}
