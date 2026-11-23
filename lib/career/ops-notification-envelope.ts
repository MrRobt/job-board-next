import {assertOpsIncidentKey} from "./ops-incident-policy";
import {opsNotificationIdempotencyKey} from "./ops-notification-intents";

/** Data-minimized, deterministic envelope; never accepts arbitrary user text.
 * No secrets, resume data, transactions, merchant references or user identifiers.
 * An actual sender must still recheck the live lease and external approval.
 */
export type OpsNotificationEnvelope=Readonly<{
  schemaVersion:1;
  idempotencyKey:string;
  incident:"STALE_AI_RESERVATIONS"|"REFUND_IN_DOUBT"|"REFUND_READY_AGED";
  kind:"NOTIFY"|"ESCALATE";
  priority:"HIGH"|"CRITICAL";
  count:number;
  episodeOpenedAt:string;
  dueBucket:number;
}>;

export function buildOpsNotificationEnvelope(value:Readonly<{
  idempotencyKey:unknown;
  key:unknown;
  kind:unknown;
  priority:unknown;
  count:unknown;
  incidentOpenedAt:unknown;
  dueBucket:unknown;
}>):OpsNotificationEnvelope{
  if(!value || typeof value!=="object")throw Error("Invalid notification intent");
  assertOpsIncidentKey(value.key);
 // This incident category has no approved sender, escalation, or outbox plan.
 if(value.key==="REFUND_LEDGER_REVIEW")
  throw Error("Refund ledger review notification delivery is not approved");
  if(typeof value.idempotencyKey!=="string"||
    !/^[a-f0-9]{64}$/.test(value.idempotencyKey)||
    (value.kind!=="NOTIFY"&&value.kind!=="ESCALATE")||
    (value.priority!=="HIGH"&&value.priority!=="CRITICAL")||
    (value.key==="REFUND_IN_DOUBT"?"CRITICAL":"HIGH")!==value.priority||
    typeof value.count!=="number"||!Number.isSafeInteger(value.count)||value.count<1||
    !(value.incidentOpenedAt instanceof Date)||!Number.isFinite(value.incidentOpenedAt.getTime())||
    typeof value.dueBucket!=="number"||!Number.isSafeInteger(value.dueBucket)||
    value.dueBucket<0||(value.kind==="NOTIFY"&&value.dueBucket!==0)||
    (value.kind==="ESCALATE"&&value.dueBucket===0))
    throw Error("Invalid notification intent");
  if(value.idempotencyKey!==opsNotificationIdempotencyKey(value.key,value.incidentOpenedAt,value.kind,value.dueBucket))
    throw Error("Inconsistent notification identity");
  return {
    schemaVersion:1,
    idempotencyKey:value.idempotencyKey,
    incident:value.key,
    kind:value.kind,
    priority:value.priority,
    count:value.count,
    episodeOpenedAt:value.incidentOpenedAt.toISOString(),
    dueBucket:value.dueBucket
  };
}
