/** Internal-only preflight for a claimed ops notification.
 * This is a point-in-time validation, NOT permission to send. A future sender
 * must handle races across the network boundary and use provider idempotency.
 */
export type OpsNotificationPreflightRow=Readonly<{
 idempotencyKey:string;incidentKey:string;episodeOpenedAt:Date;
 state:"QUEUED"|"CLAIMED";claimToken:string|null;
 leaseExpiresAt:Date|null;attemptCount:number;
}>;
export type OpsNotificationPreflightIncident=Readonly<{
 state:"OPEN"|"ACKNOWLEDGED"|"RESOLVED";openedAt:Date;count:number
}>;
export type OpsNotificationPreflightTx=Readonly<{
 readIntent(key:string):Promise<OpsNotificationPreflightRow|null>;
 readIncident(key:string):Promise<OpsNotificationPreflightIncident|null>;
}>;
export type OpsNotificationPreflightStore=Readonly<{
 transaction<T>(callback:(tx:OpsNotificationPreflightTx)=>Promise<T>):Promise<T>
}>;
export type OpsNotificationPreflightOutcome="READY"|"MISSING"|"FENCED"|"EXPIRED"|"STALE";

export async function preflightOpsNotification(
 store:OpsNotificationPreflightStore,
 key:string,claimToken:string,now:Date
):Promise<OpsNotificationPreflightOutcome>{
 if(!/^[0-9a-f]{64}$/.test(key)||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claimToken)||
  !(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("Invalid notification preflight input");
 return store.transaction(async tx=>{
  const item=await tx.readIntent(key);
  if(!item)return "MISSING";
  if(item.idempotencyKey!==key||!Number.isSafeInteger(item.attemptCount)||
   item.attemptCount<1)throw Error("Invalid notification preflight row");
  if(item.state!=="CLAIMED"||item.claimToken!==claimToken)return "FENCED";
  if(!(item.leaseExpiresAt instanceof Date)||
   !Number.isFinite(item.leaseExpiresAt.getTime()))throw Error("Invalid notification lease");
  if(item.leaseExpiresAt.getTime()<=now.getTime())return "EXPIRED";
  if(!(item.episodeOpenedAt instanceof Date)||
   !Number.isFinite(item.episodeOpenedAt.getTime()))throw Error("Invalid incident episode");
  const incident=await tx.readIncident(item.incidentKey);
  if(!incident||incident.state!=="OPEN"||!Number.isSafeInteger(incident.count)||
   incident.count<=0||incident.openedAt.getTime()!==item.episodeOpenedAt.getTime())
   return "STALE";
  return "READY";
 });
}
