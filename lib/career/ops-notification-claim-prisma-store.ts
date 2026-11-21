import type {OpsNotificationLeaseRow,OpsNotificationLeaseIncident,OpsNotificationLeaseStore} from "./ops-notification-claim";

type Tx=Readonly<{
 opsIncidentNotificationIntent:{
  findUnique(args:{where:{idempotencyKey:string};select:{idempotencyKey:true;state:true;incidentKey:true;episodeOpenedAt:true;attemptCount:true;claimToken:true;leaseExpiresAt:true}}):Promise<OpsNotificationLeaseRow|null>;
  updateMany(args:{
   where:{idempotencyKey:string;state:"QUEUED"|"CLAIMED";attemptCount:number;claimToken:string|null;leaseExpiresAt:Date|null};
   data:{state:"CLAIMED";attemptCount:number;claimToken:string;claimedAt:Date;leaseExpiresAt:Date}
  }):Promise<{count:number}>;
 };
 opsAlertIncident:{
  findUnique(args:{where:{key:string};select:{state:true;openedAt:true;count:true}}):Promise<OpsNotificationLeaseIncident|null>;
 };
}>;
export type OpsNotificationClaimPrismaPort=Readonly<{
 $transaction<T>(fn:(tx:Tx)=>Promise<T>,options:{isolationLevel:"Serializable";maxWait:number;timeout:number}):Promise<T>;
}>;
/** Candidate DB claim only. No scheduler, HTTP or sender. */
export function createPrismaOpsNotificationLeaseStore(db:OpsNotificationClaimPrismaPort):OpsNotificationLeaseStore{
 return {transaction(fn){
  return db.$transaction(async tx=>fn({
   read(key){return tx.opsIncidentNotificationIntent.findUnique({
    where:{idempotencyKey:key},
    select:{idempotencyKey:true,state:true,incidentKey:true,episodeOpenedAt:true,attemptCount:true,claimToken:true,leaseExpiresAt:true}
   });},
   readIncident(key){return tx.opsAlertIncident.findUnique({
    where:{key},select:{state:true,openedAt:true,count:true}
   });},
   async compareAndClaim(previous,claimToken,now,expiresAt){
    const result=await tx.opsIncidentNotificationIntent.updateMany({
     where:{idempotencyKey:previous.idempotencyKey,state:previous.state,
      attemptCount:previous.attemptCount,claimToken:previous.claimToken,leaseExpiresAt:previous.leaseExpiresAt},
     data:{state:"CLAIMED",attemptCount:previous.attemptCount+1,claimToken,claimedAt:now,leaseExpiresAt:expiresAt}
    });
    return result.count;
   }
  }),{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
 }};
}
