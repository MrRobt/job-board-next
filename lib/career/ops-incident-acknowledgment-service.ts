import type {OpsIncidentKey} from "./ops-incident-policy";
import type {OpsIncidentSnapshot} from "./ops-incident-state";
import {prepareOpsAcknowledgment} from "./ops-acknowledgment-policy";

/**
 * Transaction adapter contract. A real adapter MUST make these steps one
 * database transaction (including insert audit event), with server-verified
 * operator role and a conditional update over key, state and episode time.
 */
export type OpsIncidentTransaction=Readonly<{
 operatorRole(operatorId:string):Promise<string|null>;
 incident(key:OpsIncidentKey):Promise<OpsIncidentSnapshot|null>;
 compareAndAcknowledge(
  where:Readonly<{key:OpsIncidentKey;expectedState:"OPEN";expectedOpenedAt:Date}>,
  data:Readonly<{
   state:"ACKNOWLEDGED";acknowledgedById:string;
   acknowledgedAt:Date;acknowledgmentNote:string;
  }>
 ):Promise<number>;
 appendEvent(event:Readonly<{
  incidentKey:OpsIncidentKey;action:"ACKNOWLEDGED";
  count:number;operatorId:string;note:string;createdAt:Date;
 }>):Promise<void>;
}>;
export type OpsIncidentStore=Readonly<{
 transaction<T>(callback:(tx:OpsIncidentTransaction)=>Promise<T>):Promise<T>;
}>;
export type OpsIncidentAckRequest=Readonly<{
 key:OpsIncidentKey;expectedOpenedAt:Date;
 operatorId:string;reason:string;
}>;

/**
 * Contains no direct Prisma/merchant operations. Production wiring awaits
 * migration, generated client, DB-level concurrency and permission UAT.
 */
export async function acknowledgeOpsIncidentWithStore(
 store:OpsIncidentStore,
 request:OpsIncidentAckRequest,
 now:Date=new Date()
):Promise<"ACKNOWLEDGED"|"ALREADY_ACKNOWLEDGED">{
 return store.transaction(async tx=>{
  // Read the role through the server-controlled transaction; never accept it
  // from the caller or from a client-supplied command.
  const operatorRole=await tx.operatorRole(request.operatorId);
  if(operatorRole!=="ADMIN")throw new Error("Administrator required");
  const current=await tx.incident(request.key);
  const proposal=prepareOpsAcknowledgment(current,{
   ...request,operatorRole
  },now);
  if(proposal.outcome==="ALREADY_ACKNOWLEDGED")
   return "ALREADY_ACKNOWLEDGED";
  if(!proposal.next||!proposal.cas)throw new Error("Invalid acknowledgment proposal");
  const changed=await tx.compareAndAcknowledge(proposal.cas,{
   state:"ACKNOWLEDGED",
   acknowledgedAt:proposal.next.acknowledgedAt!,
   acknowledgedById:proposal.next.acknowledgedById!,
   acknowledgmentNote:proposal.next.acknowledgmentNote!
  });
  if(changed!==1)throw new Error("Incident changed during acknowledgment");
  await tx.appendEvent({
   incidentKey:request.key,action:"ACKNOWLEDGED",
   operatorId:request.operatorId,note:request.reason,
   count:proposal.next.count,createdAt:now
  });
  return "ACKNOWLEDGED";
 });
}
