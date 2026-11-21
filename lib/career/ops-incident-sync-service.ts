import type {OpsIncidentKey} from "./ops-incident-policy";
import {transitionOpsIncident,type OpsIncidentSnapshot,type OpsIncidentEvent} from "./ops-incident-state";

/** Per-category, serialized scanner write boundary. The caller must provide
 * an isolated migrated incident database; no live route or timer uses this yet.
 * Only incident and incident-event tables may be mutated.
 */
export type OpsIncidentSyncTransaction=Readonly<{
 read(key:OpsIncidentKey):Promise<OpsIncidentSnapshot|null>;
 create(next:OpsIncidentSnapshot):Promise<void>;
 compareAndUpdate(previous:OpsIncidentSnapshot,next:OpsIncidentSnapshot):Promise<number>;
 append(event:Readonly<{incidentKey:OpsIncidentKey;action:OpsIncidentEvent;count:number;createdAt:Date}>):Promise<void>;
}>;
export type OpsIncidentSyncStore=Readonly<{
 transaction<T>(callback:(tx:OpsIncidentSyncTransaction)=>Promise<T>):Promise<T>;
}>;
export type OpsIncidentSyncResult=Readonly<{
 key:OpsIncidentKey;state:"ABSENT"|OpsIncidentSnapshot["state"];
 event:OpsIncidentEvent|null;
 count:number;
}>;

/** Fail closed on a CAS collision. A worker may retry the scan after rereading;
 * it must not auto-resend notifications or touch money. */
export async function syncOpsIncidentWithStore(
 store:OpsIncidentSyncStore,key:OpsIncidentKey,count:number,now:Date
):Promise<OpsIncidentSyncResult>{
 return store.transaction(async tx=>{
  const previous=await tx.read(key);
  const {next,event}=transitionOpsIncident(key,previous,count,now);
  if(!next)return {key,state:"ABSENT",event:null,count:0};
  if(!previous)await tx.create(next);
  else if(next!==previous){
   if(await tx.compareAndUpdate(previous,next)!==1)
    throw new Error("Incident scan state changed concurrently");
  }
  if(event)await tx.append({incidentKey:key,action:event,count:next.count,createdAt:now});
  return {key,state:next.state,event,count:next.count};
 });
}
