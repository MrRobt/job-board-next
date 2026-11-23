import {assessOpsAlerts,type OpsAlertCounts} from "./ops-alert-policy";

/**
 * Pure, deterministic incident planning. The caller owns durable storage,
 * operator authentication, notifications and audit. No network or DB writes.
 */
export type OpsIncidentKey="STALE_AI_RESERVATIONS"|"REFUND_IN_DOUBT"|"REFUND_READY_AGED"|"REFUND_LEDGER_REVIEW";
export type OpsIncidentAcknowledgment=Readonly<{
 key:OpsIncidentKey;
 openedAt:Date;
 acknowledgedAt:Date|null;
 lastNotifiedAt:Date|null;
}>;
export type OpsIncidentAction="NOTIFY"|"SUPPRESS"|"ESCALATE"|"ACKNOWLEDGED";
export type PlannedOpsIncident=Readonly<{
 key:OpsIncidentKey;
 priority:"CRITICAL"|"HIGH";
 count:number;
 action:OpsIncidentAction;
 escalationAfterMinutes:number;
}>;

// The existing aggregate scanner intentionally owns only its original 3 metrics.
// A fourth isolated review signal has an independent read/write gate.
const aggregateKeys=["STALE_AI_RESERVATIONS","REFUND_IN_DOUBT","REFUND_READY_AGED"] as const;
const allowedKeys:readonly OpsIncidentKey[]=[...aggregateKeys,"REFUND_LEDGER_REVIEW"];
/** Validate runtime values even when the caller is TypeScript-typed. */
export function assertOpsIncidentKey(key:unknown):asserts key is OpsIncidentKey{
 if(typeof key!=="string"||!allowedKeys.includes(key as OpsIncidentKey))
  throw new Error("Invalid incident key");
}
const critical=(key:OpsIncidentKey)=>key==="REFUND_IN_DOUBT"||key==="REFUND_LEDGER_REVIEW";
const priority=(key:OpsIncidentKey)=>critical(key)?"CRITICAL" as const:"HIGH" as const;
const escalationMinutes=(key:OpsIncidentKey)=>critical(key)?15:30;
const millis=(date:Date,label:string)=>{
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))
  throw new Error("Invalid "+label);
 return date.getTime();
};

export function planOpsIncidents(
 counts:OpsAlertCounts,
 previous:readonly OpsIncidentAcknowledgment[],
 now:Date=new Date()
):readonly PlannedOpsIncident[]{
 const time=millis(now,"scan time");
 // Reuse the alert validation that rejects unsafe / non-integer aggregates.
 const valid=assessOpsAlerts(counts).counts;
 const records=new Map<OpsIncidentKey,OpsIncidentAcknowledgment>();
 for(const record of previous){
  assertOpsIncidentKey(record.key);
  if(records.has(record.key))throw new Error("Invalid duplicate incident");
  const opened=millis(record.openedAt,"opened time");
  if(opened>time)throw new Error("Incident opened in future");
  if(record.lastNotifiedAt!==null){
   const sent=millis(record.lastNotifiedAt,"last notification time");
   if(sent<opened)throw new Error("Notification before incident opened");
   if(sent>time)throw new Error("Notification in future");
  }
  if(record.acknowledgedAt!==null){
   const acknowledged=millis(record.acknowledgedAt,"acknowledgment time");
   if(acknowledged<opened)throw new Error("Acknowledgment before incident opened");
   if(acknowledged>time)throw new Error("Acknowledgment in future");
  }
  records.set(record.key,record);
 }
 const countByKey:Record<(typeof aggregateKeys)[number],number>={
  STALE_AI_RESERVATIONS:valid.staleReservations,
  REFUND_IN_DOUBT:valid.uncertainRefunds,
  REFUND_READY_AGED:valid.agedReadyRefunds
 };
 return aggregateKeys.filter(key=>countByKey[key]>0).map(key=>{
  const record=records.get(key);
  const minutes=escalationMinutes(key);
  let action:OpsIncidentAction="NOTIFY";
  if(record?.acknowledgedAt)action="ACKNOWLEDGED";
  else if(record?.lastNotifiedAt){
   action=time-record.openedAt.getTime()>=minutes*60_000&&
    time-record.lastNotifiedAt.getTime()>=minutes*60_000?"ESCALATE":"SUPPRESS";
  }
  return {key,priority:priority(key),count:countByKey[key],
   action,escalationAfterMinutes:minutes};
 });
}
