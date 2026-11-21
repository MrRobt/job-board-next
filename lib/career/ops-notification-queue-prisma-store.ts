import type {OpsNotificationIntent} from "./ops-notification-intents";
import type {OpsNotificationQueueStore,OpsNotificationQueueTx} from "./ops-notification-queue";

/** Narrow Prisma port: no sender, no financial mutations, no Cron entry point. */
type IncidentRow=Awaited<ReturnType<OpsNotificationQueueTx["findIncident"]>>;
type Tx=Readonly<{
 opsAlertIncident:{
  findUnique(args:{where:{key:OpsNotificationIntent["key"]};select:{
   state:true;openedAt:true;count:true
  }}):Promise<IncidentRow>;
 };
 opsIncidentNotificationIntent:{
  createMany(args:{
   data:ReadonlyArray<{
    idempotencyKey:string;incidentKey:OpsNotificationIntent["key"];
    episodeOpenedAt:Date;kind:"NOTIFY";priority:"CRITICAL"|"HIGH";
    dueBucket:number;count:number
   }>;
   skipDuplicates:true
  }):Promise<{count:number}>;
 };
}>;
export type OpsNotificationQueuePrismaPort=Readonly<{
 $transaction<T>(fn:(tx:Tx)=>Promise<T>,options:{
  isolationLevel:"Serializable";maxWait:number;timeout:number
 }):Promise<T>;
}>;

export function createPrismaOpsNotificationQueueStore(db:OpsNotificationQueuePrismaPort):OpsNotificationQueueStore{
 return {
  transaction(fn){
   return db.$transaction(async tx=>fn({
    findIncident(key){
     return tx.opsAlertIncident.findUnique({
      where:{key},select:{state:true,openedAt:true,count:true}
     });
    },
    async insertOnce(intent){
     const result=await tx.opsIncidentNotificationIntent.createMany({
      data:[{
       idempotencyKey:intent.idempotencyKey,
       incidentKey:intent.key,
       episodeOpenedAt:intent.incidentOpenedAt,
       kind:"NOTIFY",
       priority:intent.priority,
       dueBucket:0,
       count:intent.count
      }],skipDuplicates:true
     });
     return result.count;
    }
   }),{isolationLevel:"Serializable",maxWait:10000,timeout:15000});
  }
 };
}
