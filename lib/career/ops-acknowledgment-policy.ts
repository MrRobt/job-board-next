import type {OpsIncidentKey} from "./ops-incident-policy";
import type {OpsIncidentSnapshot} from "./ops-incident-state";

/**
 * Authorization, episode-binding and input validation only.
 * This does NOT authorize a DB update on its own. The caller must re-check
 * ADMIN server-side and atomically CAS key/state/openedAt inside a transaction
 * that inserts a matching audit event. Never infer merchant refund completion.
 */
export type OpsAcknowledgmentCommand=Readonly<{
 key:OpsIncidentKey;
 expectedOpenedAt:Date;
 operatorId:string;
 operatorRole:string;
 reason:string;
}>;
export type OpsAcknowledgmentProposal=Readonly<{
 outcome:"ACKNOWLEDGE"|"ALREADY_ACKNOWLEDGED";
 next:OpsIncidentSnapshot|null;
 cas:Readonly<{
  key:OpsIncidentKey;
  expectedState:"OPEN";
  expectedOpenedAt:Date;
 }> | null;
}>;

function checkedTime(date:Date,label:string):number{
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw new Error("Invalid "+label+" time");
 return date.getTime();
}

export function prepareOpsAcknowledgment(
 current:OpsIncidentSnapshot|null,
 command:OpsAcknowledgmentCommand,
 now:Date
):OpsAcknowledgmentProposal{
 if(command.operatorRole!=="ADMIN")throw new Error("Administrator required");
 if(typeof command.operatorId!=="string"||
    !/^[a-zA-Z0-9_-]{3,191}$/.test(command.operatorId))
  throw new Error("Invalid operator");
 if(typeof command.reason!=="string"||
    command.reason.length>500||command.reason.trim().length<10||
    /[\u0000-\u001F\u007F]/.test(command.reason))
  throw new Error("Invalid acknowledgment reason");
 const time=checkedTime(now,"scan");
 const expected=checkedTime(command.expectedOpenedAt,"expected episode");
 if(!current)throw new Error("Incident not found");
 if(current.key!==command.key)throw new Error("Incident category mismatch");
 const opened=checkedTime(current.openedAt,"incident open");
 const observed=checkedTime(current.lastSeenAt,"last seen");
 if(opened!==expected)throw new Error("Stale incident episode");
 if(time<opened||time<observed)throw new Error("Invalid incident time");
 if(current.state==="RESOLVED")throw new Error("Cannot acknowledge resolved incident");
 if(current.state==="ACKNOWLEDGED"){
  if(!current.acknowledgedAt||!current.acknowledgedById||!current.acknowledgmentNote)
   throw new Error("Inconsistent incident acknowledgment");
  const acknowledged=checkedTime(current.acknowledgedAt,"acknowledged");
  if(acknowledged<opened||acknowledged>time)
   throw new Error("Inconsistent incident acknowledgment time");
  if(current.acknowledgedById!==command.operatorId||
     current.acknowledgmentNote!==command.reason)
   throw new Error("Incident already acknowledged by another operation");
  return {outcome:"ALREADY_ACKNOWLEDGED",next:null,cas:null};
 }
 if(current.state!=="OPEN"||current.acknowledgedAt!==null||
    current.acknowledgedById!==null||current.acknowledgmentNote!==null||
    current.resolvedAt!==null)
  throw new Error("Inconsistent incident state");
 return {
  outcome:"ACKNOWLEDGE",
  next:{...current,state:"ACKNOWLEDGED",acknowledgedAt:now,
   acknowledgedById:command.operatorId,acknowledgmentNote:command.reason},
  cas:{key:command.key,expectedState:"OPEN",expectedOpenedAt:current.openedAt}
 };
}
