import {createHash} from "node:crypto";
import {planOpsIncidents,type OpsIncidentAcknowledgment,type OpsIncidentKey} from "./ops-incident-policy";
import type {OpsAlertCounts} from "./ops-alert-policy";

/** Offline-only candidates for a future transactional outbox.
 * THIS MODULE NEVER sends messages or claims delivery. Its deterministic ID
 * must be enforced as UNIQUE by the eventual persisted outbox before dispatch.
 */
export type OpsNotificationIntent=Readonly<{
 idempotencyKey:string;
 key:OpsIncidentKey;
 kind:"NOTIFY"|"ESCALATE";
 priority:"CRITICAL"|"HIGH";
 count:number;
 incidentOpenedAt:Date;
 dueBucket:number;
}>;

const intervalMinutes=(key:OpsIncidentKey)=>key==="REFUND_IN_DOUBT"?15:30;
const stamp=(date:Date)=>date.getTime();

export function opsNotificationIdempotencyKey(
 key:OpsIncidentKey,openedAt:Date,kind:"NOTIFY"|"ESCALATE",dueBucket:number
):string{
 const fingerprint="ops-incident-v1|"+key+"|"+openedAt.toISOString()+"|"+kind+"|"+dueBucket;
 return createHash("sha256").update(fingerprint).digest("hex");
}

export function planOpsNotificationIntents(
 counts:OpsAlertCounts,
 persisted:readonly OpsIncidentAcknowledgment[],
 now:Date
):readonly OpsNotificationIntent[]{
 const planned=planOpsIncidents(counts,persisted,now);
 const found=new Map(persisted.map(p=>[p.key,p]));
 return planned.flatMap(p=>{
  if(p.action==="ACKNOWLEDGED"||p.action==="SUPPRESS")return [];
  // A first occurrence must have an actual persisted OPEN episode.
  // Never allow a speculative, not-yet-written snapshot to trigger delivery.
  const episode=found.get(p.key);
  if(!episode)return [];
  const width=intervalMinutes(p.key)*60_000;
  const age=stamp(now)-stamp(episode.openedAt);
  if(age<0)return [];
  // Initial NOTIFY has a stable key for the entire incident episode.
  // ESCALATE is bounded by deterministic episode-relative windows.
  const dueBucket=p.action==="NOTIFY"?0:Math.floor(age/width);
  if(p.action==="ESCALATE"&&dueBucket<1)return [];
  return [{
   idempotencyKey:opsNotificationIdempotencyKey(p.key,episode.openedAt,p.action,dueBucket),
   key:p.key,kind:p.action,priority:p.priority,count:p.count,
   incidentOpenedAt:episode.openedAt,dueBucket
  }];
 });
}
