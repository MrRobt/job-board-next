import type {
  OpsNotificationHandoffStore,OpsNotificationHandoffIntent,OpsNotificationHandoffIncident
} from "./ops-notification-handoff";

type IntentSelect=Readonly<{
  idempotencyKey:true;incidentKey:true;episodeOpenedAt:true;state:true;
  claimToken:true;leaseExpiresAt:true;attemptCount:true;
  kind:true;priority:true;count:true;dueBucket:true;
}>;
type IncidentSelect=Readonly<{state:true;openedAt:true;count:true}>;
type ReadonlyTx=Readonly<{
  opsIncidentNotificationIntent:{
    findUnique(args:{where:{idempotencyKey:string};select:IntentSelect}):Promise<OpsNotificationHandoffIntent|null>;
  };
  opsAlertIncident:{
    findUnique(args:{where:{key:string};select:IncidentSelect}):Promise<OpsNotificationHandoffIncident|null>;
  };
}>;
export type OpsNotificationHandoffPrismaPort=Readonly<{
  $transaction<T>(fn:(tx:ReadonlyTx)=>Promise<T>,opts:{
    isolationLevel:"Serializable";maxWait:number;timeout:number
  }):Promise<T>;
}>;

/** Narrow read projections; this adapter cannot claim, send or mutate a task. */
export function createPrismaOpsNotificationHandoffStore(
  db:OpsNotificationHandoffPrismaPort
):OpsNotificationHandoffStore{
  return {transaction:fn=>db.$transaction(tx=>fn({
    readIntent(key){return tx.opsIncidentNotificationIntent.findUnique({
      where:{idempotencyKey:key},
      select:{
        idempotencyKey:true,incidentKey:true,episodeOpenedAt:true,state:true,
        claimToken:true,leaseExpiresAt:true,attemptCount:true,
        kind:true,priority:true,count:true,dueBucket:true
      }
    })},
    readIncident(key){return tx.opsAlertIncident.findUnique({
      where:{key},select:{state:true,openedAt:true,count:true}
    })}
  }),{isolationLevel:"Serializable",maxWait:10000,timeout:15000})};
}
