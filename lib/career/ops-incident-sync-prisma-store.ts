import type {OpsIncidentSnapshot} from "./ops-incident-state";
import type {OpsIncidentKey} from "./ops-incident-policy";
import type {OpsIncidentSyncStore,OpsIncidentSyncTransaction} from "./ops-incident-sync-service";

/** Production-shaped delegate, injectable for isolated migrated-MySQL UAT.
 * Intentionally not wired to an HTTP endpoint, timer or live alert scanner.
 */
type EventInput=Parameters<OpsIncidentSyncTransaction["append"]>[0];
type SyncTx=Readonly<{
 opsAlertIncident:Readonly<{
  findUnique(args:{where:{key:OpsIncidentKey}}):Promise<OpsIncidentSnapshot|null>;
  create(args:{data:OpsIncidentSnapshot}):Promise<unknown>;
  updateMany(args:{
   where:{key:OpsIncidentKey;state:OpsIncidentSnapshot["state"];
    openedAt:Date;lastSeenAt:Date;count:number};
   data:Omit<OpsIncidentSnapshot,"key">
  }):Promise<{count:number}>;
 }>;
 opsAlertIncidentEvent:Readonly<{
  create(args:{data:EventInput}):Promise<unknown>;
 }>;
}>;
export type OpsIncidentSyncPrismaPort=Readonly<{
 $transaction<T>(fn:(tx:SyncTx)=>Promise<T>,options:{
  isolationLevel:"Serializable";maxWait:number;timeout:number
 }):Promise<T>;
}>;

export function createPrismaOpsIncidentSyncStore(client:OpsIncidentSyncPrismaPort):OpsIncidentSyncStore{
 return {
  transaction<T>(fn:(tx:OpsIncidentSyncTransaction)=>Promise<T>){
   return client.$transaction(async dbtx=>fn({
    read(key){return dbtx.opsAlertIncident.findUnique({where:{key}});},
    async create(next){await dbtx.opsAlertIncident.create({data:next});},
    async compareAndUpdate(previous,next){
     const {key:ignored,...data}=next;
     void ignored;
     const row=await dbtx.opsAlertIncident.updateMany({
      where:{key:previous.key,state:previous.state,
       openedAt:previous.openedAt,lastSeenAt:previous.lastSeenAt,count:previous.count},
      data
     });
     return row.count;
    },
    async append(event){await dbtx.opsAlertIncidentEvent.create({data:event});}
   }),{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
  }
 };
}
