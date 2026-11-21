import type {OpsIncidentSnapshot} from "./ops-incident-state";
import type {OpsIncidentKey} from "./ops-incident-policy";
import type {OpsIncidentStore,OpsIncidentTransaction} from "./ops-incident-acknowledgment-service";

/**
 * Narrow Prisma delegate interface. No Prisma Client is constructed here.
 * The caller must supply a real PrismaClient with generated incident models
 * only AFTER migration/UAT. This adapter is not wired into any live endpoint.
 */
type CasWhere=Parameters<OpsIncidentTransaction["compareAndAcknowledge"]>[0];
type PrismaWhere=Readonly<{key:OpsIncidentKey;state:"OPEN";openedAt:Date}>;
type CasData=Parameters<OpsIncidentTransaction["compareAndAcknowledge"]>[1];
type EventData=Parameters<OpsIncidentTransaction["appendEvent"]>[0];
type PrismaTransactionPort=Readonly<{
 user:Readonly<{
  findUnique(args:{where:{id:string};select:{role:true}}):Promise<{role:string}|null>;
 }>;
 opsAlertIncident:Readonly<{
  findUnique(args:{where:{key:OpsIncidentKey}}):Promise<OpsIncidentSnapshot|null>;
  updateMany(args:{where:PrismaWhere;data:CasData}):Promise<{count:number}>;
 }>;
 opsAlertIncidentEvent:Readonly<{
  create(args:{data:EventData}):Promise<unknown>;
 }>;
}>;
export type OpsPrismaClientPort=Readonly<{
 $transaction<T>(
  fn:(tx:PrismaTransactionPort)=>Promise<T>,
  options:{isolationLevel:"Serializable";maxWait:number;timeout:number}
 ):Promise<T>;
}>;

/**
 * Guarantees one Serializable Prisma transaction, a database-bound role lookup,
 * guarded updateMany and audit creation in the same transaction.
 * The DB provider must honor transaction rollback on throw; unit tests verify
 * the boundary only, real MySQL concurrency still needs independent UAT.
 */
export function createPrismaOpsIncidentStore(client:OpsPrismaClientPort):OpsIncidentStore{
 return {
  transaction<T>(fn:(tx:OpsIncidentTransaction)=>Promise<T>){
   return client.$transaction(async dbtx=>fn({
    async operatorRole(operatorId){
     const record=await dbtx.user.findUnique({
      where:{id:operatorId},select:{role:true}
     });
     return record?.role??null;
    },
    async incident(key){
     return dbtx.opsAlertIncident.findUnique({where:{key}});
    },
    async compareAndAcknowledge(where,data){
     const updated=await dbtx.opsAlertIncident.updateMany({
      where:{key:where.key,state:where.expectedState,openedAt:where.expectedOpenedAt},
      data
     });
     return updated.count;
    },
    async appendEvent(event){
     await dbtx.opsAlertIncidentEvent.create({data:event});
    }
   }),{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
  }
 };
}
