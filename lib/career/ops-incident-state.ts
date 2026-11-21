import {assessOpsAlerts} from "./ops-alert-policy";
import {assertOpsIncidentKey,type OpsIncidentKey} from "./ops-incident-policy";

/**
 * Deterministic proposed state transition for one persisted operational
 * incident. The caller must atomically persist changes and the audit event.
 * No database access, gateway calls or automatic financial action.
 */
export type OpsIncidentSnapshot=Readonly<{
 key:OpsIncidentKey;
 state:"OPEN"|"ACKNOWLEDGED"|"RESOLVED";
 count:number;
 openedAt:Date;
 lastSeenAt:Date;
 acknowledgedAt:Date|null;
 acknowledgedById:string|null;
 acknowledgmentNote:string|null;
 resolvedAt:Date|null;
}>;
export type OpsIncidentEvent="OPENED"|"RESOLVED"|"REOPENED";
const checked=(date:Date,name:string)=>{
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))
  throw new Error("Invalid "+name+" time");
 return date.getTime();
};
export function transitionOpsIncident(
 key:OpsIncidentKey,previous:OpsIncidentSnapshot|null,count:number,now:Date
):{next:OpsIncidentSnapshot|null;event:OpsIncidentEvent|null}{
 assertOpsIncidentKey(key);
 const instant=checked(now,"scan");
 assessOpsAlerts({staleReservations:count,uncertainRefunds:0,agedReadyRefunds:0});
 if(previous){
  if(previous.key!==key)throw new Error("Incident category mismatch");
  const opened=checked(previous.openedAt,"opened");
  const seen=checked(previous.lastSeenAt,"last seen");
  if(instant<opened||instant<seen)throw new Error("Invalid stale incident scan time");
 }
 if(!previous){
  if(count===0)return {next:null,event:null};
  return {next:{key,state:"OPEN",count,openedAt:now,lastSeenAt:now,
   acknowledgedAt:null,acknowledgedById:null,acknowledgmentNote:null,
   resolvedAt:null},event:"OPENED"};
 }
 if(count===0){
  if(previous.state==="RESOLVED")return {next:previous,event:null};
  return {next:{...previous,count:0,state:"RESOLVED",lastSeenAt:now,resolvedAt:now},
   event:"RESOLVED"};
 }
 if(previous.state==="RESOLVED"){
  return {next:{...previous,count,state:"OPEN",openedAt:now,lastSeenAt:now,
   acknowledgedAt:null,acknowledgedById:null,acknowledgmentNote:null,resolvedAt:null},
   event:"REOPENED"};
 }
 return {next:{...previous,count,lastSeenAt:now},event:null};
}
