import type {OpsNotificationPreflightStore,OpsNotificationPreflightTx} from "./ops-notification-preflight";
type Intent=Awaited<ReturnType<OpsNotificationPreflightTx["readIntent"]>>;
type Incident=Awaited<ReturnType<OpsNotificationPreflightTx["readIncident"]>>;
type Tx=Readonly<{
 opsIncidentNotificationIntent:{
  findUnique(args:{where:{idempotencyKey:string};select:{idempotencyKey:true;incidentKey:true;episodeOpenedAt:true;state:true;claimToken:true;leaseExpiresAt:true;attemptCount:true}}):Promise<Intent>
 };
 opsAlertIncident:{
  findUnique(args:{where:{key:string};select:{state:true;openedAt:true;count:true}}):Promise<Incident>
 };
}>;
export type OpsNotificationPreflightPrismaPort=Readonly<{
 $transaction<T>(fn:(tx:Tx)=>Promise<T>,options:{isolationLevel:"Serializable";maxWait:number;timeout:number}):Promise<T>
}>;
/** No mutable delegates and no network / sender capability in this port. */
export function createPrismaOpsNotificationPreflightStore(db:OpsNotificationPreflightPrismaPort):OpsNotificationPreflightStore{
 return {transaction(fn){
  return db.$transaction(tx=>fn({
   readIntent(key){return tx.opsIncidentNotificationIntent.findUnique({
    where:{idempotencyKey:key},
    select:{idempotencyKey:true,incidentKey:true,episodeOpenedAt:true,state:true,claimToken:true,leaseExpiresAt:true,attemptCount:true}
   })},
   readIncident(key){return tx.opsAlertIncident.findUnique({
    where:{key},select:{state:true,openedAt:true,count:true}
   })}
  }),{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
 }};
}
