import {authorizeOpsNotificationDelivery} from "./ops-notification-delivery-policy";
import {buildOpsNotificationEnvelope,type OpsNotificationEnvelope} from "./ops-notification-envelope";

/** A read-only, point-in-time dispatch candidate. NEVER sends or authorizes HTTP.
 * A real sender still needs DNS/egress controls, recipient approval, provider-level
 * idempotency, a lease recheck at the network boundary and verified delivery receipts.
 */
export type OpsNotificationHandoffIntent=Readonly<{
  idempotencyKey:string;incidentKey:string;episodeOpenedAt:Date;
  state:string;claimToken:string|null;leaseExpiresAt:Date|null;attemptCount:number;
  kind:string;priority:string;count:number;dueBucket:number;
}>;
export type OpsNotificationHandoffIncident=Readonly<{
  state:string;openedAt:Date;count:number;
}>;
export type OpsNotificationHandoffStore=Readonly<{
  transaction<T>(fn:(reader:Readonly<{
    readIntent(key:string):Promise<OpsNotificationHandoffIntent|null>;
    readIncident(key:string):Promise<OpsNotificationHandoffIncident|null>;
  }>)=>Promise<T>):Promise<T>;
}>;
export type OpsNotificationHandoffResult=
  |Readonly<{status:"DENIED"|"MISSING"|"FENCED"|"EXPIRED"|"STALE"}>
  |Readonly<{status:"PREPARED";destination:string;envelope:OpsNotificationEnvelope}>;

const validToken=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validKey=/^[a-f0-9]{64}$/;

/** Bind the validated envelope to the SAME persisted intent and incident snapshot.
 * Caller-supplied notification metadata is intentionally never accepted.
 */
export async function prepareOpsNotificationHandoff(
  store:OpsNotificationHandoffStore,
  request:Readonly<{
    key:string;claimToken:string;now:Date;
    enabled:string|undefined;operatorApproved:string|undefined;
    destination:string|undefined;approvedOrigins:readonly string[];
  }>
):Promise<OpsNotificationHandoffResult>{
  if(!validKey.test(request.key)||!validToken.test(request.claimToken)||
    !(request.now instanceof Date)||!Number.isFinite(request.now.getTime()))
    throw Error("Invalid notification handoff request");
  const admission=authorizeOpsNotificationDelivery(request);
  if(!admission.allowed)return {status:"DENIED"};
  return store.transaction(async reader=>{
    const intent=await reader.readIntent(request.key);
    if(!intent)return {status:"MISSING"};
    if(intent.idempotencyKey!==request.key||
      !Number.isSafeInteger(intent.attemptCount)||intent.attemptCount<1||
      intent.attemptCount>5||!Number.isSafeInteger(intent.count)||intent.count<1)
      throw Error("Invalid persisted notification attempt");
    if(intent.state!=="CLAIMED"||intent.claimToken!==request.claimToken)
      return {status:"FENCED"};
    if(!(intent.leaseExpiresAt instanceof Date)||
      !Number.isFinite(intent.leaseExpiresAt.getTime()))throw Error("Invalid persisted lease");
    if(intent.leaseExpiresAt.getTime()<=request.now.getTime())return {status:"EXPIRED"};
    if(!(intent.episodeOpenedAt instanceof Date)||
      !Number.isFinite(intent.episodeOpenedAt.getTime()))throw Error("Invalid persisted episode");
    const incident=await reader.readIncident(intent.incidentKey);
    if(!incident||incident.state!=="OPEN"||
      !(incident.openedAt instanceof Date)||
      !Number.isFinite(incident.openedAt.getTime())||
      incident.openedAt.getTime()!==intent.episodeOpenedAt.getTime()||
      incident.openedAt.getTime()>request.now.getTime()||
      !Number.isSafeInteger(incident.count)||incident.count<=0)
      return {status:"STALE"};
    // Recompute identity from the persisted episode; count comes from the current
    // incident snapshot, never from a caller-supplied or stale queued count.
    const envelope=buildOpsNotificationEnvelope({
      idempotencyKey:intent.idempotencyKey,key:intent.incidentKey,
      kind:intent.kind,priority:intent.priority,count:incident.count,
      incidentOpenedAt:intent.episodeOpenedAt,dueBucket:intent.dueBucket
    });
    return {status:"PREPARED",destination:admission.destination,envelope};
  });
}
