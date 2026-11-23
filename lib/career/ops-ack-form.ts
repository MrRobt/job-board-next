import type {OpsIncidentKey} from "./ops-incident-policy";

/** Parse only administrator-submitted fields; never accept a role or operator ID. */
const keys:readonly string[]=["STALE_AI_RESERVATIONS","REFUND_IN_DOUBT","REFUND_READY_AGED","REFUND_LEDGER_REVIEW"];

export type OpsAckFormCommand=Readonly<{
 key:OpsIncidentKey;expectedOpenedAt:Date;reason:string;
}>;

export function parseOpsAckForm(form:FormData):OpsAckFormCommand{
 // Reject ambiguous multi-valued fields. A client must not be able to
 // smuggle conflicting episode IDs or confirmations in multipart payloads.
 for(const name of ["confirmed","key","expectedOpenedAt","reason"]){
  if(form.getAll(name).length!==1)throw new Error("Missing or duplicate acknowledgment field");
 }
 if(form.get("confirmed")!=="yes")throw new Error("Explicit confirmation required");
 const key=form.get("key");
 if(typeof key!=="string"||!keys.includes(key))throw new Error("Invalid incident key");
 const date=form.get("expectedOpenedAt");
 if(typeof date!=="string"||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(date))
  throw new Error("Invalid incident episode");
 const expectedOpenedAt=new Date(date);
 if(!Number.isFinite(expectedOpenedAt.getTime())||
    expectedOpenedAt.toISOString()!==date)
  throw new Error("Invalid incident episode");
 const reason=form.get("reason");
 if(typeof reason!=="string"||reason.trim().length<10||
    reason.length>500||/[\u0000-\u001F\u007F]/.test(reason))
  throw new Error("Invalid acknowledgment reason");
 return {key:key as OpsIncidentKey,expectedOpenedAt,reason:reason.trim()};
}
