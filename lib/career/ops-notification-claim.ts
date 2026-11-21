import {randomUUID} from "node:crypto";

/** Internal state machine boundary only: a lease never authorizes delivery. */
export type OpsNotificationLeaseRow=Readonly<{
 idempotencyKey:string;
 state:"QUEUED"|"CLAIMED";
 incidentKey:string;
 episodeOpenedAt:Date;
 attemptCount:number;
 claimToken:string|null;
 leaseExpiresAt:Date|null;
}>;
export type OpsNotificationLeaseIncident=Readonly<{
 state:"OPEN"|"ACKNOWLEDGED"|"RESOLVED";
 openedAt:Date;
 count:number;
}>;
export type OpsNotificationLeaseTx=Readonly<{
 read(key:string):Promise<OpsNotificationLeaseRow|null>;
 readIncident(key:string):Promise<OpsNotificationLeaseIncident|null>;
 compareAndClaim(previous:OpsNotificationLeaseRow,claimToken:string,now:Date,expiresAt:Date):Promise<number>;
}>;
export type OpsNotificationLeaseStore=Readonly<{
 transaction<T>(fn:(tx:OpsNotificationLeaseTx)=>Promise<T>):Promise<T>;
}>;
export type OpsNotificationClaimResult=
 |Readonly<{status:"CLAIMED";claimToken:string;attempt:number;expiresAt:Date}>
 |Readonly<{status:"MISSING"|"STALE"|"BUSY"|"EXHAUSTED"}>;

export async function claimOpsNotificationIntent(
 store:OpsNotificationLeaseStore,key:string,now:Date,leaseMinutes:number=5
):Promise<OpsNotificationClaimResult>{
 if(!/^[a-f0-9]{64}$/.test(key)||!(now instanceof Date)||!Number.isFinite(now.getTime())||
  !Number.isSafeInteger(leaseMinutes)||leaseMinutes<1||leaseMinutes>15)
  throw new Error("Invalid notification claim input");
 const expiresAt=new Date(now.getTime()+leaseMinutes*60_000);
 if(!Number.isFinite(expiresAt.getTime()))throw Error("Invalid notification lease expiration");
 const claimToken=randomUUID();
 return store.transaction(async tx=>{
  const previous=await tx.read(key);
  if(!previous)return {status:"MISSING"};
  if(previous.idempotencyKey!==key||
    !Number.isSafeInteger(previous.attemptCount)||previous.attemptCount<0||
    !(previous.episodeOpenedAt instanceof Date)||!Number.isFinite(previous.episodeOpenedAt.getTime()))
   throw Error("Invalid notification claim row");
  // The incident must remain in the same OPEN episode even for an expired claim.
  const incident=await tx.readIncident(previous.incidentKey);
  if(!incident||incident.state!=="OPEN"||incident.count<=0||
   incident.openedAt.getTime()!==previous.episodeOpenedAt.getTime())
   return {status:"STALE"};
  if(previous.attemptCount>=5)return {status:"EXHAUSTED"};
  if(previous.state==="CLAIMED"){
   if(!previous.leaseExpiresAt||!Number.isFinite(previous.leaseExpiresAt.getTime()))
    throw Error("Claimed notification missing lease");
   if(previous.leaseExpiresAt.getTime()>now.getTime())return {status:"BUSY"};
  }else if(previous.state!=="QUEUED")throw Error("Unknown notification state");
  if(await tx.compareAndClaim(previous,claimToken,now,expiresAt)!==1)
   return {status:"BUSY"};
  return {status:"CLAIMED",claimToken,attempt:previous.attemptCount+1,expiresAt};
 });
}
